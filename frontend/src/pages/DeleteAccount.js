import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';
import { AuthAvailability, useAuthAvailability } from '@/components/public/AuthAvailability';

const REASONS=[['','Prefer not to say'],['not_buying','I no longer buy silver or gold'],['other_supplier','I buy from another supplier'],['app_problems','Problems with the app'],['too_many_messages','Too many messages or calls'],['privacy','Privacy concerns'],['other','Other']];

export default function DeleteAccount() {
  const availability=useAuthAvailability('deletion');
  const [phone,setPhone]=useState(''), [challenge,setChallenge]=useState(null), [otp,setOtp]=useState(''), [confirm,setConfirm]=useState(false), [reason,setReason]=useState(''), [keepInTouch,setKeepInTouch]=useState(false), [note,setNote]=useState(''), [callbackMode,setCallbackMode]=useState(false), [result,setResult]=useState(null), [callback,setCallback]=useState(null), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const run=async fn=>{setBusy(true);setError('');try{await fn();}catch(e){setError(errMsg(e));}finally{setBusy(false);}};
  const sendOtp=()=>run(async()=>{const r=await api.post('/delete/send-otp',{phone});setChallenge(r.data);});
  const confirmDeletion=()=>run(async()=>{const r=await api.post('/delete/confirm',{phone,otp,challenge_id:challenge.challenge_id,winback_consent:keepInTouch,...(reason?{reason}:{})});setResult(r.data);});
  const requestCallback=()=>run(async()=>{const r=await api.post('/delete/callback',{phone,otp,challenge_id:challenge.challenge_id,note});setCallback(r.data);});
  const submit=e=>{e.preventDefault();if(!availability.available)return;if(!challenge)return sendOtp();callbackMode?requestCallback():confirmDeletion();};
  return <div className="min-h-screen flex flex-col"><PublicHeader/><main className="w-full max-w-xl mx-auto p-6 flex-1 space-y-5">
    <h1 className="font-heading text-3xl" data-testid="deletion-heading">Delete your account</h1>
    <p data-testid="deletion-retention-notice">Verification is required. Canonical deletion disables access and anonymizes the local profile. Provider erasure and backup retention remain pending until separately confirmed; this is not instant global erasure.</p>
    {!result && !callback && <AuthAvailability state={availability} prefix="deletion" />}
    {callback?<section data-testid="callback-result" className="space-y-3"><h2>Callback requested — your account is unchanged</h2><p>Reference: {callback.reference}</p><p>Our team will call you on {phone}. Nothing has been deleted. You can return here any time to delete your account.</p></section>
    :result?<section data-testid="deletion-result" className="space-y-3"><h2>Account access removed</h2><p>Reference: {result.reference}</p><p>{result.status}: {result.detail}</p><p>External erasure is not complete.</p>{result.winback_contact_kept&&<p data-testid="deletion-winback-kept">As you agreed, we have kept only your name and phone number to contact you about offers. Tell our caller, or write to info@yashornaments.in, to withdraw at any time.</p>}</section>
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
