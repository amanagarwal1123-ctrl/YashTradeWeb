import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';
import { AuthAvailability, useAuthAvailability } from '@/components/public/AuthAvailability';
export default function DeleteAccount() {
  const availability=useAuthAvailability('deletion');
  const [phone,setPhone]=useState(''), [challenge,setChallenge]=useState(null), [otp,setOtp]=useState(''), [confirm,setConfirm]=useState(false), [result,setResult]=useState(null), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const submit=async e=>{e.preventDefault();setBusy(true);setError('');try { const r=await api.post(challenge?'/delete/confirm':'/delete/send-otp',challenge?{phone,otp,challenge_id:challenge.challenge_id}:{phone});challenge?setResult(r.data):setChallenge(r.data); } catch(e){setError(errMsg(e));}finally{setBusy(false);}};
  return <div className="min-h-screen flex flex-col"><PublicHeader/><main className="w-full max-w-xl mx-auto p-6 flex-1 space-y-5">
    <h1 className="font-heading text-3xl" data-testid="deletion-heading">Delete your account</h1>
    <p data-testid="deletion-retention-notice">Verification is required. Canonical deletion disables access and anonymizes the local profile. Provider erasure and backup retention remain pending until separately confirmed; this is not instant global erasure.</p>
    {!result && <AuthAvailability state={availability} prefix="deletion" />}
    {result?<section data-testid="deletion-result" className="space-y-3"><h2>Account access removed</h2><p>Reference: {result.reference}</p><p>{result.status}: {result.detail}</p><p>External erasure is not complete.</p></section>:<form onSubmit={e=>{if(!availability.available){e.preventDefault();return;}submit(e);}} className="space-y-4">
      <label htmlFor="delete-phone">Phone number</label><Input id="delete-phone" value={phone} disabled={!!challenge} onChange={e=>setPhone(e.target.value)} pattern="[6-9][0-9]{9}" required maxLength={10} data-testid="delete-phone-input"/>
      {challenge&&<><label htmlFor="delete-otp">{challenge.otp_length}-digit deletion OTP</label><Input id="delete-otp" inputMode="numeric" autoComplete="one-time-code" value={otp} maxLength={challenge.otp_length} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))} data-testid="delete-otp-input"/><label className="flex gap-2"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)} data-testid="delete-confirm-checkbox"/>I confirm permanent account deletion.</label></>}
      {error&&<p role="alert" data-testid="delete-error" className="text-red-700">{error}</p>}
      <Button disabled={busy||!availability.available||availability.checking||(!!challenge&&!confirm)} variant="destructive" data-testid="delete-submit-button">{busy?'Please wait…':challenge?'Verify & Delete Account':'Send deletion OTP'}</Button>
    </form>}<Link to="/privacy" data-testid="delete-privacy-link" className="underline">Privacy and retention policy</Link>
  </main><PublicFooter/></div>;
}