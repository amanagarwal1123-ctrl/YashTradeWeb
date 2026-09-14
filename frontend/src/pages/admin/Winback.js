import React,{useState,useCallback,useEffect,useRef} from 'react';
import {Link} from 'react-router-dom';
import {api,errMsg} from '@/lib/api';
import {PageTitle,State,Field,Pager,Table,Notice,ist,label} from '@/components/admin/SharedUI';
import {Button} from '@/components/ui/button';

function useLocal(path,params={}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[updated,setUpdated]=useState(null);const serial=JSON.stringify(params),seq=useRef(0);
  const load=useCallback(async()=>{const n=++seq.current;setBusy(true);try{const r=await api.get(path,{params:JSON.parse(serial)});if(n===seq.current){setData(r.data);setError('');setUpdated(Date.now());}}catch(e){if(n===seq.current)setError(errMsg(e));}finally{if(n===seq.current)setBusy(false);}},[path,serial]);
  useEffect(()=>{load();},[load]);
  return {data,error,busy,updated,load};
}

export default function Winback(){
  const [f,setF]=useState({status:'',source:'',page:1,limit:20}),[selected,setSelected]=useState(null),[note,setNote]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
  const contacts=useLocal('/admin/winback/contacts',f),churn=useLocal('/admin/winback/churn',{months:12}),returning=useLocal('/admin/winback/returning');
  const set=(k,v)=>setF(s=>({...s,[k]:v,page:1}));
  const act=async(action)=>{setBusy(true);setMsg('');try{if(action==='opt_out')await api.post(`/admin/winback/contacts/${selected.id}/opt-out`);else await api.patch(`/admin/winback/contacts/${selected.id}`,{action,note});await contacts.load();await churn.load();setMsg(action==='opt_out'?'Consent withdrawn; personal details erased.':`Marked ${label(action)}.`);setSelected(null);setNote('');}catch(e){setMsg(errMsg(e));}finally{setBusy(false);}};
  const w=churn.data?.winback;
  return <><PageTitle>Win-back & Churn</PageTitle><Notice id="winback-result">{msg}</Notice>
    <Notice id="winback-boundary">Only customers who ticked the offers opt-in while deleting, or asked for a callback first, appear here. Deleted account data is never kept. Withdraw consent the moment a customer asks — “Opt out” erases their details.</Notice>
    <section className="detail-section"><h2>Win-back contacts</h2><State resource={contacts} id="winback-contacts"/>
      <div className="filters"><Field name="winback-status" value={f.status} options={[{value:'',label:'All statuses'},...(contacts.data?.statuses||[]).map(s=>({value:s,label:label(s)}))]} onChange={v=>set('status',v)}/><Field name="winback-source" value={f.source} options={[{value:'',label:'All sources'},{value:'deletion_optin',label:'Opted in at deletion'},{value:'pre_deletion_callback',label:'Asked for a callback'}]} onChange={v=>set('source',v)}/></div>
      <Table id="winback-contacts" rows={contacts.data?.contacts||[]} columns={[{key:'name',title:'Name',render:c=>c.name||'—'},{key:'phone',title:'Phone',render:c=><span className="whitespace-nowrap">{c.phone||'erased'}</span>},{key:'shop_name',title:'Shop'},{key:'location',title:'Place'},{key:'source',title:'Source',render:c=>c.source==='deletion_optin'?'Opted in at deletion':'Asked for a callback'},{key:'reason',title:'Reason',render:c=>c.reason?label(c.reason):'—'},{key:'note',title:'Customer note'},{key:'consented_at',title:'Consented',render:c=>ist(c.consented_at)},{key:'status',title:'Status',render:c=>label(c.status)},{key:'actions',title:'',render:c=>c.status==='opted_out'?'—':<Button size="sm" variant="outline" className="whitespace-nowrap" data-testid={`winback-open-${c.id}`} onClick={()=>{setSelected(c);setNote('');}}>Update</Button>}]}/>
      <Pager id="winback" {...contacts.data} page={f.page} onPage={page=>setF({...f,page})}/>
      {selected&&<section className="app-dialog" data-testid="winback-editor"><h2>{selected.name||'Contact'} · {selected.phone}</h2><p className="text-sm">Status: {label(selected.status)} · {selected.history?.length||0} previous updates</p>
        <Field name="winback-note" title="Call note" value={note} onChange={setNote}/>
        <div className="flex flex-wrap gap-2"><Button disabled={busy} data-testid="winback-mark-contacted" onClick={()=>act('contacted')}>Contacted</Button><Button disabled={busy} data-testid="winback-mark-converted" onClick={()=>act('converted')}>Converted</Button><Button disabled={busy} variant="outline" data-testid="winback-reopen" onClick={()=>act('reopen')}>Reopen</Button><Button disabled={busy} variant="destructive" data-testid="winback-opt-out" onClick={()=>act('opt_out')}>Opt out (erase details)</Button><Button variant="ghost" data-testid="winback-cancel" onClick={()=>setSelected(null)}>Close</Button></div>
        <Table id="winback-history" rows={(selected.history||[]).map((h,i)=>({...h,id:i}))} columns={[{key:'at',title:'At',render:h=>ist(h.at)},{key:'actor_name',title:'By'},{key:'action',title:'Action',render:h=>label(h.action)},{key:'note',title:'Note'}]}/></section>}
    </section>
    <section className="detail-section"><h2>Churn insight (anonymous, last 12 months)</h2><State resource={churn} id="churn"/>
      {churn.data&&<><p className="text-sm" data-testid="churn-summary">{churn.data.total} deletions since {churn.data.from_month} · {w.opted_in} opted in for offers · {w.callbacks} asked for a callback · {w.converted} converted · {w.opted_out} withdrew · {churn.data.returning} returning registrations</p>
        <div className="grid gap-6 lg:grid-cols-3">
          <Table id="churn-month" rows={churn.data.by_month.map(r=>({...r,id:r.month}))} columns={[{key:'month',title:'Month'},{key:'total',title:'Deleted'},{key:'website',title:'Via website'},{key:'app',title:'Via app'}]}/>
          <Table id="churn-location" rows={churn.data.by_location.map(r=>({...r,id:r.location}))} columns={[{key:'location',title:'Place'},{key:'count',title:'Deleted'}]}/>
          <Table id="churn-reason" rows={churn.data.by_reason.map(r=>({...r,id:r.reason}))} columns={[{key:'reason',title:'Reason',render:r=>label(r.reason)},{key:'count',title:'Deleted'}]}/></div></>}
    </section>
    <section className="detail-section"><h2>Returning registrations</h2><State resource={returning} id="returning"/><p className="text-xs text-slate-500" data-testid="returning-note">Flagged when a number deleted earlier registers again through the website. {returning.data?.note}</p>
      <Table id="returning" rows={(returning.data?.returning||[]).map(r=>({...r,id:r.canonical_user_id}))} columns={[{key:'canonical_user_id',title:'Customer',render:r=><Link className="underline" to={`/admin/users/${r.canonical_user_id}`} data-testid={`returning-open-${r.canonical_user_id}`}>{r.canonical_user_id}</Link>},{key:'enrolled_at',title:'Registered again',render:r=>ist(r.enrolled_at)},{key:'previously_deleted_at',title:'Previously deleted',render:r=>ist(r.previously_deleted_at)}]}/></section>
  </>;
}
