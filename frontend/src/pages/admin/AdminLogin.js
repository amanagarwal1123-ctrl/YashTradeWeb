import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { OtpVerify } from '@/components/public/OtpVerify';
import { api, errMsg } from '@/lib/api';
import { ROLE_HOME } from '@/components/admin/AdminLayout';
import { AuthAvailability, useAuthAvailability } from '@/components/public/AuthAvailability';

export default function AdminLogin() {
  const [phone, setPhone] = useState(''), [challenge, setChallenge] = useState(null), [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const navigate = useNavigate();
  const availability = useAuthAvailability('staff');
  const send = async e => {
    e.preventDefault(); if (!availability.available) return; setBusy(true); setError('');
    try { const r = await api.post('/admin/auth/send-otp', {phone}); setChallenge(r.data); setSent(Date.now()); }
    catch(e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  return <main className="min-h-screen flex items-center justify-center p-4 bg-[#f5f6f8]">
    <section className="w-full max-w-sm border bg-white rounded-lg p-6 space-y-5">
      <img src="/brand/yash-mark-hd.png" alt="Yash Ornaments" className="h-16 w-16 mx-auto" />
      <h1 className="font-heading text-2xl text-center font-bold" data-testid="staff-login-heading">Yash Ornaments · Staff Login</h1>
      <AuthAvailability state={availability} prefix="admin" />
      {challenge ? <OtpVerify prefix="admin" phone={phone} challenge={challenge} sentAt={sent} verifyPath="/admin/auth/verify-otp" resendPath="/admin/auth/send-otp" onResent={c => {setChallenge(c); setSent(Date.now());}} onChangeDetails={() => setChallenge(null)} onVerified={u => navigate(ROLE_HOME[u.role] || '/admin/login')} /> :
      <form className="space-y-4" onSubmit={send}>
        <label htmlFor="staff-phone">Mobile number</label><Input id="staff-phone" type="tel" inputMode="numeric" pattern="[6-9][0-9]{9}" required maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} data-testid="admin-login-phone-input" />
        {error && <p role="alert" className="text-sm text-red-700" data-testid="admin-login-error">{error}</p>}
        <Button disabled={busy || !availability.available || availability.checking} className="w-full bg-[#0B1F3B]" data-testid="admin-login-send-otp-button">{busy ? 'Please wait…' : 'Send OTP'}</Button>
      </form>}
    </section>
  </main>;
}