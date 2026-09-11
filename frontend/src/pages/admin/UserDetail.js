import React,{useEffect,useState} from 'react';
import {useParams,Link} from 'react-router-dom';
import {PageTitle,State,useResource,Field,Notice,Table,ist,changed} from '@/components/admin/SharedUI';
import {Button} from '@/components/ui/button';
import {shared,errMsg} from '@/lib/api';
export default function UserDetail(){
  const {id}=useParams(),r=useResource(`/customers/${id}`),staff=useResource('/integrations/staff',{role:'telecaller',status:'active'});const [form,setForm]=useState({}),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{if(r.data)setForm(Object.fromEntries(['name','shop_name','location','city','account_status','assigned_salesperson'].map(k=>[k,r.data[k]||''])));},[r.data]);
  const save=async()=>{setBusy(true);setMsg('');try{await shared.write('patch',`/customers/${id}`,changed(r.data,form));await r.load();setMsg('Canonical profile updated.');}catch(e){setMsg(errMsg(e));}finally{setBusy(false);}};
  return <><PageTitle>Customer profile</PageTitle><Link to="/admin/users" data-testid="customers-back" className="underline">All customers</Link><State resource={r} id="customer-detail"/><Notice id="customer-save-result">{msg}</Notice>
    {r.data&&<><p className="mt-4" data-testid="customer-canonical-id">Canonical ID: {r.data.id}</p><p data-testid="customer-phone-readonly">Phone: {r.data.phone} · Verified phone correction is not available to administrators.</p>
    <div className="fields-grid">{['name','shop_name','location','city'].map(k=><Field key={k} name={`edit-customer-${k}`} value={form[k]} onChange={v=>setForm({...form,[k]:v})}/>)}<Field name="edit-customer-account-status" value={form.account_status} options={['active','inactive']} onChange={v=>setForm({...form,account_status:v})}/><Field name="edit-customer-assignment" title="Assigned telecaller" value={form.assigned_salesperson} options={[{value:'',label:'Unassigned'},...(staff.data?.users||[]).map(u=>({value:u.id,label:u.name}))]} onChange={v=>setForm({...form,assigned_salesperson:v})}/></div>
    <Button disabled={busy} onClick={save} data-testid="customer-save">Save profile</Button>
    <div className="detail-section"><h2>Recent history</h2><p data-testid="customer-history-limit">Up to {r.data.detail_limit} recent queries and {r.data.detail_limit} activity entries. Not a full history export.</p><Link data-testid="customer-query-search" className="underline" to={`/admin/queries?search=${encodeURIComponent(r.data.phone)}`}>Search paginated enquiries by phone</Link>
    <Table id="customer-history" rows={r.data.queries||[]} columns={[{key:'request_type',title:'Type'},{key:'status',title:'Status'},{key:'created_at',title:'Created',render:u=>ist(u.created_at)}]}/>
    <Table id="customer-activity" rows={r.data.activity||[]} columns={[{key:'action',title:'Action'},{key:'notes',title:'Note'},{key:'created_at',title:'At',render:u=>ist(u.created_at)}]}/></div></>}
  </>;
}