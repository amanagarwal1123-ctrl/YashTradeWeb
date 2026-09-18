import React,{useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {PageTitle,State,useResource,Field,Table,Notice,changed} from '@/components/admin/SharedUI';
import {useAdmin} from '@/components/admin/AdminLayout';
import {shared,errMsg} from '@/lib/api';
import {Button} from '@/components/ui/button';
const empty={name:'',phone:'',role:'telecaller',code:'',status:'active'};
const ROLE_LABEL={admin:'Admin',telecaller:'Telecaller',billing_executive:'Billing executive'};
const digits=v=>String(v||'').replace(/\D/g,'').slice(-10);

/** Canonical staff rules, in words the owner can act on. */
export function staffError(e,{form,users}){
 const code=e.response?.data?.code;
 if(code==='ROLE_CONFLICT'){const u=(users||[]).find(x=>digits(x.phone)===digits(form?.phone));return `${form?.phone} already belongs to staff member ${u?`${u.name} (${ROLE_LABEL[u.role]||u.role})`:'with a different role'}. The app keeps one identity per number — open that record with Edit and change the role there instead of creating a second one.`;}
 if(code==='PHONE_VERIFICATION_REQUIRED')return 'A login number can only be changed by its holder: they sign in and use My account → Change my login number (a code goes to the new number).';
 if(code==='EXPLICIT_CONVERSION_REQUIRED')return `${form?.phone} is already registered as a customer in the app. Convert that customer into staff below — the app keeps their identity and history instead of creating a duplicate.`;
 if(code==='LAST_ADMIN')return 'This is the last active administrator — make another admin active first, then demote or disable this one.';
 if(code==='OWNER_ADMIN_PROTECTED')return 'The default owner administrator cannot be demoted or disabled from here.';
 if(code==='USER_NOT_FOUND')return 'This staff record no longer exists in the app. Refresh the directory.';
 return errMsg(e);
}

export default function Staff(){
  const {me}=useAdmin(),navigate=useNavigate();
  const r=useResource('/integrations/staff'),[selected,setSelected]=useState(null),[form,setForm]=useState(null),[error,setError]=useState(''),[info,setInfo]=useState(''),[busy,setBusy]=useState(false),[conversion,setConversion]=useState(null);
  const users=r.data?.users;
  const offerConversion=async f=>{
    // The number belongs to a customer: find that record so the admin never has to type a canonical ID.
    try{const found=await shared.get('/customers',{search:digits(f.phone),limit:5});const c=(found.customers||found.users||[]).find(x=>digits(x.phone)===digits(f.phone));
      if(c){setConversion({id:c.id,role:f.role,reason:'',confirm:c.id,customer:c});return;}}
    catch{/* fall through to the manual dialog */}
    setConversion({id:'',role:f.role,reason:'',confirm:'',customer:null});
  };
  const save=async()=>{setBusy(true);setError('');setInfo('');try{const res=await shared.write(selected?'patch':'post',selected?`/integrations/staff/${selected.id}`:'/integrations/staff',selected?changed(selected,form):form);if(!selected&&res?.created===false)setInfo(`${form.phone} was already a ${ROLE_LABEL[res.user?.role]||'staff'} account (${res.user?.name}) — nothing new was created.`);setForm(null);await r.load();}catch(e){setError(staffError(e,{form,users}));if(e.response?.data?.code==='EXPLICIT_CONVERSION_REQUIRED')await offerConversion(form);}finally{setBusy(false);}};
  const disable=async u=>{if(!window.confirm(`Disable ${u.name}? Canonical history will be preserved.`))return;setError('');try{await shared.write('delete',`/integrations/staff/${u.id}`);await r.load();}catch(e){setError(staffError(e,{form:u,users}));}};
  const convert=async()=>{setBusy(true);setError('');try{await shared.write('post',`/integrations/staff/${conversion.id}/convert`,{role:conversion.role,reason:conversion.reason,confirm_user_id:conversion.confirm});setInfo(`${conversion.customer?.name||conversion.id} is now a ${ROLE_LABEL[conversion.role]} with the same identity and history.`);setConversion(null);setForm(null);await r.load();}catch(e){setError(staffError(e,{form,users}));}finally{setBusy(false);}};
  const phoneHelp=selected?(selected.id===me.id?<>Login numbers are verified by their holder. <Button variant="link" className="h-auto p-0 text-sm" data-testid="staff-change-own-phone" onClick={()=>navigate('/admin/account')}>Change my login number</Button> (a code goes to the new number).</>:<>Login numbers are verified by their holder: ask {selected.name} to sign in and use <strong>My account → Change my login number</strong> (a code goes to the new number). Administrators cannot set another person's number.</>):null;
  return <><PageTitle actions={<><Button data-testid="staff-add" onClick={()=>{setSelected(null);setForm({...empty});setError('');setInfo('');}}>Add staff</Button><Button variant="outline" data-testid="staff-convert-open" onClick={()=>setConversion({id:'',role:'telecaller',reason:'',confirm:'',customer:null})}>Convert existing customer</Button></>}>Staff directory</PageTitle><State resource={r} id="staff"/><Notice id="staff-error">{error}</Notice>{info&&<p className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status" data-testid="staff-info">{info}</p>}
    <Table id="staff" rows={users||[]} columns={[{key:'name',title:'Name'},{key:'phone',title:'Phone'},{key:'role',title:'Role'},{key:'status',title:'Account'},{key:'actions',title:'Actions',render:u=><div className="flex gap-2"><Button variant="outline" data-testid={`staff-edit-${u.id}`} onClick={()=>{setSelected(u);setForm(Object.fromEntries(Object.keys(empty).map(k=>[k,u[k]||''])));setError('');setInfo('');}}>Edit</Button><Button variant="outline" data-testid={`staff-disable-${u.id}`} onClick={()=>disable(u)}>Disable</Button></div>}]}/>
    {form&&<section className="app-dialog" data-testid="staff-editor"><h2>{selected?'Edit staff':'Create staff identity'}</h2><div className="fields-grid">{['name','phone','code'].map(k=><Field key={k} name={`staff-${k}`} disabled={!!selected&&k==='phone'} value={form[k]} onChange={v=>setForm({...form,[k]:v})}/>)}<Field name="staff-role" options={['admin','telecaller','billing_executive']} value={form.role} onChange={v=>setForm({...form,role:v})}/><Field name="staff-status" options={['active','inactive']} value={form.status} onChange={v=>setForm({...form,status:v})}/></div>
      {phoneHelp&&<p className="text-xs text-slate-600 -mt-2 mb-3" data-testid="staff-phone-rule">{phoneHelp}</p>}
      <Button disabled={busy} onClick={save} data-testid="staff-save">Save</Button><Button variant="ghost" data-testid="staff-cancel" onClick={()=>setForm(null)}>Cancel</Button></section>}
    {conversion&&<section className="app-dialog" data-testid="staff-conversion"><h2>{conversion.customer?`Convert customer ${conversion.customer.name} into staff`:'Explicit customer conversion'}</h2>
      {conversion.customer?<p className="text-sm" data-testid="conversion-customer">+91 {conversion.customer.phone}{conversion.customer.shop_name?` · ${conversion.customer.shop_name}`:''}{conversion.customer.location?` · ${conversion.customer.location}`:''} · canonical ID <code className="break-all">{conversion.customer.id}</code>. The identity and its history are kept; the person keeps logging in with the same number.</p>:<p>Preserves the existing canonical identity. Confirm the exact ID and reason.</p>}
      <div className="fields-grid">{(conversion.customer?['reason']:['id','reason','confirm']).map(k=><Field key={k} name={`conversion-${k}`} title={k==='confirm'?'Retype canonical ID':k==='reason'?'Reason (at least 10 characters)':k} value={conversion[k]} onChange={v=>setConversion({...conversion,[k]:v})}/>)}<Field name="conversion-role" options={['admin','telecaller','billing_executive']} value={conversion.role} onChange={v=>setConversion({...conversion,role:v})}/></div>
      <Button disabled={busy||!conversion.id||conversion.id!==conversion.confirm||conversion.reason.trim().length<10} onClick={convert} data-testid="conversion-submit">{conversion.customer?`Convert to ${ROLE_LABEL[conversion.role]}`:'Confirm conversion'}</Button><Button variant="ghost" onClick={()=>setConversion(null)} data-testid="conversion-cancel">Cancel</Button></section>}
  </>;
}
