import React,{useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useAdmin} from '@/components/admin/AdminLayout';
import {PageTitle,State,useResource,Field,Pager,Table,ist,duration,label} from '@/components/admin/SharedUI';
import {CompletionReport} from '@/components/admin/QueryMetrics';
import {QueryDetail} from '@/components/admin/QueryDetail';
import {Button} from '@/components/ui/button';
import {phoneDisplay} from '@/lib/phone';
const VIEWS=[['all_pending','All pending'],['my_pending','My pending'],['unassigned','Unassigned'],['my_completed','My completed'],['completed','Completed history'],['all','All records']];
const COMPLETED=new Set(['my_completed','completed']);
const REQUEST_ID=/^[A-Za-z0-9_-]{1,64}$/;
const base=search=>({page:1,limit:20,view:'all_pending',sort:'fresh',search:search||''});
export default function Queries(){
  const {me}=useAdmin(),[url,setUrl]=useSearchParams(),[f,setF]=useState(base(url.get('search'))),[id,setId]=useState(REQUEST_ID.test(url.get('request')||'')?url.get('request'):null);
  const wanted=url.get('request');
  useEffect(()=>{if(wanted&&REQUEST_ID.test(wanted))setId(wanted);},[wanted]);
  // No default date cutoff and no local record cap: the server filters the full authorized history and pages continue to `pages`.
  const r=useResource('/requests',Object.fromEntries(Object.entries(f).filter(([,v])=>v!==''&&v!=null)),true),catalog=useResource('/requests/catalog'),staff=useResource('/requests/staff-options'),active=useResource(me.role==='admin'?'/integrations/staff':null,{status:'active'});
  const set=(k,v)=>setF(s=>({...s,[k]:v,page:1}));const people=staff.data?.users||[],opts=[{value:'',label:'All'},...people.map(u=>({value:u.id,label:u.name}))];
  // Switching to a completed view drops an inherited status filter (otherwise completed records stay hidden) and sorts by completion.
  const view=v=>setF(s=>({...s,view:v,page:1,status:v==='unassigned'?'open':'',sort:COMPLETED.has(v)?'completed':s.sort==='completed'?'fresh':s.sort}));
  const heads=catalog.data?.heads||[],headLabel=h=>catalog.data?.head_labels?.[h]||label(h),counts=r.data?.counts||{};
  const close=()=>{setId(null);if(url.get('request')){url.delete('request');setUrl(url,{replace:true});}};
  return <><PageTitle>Customer enquiries</PageTitle><State resource={r} id="queries"/>
    <div className="flex flex-wrap gap-2 mt-4">{VIEWS.map(([v,title])=><Button key={v} variant={f.view===v?'default':'outline'} onClick={()=>view(v)} data-testid={`query-view-${v}`}>{title}{v==='all_pending'&&counts.all_pending!=null?` · ${counts.all_pending}`:''}{v==='my_pending'&&counts.my_pending!=null?` · ${counts.my_pending}`:''}</Button>)}</div>
    <div className="filters"><Field name="query-search" title="Name, phone, shop, place" value={f.search} onChange={v=>set('search',v)}/><Field name="query-type" options={[{value:'',label:'All types'},...(catalog.data?.types||[])]} value={f.request_type} onChange={v=>set('request_type',v)}/><Field name="query-head" title="Query head" options={[{value:'',label:'All heads'},...heads.map(h=>({value:h,label:headLabel(h)}))]} value={f.head} onChange={v=>set('head',v)}/>{!COMPLETED.has(f.view)&&<Field name="query-status" options={[{value:'',label:f.view==='all'?'Server default':'Open (view)'},'all','open',...(catalog.data?.statuses||[])]} value={f.status} onChange={v=>set('status',v)}/>}<Field name="query-sort" title="Order" options={[{value:'fresh',label:'Fresh first (released & new on top)'},{value:'oldest',label:'Oldest first'},{value:'newest',label:'Newest first'},{value:'longest_wait',label:'Longest wait'},{value:'completed',label:'Latest completed'}]} value={f.sort} onChange={v=>set('sort',v)}/>
    {['assignee','resolver'].map(k=><Field key={k} name={`query-${k}`} title={k==='assignee'?'Current holder':'Completed by'} options={opts} value={f[k]} onChange={v=>set(k,v)}/>)}
    {['created_from','created_to','resolved_from','resolved_to'].map(k=><Field key={k} name={`query-${k}`} title={`${label(k)} · IST`} type="date" value={f[k]} onChange={v=>set(k,v)}/>)}
    {['min_age_minutes','max_age_minutes'].map(k=><Field key={k} name={`query-${k}`} title={label(k)} type="number" min="0" value={f[k]} onChange={v=>set(k,v)}/>)}</div>
    <div className="flex flex-wrap gap-2">{(catalog.data?.types||[]).map(t=><Button key={t} variant="outline" size="sm" data-testid={`query-count-${t}`} onClick={()=>{set('request_type',t);}}>{label(t)} · {r.data?.open_counts_by_type?.[t]??0}</Button>)}{heads.map(h=><Button key={h} variant="ghost" size="sm" data-testid={`query-head-count-${h}`} onClick={()=>set('head',h)}>{headLabel(h)} · {r.data?.open_counts_by_head?.[h]??0}</Button>)}</div>
    <p className="text-xs text-slate-500 mt-2" data-testid="query-release-note">Every open query returns to pending/new and to the top of the queue at 03:00 IST (app rule); notes and history are kept. This list refreshes about every 15 seconds while visible.</p>
    <Table id="queries" rows={r.data?.requests||[]} columns={[{key:'customer_name',title:'Customer',render:q=><Button variant="link" data-testid={`query-open-${q.id}`} onClick={()=>setId(q.id)}>{q.customer_name||q.user_name||'Unknown'}<br/>{q.customer_deleted?'Deleted customer':q.customer_phone_display||phoneDisplay(q.customer_phone||q.user_phone)}</Button>},{key:'customer_shop_name',title:'Shop / Place',render:q=>`${q.customer_shop_name||q.shop_name||'—'} / ${q.customer_location||q.user_city||'—'}`},{key:'request_type',title:'Type',render:q=>label(q.request_type)},{key:'head',title:'Head · Status',render:q=><span data-testid={`query-head-${q.id}`}>{q.status==='resolved'?`Completed · ${label(q.outcome||'other')}`:`${q.head_label||headLabel(q.head)} · ${label(q.status)}`}</span>},{key:'created_at',title:'Created · IST',render:q=>ist(q.created_at)},{key:'pending_seconds',title:'Current wait',render:q=>q.status==='resolved'?'—':duration(q.pending_seconds)},{key:'follow_up_at',title:'Follow-up',render:q=>q.follow_up_at?ist(q.follow_up_at):'—'},{key:'assignee_id',title:'Holder',render:q=><span data-testid={`query-holder-${q.id}`}>{q.assignee_name||people.find(p=>p.id===q.assignee_id)?.name||(q.assignee_id?'Staff':'Unassigned')}</span>},{key:'resolver_id',title:'Completed by',render:q=>q.resolver_name||q.completed_by_name||people.find(p=>p.id===q.resolver_id)?.name||'—'}]}/><Pager id="queries" {...r.data} page={f.page} onPage={page=>setF({...f,page})}/>
    {id&&<QueryDetail key={id} id={id} me={me} catalog={catalog.data} options={[...people.filter(u=>!(active.data?.users||[]).some(a=>a.id===u.id)),...(active.data?.users||[])]} onClose={close} onChanged={r.load}/>}
    {me.role!=='billing_executive'&&<CompletionReport key={me.id} me={me} onOpen={setId}/>}
  </>;
}
