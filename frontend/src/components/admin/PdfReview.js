import React,{useState} from 'react';
import {State,useResource,Notice,Pager,Table,Check,Field} from './SharedUI';
import {ProductFields} from './ProductFields';
import {PrivateImage} from './PrivateImage';
import {SquareCrop} from './SquareCrop';
import {shared} from '@/lib/api';
import {isBusy,transient,busyMsg,backoff} from '@/lib/pdfImport';
import {Button} from '@/components/ui/button';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const COMMIT_POLL_MS=5000,COMMIT_BUDGET_MS=30*60*1000;
const clock=ms=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;

const RowEditor=({job,row,capabilities,onSaved,onClose})=>{
 const [fields,setFields]=useState(row.fields),[crop,setCrop]=useState(row.crop_points),[excluded,setExcluded]=useState(!!row.excluded),[duplicate,setDuplicate]=useState(row.duplicate_policy||'skip'),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[wait,setWait]=useState(''),[busy,setBusy]=useState(false);
 const path=`/pdf-upload/${job}/pages/${row.page}/image`,geometry=useResource(path,{metadata:true});
 const save=async()=>{setBusy(true);setError('');setWait('');const payload={version:row.version,fields,excluded,duplicate_policy:duplicate,crop_points:crop};if(duplicate==='update')payload.expected_product_version=row.existing_product?.version;
  for(let attempt=0;attempt<6;attempt++){try{await shared.write('patch',`/pdf-upload/${job}/rows/${row.id}`,payload);await onSaved();onClose();break;}catch(e){if(isBusy(e)&&attempt<5){const ms=backoff(attempt);setWait(`The app server is busy with another import step — saving again in ${Math.round(ms/1000)} s…`);await sleep(ms);continue;}setWait('');setError(busyMsg(e));if(e.response?.data?.code==='VERSION_CONFLICT'){await onSaved();setError('Row changed. Close and reopen it before making a deliberate retry.');}break;}}setBusy(false);
 };
 return <section className="app-dialog" data-testid="pdf-row-editor"><div className="flex justify-between"><h2>Review {row.fields.product_code||'product'} · row v{row.version}</h2><Button variant="ghost" data-testid="pdf-row-close" onClick={onClose}>Close</Button></div><Notice id="pdf-row-error">{error}</Notice>{wait&&<p className="text-sm text-amber-800" role="status" data-testid="pdf-row-wait">{wait}</p>}<ProductFields value={fields} onChange={setFields} prefix="pdf-row"/>
 <Check id="pdf-row-exclude" value={excluded} onChange={setExcluded}>Exclude this row</Check><Notice id="pdf-row-validation">{(row.errors||[]).join(' · ')}</Notice><p className="text-sm" data-testid="pdf-row-warnings">{(row.warnings||[]).join(' · ')}</p>
 {row.existing_product&&<div className="my-4 space-y-3"><p data-testid="pdf-existing-product">Existing {row.existing_product.title||row.existing_product.id} · product v{row.existing_product.version}</p><Field name="pdf-duplicate-policy" value={duplicate} options={[{value:'skip',label:'Skip duplicate (default)'},{value:'update',label:'Update existing product'}]} onChange={v=>{setDuplicate(v);setConfirmed(false);}}/>{duplicate==='update'&&<Check id="pdf-confirm-existing-version" value={confirmed} onChange={setConfirmed}>I confirm updating the displayed product version {row.existing_product.version}.</Check>}</div>}
 <State resource={geometry} id="pdf-geometry"/><SquareCrop path={path} geometry={geometry.data} value={crop} onChange={setCrop} bounds={row.template_version===1?capabilities?.template?.photo_boxes_points?.[row.slot]:null}/>
 <Button className="mt-4" data-testid="pdf-row-save" disabled={busy||(duplicate==='update'&&!confirmed)} onClick={save}>{busy?'Saving…':'Save reviewed row'}</Button></section>;
};

