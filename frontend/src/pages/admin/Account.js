import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {PageTitle,Notice} from '@/components/admin/SharedUI';
import {useAdmin,ROLE_LABEL} from '@/components/admin/AdminLayout';
import {shared,errMsg} from '@/lib/api';
import {isStaffPhone,normalizePhone,phoneDisplay,typedPhone} from '@/lib/phone';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

const REASONS={PHONE_CONFLICT:'That number already belongs to another account on the app (or to an account that was deleted). Choose a different number.',
 OTP_INVALID:'The code did not match. Check the SMS on the new number and try again.',OTP_EXPIRED:'The code expired. Send a new one.',
 OTP_RATE_LIMIT:'Too many codes were requested for that number. Wait a minute before trying again.',OTP_COOLDOWN:'Wait a few seconds before requesting another code.',
 UNSUPPORTED_COUNTRY:'Supported countries: India (+91), USA and Canada (+1), Australia (+61).',INVALID_PHONE:'Enter 10 Indian mobile digits, or an international number with its country code.'};
const explain=e=>REASONS[e.response?.data?.code]||errMsg(e);

/** The canonical app changes a login number for the signed-in person after an OTP to the NEW number. */
function PhoneChange({me}){
 const navigate=useNavigate();
 const [phone,setPhone]=useState(''),[challenge,setChallenge]=useState(null),[sentAt,setSentAt]=useState(0),[otp,setOtp]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(null),[clock,setClock]=useState(Date.now());
 useEffect(()=>{if(!challenge||done)return;const t=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(t);},[challenge,done]);
 useEffect(()=>{if(!done)return;const t=setTimeout(()=>{window.dispatchEvent(new Event('yash-session-ended'));navigate('/admin/login',{replace:true});},6000);return()=>clearTimeout(t);},[done,navigate]);
 const elapsed=Math.floor((clock-sentAt)/1000),ttl=Math.max(0,(challenge?.expires_in||0)-elapsed),cooldown=Math.max(0,(challenge?.resend_after||0)-elapsed),length=challenge?.otp_length||4;
 const valid=isStaffPhone(phone)&&normalizePhone(phone)!==me.phone;
 const send=async()=>{setBusy(true);setError('');try{const r=await shared.write('post','/auth/phone-change/request',{new_phone:normalizePhone(phone)});setChallenge(r);setSentAt(Date.now());setOtp('');}catch(e){setError(explain(e));}finally{setBusy(false);}};
 const verify=async()=>{setBusy(true);setError('');try{const r=await shared.write('post','/auth/phone-change/verify',{new_phone:normalizePhone(phone),otp,challenge_id:challenge.challenge_id});setDone(r);}catch(e){setError(explain(e));}finally{setBusy(false);}};
 if(done)return <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status" data-testid="account-phone-changed">Your login number is now <strong>{phoneDisplay(done.phone)}</strong>. For security every session was signed out — you will be taken to the login page in a few seconds; sign in with the new number and a fresh OTP. <Button variant="outline" size="sm" className="ml-2" data-testid="account-phone-changed-login" onClick={()=>{window.dispatchEvent(new Event('yash-session-ended'));navigate('/admin/login',{replace:true});}}>Go to login now</Button></div>;
 return <div className="space-y-3">
  <p className="text-sm text-slate-600" data-testid="account-phone-rule">The app keeps one verified number per person: a code is sent to the <strong>new</strong> number and only you can confirm it. {me.role==='admin'?'Administrators’ numbers are changed only here, by the administrator themselves — another administrator cannot set another person\'s number.':'An administrator can also change an ordinary staff member\'s login number from the Staff directory (checked first, then confirmed).'} Customer numbers are never edited by staff.</p>
  {!challenge?<div className="flex flex-wrap items-end gap-2"><label className="field"><span>New login number (10 Indian digits or +country code)</span><Input inputMode="tel" maxLength={16} value={phone} data-testid="account-new-phone" onChange={e=>setPhone(typedPhone(e.target.value))}/></label><Button disabled={busy||!valid} data-testid="account-send-code" onClick={send}>{busy?'Sending…':'Send code to new number'}</Button></div>
  :<div className="space-y-3"><p className="text-sm" data-testid="account-code-sent">Code sent to <strong>{phoneDisplay(phone)}</strong> · expires in {Math.floor(ttl/60)}:{String(ttl%60).padStart(2,'0')}</p>
   <div className="flex flex-wrap items-end gap-2"><label className="field"><span>{length}-digit code</span><Input inputMode="numeric" autoComplete="one-time-code" maxLength={length} value={otp} data-testid="account-otp" onChange={e=>setOtp(e.target.value.replace(/\D/g,''))}/></label><Button disabled={busy||otp.length!==length||!ttl} data-testid="account-verify-code" onClick={verify}>{busy?'Please wait…':'Verify & change number'}</Button><Button variant="ghost" disabled={busy||cooldown>0} data-testid="account-resend-code" onClick={send}>{cooldown?`Resend in ${cooldown}s`:'Resend code'}</Button><Button variant="ghost" disabled={busy} data-testid="account-change-cancel" onClick={()=>{setChallenge(null);setOtp('');setError('');}}>Cancel</Button></div></div>}
  <Notice id="account-phone-error">{error}</Notice>
 </div>;
}

export default function Account(){
 const {me}=useAdmin();
 return <><PageTitle>My account</PageTitle>
  <section className="detail-section" data-testid="account-identity"><h2>Signed in as</h2><div className="metrics-strip"><div>Name<strong data-testid="account-name">{me.name||'—'}</strong></div><div>Login number<strong data-testid="account-phone">{phoneDisplay(me.phone)}</strong></div><div>Role<strong data-testid="account-role">{ROLE_LABEL[me.role]||me.role.replace('_',' ')}</strong></div></div>
   <p className="text-xs text-slate-500 break-all" data-testid="account-id">Canonical ID {me.id}</p></section>
  <section className="detail-section" data-testid="account-phone-change"><h2>Change my login number</h2><PhoneChange me={me}/></section>
 </>;
}
