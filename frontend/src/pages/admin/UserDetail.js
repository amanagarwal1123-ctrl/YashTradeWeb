import React,{useEffect,useState} from 'react';
import {useParams,Link} from 'react-router-dom';
import {PageTitle,State,useResource,Field,Notice,Table,Pager,ist,changed} from '@/components/admin/SharedUI';
import {AccountDeletion} from '@/components/admin/AccountDeletion';
import {Button} from '@/components/ui/button';
import {shared,errMsg} from '@/lib/api';
import {phoneDisplay} from '@/lib/phone';
const PROFILE=['name','shop_name','location','city','assigned_salesperson'];
export default function UserDetail(){
  const {id}=useParams(),r=useResource(`/customers/${id}`),staff=useResource('/integrations/staff',{role:'telecaller',status:'active'});const [form,setForm]=useState({}),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[deletion,setDeletion]=useState(false);
  useEffect(()=>{if(r.data)setForm(Object.fromEntries(PROFILE.map(k=>[k,r.data[k]||''])));},[r.data]);
  const save=async()=>{setBusy(true);setMsg('');try{await shared.write('patch',`/customers/${id}`,changed(r.data,form));await r.load();setMsg('Canonical profile updated.');}catch(e){setMsg(errMsg(e));}finally{setBusy(false);}};
  const inactive=r.data&&(r.data.account_status==='inactive'||r.data.status==='inactive'),deleted=r.data?.account_status==='deleted';
  // Disable is reversible (PATCH account_status); Delete is the explicit canonical deletion with confirmation.
  const toggle=async()=>{if(!inactive&&!window.confirm(`Disable ${r.data.name}? Sign-in is blocked immediately; the account and history are kept and can be re-enabled.`))return;setBusy(true);setMsg('');try{await shared.write('patch',`/customers/${id}`,{account_status:inactive?'active':'inactive'});await r.load();setMsg(inactive?'Account re-enabled.':'Account disabled (reversible). App sessions were revoked.');}catch(e){setMsg(errMsg(e));}finally{setBusy(false);}};
  return <><PageTitle>Customer profile</PageTitle><Link to="/admin/users" data-testid="customers-back" className="underline">All customers</Link><State resource={r} id="customer-detail"/><Notice id="customer-save-result">{msg}</Notice>
    {r.data&&<><p className="mt-4" data-testid="customer-canonical-id">Canonical ID: {r.data.id}</p><p data-testid="customer-phone-readonly">Phone: {phoneDisplay(r.data.phone)} · Customer numbers are never edited by staff: the customer verifies a new number themselves in the app.</p>
    <p data-testid="customer-account-status">Account: <strong>{deleted?'deleted':inactive?'inactive (disabled)':(r.data.account_status||'active')}</strong></p>
    {!deleted&&<div className="flex flex-wrap gap-2 my-3" data-testid="customer-account-controls"><Button variant="outline" disabled={busy} data-testid={inactive?'customer-enable':'customer-disable'} onClick={toggle}>{inactive?'Re-enable account':'Disable account (reversible)'}</Button><Button variant="ghost" className="text-red-700" disabled={busy} data-testid="customer-delete-open" onClick={()=>setDeletion(true)}>Delete account…</Button></div>}
    {deletion&&!deleted&&<AccountDeletion kind="customer" account={r.data} onDone={()=>setDeletion(false)} onDeleted={()=>r.load()}/>}
    {!deleted&&<><div className="fields-grid">{['name','shop_name','location','city'].map(k=><Field key={k} name={`edit-customer-${k}`} value={form[k]} onChange={v=>setForm({...form,[k]:v})}/>)}<Field name="edit-customer-assignment" title="Assigned telecaller" value={form.assigned_salesperson} options={[{value:'',label:'Unassigned'},...(staff.data?.users||[]).map(u=>({value:u.id,label:u.name}))]} onChange={v=>setForm({...form,assigned_salesperson:v})}/></div>
    <Button disabled={busy} onClick={save} data-testid="customer-save">Save profile</Button></>}
    <div className="detail-section"><h2>Recent history</h2><p data-testid="customer-history-limit">Up to {r.data.detail_limit} recent queries and {r.data.detail_limit} activity entries. Not a full history export.</p>
    <Table id="customer-history" rows={r.data.queries||[]} columns={[{key:'request_type',title:'Type'},{key:'status',title:'Status'},{key:'created_at',title:'Created',render:u=>ist(u.created_at)}]}/>
    <Table id="customer-activity" rows={r.data.activity||[]} columns={[{key:'action',title:'Action'},{key:'notes',title:'Note'},{key:'created_at',title:'At',render:u=>ist(u.created_at)}]}/></div>
    <CompleteHistory customerId={r.data.id}/></>}
  </>;
}

const TYPES=['','video_call','ask_price','callback','similar_products','hold_item','quick_reorder','cart_selection'];
export function CompleteHistory({customerId}){
  const [f,setF]=useState({status:'all',request_type:'',sort:'newest',page:1,limit:30});const h=useResource(`/requests`,{customer_id:customerId,...f});
  const set=(k,v)=>setF(s=>({...s,[k]:v,page:1}));
  return <div className="detail-section"><h2>Complete enquiry history</h2><p className="text-xs text-slate-500" data-testid="customer-complete-history-scope">Paginated by immutable canonical customer ID (includes older user_id-backed enquiries). Total <strong data-testid="customer-complete-history-total">{h.data?.total??'…'}</strong> enquiries.</p>
    <div className="filters"><Field name="history-status" value={f.status} options={['all','open','pending','in_progress','contacted','no_response','resolved','cancelled'].map(v=>({value:v,label:v==='all'?'All statuses':v.replace('_',' ')}))} onChange={v=>set('status',v)}/><Field name="history-request_type" title="Type" value={f.request_type} options={TYPES.map(v=>({value:v,label:v?v.replace('_',' '):'All types'}))} onChange={v=>set('request_type',v)}/><Field name="history-sort" value={f.sort} options={[{value:'newest',label:'Newest first'},{value:'oldest',label:'Oldest first'}]} onChange={v=>set('sort',v)}/></div>
    <State resource={h} id="customer-complete-history"/>
    <Table id="customer-complete-history" rows={h.data?.requests||[]} columns={[{key:'request_type',title:'Type'},{key:'status',title:'Status'},{key:'assignee_name',title:'Telecaller',render:q=>q.assignee_name||'Unassigned'},{key:'created_at',title:'Created',render:q=>ist(q.created_at)},{key:'resolved_at',title:'Resolved',render:q=>q.resolved_at?ist(q.resolved_at):'—'}]}/>
    <Pager id="customer-complete-history" {...h.data} page={f.page} onPage={page=>setF({...f,page})}/></div>;
}
