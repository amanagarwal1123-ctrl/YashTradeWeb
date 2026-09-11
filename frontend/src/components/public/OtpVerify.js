import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api, errMsg } from '@/lib/api';

export const OtpVerify = ({ phone, challenge, sentAt, onResent, onVerified, onChangeDetails, pending = false, prefix = 'public', verifyPath = '/enroll/verify-otp', resendPath = '/enroll/resend-otp' }) => {
  const [otp, setOtp] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(pending); const [clock, setClock] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const elapsed = Math.floor((clock - sentAt) / 1000);
  const ttl = Math.max(0, (challenge?.expires_in || 0) - elapsed), cooldown = Math.max(0, (challenge?.resend_after || 0) - elapsed);
  const length = challenge?.otp_length || 4;
  const verify = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.post(retry ? '/enroll/complete' : verifyPath, retry ? {} : { phone, otp, challenge_id: challenge.challenge_id });
      onVerified(r.data);
    } catch (e) {
      setError(errMsg(e));
      if (prefix === 'public') {
        const state = await api.get('/enroll/state').catch(() => null);
        setRetry(state?.data?.phase === 'verified_pending');
      }
    } finally { setBusy(false); }
  };
  const resend = async () => {
    setBusy(true); setError('');
    try { const r = await api.post(resendPath, prefix === 'admin' ? { phone } : {}); onResent(r.data); setOtp(''); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <h2 className="font-heading text-lg font-semibold" data-testid={`${prefix}-otp-heading`}>{retry ? 'Registration awaiting confirmation' : 'Verify your phone'}</h2>
    <p className="text-sm" data-testid={`${prefix}-otp-phone-display`}>+91 {phone}</p>
    {!retry && <><label htmlFor={`${prefix}-otp`} className="text-sm">{length}-digit OTP</label><Input id={`${prefix}-otp`} data-testid={`${prefix}-otp-input`} inputMode="numeric" autoComplete="one-time-code" maxLength={length} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} />
      <p className="text-xs text-slate-500" data-testid={`${prefix}-otp-timer`}>Expires in {Math.floor(ttl / 60)}:{String(ttl % 60).padStart(2, '0')}</p></>}
    {error && <p role="alert" className="text-sm text-red-700" data-testid={`${prefix}-otp-error`}>{error}</p>}
    <Button className="w-full bg-[#0B1F3B]" data-testid={`${prefix}-otp-verify-button`} disabled={busy || (!retry && (otp.length !== length || !ttl))} onClick={verify}>{busy ? 'Please wait…' : retry ? 'Retry verified registration' : prefix === 'admin' ? 'Verify & Log In' : 'Verify & Register'}</Button>
    <div className="flex flex-wrap justify-between gap-2">
      <Button variant="ghost" data-testid={`${prefix}-otp-change-details-button`} disabled={busy || retry} onClick={onChangeDetails}>Change details</Button>
      {!retry && <Button variant="ghost" data-testid={`${prefix}-otp-resend-button`} disabled={busy || cooldown > 0} onClick={resend}>{cooldown ? `Resend in ${cooldown}s` : 'Resend OTP'}</Button>}
    </div>
  </div>;
};