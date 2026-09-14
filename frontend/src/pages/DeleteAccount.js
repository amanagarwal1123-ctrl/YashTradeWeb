import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { api, errMsg } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';
import { AuthAvailability, useAuthAvailability } from '@/components/public/AuthAvailability';

const REASONS=[['','Prefer not to say'],['not_buying','I no longer buy silver or gold'],['other_supplier','I buy from another supplier'],['app_problems','Problems with the app'],['too_many_messages','Too many messages or calls'],['privacy','Privacy concerns'],['other','Other']];

function Row({tone,testid,title,children}){
 const Icon=tone==='ok'?CheckCircle2:tone==='pending'?Clock:AlertTriangle,cls=tone==='ok'?'border-emerald-300 bg-emerald-50 text-emerald-900':tone==='pending'?'border-sky-300 bg-sky-50 text-sky-900':'border-amber-300 bg-amber-50 text-amber-900';
 return <div className={`flex gap-3 rounded-md border px-4 py-3 text-sm ${cls}`} data-testid={testid}><Icon size={20} className="mt-0.5 shrink-0" aria-hidden="true"/><div><p className="font-semibold">{title}</p><div className="mt-1 space-y-1">{children}</div></div></div>;
}

export function DeletionOutcome({result,phone}){
 const ext=result.erasure?.external||{};
 const sms=ext.sms_provider?.provider||'MSG91',ai=ext.ai_provider?.provider||'Anthropic (Claude) via Emergent LLM gateway';
 const complete=result.deletion_complete===true,acked=result.website_acknowledged===true,awaiting=result.awaiting_other_consumers||[];
 return <section data-testid="deletion-result" className="space-y-3">
  <h2 className="text-xl font-semibold" data-testid="deletion-result-heading">{complete?'Your account has been deleted':'Your account access has been removed'}</h2>
  <p data-testid="deletion-reference">Deletion reference: <code>{result.reference}</code> — keep it for any question about this request.</p>
  <Row tone="ok" testid="deletion-app-status" title="App: deleted or anonymised now">
   <p>Your sign-in stopped working and every session was signed out. Name, phone number, shop, location, cart, wishlist, rewards, telecaller notes, AI chat history and consent, and the one-time-code records for your number were deleted. Your enquiries were anonymised (type, status, dates and assignee remain without your details).</p>
   {typeof result.erasure?.local_personal_records_remaining==='number'&&<p data-testid="deletion-app-remaining">Personal records remaining in the app: <strong>{result.erasure.local_personal_records_remaining}</strong>{result.erasure.requests_anonymized!==undefined?` · enquiries anonymised: ${result.erasure.requests_anonymized}`:''}</p>}
  </Row>
  {acked
   ?<Row tone="ok" testid="deletion-website-status" title={complete?'This website: cleaned up and acknowledged — deletion recorded as complete':'This website: cleaned up and acknowledged'}>
     <p>Your enrolment record, drafts, cached data and sessions on this website were removed and verified gone before we acknowledged the app's erasure event.</p>
     {complete?<p>The app has recorded your deletion as <strong>complete</strong>.</p>:awaiting.length>0&&<p data-testid="deletion-awaiting">The app is still waiting for: {awaiting.join(', ')}. This website cannot acknowledge on their behalf.</p>}
    </Row>
   :<Row tone="pending" testid="deletion-website-status" title="This website: acknowledgement pending">
     <p>Your website records are removed and the acknowledgement to the app will be sent automatically within 30 days of your request (normally within minutes). Nothing further is needed from you.</p>
    </Row>}
  <Row tone="warn" testid="deletion-provider-status" title="Not erased by this request: copies held by service providers">
   <p>Our SMS provider (<strong>{sms}</strong>) keeps its own delivery records of the one-time codes sent to your number. If you used the app's AI assistant, <strong>{ai}</strong> keep whatever they retain under their own terms. We have no per-user deletion request we can send them, so we do not claim these copies are erased.</p>
  </Row>
  <div className="rounded-md border px-4 py-3 text-sm" data-testid="deletion-kept">
   <p className="font-semibold">Kept without your name or number in readable form</p>
   <ul className="list-disc pl-5 mt-1 space-y-1">
    <li>A keyed hash of your phone number with the deletion time (app and this website), so a retried enrolment cannot silently recreate your account.</li>
    <li>The deletion reference and its timestamps as proof that your request was honoured.</li>
    <li>Anonymised enquiry statistics in the app, and anonymous deletion statistics on this website{result.churn_reason_recorded?' (including the reason you chose)':''}.</li>
    {result.winback_contact_kept&&<li data-testid="deletion-winback-kept">Because you ticked the offers box: your name and phone number, kept separately for up to 12 months so we can contact you about offers. Tell our caller, or write to info@yashornaments.in, to withdraw at any time.</li>}
   </ul>
  </div>
  <p className="text-sm"><Link to="/privacy#delete" className="underline" data-testid="deletion-policy-link">Read the full deletion section of the privacy policy</Link></p>
 </section>;
}

