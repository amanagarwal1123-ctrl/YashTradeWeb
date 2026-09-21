import React,{useState} from 'react';
import {Field,Notice} from './SharedUI';
import {Button} from '@/components/ui/button';
import {shared,errMsg} from '@/lib/api';
import {phoneDisplay} from '@/lib/phone';
import {STAFF_OPERATION_ERRORS} from './StaffPhoneChange';

const ERRORS={...STAFF_OPERATION_ERRORS,
 CONFIRMATION_REQUIRED:'Confirm the account’s exact canonical ID and the last four digits of its number.',
 SELF_DELETION_DENIED:'Administrators cannot delete their own account here.',
 ROLE_MISMATCH:'Use the matching customer or staff deletion operation.',
 LAST_ADMIN:'This is the last usable administrator; make another administrator active first.',
 OWNER_ADMIN_PROTECTED:'The default owner administrator cannot be deleted.',
 USER_NOT_FOUND:'This account no longer exists in the app. Refresh the list.',
 CUSTOMER_NOT_FOUND:'This customer no longer exists in the app. Refresh the list.'};
const explain=e=>ERRORS[e.response?.data?.code]||errMsg(e);

/** Explicit, step-up-authenticated deletion (staff or customer). Never the reversible Disable. */
export function AccountDeletion({account,kind,onDone,onDeleted}){
  const [form,setForm]=useState({id:'',last4:'',reason:''}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState(null);
  const path=kind==='staff'?`/integrations/staff/${account.id}/delete`:`/customers/${account.id}/delete`;
  const ready=form.id.trim()===account.id&&/^\d{4}$/.test(form.last4)&&form.reason.trim().length>=10;
  const remove=async()=>{setBusy(true);setError('');try{const r=await shared.write('post',path,{reason:form.reason.trim(),confirm_user_id:form.id.trim(),confirm_phone_last4:form.last4});setResult(r);onDeleted&&await onDeleted(r);}catch(e){setError(explain(e));}finally{setBusy(false);}};
  const providers=typeof result?.provider_erasure==='string'?result.provider_erasure:'';
  return <section className="app-dialog border-red-300" data-testid="account-deletion"><h2 className="text-red-800">Delete {kind==='staff'?'staff':'customer'} account — {account.name||account.id}</h2>
    {result?<div className="space-y-2 text-sm" data-testid="account-deletion-result">
      <p className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900" role="status" data-testid="account-deletion-done">{result.already_deleted?'This account was already deleted; nothing was repeated.':'Deleted in the app: sessions and devices revoked, personal data removed or anonymised, tombstone written.'} Reference <code>{result.reference}</code>.{result.queries_released?` ${result.queries_released} open quer${result.queries_released===1?'y':'ies'} returned to the shared queue.`:''}</p>
      <p data-testid="account-deletion-website">This website: {result.website_acknowledged?'its own session/draft rows are gone and the erasure event is acknowledged (app + website cleanup complete).':'cleanup acknowledgement is still pending — it completes on the next reconcile.'}{result.website_sessions_ended?` ${result.website_sessions_ended} website session(s) ended.`:''}</p>
      <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900" data-testid="account-deletion-providers"><strong>Not erased by this action:</strong> copies held by service providers (SMS delivery logs, AI gateway). Provider erasure is a separate manual ledger outcome{providers?` — current state: ${providers.replace(/_/g,' ')}`:''}. Record provider requests in the app’s Deletions panel.</p>
      <Button variant="ghost" data-testid="account-deletion-close" onClick={onDone}>Close</Button></div>
    :<>
      <p className="text-sm text-slate-700" data-testid="account-deletion-warning">This is <strong>not</strong> Disable. Deletion is permanent in the app: {kind==='staff'?'sessions and devices are revoked, open queries return to the shared queue, personal data is removed or anonymised and completion attribution stays in the ledger.':'the account is tombstoned, enquiries are anonymised and a new registration with the same number starts a new account.'} It needs an administrator OTP sign-in from the last 30 minutes.</p>
      <p className="text-xs text-slate-500 break-all" data-testid="account-deletion-target">Canonical ID <code>{account.id}</code> · number {phoneDisplay(account.phone)}</p>
      <div className="fields-grid"><Field name="account-deletion-id" title="Retype the canonical ID" value={form.id} onChange={v=>setForm({...form,id:v})} disabled={busy}/><Field name="account-deletion-last4" title="Last 4 digits of the number" value={form.last4} onChange={v=>setForm({...form,last4:v.replace(/\D/g,'').slice(0,4)})} disabled={busy}/><Field name="account-deletion-reason" title="Audit reason (10–500 characters)" value={form.reason} onChange={v=>setForm({...form,reason:v})} disabled={busy}/></div>
      <Notice id="account-deletion-error">{error}</Notice>
      <div className="flex flex-wrap gap-2 mt-3"><Button variant="destructive" disabled={busy||!ready} data-testid="account-deletion-confirm" onClick={remove}>{busy?'Deleting…':'Delete permanently'}</Button><Button variant="ghost" disabled={busy} data-testid="account-deletion-cancel" onClick={onDone}>Cancel</Button></div>
    </>}
  </section>;
}
