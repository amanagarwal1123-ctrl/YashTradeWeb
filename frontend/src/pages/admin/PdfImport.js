import React,{useEffect,useRef,useState} from 'react';
import {AlertTriangle} from 'lucide-react';
import {PageTitle,State,useResource,Notice,Field} from '@/components/admin/SharedUI';
import {ImportJob,ProgressBar} from '@/components/admin/ImportJob';
import {useAdmin} from '@/components/admin/AdminLayout';
import {shared,download,errMsg} from '@/lib/api';
import {loadJobs,saveJobs,transferFile,fileProblem,DONE,MAX_ACTIVE} from '@/lib/pdfImport';
import {Button} from '@/components/ui/button';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mib=n=>(n/1048576).toFixed(1);
const LAST_BATCH=uid=>`yash-pdf-last-batch-${uid}`;

export default function PdfImport(){
 const {me}=useAdmin(),cap=useResource('/pdf-template/capabilities'),batches=useResource('/batches'),lim=cap.data?.limits;
 const [jobs,setJobs]=useState(()=>loadJobs(me.id)),[phases,setPhases]=useState({}),[reviewOpen,setReviewOpen]=useState(null);
 const [batch,setBatchState]=useState(()=>localStorage.getItem(LAST_BATCH(me.id))||''),[mode,setMode]=useState('template_v1'),[files,setFiles]=useState([]),[progress,setProgress]=useState({}),[running,setRunning]=useState(false),[current,setCurrent]=useState(null),[waiting,setWaiting]=useState(false),[error,setError]=useState('');
 const [newBatch,setNewBatch]=useState(''),[creating,setCreating]=useState(false);
 const stop=useRef(false),jobsRef=useRef(jobs),phasesRef=useRef(phases),reviewRef=useRef(reviewOpen);
 const setBatch=id=>{setBatchState(id);if(id)localStorage.setItem(LAST_BATCH(me.id),id);};
 useEffect(()=>{jobsRef.current=jobs;saveJobs(me.id,jobs);},[jobs,me.id]);
 useEffect(()=>{phasesRef.current=phases;},[phases]);
 useEffect(()=>{reviewRef.current=reviewOpen;},[reviewOpen]);
 useEffect(()=>()=>{stop.current=true;},[]);
 const list=batches.data?.batches;
 useEffect(()=>{if(!list)return;if(batch&&!list.some(b=>b.id===batch))setBatchState('');else if(!batch&&list.length===1)setBatch(list[0].id);},[list]); // eslint-disable-line react-hooks/exhaustive-deps
 const activeCount=()=>jobsRef.current.filter(j=>!DONE.includes(phasesRef.current[j.upload_id])&&phasesRef.current[j.upload_id]!=='missing').length;
 const onChanged=(jid,phase)=>{setPhases(p=>p[jid]===phase?p:{...p,[jid]:phase});if(phase==='review'&&!reviewRef.current)setReviewOpen(jid);};
 const upsert=record=>setJobs(prev=>prev.some(j=>j.upload_id===record.upload_id)?prev.map(j=>j.upload_id===record.upload_id?{...j,...record,created_at:j.created_at}:j):[record,...prev]);
 const note=(name,patch)=>setProgress(p=>({...p,[name]:{...(p[name]||{}),...patch}}));

 const run=async()=>{
  if(running||!files.length||!lim)return;setRunning(true);setError('');stop.current=false;const queue=[...files];let index=0;
  while(queue.length&&!stop.current){
   if(activeCount()>=MAX_ACTIVE){setWaiting(true);await sleep(5000);continue;}
   setWaiting(false);const file=queue.shift();index+=1;setCurrent({name:file.name,index,total:files.length});note(file.name,{text:'Starting…',error:'',done:false,bytes:0,total:file.size});
   try{
    const {record,outcome}=await transferFile({file,batch,mode,limits:lim,onInit:r=>{upsert(r);note(file.name,{upload_id:r.upload_id});},onProgress:(text,bytes)=>note(file.name,{text,...(bytes===undefined?{}:{bytes})}),shouldStop:()=>stop.current});
    upsert(record);
    note(file.name,{upload_id:record.upload_id,done:outcome!=='stopped',bytes:outcome==='stopped'?undefined:file.size,text:outcome==='stopped'?'Transfer stopped — select the file again to resume.':outcome==='queued'?'Upload complete ✓ — queued for analysis.':`Already ${outcome.slice(8)} on the app — nothing to upload.`});
   }catch(e){
    if(e.response?.data?.code==='ACTIVE_IMPORT_LIMIT'){queue.unshift(file);index-=1;note(file.name,{text:'Waiting for a free import slot…'});setWaiting(true);await sleep(5000);continue;}
    note(file.name,{error:e.response?errMsg(e):e.message,done:true});
   }
  }
  setRunning(false);setWaiting(false);setCurrent(null);
 };
 const createBatch=async()=>{const name=newBatch.trim();if(!name)return;setCreating(true);setError('');try{const created=await shared.write('post','/batches',{name,metal_type:'silver',category:''});await batches.load();if(created?.id)setBatch(created.id);setNewBatch('');}catch(e){setError(errMsg(e));}finally{setCreating(false);}};
 const [autoNote,setAutoNote]=useState('');
 const autoBatch=async list=>{
  // No batch chosen yet → create one named after the selected files so the upload is never blocked on this step.
  const stems=list.map(f=>f.name.replace(/\.pdf$/i,'')),prefix=stems.reduce((a,b)=>{let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;return a.slice(0,i);}).replace(/[\s_\-.#]*[0-9]*$/,'').replace(/[\s_\-.#]+$/,''),base=(list.length===1?stems[0]:prefix||'PDF import').replace(/[_]+/g,' ').trim();
  const name=`${base}${list.length>1?` (${list.length} files)`:''} · ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}`.slice(0,120);
  setCreating(true);setError('');
  try{const created=await shared.write('post','/batches',{name,metal_type:/gold/i.test(name)?'gold':'silver',category:''});await batches.load();if(created?.id){setBatch(created.id);setAutoNote(`Batch “${name}” was created automatically for the selected files — change it above if you want a different batch.`);}}
  catch(e){setError(`Could not create a batch automatically (${errMsg(e)}). Choose or create one above.`);}
  finally{setCreating(false);}
 };
 const chooseFiles=list=>{setFiles(list);setProgress({});setAutoNote('');if(list.length&&!batch&&!creating)autoBatch(list);};
 const sample=async()=>{setError('');try{await download('/pdf-template/sample.pdf','Yash-Catalog-Template-v1.pdf');}catch(e){setError(errMsg(e));}};
 const batchName=id=>(list||[]).find(b=>b.id===id)?.name;
 const problems=files.map(f=>fileProblem(f,lim)).filter(Boolean);
 const needBatch=!batch&&files.length>0&&!creating;
 const blocker=!cap.data?(cap.error?'Import limits could not be loaded — refresh above.':'Loading import limits…'):batches.error?'Batch list could not be loaded — refresh below.':!batch?(creating?'Creating a batch for the selected files…':list?.length?'Step 1: choose a batch in the “Batch” box above (or create one) — the upload button unlocks as soon as a batch is selected.':'No batches exist yet — type a name below and click “Create & select batch” to unlock the upload button.'):!files.length?'Choose one or more PDFs to enable “Upload & analyze”.':problems[0]||'';
 const active=jobs.filter(j=>!DONE.includes(phases[j.upload_id])&&phases[j.upload_id]!=='missing').length;
 const totalBytes=files.reduce((n,f)=>n+f.size,0),doneBytes=files.reduce((n,f)=>{const p=progress[f.name];return n+(p?.done?f.size:Math.min(p?.bytes||0,f.size));},0);

 return <><PageTitle actions={<><Button variant="outline" data-testid="pdf-download-sample" onClick={sample}>Download sample PDF</Button><Button variant="outline" data-testid="pdf-download-authoring-json" onClick={async()=>{try{await download('/pdf-template/authoring.json','Yash-Catalog-v1.json');}catch(e){setError(errMsg(e));}}}>Authoring JSON</Button></>}>Reviewed PDF import</PageTitle><State resource={cap} id="pdf-capabilities"/><Notice id="pdf-upload-error">{error}</Notice>
 {lim&&<p className="text-sm my-4" data-testid="pdf-limits">Configured: {(lim.max_bytes/1048576).toFixed(0)} MiB · {lim.max_pages} pages · {lim.chunk_bytes/1024} KiB chunks per file · up to {MAX_ACTIVE} imports open at once (app limit) · files upload one after another and the app analyses them in turn.</p>}
 <div className={`filters rounded-md ${needBatch?'ring-2 ring-amber-500 ring-offset-2':''}`} data-testid="pdf-batch-row"><Field name="pdf-batch" title={needBatch?'Batch — required':'Batch'} options={[{value:'',label:batches.busy&&!list?'Loading batches…':'Choose batch'},...(list||[]).map(b=>({value:b.id,label:b.name}))]} value={batch} disabled={running} onChange={setBatch}/><Field name="pdf-mode" title="Import mode" options={[{value:'template_v1',label:'Template v1'},{value:'legacy_pages',label:'Legacy pages · manual review'}]} value={mode} disabled={running} onChange={setMode}/></div>
 <div className="flex flex-wrap items-end gap-2 my-2"><Field name="pdf-new-batch" title="Or create a new batch for this import" value={newBatch} onChange={setNewBatch} disabled={creating}/><Button variant="outline" disabled={creating||!newBatch.trim()} data-testid="pdf-create-batch" onClick={createBatch}>{creating?'Creating…':'Create & select batch'}</Button><State resource={batches} id="pdf-batches"/></div>
 <label className="field my-4">Choose PDF(s) — select several to queue them; a batch is created automatically if none is chosen; to resume an interrupted transfer, select the same file again<input type="file" multiple accept="application/pdf,.pdf" disabled={running} data-testid="pdf-file-input" onChange={e=>chooseFiles(Array.from(e.target.files||[]))}/></label>
 {autoNote&&<p className="text-sm text-emerald-800 -mt-2 mb-3" role="status" data-testid="pdf-auto-batch">{autoNote}</p>}
 {files.length>0&&<ul className="text-sm -mt-2 mb-3 space-y-2" data-testid="pdf-file-summary">{files.map((f,i)=>{const p=progress[f.name],bad=fileProblem(f,lim),pct=p?.done?100:Math.round(Math.min(p?.bytes||0,f.size)/f.size*100);return <li key={f.name+f.size} data-testid={`pdf-file-${i}`}><div><span className="font-medium">{f.name}</span> · {mib(f.size)} MiB{lim?` · ${Math.ceil(f.size/lim.chunk_bytes)} chunks`:''}{bad&&<span className="text-amber-800"> · {bad}</span>}{p?.error&&<span className="text-red-700" role="alert"> · {p.error}</span>}{p?.text&&!p.error&&<span className={p.done?'text-emerald-800':'text-sky-800'}> · {p.text}</span>}</div>{p&&!p.error&&<ProgressBar id={`pdf-file-progress-${i}`} value={pct} done={p.done}/>}</li>;})}</ul>}
 <div className="flex flex-wrap gap-2"><Button disabled={running||!files.length||!batch||!cap.data||problems.length>0} onClick={run} data-testid="pdf-upload-start">{running?'Transferring…':files.length>1?`Upload & analyze ${files.length} files`:'Upload & analyze'}</Button>{running&&<Button variant="outline" data-testid="pdf-queue-stop" onClick={()=>{stop.current=true;}}>Stop after current file</Button>}</div>
 {running&&current&&<div className="mt-3 rounded-md border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900" role="status" data-testid="pdf-queue-progress"><div className="flex flex-wrap justify-between gap-2"><span data-testid="pdf-queue-progress-text">Uploading file {current.index} of {current.total}: <strong>{current.name}</strong>{progress[current.name]?.text?` · ${progress[current.name].text}`:''}</span><span data-testid="pdf-queue-progress-percent">{totalBytes?Math.round(doneBytes/totalBytes*100):0}% overall · {mib(doneBytes)} / {mib(totalBytes)} MiB</span></div><ProgressBar id="pdf-queue-progress-bar" value={totalBytes?Math.round(doneBytes/totalBytes*100):0}/></div>}
 {blocker&&!running&&<p className={`flex items-start gap-2 text-sm mt-3 ${needBatch||(!batch&&!list?.length)?'rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-amber-900 font-medium':'text-amber-800'}`} role="status" data-testid="pdf-upload-blocker">{(needBatch||(!batch&&!list?.length))&&<AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true"/>}<span>{blocker}</span></p>}
 {waiting&&<p className="text-sm text-amber-800 mt-2" role="status" data-testid="pdf-queue-waiting">The app allows {MAX_ACTIVE} open imports at a time and all slots are in use. The next file uploads automatically as soon as you commit or cancel one of the imports below (selected files wait in this browser tab).</p>}
 <section className="detail-section"><h2 data-testid="pdf-jobs-heading">Imports ({jobs.length}) · {active} of {MAX_ACTIVE} slots in use</h2>{!jobs.length&&<p className="text-sm text-slate-500" data-testid="pdf-jobs-empty">No imports yet. Each upload appears here with its own progress, review and outcome.</p>}
  {jobs.map(j=><ImportJob key={j.upload_id} job={j} batchName={batchName(j.batch_id)} capabilities={cap.data} transfer={Object.values(progress).find(p=>p.upload_id===j.upload_id)} reviewOpen={reviewOpen===j.upload_id} onToggleReview={()=>setReviewOpen(reviewOpen===j.upload_id?null:j.upload_id)} onChanged={onChanged} onRemove={()=>{setJobs(prev=>prev.filter(x=>x.upload_id!==j.upload_id));if(reviewOpen===j.upload_id)setReviewOpen(null);}}/>)}</section>
 </>;
}