export default function DeleteAccount() {
  const availability=useAuthAvailability('deletion');
  const [phone,setPhone]=useState(''), [challenge,setChallenge]=useState(null), [otp,setOtp]=useState(''), [confirm,setConfirm]=useState(false), [reason,setReason]=useState(''), [keepInTouch,setKeepInTouch]=useState(false), [note,setNote]=useState(''), [callbackMode,setCallbackMode]=useState(false), [result,setResult]=useState(null), [callback,setCallback]=useState(null), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const run=async fn=>{setBusy(true);setError('');try{await fn();}catch(e){setError(errMsg(e));}finally{setBusy(false);}};
  const sendOtp=()=>run(async()=>{const r=await api.post('/delete/send-otp',{phone});setChallenge(r.data);});
  const confirmDeletion=()=>run(async()=>{const r=await api.post('/delete/confirm',{phone,otp,challenge_id:challenge.challenge_id,winback_consent:keepInTouch,...(reason?{reason}:{})});setResult({...r.data,churn_reason_recorded:!!reason});});
  const requestCallback=()=>run(async()=>{const r=await api.post('/delete/callback',{phone,otp,challenge_id:challenge.challenge_id,note});setCallback(r.data);});
  const submit=e=>{e.preventDefault();if(!availability.available)return;if(!challenge)return sendOtp();callbackMode?requestCallback():confirmDeletion();};
  return <div className="min-h-screen flex flex-col"><PublicHeader/><main className="w-full max-w-xl mx-auto p-6 flex-1 space-y-5">
    <h1 className="font-heading text-3xl" data-testid="deletion-heading">Delete your account</h1>
    <div className="text-sm space-y-2" data-testid="deletion-retention-notice">
      <p>Confirm with the one-time code sent to your registered number. <strong>Immediately:</strong> all sessions are signed out, your login stops working, and your name, phone number, shop, location, cart, wishlist, rewards, telecaller notes and AI chat history are deleted in the app; your enquiries are anonymised. This website removes its enrolment record, drafts and sessions and acknowledges the deletion — normally within the same minute, at most within 30 days.</p>
      <p><strong>Not erased by this request:</strong> the SMS provider's delivery records of one-time codes sent to your number and, if you used the app's AI assistant, the AI provider's copies — we have no per-user deletion request for them. <strong>Kept:</strong> a keyed hash of your number with the deletion time, the deletion reference, and anonymous statistics — none in readable form. <Link to="/privacy#delete" className="underline" data-testid="deletion-notice-policy-link">Details in the privacy policy</Link>.</p>
    </div>
    {!result && !callback && <AuthAvailability state={availability} prefix="deletion" />}
    {callback?<section data-testid="callback-result" className="space-y-3"><h2 className="text-xl font-semibold">Callback requested — your account is unchanged</h2><p>Reference: {callback.reference}</p><p>Our team will call you on {phone}. Nothing has been deleted. You can return here any time to delete your account.</p></section>
    :result?<DeletionOutcome result={result} phone={phone}/>
    :<form onSubmit={submit} className="space-y-4">
      <label htmlFor="delete-phone">Phone number</label><Input id="delete-phone" value={phone} disabled={!!challenge} onChange={e=>setPhone(e.target.value)} pattern="[6-9][0-9]{9}" required maxLength={10} data-testid="delete-phone-input"/>
      {challenge&&<>
        <label htmlFor="delete-otp">{challenge.otp_length}-digit verification OTP</label><Input id="delete-otp" inputMode="numeric" autoComplete="one-time-code" value={otp} maxLength={challenge.otp_length} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))} data-testid="delete-otp-input"/>
        <div className="rounded-md border p-4 space-y-3" data-testid="talk-first-panel"><p className="font-medium">Talk to us first?</p><p className="text-sm">If something went wrong, a Yash Ornaments team member can call you back before anything is deleted. Your account stays exactly as it is.</p>
          {callbackMode&&<><label htmlFor="callback-note" className="text-sm">Anything we should know? (optional)</label><Input id="callback-note" maxLength={300} value={note} onChange={e=>setNote(e.target.value)} data-testid="callback-note-input"/></>}
          <Button type="button" variant={callbackMode?'default':'outline'} onClick={()=>setCallbackMode(m=>!m)} data-testid="callback-toggle-button">{callbackMode?'Cancel callback request':'Request a callback instead of deleting'}</Button></div>
        {!callbackMode&&<>
          <label htmlFor="delete-reason" className="text-sm">Why are you leaving? (optional, stored without your name)</label>
          <select id="delete-reason" className="w-full rounded-md border p-2" value={reason} onChange={e=>setReason(e.target.value)} data-testid="delete-reason-select">{REASONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
          <label className="flex gap-2 items-start text-sm"><input className="mt-1" type="checkbox" checked={keepInTouch} onChange={e=>setKeepInTouch(e.target.checked)} data-testid="winback-consent-checkbox"/><span>Yash Ornaments may keep my name and phone number for up to 12 months to contact me about offers. I can withdraw at any time by telling the caller or writing to info@yashornaments.in. (Optional — your account is deleted either way.)</span></label>
          <label className="flex gap-2"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)} data-testid="delete-confirm-checkbox"/>I confirm permanent account deletion.</label></>}
      </>}
      {error&&<p role="alert" data-testid="delete-error" className="text-red-700">{error}</p>}
      <Button disabled={busy||!availability.available||availability.checking||(!!challenge&&!callbackMode&&!confirm)||(!!challenge&&otp.length<(challenge.otp_length||4))} variant={callbackMode?'default':'destructive'} data-testid="delete-submit-button">{busy?'Please wait…':!challenge?'Send verification OTP':callbackMode?'Verify & request callback':'Verify & Delete Account'}</Button>
    </form>}<Link to="/privacy" data-testid="delete-privacy-link" className="underline">Privacy and retention policy</Link>
  </main><PublicFooter/></div>;
}
