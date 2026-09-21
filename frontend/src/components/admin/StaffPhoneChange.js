import React,{useState} from 'react';
import {Field,Notice} from './SharedUI';
import {ROLE_LABEL} from './AdminLayout';
import {Button} from '@/components/ui/button';
import {shared,errMsg} from '@/lib/api';
import {isStaffPhone,normalizePhone,phoneDisplay} from '@/lib/phone';

export const STAFF_OPERATION_ERRORS={
 RECENT_AUTH_REQUIRED:'For this change the app needs an administrator OTP sign-in from the last 30 minutes. Sign out, sign in again with a fresh OTP, then check the number again.',
 PREVIEW_EXPIRED:'The checked result expired (10 minutes). Check the number again before confirming.',
 PREVIEW_MISMATCH:'The confirmation you saw described a different account or number. Check the number again.',
 VERSION_CONFLICT:'This staff record changed since you opened it (perhaps by another administrator). The directory was reloaded — check the number again.',
 PHONE_UNCHANGED:'This is already the staff member’s current login number; nothing to change.',
 CUSTOMER_PROMOTION_REQUIRED:'This number belongs to an existing customer. Promote that customer explicitly (their own account) or choose another number; the staff member being edited is unchanged.',
 PHONE_OWNED_BY_STAFF:'This number already belongs to another staff account. Disable or renumber that account first — two staff accounts never share a login number.',
 PHONE_CONFLICT:'This number was claimed by another account a moment ago. Check the number again.',
 CONFIRMATION_REQUIRED:'The confirmation did not match this account. Reload the directory and try again.',
 IDEMPOTENCY_MISMATCH:'This operation key was already used for a different change. Check the number again to start a fresh operation.',
 OPERATION_INCOMPLETE:'The login number was changed but the app could not finish its audit record. Use “Retry the same operation” — it finishes the same change and never creates another one.',
 ADMIN_SELF_SERVICE_REQUIRED:'Administrators change their own number through My account (a code goes to the new number); another administrator cannot renumber them.',
 OWNER_ADMIN_PROTECTED:'The owner administrator’s login number is never changed by another administrator.',
 EXPLICIT_CONVERSION_REQUIRED:'This is a customer account. Use the explicit customer promotion instead.',
 PHONE_CHANGE_OPERATION_REQUIRED:'Login numbers change through “Change login number” (administrator, ordinary staff) or the staff member’s own My account page.',
 UNSUPPORTED_COUNTRY:'Supported countries: India (+91), USA and Canada (+1), Australia (+61).',
 INVALID_PHONE:'Enter 10 Indian mobile digits, or an international number with its country code (+1, +61).',
};
export const staffOperationError=e=>STAFF_OPERATION_ERRORS[e.response?.data?.code]||errMsg(e);
const newKey=()=>(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Administrator-controlled login-number change for ORDINARY staff: preview → confirm with the shown number. */
export function StaffPhoneChange({staff,onDone,onReload}){
  const [phone,setPhone]=useState(''),[reason,setReason]=useState(''),[preview,setPreview]=useState(null),[key,setKey]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState(null),[promo,setPromo]=useState({role:'telecaller',reason:''});
  const edit=v=>{setPhone(v);setPreview(null);setKey(null);setError('');setResult(null);};
  const check=async()=>{setBusy(true);setError('');setResult(null);try{const r=await shared.write('post',`/integrations/staff/${staff.id}/phone/preview`,{new_phone:normalizePhone(phone)});setPreview(r);setKey(r.status==='available'?newKey():null);}catch(e){setError(staffOperationError(e));setPreview(null);}finally{setBusy(false);}};
  const confirm=async()=>{setBusy(true);setError('');try{const r=await shared.write('post',`/integrations/staff/${staff.id}/phone`,{new_phone:preview.new_phone,reason:reason.trim(),confirm_user_id:staff.id,expected_phone:staff.phone,idempotency_key:key,preview_token:preview.preview_token});setResult(r);setPreview(null);onReload&&await onReload();}
    catch(e){const code=e.response?.data?.code;setError(staffOperationError(e));if(code!=='OPERATION_INCOMPLETE'&&code!=='RECENT_AUTH_REQUIRED'){setPreview(null);setKey(null);onReload&&await onReload();}}finally{setBusy(false);}};
  const promote=async()=>{setBusy(true);setError('');try{const r=await shared.write('post',`/integrations/staff/${preview.customer.id}/convert`,{role:promo.role,reason:promo.reason.trim(),confirm_user_id:preview.customer.id});setResult({promoted:r.user});setPreview(null);onReload&&await onReload();}catch(e){setError(staffOperationError(e));}finally{setBusy(false);}};
  const incomplete=error&&error===STAFF_OPERATION_ERRORS.OPERATION_INCOMPLETE&&preview&&key;
  return <section className="app-dialog" data-testid="staff-phone-change"><h2>Change login number — {staff.name} ({ROLE_LABEL[staff.role]||staff.role})</h2>
    <p className="text-sm text-slate-600" data-testid="staff-phone-change-rule">Current number <strong data-testid="staff-phone-current">{phoneDisplay(staff.phone)}</strong>. The account, role, code, assignments and history stay the same; only the login number changes. The app first checks who holds the new number and you confirm exactly what it shows. Administrators’ own numbers change through My account, never here.</p>
    {result?.user&&<p className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 my-3" role="status" data-testid="staff-phone-changed">{result.user.name} now signs in with <strong>{result.new_phone_display||phoneDisplay(result.new_phone)}</strong> (was {result.old_phone_masked}). All their app and website sessions were signed out{result.website_sessions_ended?` (${result.website_sessions_ended} website session${result.website_sessions_ended===1?'':'s'} ended)`:''}; the new number must be verified by OTP at their next sign-in.{result.replayed?' (This confirmation had already been applied — nothing was repeated.)':''}{result.recovered?' (An interrupted earlier attempt was completed.)':''}</p>}
    {result?.promoted&&<p className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 my-3" role="status" data-testid="staff-phone-promoted">Customer {result.promoted.name} is now a {ROLE_LABEL[result.promoted.role]||result.promoted.role} on their own account (ID kept). {staff.name} is unchanged and keeps {phoneDisplay(staff.phone)}.</p>}
    <div className="flex flex-wrap items-end gap-2 mt-3"><Field name="staff-phone-new" title="New login number (10 Indian digits or +country code)" value={phone} onChange={v=>edit(v.replace(/[^\d+\s]/g,''))} disabled={busy}/><Button disabled={busy||!isStaffPhone(phone)||normalizePhone(phone)===staff.phone} data-testid="staff-phone-check" onClick={check}>{busy&&!preview?'Checking…':'Check number'}</Button></div>
    {normalizePhone(phone)&&normalizePhone(phone)===staff.phone&&<p className="text-xs text-slate-600" data-testid="staff-phone-same">This is already the current login number.</p>}
    {preview&&<div className="rounded-md border bg-slate-50 p-4 text-sm space-y-2 mt-3" data-testid="staff-phone-preview">
      <p><strong data-testid="staff-phone-preview-status">{{available:'Number is free',customer:'Number belongs to a customer',staff:'Number belongs to another staff member',unchanged:'Unchanged'}[preview.status]||preview.status}</strong> · checked number <strong data-testid="staff-phone-preview-number">{preview.new_phone_display||phoneDisplay(preview.new_phone)}</strong></p>
      <p data-testid="staff-phone-preview-outcome">{preview.outcome}</p>
      {preview.status==='available'&&<><Field name="staff-phone-reason" title="Reason (10–500 characters, recorded in the audit history)" value={reason} onChange={setReason} disabled={busy}/>
        <div className="flex flex-wrap gap-2"><Button disabled={busy||reason.trim().length<10} data-testid="staff-phone-confirm" onClick={confirm}>{busy?'Please wait…':incomplete?'Retry the same operation':`Change ${staff.name}’s number to ${preview.new_phone_display||phoneDisplay(preview.new_phone)}`}</Button></div>
        <p className="text-xs text-slate-500" data-testid="staff-phone-preview-expiry">This confirmation is valid for {Math.round((preview.preview_expires_in||600)/60)} minutes and only for the account and numbers shown above.</p></>}
      {preview.status==='customer'&&<div className="space-y-2" data-testid="staff-phone-promotion"><p className="text-xs text-slate-600">Customer <strong>{preview.customer?.name||'(no name)'}</strong> · {preview.customer?.masked_phone} · canonical ID <code className="break-all">{preview.customer?.id}</code>. Promotion keeps their own account, ID and history. Nothing is merged: <strong>{staff.name}</strong> stays unchanged with {phoneDisplay(staff.phone)}.</p>
        <div className="fields-grid"><Field name="staff-phone-promotion-role" title="Staff role for the promoted customer" options={['telecaller','billing_executive','upload_executive','admin'].map(r=>({value:r,label:ROLE_LABEL[r]}))} value={promo.role} onChange={v=>setPromo({...promo,role:v})}/><Field name="staff-phone-promotion-reason" title="Reason (10–500 characters)" value={promo.reason} onChange={v=>setPromo({...promo,reason:v})}/></div>
        <Button variant="outline" disabled={busy||promo.reason.trim().length<10} data-testid="staff-phone-promote" onClick={promote}>Promote {preview.customer?.name||'this customer'} to {ROLE_LABEL[promo.role]}</Button></div>}
      {preview.status==='staff'&&<p className="text-xs text-slate-600" data-testid="staff-phone-owned">Held by {preview.owner?.name||'(no name)'} ({ROLE_LABEL[preview.owner?.role]||preview.owner?.role}) · {preview.owner?.masked_phone}. This is not a change you can confirm here.</p>}
    </div>}
    <Notice id="staff-phone-error">{error}</Notice>
    <Button variant="ghost" className="mt-3" data-testid="staff-phone-close" onClick={onDone}>Close</Button>
  </section>;
}
