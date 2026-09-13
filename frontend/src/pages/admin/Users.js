import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '@/lib/api';
import {PageTitle,State,useResource,Field,Pager,Table,ist} from '@/components/admin/SharedUI';
export default function Users(){
  const [f,setF]=useState({page:1,limit:20});const r=useResource('/customers',f,true);const staff=useResource('/integrations/staff',{role:'telecaller',status:'active'});const [returning,setReturning]=useState({});
  const set=(k,v)=>setF(s=>({...s,[k]:v,page:1}));const opts=[{value:'',label:'All'},{value:'unassigned',label:'Unassigned'},...(staff.data?.users||[]).map(u=>({value:u.id,label:u.name}))];
  const phones=(r.data?.customers||[]).map(u=>u.phone).filter(Boolean).join(',');
  useEffect(()=>{if(!phones){setReturning({});return;}api.post('/admin/winback/match',{phones:phones.split(',')}).then(x=>setReturning(x.data.returning||{})).catch(()=>setReturning({}));},[phones]);
  return <><PageTitle>Customers</PageTitle><State resource={r} id="customers"/>
  <div className="filters"><Field name="customer-search" title="Name, phone, shop, location" value={f.search} onChange={v=>set('search',v)}/>
    {[['account_status',['','active','inactive']],['login_state',['','logged_in','never']],['onboarding_status',['','completed','pending']]].map(([k,o])=><Field key={k} name={`customer-${k}`} value={f[k]} options={o.map(v=>({value:v,label:v||'All'}))} onChange={v=>set(k,v)}/>)}
    <Field name="customer-assigned-to" title="Telecaller" value={f.assigned_to} options={opts} onChange={v=>set('assigned_to',v)}/>
    {['registered_from','registered_to','login_from','login_to'].map(k=><Field key={k} name={`customer-${k}`} title={`${k.startsWith('login')?'Mobile login':'Registration'} ${k.endsWith('from')?'from':'to'} · IST`} type="date" value={f[k]} onChange={v=>set(k,v)}/>)}
  </div><p className="text-xs text-slate-500" data-testid="customer-date-scope">Inclusive IST ranges · maximum 366 days. Unknown mobile login dates remain unknown.</p>
  <Table id="customers" rows={r.data?.customers||[]} columns={[{key:'number',title:'#'},{key:'name',title:'Customer',render:u=><>
    <Link className="underline" to={`/admin/users/${u.id}`} data-testid={`customer-open-${u.id}`}>{u.name}</Link>{returning[u.phone]&&<span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900" title={`Previously deleted ${ist(returning[u.phone])}`} data-testid={`customer-returning-${u.id}`}>Returning</span>}</>},{key:'phone',title:'Phone'},{key:'shop_name',title:'Shop'},{key:'location',title:'Place',render:u=>u.location||u.city||'Unknown'},{key:'registered_at',title:'Registration',render:u=>ist(u.registered_at)},{key:'last_mobile_login_at',title:'Last mobile login',render:u=>ist(u.last_mobile_login_at)},{key:'account_status',title:'Account'},{key:'onboarding_status',title:'Step 1 / App login',render:u=>`${u.step1_complete?'Complete':'Pending'} / ${u.has_logged_in?'Logged in':'Never recorded'}`} ]}/>
  <Pager id="customers" {...r.data} page={f.page} onPage={page=>setF({...f,page})}/></>;
}