export const PdfReview=({job,status,capabilities,onStatus})=>{
 const [page,setPage]=useState(1),r=useResource(`/pdf-upload/${job}/preview`,{page,limit:10}),[row,setRow]=useState(null),[partial,setPartial]=useState(false),[publish,setPublish]=useState(false),[confirm,setConfirm]=useState(false),[error,setError]=useState(''),[wait,setWait]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState(status.result||null);
 // The app commits every row in one long request under a per-import lock; the browser/proxy may give up
 // long before it finishes and a second click then answers 409. Wait for the outcome instead of failing.
 const commit=async()=>{setBusy(true);setError('');setWait('');
  try{
   const v=await shared.get(`/pdf-upload/${job}/status`);
   if(v.version!==status.version){setError('Job version changed. Review the refreshed rows and confirm again.');setConfirm(false);await r.load();await onStatus();return;}
   const started=Date.now();let res=null;
   while(res===null){
    try{res=await shared.write('post',`/pdf-upload/${job}/commit`,{version:v.version,confirm:true,allow_partial:partial,publish});}
    catch(e){
     if(!transient(e))throw e;
     if(Date.now()-started>COMMIT_BUDGET_MS)throw new Error('The app server has been committing this import for over 30 minutes. Refresh the import status later — created products are kept and committing again retries only the remaining rows.');
     setWait(`The app server is still committing this import (${status.product_count} rows) — large imports take several minutes on a busy server. Waiting… ${clock(Date.now()-started)} elapsed. Keep this page open, or come back later: the outcome appears on the import card.`);
     await sleep(COMMIT_POLL_MS);
     const s=await onStatus();
     if(s?.phase==='committed'||(s?.phase==='review'&&s.result&&s.updated_at!==v.updated_at))res=s.result;
    }
   }
   setResult(res);setConfirm(false);await onStatus();await r.load();
  }catch(e){setError(busyMsg(e));setConfirm(false);await r.load();await onStatus();}finally{setBusy(false);setWait('');}};
 const shown=result||status.result;
 return <section className="detail-section"><h2>Review detected products</h2><State resource={r} id="pdf-preview"/><Notice id="pdf-commit-error">{error}</Notice>
 {wait&&<p className="rounded-md border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900" role="status" data-testid="pdf-commit-progress">{wait}</p>}
 <Table id="pdf-preview" rows={r.data?.rows||[]} columns={[{key:'photo',title:'Crop',render:r=><div className="w-20"><PrivateImage src={`/pdf-upload/${job}/rows/${r.id}/image`} id={`pdf-row-photo-${r.id}`}/></div>},{key:'fields',title:'Product',render:r=><>{r.fields.product_code}<br/>{r.fields.title}<br/>{r.fields.metal_type}</>},{key:'page',title:'Page / block',render:r=>`${r.page+1} / ${r.slot+1}`},{key:'errors',title:'Validation',render:r=><>{(r.errors||[]).join(' · ')||'Valid'}{r.excluded?' · Excluded':''}{r.existing_product?' · Duplicate':''}</>},{key:'actions',title:'Review',render:r=><Button variant="outline" onClick={()=>setRow(r)} disabled={status.phase==='committed'||busy} data-testid={`pdf-review-${r.id}`}>Review fields & crop</Button>}]}/><Pager id="pdf-preview" page={page} pages={Math.ceil((r.data?.total||0)/10)} total={r.data?.total} onPage={setPage}/>
 {row&&<RowEditor key={`${row.id}-${row.version}`} job={job} row={row} capabilities={capabilities} onSaved={async()=>{await r.load();await onStatus();}} onClose={()=>setRow(null)}/>}
 {status.phase!=='committed'&&<div className="space-y-3 mt-5">{shown?.failed>0&&<p className="rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status" data-testid="pdf-commit-retry-hint">{shown.failed} row{shown.failed===1?'':'s'} failed in the last commit (see the outcome below). Products already created are kept — confirm and commit again to retry only the failed rows.</p>}<Check id="pdf-partial" value={partial} onChange={setPartial}>Allow valid-only partial import; show every skipped/failed row.</Check><Check id="pdf-publish" value={publish} onChange={setPublish}>Publish imported products. Otherwise keep hidden drafts.</Check><Check id="pdf-confirm" value={confirm} onChange={setConfirm}>I reviewed the rows and confirm this import.</Check><Button disabled={busy||!confirm||!!row} onClick={commit} data-testid="pdf-commit">{busy?'Committing…':publish?'Commit & publish':'Commit hidden drafts'}</Button></div>}
 {shown&&<section className="detail-section" data-testid="pdf-result"><h2>Canonical import outcome</h2><div className="metrics-strip">{['created','updated','skipped','failed'].map(k=><div key={k}>{k}<strong data-testid={`pdf-result-${k}`}>{shown[k]}</strong></div>)}</div><Table id="pdf-outcomes" rows={shown.rows||[]} columns={[{key:'row_id',title:'Row'},{key:'status',title:'Outcome'},{key:'reason',title:'Reason'},{key:'product_id',title:'Product'}]}/></section>}
 </section>;
};
