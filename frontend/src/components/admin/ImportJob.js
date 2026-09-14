import React,{useCallback,useEffect,useState} from 'react';
import {CheckCircle2,AlertTriangle,Loader2,PauseCircle,XCircle} from 'lucide-react';
import {State,useResource,Notice} from './SharedUI';
import {PdfReview} from './PdfReview';
import {api,shared,errMsg} from '@/lib/api';
import {Button} from '@/components/ui/button';

const TONE={ok:'bg-emerald-50 text-emerald-900 border-emerald-300',warn:'bg-amber-50 text-amber-900 border-amber-300',info:'bg-sky-50 text-sky-900 border-sky-300',muted:'bg-slate-50 text-slate-700 border-slate-300'};
const ICON={ok:CheckCircle2,warn:AlertTriangle,info:Loader2,muted:PauseCircle};

function watchText(watch){
 if(!watch)return '';const page=(watch.page??0)+1,max=watch.max_attempts_per_page;
 if(watch.active)return `Website auto-retry is ON: if the app server runs out of its per-page time budget, the website resumes from the saved checkpoint automatically (page ${page}, attempt ${watch.attempts||0} of ${max}, ${watch.total_resumes||0} automatic resume${watch.total_resumes===1?'':'s'} so far). You may close this tab and review later.`;
 return {paused_by_operator:'Auto-retry paused with the import. Use Resume analysis to continue.',stopped_by_operator:'Auto-retry stopped by you.',upload_incomplete:'Auto-retry waits for the file transfer to finish.',
  needs_correction:'Auto-retry stopped: the app reported a problem with the PDF itself. Correct the source and upload again.',
  page_retry_exhausted:`Auto-retry stopped: page ${page} failed ${max} times in a row on the app server (${watch.last_error||'RENDER_TIMEOUT'}). This is the app server's per-page time budget, not your file — ${watch.page||0} pages are saved. Click Resume analysis to try again (auto-retry restarts), or ask the app team to raise the page budget.`,
  resume_budget_exhausted:'Auto-retry stopped after 400 automatic resumes. Click Resume analysis to continue from the checkpoint.',time_budget_exhausted:'Auto-retry stopped after 6 hours. Click Resume analysis to continue from the checkpoint.',
  session_ended:'Auto-retry stopped because your website session ended. Click Resume analysis to continue from the checkpoint.',access_ended:'Auto-retry stopped: the app no longer accepts this session for the import. Click Resume analysis to continue.',
  app_unreachable:'Auto-retry stopped: the app could not be reached for two minutes. Click Resume analysis when it is back.'}[watch.stopped_reason]??'';
}

export function banner(s,transfer,watch){
 if(transfer?.error)return {tone:'warn',text:`Transfer failed: ${transfer.error}`};
 if(transfer?.text&&!transfer.done)return {tone:'info',text:transfer.text};
 if(!s)return {tone:'muted',text:'Loading job status…'};
 const products=`${s.product_count} product${s.product_count===1?'':'s'}`;
 switch(s.phase){
  case 'uploading':return {tone:'warn',text:`Transfer incomplete (${s.bytes_received} of ${s.file_size} bytes). Select this same file again and click Upload to resume.`};
  case 'queued':return {tone:'ok',text:'Upload complete ✓ — waiting for the app to start the analysis (imports are analysed one after another).'};
  case 'analyzing':return {tone:'info',text:`Upload complete ✓ — analysing page ${s.pages_processed} of ${s.total_pages??'?'} · ${products} detected so far.`};
  case 'review':return {tone:'ok',text:`Upload and analysis complete ✓ — ${products} detected on ${s.total_pages} pages. Review the rows below and commit to create them.`};
  case 'committed':{const r=s.result||{};return {tone:'ok',text:`Import committed ✓ — ${r.created??0} created · ${r.updated??0} updated · ${r.skipped??0} skipped · ${r.failed??0} failed.`};}
  case 'paused':return {tone:'muted',text:'Paused. Resume analysis to continue.'};
  case 'error':return {tone:'warn',text:`Stopped at page ${s.pages_processed} of ${s.total_pages??'?'}: ${s.error||'error'}`};
  case 'cancelled':return {tone:'muted',text:'Cancelled — remove it from this list.'};
  case 'expired':return {tone:'muted',text:'Expired on the app server (temporary files are kept 7 days) — remove it from this list and upload again.'};
  default:return {tone:'muted',text:s.phase};
 }
}

