import React,{useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Bell} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {shared,errMsg} from '@/lib/api';
import {useResource,ist} from './SharedUI';
const REQUEST_ID=/^[A-Za-z0-9_-]{1,64}$/;
export const ALERT_ROLES=['admin','telecaller','billing_executive'];

/** Account-specific query alerts from the canonical inbox, polled while the page is visible. Opening one never claims it. */
export function QueryAlerts({me}){
  const navigate=useNavigate(),inbox=useResource('/notifications/inbox',{page:1,limit:30},true),[open,setOpen]=useState(false),[error,setError]=useState(''),box=useRef(null);
  useEffect(()=>{if(!open)return;const close=e=>{if(box.current&&!box.current.contains(e.target))setOpen(false);};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close);},[open]);
  const unread=inbox.data?.unread??0,rows=inbox.data?.notifications||[];
  const openAlert=async n=>{setError('');try{if(!n.read_at)await shared.write('post',`/notifications/inbox/${n.id}/read`);}catch(e){setError(errMsg(e));}
    inbox.load();setOpen(false);
    if(n.request_id&&REQUEST_ID.test(n.request_id))navigate(`/admin/queries?request=${encodeURIComponent(n.request_id)}`);else navigate('/admin/queries');};
  const readAll=async()=>{setError('');try{await shared.write('post','/notifications/inbox/read-all');await inbox.load();}catch(e){setError(errMsg(e));}};
  return <div className="relative" ref={box} data-testid="query-alerts">
    <Button variant="outline" size="sm" aria-label="Query alerts" data-testid="query-alerts-toggle" onClick={()=>{setOpen(o=>!o);if(!open)inbox.load();}}><Bell size={16}/>{unread>0&&<span className="rounded-full bg-[#c21f2b] px-1.5 text-xs text-white" data-testid="query-alerts-unread">{unread}</span>}</Button>
    {open&&<div className="absolute right-0 z-30 mt-2 w-[min(92vw,380px)] rounded-md border bg-white p-3 shadow-lg text-sm" data-testid="query-alerts-panel">
      <div className="flex items-center justify-between gap-2 mb-2"><strong>Query alerts</strong>{unread>0&&<Button variant="link" size="sm" className="h-auto p-0" data-testid="query-alerts-read-all" onClick={readAll}>Mark all read</Button>}</div>
      <p className="text-xs text-slate-500 mb-2" data-testid="query-alerts-note">Alerts for {me.name||'you'} while this website is open. Opening an alert shows the query; it does not take it — use “Take this query” there.</p>
      {error&&<p role="alert" className="notice" data-testid="query-alerts-error">{error}</p>}
      {inbox.error&&<p className="text-xs text-red-700" data-testid="query-alerts-load-error">{inbox.error}</p>}
      <ul className="max-h-80 overflow-auto divide-y">{rows.map(n=><li key={n.id}><button type="button" className={`w-full text-left py-2 ${n.read_at?'text-slate-500':'font-semibold'}`} data-testid={`query-alert-${n.id}`} onClick={()=>openAlert(n)}>
        <span className="block">{n.title||'Alert'}</span><span className="block text-xs font-normal">{n.body}</span><span className="block text-xs font-normal text-slate-400">{ist(n.created_at)} · {n.kind||'alert'}{n.read_at?' · read':''}</span></button></li>)}</ul>
      {!rows.length&&!inbox.busy&&<p className="py-4 text-center text-slate-500" data-testid="query-alerts-empty">No alerts yet.</p>}
    </div>}
  </div>;
}
