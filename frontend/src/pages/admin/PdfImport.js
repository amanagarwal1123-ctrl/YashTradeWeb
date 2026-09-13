import React,{useEffect,useRef,useState} from 'react';
import {createSHA256} from 'hash-wasm';
import {PageTitle,State,useResource,Notice,Field} from '@/components/admin/SharedUI';
import {PdfReview} from '@/components/admin/PdfReview';
import {useAdmin} from '@/components/admin/AdminLayout';
import {api,shared,download,errMsg} from '@/lib/api';
import {Button} from '@/components/ui/button';
async function hashFile(file,chunk){const hash=await createSHA256();hash.init();for(let n=0;n<file.size;n+=chunk)hash.update(new Uint8Array(await file.slice(n,n+chunk).arrayBuffer()));return hash.digest('hex');}
export default function PdfImport(){
 const {me}=useAdmin(),key=`yash-pdf-resume-v1-${me.id}`,cap=useResource('/pdf-template/capabilities'),batches=useResource('/batches');
 const [saved,setSaved]=useState(()=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}),[batch,setBatch]=useState(saved?.batch_id||''),[mode,setMode]=useState(saved?.mode||'template_v1'),[file,setFile]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState('');
 const stop=useRef(false),status=useResource(saved?`/pdf-upload/${saved.upload_id}/status`:null,{},true);
 useEffect(()=>()=>{stop.current=true;},[]);
 useEffect(()=>{if(!saved)return;localStorage.setItem(key,JSON.stringify(saved));},[saved,key]);
 const phase=status.data?.phase,loadStatus=status.load;
 useEffect(()=>{if(!['queued','analyzing'].includes(phase))return;const timer=setInterval(()=>{if(!document.hidden)loadStatus();},3000);return()=>clearInterval(timer);},[phase,loadStatus]);
 const start=async()=>{if(!file||!cap.data)return;setBusy(true);setError('');stop.current=false;try{
  const lim=cap.data.limits;if(!file.name.toLowerCase().endsWith('.pdf')||file.size>lim.max_bytes)throw new Error(`Select a PDF within ${lim.max_bytes} bytes.`);
  setProgress('Checking file identity…');const sha256=await hashFile(file,lim.chunk_bytes);
  if(saved&&(saved.sha256!==sha256||saved.file_size!==file.size||saved.filename!==file.name))throw new Error('Wrong file for resume. Select the same original filename, size and SHA-256.');
  const init=await shared.write('post','/pdf-upload/init',{batch_id:batch,filename:file.name,file_size:file.size,sha256,total_chunks:Math.ceil(file.size/lim.chunk_bytes),mode});
  const resume={upload_id:init.upload_id,batch_id:batch,filename:file.name,file_size:file.size,sha256,mode};setSaved(resume);localStorage.setItem(key,JSON.stringify(resume));
  let current=await shared.get(`/pdf-upload/${init.upload_id}/status`);if(current.phase==='paused')current=await shared.write('post',`/pdf-upload/${init.upload_id}/resume`,{});
  if(!['uploading','paused'].includes(current.phase)){setProgress(`Transfer already ${current.phase}.`);await status.load();return;}
  const acknowledged=new Set(current.received_chunk_indices||[]);
  for(let i=0;i<Math.ceil(file.size/init.chunk_size);i++){
   if(stop.current)break;if(acknowledged.has(i))continue;
   const blob=file.slice(i*init.chunk_size,Math.min(file.size,(i+1)*init.chunk_size)),bytes=await blob.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
   let accepted=false;for(let attempt=0;attempt<3&&!accepted;attempt++){
    try{const form=new FormData();form.append('file',blob,`chunk-${i}`);await api.post(`/bff/pdf-upload/${init.upload_id}/chunk`,form,{params:{chunk_index:i},headers:{'X-Chunk-Sha256':hash}});accepted=true;}
    catch(e){if(e.response&&e.response.status<500)throw e;const s=await shared.get(`/pdf-upload/${init.upload_id}/status`);accepted=s.received_chunk_indices.includes(i);if(s.phase!=='uploading')throw new Error('Upload state changed. Refresh status before resuming.');if(!accepted&&attempt===2)throw e;}
   }setProgress(`Uploaded ${Math.min(file.size,(i+1)*init.chunk_size)} of ${file.size} bytes`);
  }
  if(!stop.current)await shared.write('post',`/pdf-upload/${init.upload_id}/complete`,{});
  await status.load();
 }catch(e){setError(e.response?errMsg(e):e.message);}finally{setBusy(false);}};
 const action=async kind=>{if(!saved)return;if(kind==='cancel'&&!window.confirm('Cancel this import permanently? A paused import can resume; a cancelled one cannot.'))return;stop.current=true;setError('');try{await shared.write('post',`/pdf-upload/${saved.upload_id}/${kind}`,{});await status.load();}catch(e){setError(errMsg(e));}};
 const sample=async()=>{setError('');try{await download('/pdf-template/sample.pdf','Yash-Catalog-Template-v1.pdf');}catch(e){setError(errMsg(e));}};
 const [newBatch,setNewBatch]=useState(''),[creating,setCreating]=useState(false);
 const createBatch=async()=>{const name=newBatch.trim();if(!name)return;setCreating(true);setError('');try{const created=await shared.write('post','/batches',{name,metal_type:'silver',category:''});await batches.load();if(created?.id)setBatch(created.id);setNewBatch('');}catch(e){setError(errMsg(e));}finally{setCreating(false);}};
 const lim=cap.data?.limits,fileTooBig=!!(file&&lim&&file.size>lim.max_bytes),fileNotPdf=!!(file&&!file.name.toLowerCase().endsWith('.pdf'));
 const blocker=saved?'':!cap.data?(cap.error?'Import limits could not be loaded — refresh above.':'Loading import limits…'):batches.error?'Batch list could not be loaded — refresh below.':!batch?(batches.data?.batches?.length?'Choose a batch above to enable “Upload & analyze”.':'No batches exist yet — create one below to enable “Upload & analyze”.'):!file?'Choose a PDF to enable “Upload & analyze”.':fileNotPdf?'Only .pdf files can be imported.':fileTooBig?`This file is larger than the ${(lim.max_bytes/1024/1024).toFixed(0)} MiB limit.`:'';
 return <><PageTitle actions={<><Button variant="outline" data-testid="pdf-download-sample" onClick={sample}>Download sample PDF</Button><Button variant="outline" data-testid="pdf-download-authoring-json" onClick={async()=>{try{await download('/pdf-template/authoring.json','Yash-Catalog-v1.json');}catch(e){setError(errMsg(e));}}}>Authoring JSON</Button></>}>Reviewed PDF import</PageTitle><State resource={cap} id="pdf-capabilities"/><Notice id="pdf-upload-error">{error}</Notice>
 {cap.data&&<p className="text-sm my-4" data-testid="pdf-limits">Configured: {(cap.data.limits.max_bytes/1024/1024).toFixed(0)} MiB · {cap.data.limits.max_pages} pages · {cap.data.limits.chunk_bytes/1024} KiB chunks. Not a proven production maximum. Sample: three products, two guide pages, up to two products per page.</p>}
 <div className="filters"><Field name="pdf-batch" title="Batch" options={[{value:'',label:batches.busy&&!batches.data?'Loading batches…':'Choose batch'},...(batches.data?.batches||[]).map(b=>({value:b.id,label:b.name}))]} value={batch} disabled={!!saved} onChange={setBatch}/><Field name="pdf-mode" title="Import mode" options={[{value:'template_v1',label:'Template v1'},{value:'legacy_pages',label:'Legacy pages · manual review'}]} value={mode} disabled={!!saved} onChange={setMode}/></div>
 {!saved&&<div className="flex flex-wrap items-end gap-2 my-2"><Field name="pdf-new-batch" title="Or create a new batch for this import" value={newBatch} onChange={setNewBatch} disabled={creating}/><Button variant="outline" disabled={creating||!newBatch.trim()} data-testid="pdf-create-batch" onClick={createBatch}>{creating?'Creating…':'Create & select batch'}</Button><State resource={batches} id="pdf-batches"/></div>}
 <label className="field my-4">{saved?'Reselect original PDF to resume':'Choose PDF'}<input type="file" accept="application/pdf,.pdf" disabled={busy} data-testid="pdf-file-input" onChange={e=>{if(e.target.files?.[0])setFile(e.target.files[0]);}}/></label>
 {file&&<p className="text-sm -mt-2 mb-3" data-testid="pdf-file-summary">{file.name} · {(file.size/1024/1024).toFixed(1)} MiB{lim?` · ${Math.ceil(file.size/lim.chunk_bytes)} chunks`:''}</p>}
 <div className="flex flex-wrap gap-2"><Button disabled={busy||!file||!batch||!cap.data||fileTooBig||fileNotPdf||['committed','cancelled'].includes(status.data?.phase)} onClick={start} data-testid="pdf-upload-start">{busy?'Transferring…':saved?'Resume same-file transfer':'Upload & analyze'}</Button>{saved&&<><Button variant="outline" data-testid="pdf-pause" disabled={['committed','cancelled'].includes(status.data?.phase)} onClick={()=>action('pause')}>Pause</Button><Button variant="outline" data-testid="pdf-resume-analysis" disabled={busy||!['paused','error'].includes(status.data?.phase)} onClick={()=>action('resume')}>Resume analysis</Button><Button variant="destructive" data-testid="pdf-cancel" disabled={status.data?.phase==='committed'} onClick={()=>action('cancel')}>Cancel import</Button></>}</div>
 {blocker&&<p className="text-sm text-amber-800 mt-2" data-testid="pdf-upload-blocker">{blocker}</p>}
 <p className="my-3 text-sm" data-testid="pdf-upload-progress">{progress}</p>
 {saved&&<><State resource={status} id="pdf-job"/><p data-testid="pdf-resume-identity" className="text-xs break-all">{saved.filename} · {saved.file_size} bytes · Job {saved.upload_id}</p>{status.data&&<><div className="metrics-strip"><div>Phase<strong data-testid="pdf-phase">{status.data.phase}</strong></div><div>Bytes<strong data-testid="pdf-byte-progress">{status.data.bytes_received} / {status.data.file_size}</strong></div><div>Analysis pages<strong data-testid="pdf-page-progress">{status.data.pages_processed} / {status.data.total_pages??'Unknown'}</strong></div><div>Detected products<strong data-testid="pdf-product-count">{status.data.product_count}</strong></div></div><Notice id="pdf-job-error">{status.data.error}</Notice>
 {['review','committed'].includes(status.data.phase)&&<PdfReview job={saved.upload_id} status={status.data} capabilities={cap.data} onStatus={status.load}/>}
 {['committed','cancelled','expired'].includes(status.data.phase)&&<Button className="mt-5" variant="outline" data-testid="pdf-new-import" onClick={()=>{localStorage.removeItem(key);setSaved(null);setFile(null);setProgress('');}}>Start another import</Button>}</>}</>}
 </>;
}