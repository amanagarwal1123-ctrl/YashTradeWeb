import {createSHA256} from 'hash-wasm';
import {api,shared,errMsg} from '@/lib/api';

const KEY=uid=>`yash-pdf-imports-v2-${uid}`,LEGACY=uid=>`yash-pdf-resume-v1-${uid}`;
export const ACTIVE=['uploading','queued','analyzing','review','paused'],DONE=['committed','cancelled','expired'];
export const MAX_ACTIVE=4; // canonical app limit: ACTIVE_IMPORT_LIMIT
export const BUSY_BUDGET_MS=4*60*1000; // how long one chunk keeps retrying while the app server is busy
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export function loadJobs(uid){
  let list=[];try{list=JSON.parse(localStorage.getItem(KEY(uid))||'[]');}catch{list=[];}
  if(!Array.isArray(list))list=[];
  try{const legacy=JSON.parse(localStorage.getItem(LEGACY(uid))||'null');if(legacy?.upload_id&&!list.some(j=>j.upload_id===legacy.upload_id)){list.unshift({...legacy,created_at:Date.now()});}localStorage.removeItem(LEGACY(uid));}catch{/* ignore */}
  saveJobs(uid,list);return list;
}
export function saveJobs(uid,list){localStorage.setItem(KEY(uid),JSON.stringify(list.slice(0,20)));}

async function hashFile(file,chunk){const hash=await createSHA256();hash.init();for(let n=0;n<file.size;n+=chunk)hash.update(new Uint8Array(await file.slice(n,n+chunk).arrayBuffer()));return hash.digest('hex');}
const hex=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');

export function fileProblem(file,limits){
  if(!file.name.toLowerCase().endsWith('.pdf'))return 'Only .pdf files can be imported.';
  if(limits&&file.size>limits.max_bytes)return `Larger than the ${(limits.max_bytes/1048576).toFixed(0)} MiB limit.`;
  return '';
}

/** The app serialises every storage write (chunks, analysis previews, commit images) on one lock and answers 409 at once. */
export const isBusy=e=>e?.response?.data?.code==='OPERATION_IN_PROGRESS';
/** Errors after which the same idempotent request may simply be repeated. */
export function transient(e){
  const st=e?.response?.status,code=e?.response?.data?.code;
  return !e?.response||e.code==='ECONNABORTED'||isBusy(e)||code==='UPSTREAM_UNCERTAIN'||(st>=502&&st<=504&&typeof e.response.data!=='object');
}
export function busyMsg(e){
  if(isBusy(e))return 'The app server was busy with another import step — analysis, commit and upload share one storage queue. Wait a few seconds and try again.';
  return e?.response?errMsg(e):(e?.message||errMsg(e));
}
export const backoff=attempt=>Math.min(10000,1000*2**Math.min(attempt,4));

/** Transfers one PDF (new or resumed) through the BFF; resolves with the job record and how it ended. */
export async function transferFile({file,batch,mode,limits,onProgress,onInit,shouldStop}){
  const problem=fileProblem(file,limits);if(problem)throw new Error(problem);
  onProgress('Checking file identity…',0);
  const sha256=await hashFile(file,limits.chunk_bytes),total=Math.ceil(file.size/limits.chunk_bytes);
  const init=await shared.write('post','/pdf-upload/init',{batch_id:batch,filename:file.name,file_size:file.size,sha256,total_chunks:total,mode});
  const record={upload_id:init.upload_id,batch_id:batch,filename:file.name,file_size:file.size,sha256,mode,created_at:Date.now()};
  onInit?.(record);
  let current=await shared.get(`/pdf-upload/${init.upload_id}/status`);
  if(current.phase==='paused')current=await shared.write('post',`/pdf-upload/${init.upload_id}/resume`,{});
  if(!['uploading'].includes(current.phase))return {record,outcome:`already ${current.phase}`};
  const acknowledged=new Set(current.received_chunk_indices||[]);
  const report=i=>onProgress(`Uploading… ${Math.round(Math.min(file.size,(i+1)*init.chunk_size)/file.size*100)}%`,Math.min(file.size,(i+1)*init.chunk_size));
  const waitText=(e,i,wait)=>`${isBusy(e)?'App server busy writing another import':'Connection problem'} — retrying chunk ${i+1} of ${total} in ${Math.round(wait/1000)} s… (received chunks are kept)`;
  for(let i=0;i<total;i++){
    if(shouldStop())return {record,outcome:'stopped'};
    if(acknowledged.has(i)){report(i);continue;}
    const blob=file.slice(i*init.chunk_size,Math.min(file.size,(i+1)*init.chunk_size)),digest=await hex(await blob.arrayBuffer()),started=Date.now();
    for(let attempt=0;;attempt++){
      if(shouldStop())return {record,outcome:'stopped'};
      try{const form=new FormData();form.append('file',blob,`chunk-${i}`);await api.post(`/bff/pdf-upload/${init.upload_id}/chunk`,form,{params:{chunk_index:i},headers:{'X-Chunk-Sha256':digest}});break;}
      catch(e){
        if(e.response&&!transient(e))throw e;
        let s=null;try{s=await shared.get(`/pdf-upload/${init.upload_id}/status`);}catch{/* checked again after the wait */}
        if(s){if((s.received_chunk_indices||[]).includes(i))break;if(s.phase!=='uploading')throw new Error('Upload state changed. Refresh status before resuming.');}
        if(Date.now()-started>BUSY_BUDGET_MS)throw new Error(isBusy(e)?'The app server stayed busy for 4 minutes (another import is being analysed or committed). Received chunks are kept — select this file again later to resume.':busyMsg(e));
        const wait=backoff(attempt);onProgress(waitText(e,i,wait),i*init.chunk_size);await sleep(wait);
      }
    }
    report(i);
  }
  onProgress('Finishing upload…',file.size);
  for(let attempt=0;;attempt++){
    try{await shared.write('post',`/pdf-upload/${init.upload_id}/complete`,{});break;}
    catch(e){if(!transient(e)||attempt>=5)throw e;const wait=backoff(attempt);onProgress(`${isBusy(e)?'App server busy':'Connection problem'} — finishing upload again in ${Math.round(wait/1000)} s…`,file.size);await sleep(wait);}
  }
  return {record,outcome:'queued'};
}