export function ImportJob({job,batchName,capabilities,transfer,reviewOpen,onToggleReview,onRemove,onChanged}){
 const jid=job.upload_id,status=useResource(`/pdf-upload/${jid}/status`,{},true),[watch,setWatch]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const loadWatch=useCallback(async()=>{try{const r=await api.get(`/admin/pdf-watch/${jid}`);setWatch(r.data);}catch(e){if(e.response?.status===404)setWatch(null);}},[jid]);
 useEffect(()=>{loadWatch();},[loadWatch]);
 const s=status.data,phase=s?.phase,working=['queued','analyzing'].includes(phase)||(phase==='error'&&watch?.active);
 useEffect(()=>{if(!working)return;const t=setInterval(()=>{if(!document.hidden){status.load();loadWatch();}},3000);return()=>clearInterval(t);},[working,status.load,loadWatch]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(transfer?.done){status.load();loadWatch();}},[transfer?.done]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{onChanged?.(jid,status.error&&!s?'missing':phase);},[jid,phase,status.error]); // eslint-disable-line react-hooks/exhaustive-deps
 const act=async kind=>{if(kind==='cancel'&&!window.confirm('Cancel this import permanently? A paused import can resume; a cancelled one cannot.'))return;setBusy(true);setError('');try{await shared.write('post',`/pdf-upload/${jid}/${kind}`,{});await status.load();await loadWatch();}catch(e){setError(errMsg(e));}finally{setBusy(false);}};
 const b=banner(s,transfer,watch),Icon=ICON[b.tone],done=['committed','cancelled','expired'].includes(phase);
 return <section className="app-dialog" data-testid={`pdf-job-${jid}`}>
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="!mb-1" data-testid={`pdf-job-title-${jid}`}>{job.filename}</h2><p className="text-xs text-slate-500 break-all" data-testid={`pdf-resume-identity-${jid}`}>{job.file_size} bytes · batch {batchName||job.batch_id} · {job.mode==='legacy_pages'?'legacy pages':'template v1'} · Job {jid}</p></div><State resource={status} id={`pdf-job-status-${jid}`}/></div>
  <div className={`mt-4 flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${TONE[b.tone]}`} role={b.tone==='warn'?'alert':undefined} data-testid={`pdf-job-banner-${jid}`}><Icon className={`mt-0.5 shrink-0 ${b.tone==='info'?'animate-spin':''}`} size={20} aria-hidden="true"/><span data-testid={`pdf-job-banner-text-${jid}`}>{b.text}</span></div>
  {s&&<div className="metrics-strip"><div>Phase<strong data-testid={`pdf-phase-${jid}`}>{s.phase}</strong></div><div>Bytes<strong data-testid={`pdf-byte-progress-${jid}`}>{s.bytes_received} / {s.file_size}</strong></div><div>Analysis pages<strong data-testid={`pdf-page-progress-${jid}`}>{s.pages_processed} / {s.total_pages??'Unknown'}</strong></div><div>Detected products<strong data-testid={`pdf-product-count-${jid}`}>{s.product_count}</strong></div></div>}
  <Notice id={`pdf-job-error-${jid}`}>{error}</Notice>{['queued','analyzing','error'].includes(phase)&&watchText(watch)&&<p className={`text-sm ${watch?.active?'text-emerald-800':'text-amber-800'}`} data-testid={`pdf-watch-${jid}`}>{watchText(watch)}</p>}
  <div className="mt-4 flex flex-wrap gap-2">
   {['uploading','queued','analyzing'].includes(phase)&&<Button variant="outline" disabled={busy} data-testid={`pdf-pause-${jid}`} onClick={()=>act('pause')}>Pause</Button>}
   {['paused','error'].includes(phase)&&<Button disabled={busy} data-testid={`pdf-resume-analysis-${jid}`} onClick={()=>act('resume')}>Resume analysis</Button>}
   {s&&!done&&<Button variant="destructive" disabled={busy} data-testid={`pdf-cancel-${jid}`} onClick={()=>act('cancel')}>Cancel import</Button>}
   {['review','committed'].includes(phase)&&<Button variant={reviewOpen?'outline':'default'} data-testid={`pdf-toggle-review-${jid}`} onClick={onToggleReview}>{reviewOpen?'Hide review':phase==='review'?'Review & commit':'Show outcome'}</Button>}
   {(done||status.error)&&<Button variant="ghost" data-testid={`pdf-remove-${jid}`} onClick={onRemove}><XCircle size={16}/>Remove from list</Button>}
  </div>
  {reviewOpen&&s&&['review','committed'].includes(phase)&&<PdfReview job={jid} status={s} capabilities={capabilities} onStatus={status.load}/>}
 </section>;
}
