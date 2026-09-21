import React,{useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {PageTitle,State,useResource,Field,Table,Notice,changed} from '@/components/admin/SharedUI';
import {useAdmin,ROLE_LABEL} from '@/components/admin/AdminLayout';
import {StaffPhoneChange,STAFF_OPERATION_ERRORS} from '@/components/admin/StaffPhoneChange';
import {AccountDeletion} from '@/components/admin/AccountDeletion';
import {shared,errMsg} from '@/lib/api';
import {isStaffPhone,normalizePhone,phoneDisplay} from '@/lib/phone';
import {Button} from '@/components/ui/button';
const empty={name:'',phone:'',role:'telecaller',code:'',status:'active'};
const ROLES=['admin','telecaller','billing_executive','upload_executive'];
const roleOptions=ROLES.map(r=>({value:r,label:ROLE_LABEL[r]}));
const same=(a,b)=>normalizePhone(a)===normalizePhone(b);

/** Canonical staff rules, in words the owner can act on. */
export function staffError(e,{form,users}){
 const code=e.response?.data?.code;
 if(code==='ROLE_CONFLICT'){const u=(users||[]).find(x=>same(x.phone,form?.phone));return `${phoneDisplay(form?.phone)} already belongs to staff member ${u?`${u.name} (${ROLE_LABEL[u.role]||u.role})`:'with a different role'}. The app keeps one identity per number — open that record with Edit and change the role there instead of creating a second one.`;}
 if(code==='EXPLICIT_CONVERSION_REQUIRED')return `${phoneDisplay(form?.phone)} is already registered as a customer in the app. Convert that customer into staff below — the app keeps their identity and history instead of creating a duplicate.`;
 if(code==='LAST_ADMIN')return 'This is the last active administrator — make another admin active first, then demote or disable this one.';
 if(code==='USER_NOT_FOUND')return 'This staff record no longer exists in the app. Refresh the directory.';
 return STAFF_OPERATION_ERRORS[code]||errMsg(e);
}

export default function Staff(){
  const {me}=useAdmin(),navigate=useNavigate();
  const r=useResource('/integrations/staff'),[selected,setSelected]=useState(null),[form,setForm]=useState(null),[error,setError]=useState(''),[info,setInfo]=useState(''),[busy,setBusy]=useState(false),[conversion,setConversion]=useState(null),[renumber,setRenumber]=useState(null),[deletion,setDeletion]=useState(null);
  const users=r.data?.users;
  const reset=()=>{setError('');setInfo('');};
  const offerConversion=async f=>{
    // The number belongs to a customer: find that record so the admin never has to type a canonical ID.
    try{const found=await shared.get('/customers',{search:normalizePhone(f.phone).replace(/^\+91/,''),limit:5});const c=(found.customers||found.users||[]).find(x=>same(x.phone,f.phone));
      if(c){setConversion({id:c.id,role:f.role,reason:'',confirm:c.id,customer:c});return;}}
    catch{/* fall through to the manual dialog */}
    setConversion({id:'',role:f.role,reason:'',confirm:'',customer:null});
  };
  const save=async()=>{setBusy(true);reset();try{const body=selected?changed(selected,form):{...form,phone:normalizePhone(form.phone)};delete body.phone_display;if(selected)delete body.phone;const res=await shared.write(selected?'patch':'post',selected?`/integrations/staff/${selected.id}`:'/integrations/staff',body);if(!selected&&res?.created===false)setInfo(`${phoneDisplay(form.phone)} was already a ${ROLE_LABEL[res.user?.role]||'staff'} account (${res.user?.name}) — nothing new was created.`);if(selected&&res?.sessions_revoked)setInfo(`${res.user?.name||selected.name} saved. Their app and website sessions were signed out${res.queries_released?`; ${res.queries_released} open quer${res.queries_released===1?'y':'ies'} returned to the shared queue`:''}.`);setForm(null);await r.load();}catch(e){setError(staffError(e,{form,users}));if(e.response?.data?.code==='EXPLICIT_CONVERSION_REQUIRED')await offerConversion(form);}finally{setBusy(false);}};
  const toggle=async u=>{const disabling=u.account_status!=='inactive'&&u.status!=='inactive';if(disabling&&!window.confirm(`Disable ${u.name}? This is reversible; the record and history are kept and open queries return to the shared queue.`))return;reset();try{const res=await shared.write('patch',`/integrations/staff/${u.id}`,{account_status:disabling?'inactive':'active'});setInfo(`${u.name} is now ${disabling?'disabled (reversible — use Re-enable to restore access)':'active again'}.${res?.queries_released?` ${res.queries_released} open quer${res.queries_released===1?'y':'ies'} returned to the shared queue.`:''}`);await r.load();}catch(e){setError(staffError(e,{form:u,users}));}};
  const convert=async()=>{setBusy(true);reset();try{await shared.write('post',`/integrations/staff/${conversion.id}/convert`,{role:conversion.role,reason:conversion.reason,confirm_user_id:conversion.confirm});setInfo(`${conversion.customer?.name||conversion.id} is now a ${ROLE_LABEL[conversion.role]} with the same identity and history.`);setConversion(null);setForm(null);await r.load();}catch(e){setError(staffError(e,{form,users}));}finally{setBusy(false);}};
  const ordinary=u=>u.role!=='admin';
  const phoneHelp=selected?(selected.id===me.id?<>Your own login number changes through <Button variant="link" className="h-auto p-0 text-sm" data-testid="staff-change-own-phone" onClick={()=>navigate('/admin/account')}>My account → Change my login number</Button> (a code goes to the new number).</>:selected.role==='admin'?<>Administrators change their own number through My account (a code goes to the new number); another administrator cannot renumber them.</>:<>Ordinary staff numbers are changed by an administrator with <Button variant="link" className="h-auto p-0 text-sm" data-testid="staff-open-renumber" onClick={()=>{setForm(null);setRenumber(selected);}}>Change login number</Button> (checked first, then confirmed), or by {selected.name} in My account. Customer numbers cannot be edited here.</>):null;
  const inactive=u=>u.account_status==='inactive'||u.status==='inactive';
  return <><PageTitle actions={<><Button data-testid="staff-add" onClick={()=>{setSelected(null);setForm({...empty});reset();}}>Add staff</Button><Button variant="outline" data-testid="staff-convert-open" onClick={()=>setConversion({id:'',role:'telecaller',reason:'',confirm:'',customer:null})}>Convert existing customer</Button></>}>Staff directory</PageTitle><State resource={r} id="staff"/><Notice id="staff-error">{error}</Notice>{info&&<p className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status" data-testid="staff-info">{info}</p>}
    <p className="text-xs text-slate-500 mt-3" data-testid="staff-controls-note">Disable is reversible (Re-enable restores access). Delete is permanent and asks for the canonical ID, the last four digits and a reason.</p>
    <Table id="staff" rows={users||[]} columns={[{key:'name',title:'Name'},{key:'phone',title:'Phone',render:u=>phoneDisplay(u.phone)},{key:'role',title:'Role',render:u=>ROLE_LABEL[u.role]||u.role},{key:'status',title:'Account',render:u=>inactive(u)?'inactive (disabled)':(u.account_status||u.status||'—')},{key:'actions',title:'Actions',render:u=><div className="flex flex-wrap gap-2"><Button variant="outline" data-testid={`staff-edit-${u.id}`} onClick={()=>{setSelected(u);setForm(Object.fromEntries(Object.keys(empty).map(k=>[k,u[k]||''])));reset();}}>Edit</Button>{ordinary(u)&&<Button variant="outline" data-testid={`staff-renumber-${u.id}`} onClick={()=>{setForm(null);setRenumber(u);reset();}}>Change login number</Button>}<Button variant="outline" data-testid={`staff-${inactive(u)?'enable':'disable'}-${u.id}`} onClick={()=>toggle(u)}>{inactive(u)?'Re-enable':'Disable'}</Button>{u.id!==me.id&&<Button variant="ghost" className="text-red-700" data-testid={`staff-delete-${u.id}`} onClick={()=>{setDeletion(u);reset();}}>Delete</Button>}</div>}]}/>
    {form&&<section className="app-dialog" data-testid="staff-editor"><h2>{selected?'Edit staff':'Create staff identity'}</h2><div className="fields-grid">{['name','phone','code'].map(k=><Field key={k} name={`staff-${k}`} title={k==='phone'?'Phone (10 Indian digits or +country code)':undefined} disabled={!!selected&&k==='phone'} value={k==='phone'&&selected?phoneDisplay(form.phone):form[k]} onChange={v=>setForm({...form,[k]:k==='phone'?v.replace(/[^\d+\s]/g,''):v})}/>)}<Field name="staff-role" options={roleOptions} value={form.role} onChange={v=>setForm({...form,role:v})}/><Field name="staff-status" options={['active','inactive']} value={form.status} onChange={v=>setForm({...form,status:v})}/></div>
      {phoneHelp&&<p className="text-xs text-slate-600 -mt-2 mb-3" data-testid="staff-phone-rule">{phoneHelp}</p>}
      <Button disabled={busy||(!selected&&!isStaffPhone(form.phone))} onClick={save} data-testid="staff-save">Save</Button><Button variant="ghost" data-testid="staff-cancel" onClick={()=>setForm(null)}>Cancel</Button></section>}
    {conversion&&<section className="app-dialog" data-testid="staff-conversion"><h2>{conversion.customer?`Convert customer ${conversion.customer.name} into staff`:'Explicit customer conversion'}</h2>
      {conversion.customer?<p className="text-sm" data-testid="conversion-customer">{phoneDisplay(conversion.customer.phone)}{conversion.customer.shop_name?` · ${conversion.customer.shop_name}`:''}{conversion.customer.location?` · ${conversion.customer.location}`:''} · canonical ID <code className="break-all">{conversion.customer.id}</code>. The identity and its history are kept; the person keeps logging in with the same number.</p>:<p>Preserves the existing canonical identity. Confirm the exact ID and reason.</p>}
      <div className="fields-grid">{(conversion.customer?['reason']:['id','reason','confirm']).map(k=><Field key={k} name={`conversion-${k}`} title={k==='confirm'?'Retype canonical ID':k==='reason'?'Reason (at least 10 characters)':k} value={conversion[k]} onChange={v=>setConversion({...conversion,[k]:v})}/>)}<Field name="conversion-role" options={roleOptions} value={conversion.role} onChange={v=>setConversion({...conversion,role:v})}/></div>
      <Button disabled={busy||!conversion.id||conversion.id!==conversion.confirm||conversion.reason.trim().length<10} onClick={convert} data-testid="conversion-submit">{conversion.customer?`Convert to ${ROLE_LABEL[conversion.role]}`:'Confirm conversion'}</Button><Button variant="ghost" onClick={()=>setConversion(null)} data-testid="conversion-cancel">Cancel</Button></section>}
    {renumber&&<StaffPhoneChange key={renumber.id} staff={renumber} onDone={()=>setRenumber(null)} onReload={()=>r.load()}/>}
    {deletion&&<AccountDeletion kind="staff" account={deletion} onDone={()=>setDeletion(null)} onDeleted={()=>r.load()}/>}
  </>;
}
