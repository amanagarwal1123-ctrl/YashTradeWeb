import React,{useState} from 'react';
import {useResource,State,Field,Table,Pager,ist,todayIST,label} from './SharedUI';
import {Button} from '@/components/ui/button';
const OUTCOME={converted:'Converted',not_interested:'Not interested',other:'Other'};

/** Completion counts from the app's immutable completion ledger (inclusive IST dates, 1–366 days; reopened completions stop counting). */
export const CompletionReport=({me,onOpen})=>{
  const [range,setRange]=useState({start:todayIST(),end:todayIST()}),[telecaller,setTelecaller]=useState(''),[page,setPage]=useState(1);
  const params={start:range.start,end:range.end,page,limit:50,...(telecaller?{telecaller}:{})};
  const r=useResource('/requests/reports/completions',params,true),d=r.data;
  const pick=id=>{setTelecaller(id===telecaller?'':id);setPage(1);};
  return <section className="detail-section" data-testid="completion-report"><h2>Completion report · IST</h2>
    <div className="filters"><Field name="report-start" type="date" title="From (inclusive)" value={range.start} onChange={v=>{setRange({...range,start:v});setPage(1);}}/><Field name="report-end" type="date" title="To (inclusive)" value={range.end} onChange={v=>{setRange({...range,end:v});setPage(1);}}/></div>
    <State resource={r} id="completion-report"/>
    {d&&<><div className="metrics-strip"><div><span>Completed queries in range</span><strong data-testid="report-total-completed">{d.total_completed}</strong></div><div><span>Calendar days</span><strong data-testid="report-days">{d.calendar_days}</strong></div><div><span>Ledger records</span><strong data-testid="report-total-records">{d.total_records}</strong></div></div>
    <p className="text-xs text-slate-500" data-testid="report-semantics">{d.semantics?.completed}. {d.semantics?.reopen}. {d.semantics?.retry}. {me.role==='telecaller'?'Telecallers see their own completions only.':'Click a telecaller to narrow the records; click again to clear.'}</p>
    <Table id="report-telecallers" rows={d.telecallers||[]} columns={[{key:'name',title:'Telecaller',render:u=><Button variant={telecaller===u.id?'default':'link'} data-testid={`report-pick-${u.id}`} onClick={()=>pick(u.id)}>{u.name}</Button>},{key:'role',title:'Role',render:u=>label(u.role)},{key:'completed',title:'Completed (distinct queries)'},{key:'records',title:'Ledger records'},{key:'account_status',title:'Account'}]}/>
    <Table id="report-records" rows={(d.records||[]).map(x=>({...x,id:x.id||x.key}))} columns={[{key:'completed_at',title:'Completed · IST',render:x=>ist(x.completed_at)},{key:'actor_name',title:'By'},{key:'request_type',title:'Type',render:x=>label(x.request_type)},{key:'customer_name',title:'Customer',render:x=>`${x.customer_name||'—'}${x.shop_name?` · ${x.shop_name}`:''}`},{key:'outcome',title:'Outcome',render:x=>OUTCOME[x.outcome]||label(x.outcome)},{key:'request_id',title:'Query',render:x=><Button variant="link" data-testid={`report-open-${x.request_id}`} onClick={()=>onOpen(x.request_id)}>Open</Button>}]}/>
    <Pager id="report-records" total={d.total_records} pages={d.pages} page={page} onPage={setPage}/></>}
  </section>;
};
