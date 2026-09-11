import React, { useCallback, useEffect, useRef, useState } from 'react';
import { shared, errMsg } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

export const label = value => String(value || '').replace(/[-_]/g, ' ').replace(/^./, c => c.toUpperCase());
export const ist = value => value ? new Date(value).toLocaleString('en-IN', {timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}) : 'Unknown';
export const todayIST = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const changed = (before, after) => Object.fromEntries(Object.entries(after).filter(([k,v]) => JSON.stringify(v) !== JSON.stringify(before[k])));
export const duration = seconds => seconds == null ? 'Unknown' : `${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`;

export function useResource(path, params = {}, poll = false) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[updated,setUpdated]=useState(null);
  const serial=JSON.stringify(params),seq=useRef(0);
  const load=useCallback(async()=>{
    if(!path){setBusy(false);return null;} const n=++seq.current;setBusy(true);
    try{const r=await shared.get(path,JSON.parse(serial));if(n===seq.current){setData(r);setError('');setUpdated(Date.now());}return r;}
    catch(e){if(n===seq.current)setError(errMsg(e));return null;}finally{if(n===seq.current)setBusy(false);}
  },[path,serial]);
  useEffect(()=>{setData(null);load();return()=>{seq.current++;};},[load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(!poll)return;const visible=()=>{if(!document.hidden)load();};const id=setInterval(visible,15000);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);return()=>{clearInterval(id);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};},[load,poll]);
  return {data,error,busy,updated,load};
}
export const Field=({name,title,value,onChange,options,type='text',required=false,disabled=false,...props})=><label className="field" htmlFor={name}><span>{title||label(name)}</span>{options?<select id={name} data-testid={name} value={value??''} disabled={disabled} onChange={e=>onChange(e.target.value)} required={required}>{options.map(o=><option key={typeof o==='string'?o:o.value} value={typeof o==='string'?o:o.value}>{typeof o==='string'?label(o):o.label}</option>)}</select>:<Input id={name} data-testid={name} type={type} value={value??''} disabled={disabled} onChange={e=>onChange(e.target.value)} required={required} {...props}/>}</label>;
export const Check=({id,children,value,onChange})=><label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" data-testid={id} checked={!!value} onChange={e=>onChange(e.target.checked)}/>{children}</label>;
export const Notice=({id='page-error',children})=>children?<p role="alert" className="notice" data-testid={id}>{children}</p>:null;
export const State=({resource,id='resource'})=><div className="flex flex-wrap gap-3 items-center text-xs text-slate-500"><Button size="sm" variant="outline" onClick={resource.load} data-testid={`${id}-refresh`} disabled={resource.busy}><RefreshCw size={14}/>Refresh</Button><span data-testid={`${id}-status`}>{resource.busy?'Loading…':resource.error?'Stale · refresh failed':resource.updated?`Updated ${new Date(resource.updated).toLocaleTimeString()}`:'Not loaded'}</span><Notice id={`${id}-error`}>{resource.error}</Notice></div>;
export const Pager=({page,pages,total,onPage,id='page'})=><div className="flex flex-wrap items-center justify-between gap-3 py-4"><p className="text-sm" data-testid={`${id}-total`}>{total??0} records · Page {page} of {Math.max(1,pages||0)}</p><div className="flex gap-2"><Button variant="outline" data-testid={`${id}-previous`} disabled={page<=1} onClick={()=>onPage(page-1)}><ChevronLeft size={16}/>Previous</Button><Button variant="outline" data-testid={`${id}-next`} disabled={page>=(pages||1)} onClick={()=>onPage(page+1)}>Next<ChevronRight size={16}/></Button></div></div>;
export const PageTitle=({children,actions})=><div className="flex flex-wrap items-center justify-between gap-4 mb-6"><h1 className="font-heading text-3xl font-semibold" data-testid="workspace-heading">{children}</h1><div className="flex flex-wrap gap-2">{actions}</div></div>;
export const Table=({columns,rows,id,onRow})=><div className="records" data-testid={`${id}-table`}><table><thead><tr>{columns.map(c=><th key={c.key}>{c.title}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||i} data-testid={`${id}-row-${r.id||i}`}>{columns.map(c=><td key={c.key} data-label={c.title} data-testid={`${id}-${r.id||i}-${c.key}`}>{c.render?c.render(r):r[c.key]??'—'}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="py-8 text-center text-slate-500" data-testid={`${id}-empty`}>No records match.</p>}</div>;