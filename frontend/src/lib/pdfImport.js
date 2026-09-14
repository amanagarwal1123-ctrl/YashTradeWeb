import {createSHA256} from 'hash-wasm';
import {api,shared} from '@/lib/api';

const KEY=uid=>`yash-pdf-imports-v2-${uid}`,LEGACY=uid=>`yash-pdf-resume-v1-${uid}`;
export const ACTIVE=['uploading','queued','analyzing','review','paused'],DONE=['committed','cancelled','expired'];
export const MAX_ACTIVE=4; // canonical app limit: ACTIVE_IMPORT_LIMIT

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
  for(let i=0;i<total;i++){
    if(shouldStop())return {record,outcome:'stopped'};
    if(acknowledged.has(i)){report(i);continue;}
    const blob=file.slice(i*init.chunk_size,Math.min(file.size,(i+1)*init.chunk_size)),digest=await hex(await blob.arrayBuffer());
    let accepted=false;
    for(let attempt=0;attempt<3&&!accepted;attempt++){
      try{const form=new FormData();form.append('file',blob,`chunk-${i}`);await api.post(`/bff/pdf-upload/${init.upload_id}/chunk`,form,{params:{chunk_index:i},headers:{'X-Chunk-Sha256':digest}});accepted=true;}
      catch(e){if(e.response&&e.response.status<500)throw e;const s=await shared.get(`/pdf-upload/${init.upload_id}/status`);accepted=(s.received_chunk_indices||[]).includes(i);if(s.phase!=='uploading')throw new Error('Upload state changed. Refresh status before resuming.');if(!accepted&&attempt===2)throw e;}
    }
    report(i);
  }
  onProgress('Finishing upload…',file.size);
  await shared.write('post',`/pdf-upload/${init.upload_id}/complete`,{});
  return {record,outcome:'queued'};
}
