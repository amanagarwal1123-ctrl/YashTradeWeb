import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Trash2, Loader2, ShieldAlert, CheckCircle2, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { PublicFooter } from "@/components/public/PublicFooter";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

const FALLBACK = { name: "Yash Ornaments", app_name: "Yash Trade App", support_email: "info@yashornaments.in", support_phone: "+91 97118 81372, +91 99998 13334", deletion_sla_days: 30 };

export default function DeleteAccount() {
  const [co, setCo] = useState(FALLBACK);
  const [phase, setPhase] = useState("phone"); // phone | otp | done
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    api.get("/public/config").then((r) => setCo({ ...FALLBACK, ...(r.data?.company || {}) })).catch(() => {});
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendOtp = async (e) => {
    e?.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError("Please enter the 10-digit mobile number registered with your account.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.post(phase === "otp" ? "/account/delete/resend-otp" : "/account/delete/send-otp", { phone });
      toast.success(res.data.message || "OTP sent");
      setPhase("otp");
      setCooldown(res.data.resend_after || 30);
      setOtp("");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (otp.length !== 4) { setError("Enter the 4-digit OTP."); return; }
    if (!ack) { setError("Please tick the box to confirm you understand deletion is permanent."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/account/delete/confirm", { phone, otp, reason });
      setResult(res.data);
      setPhase("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(errMsg(err, "Could not verify the OTP"));
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF7F0]">
      <div className="mx-auto w-full max-w-[680px] px-4 sm:px-6 py-10 flex-1">
        <Link to="/privacy" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0B1F3B] mb-6" data-testid="delete-back-link">
          <ArrowLeft className="h-4 w-4" /> Privacy Policy
        </Link>
        <img src="/brand/yash-logo-hd.png" alt={co.name} className="brand-logo h-16 w-auto mb-6" />
        <h1 className="font-heading text-3xl font-bold text-[#0B1F3B] mb-2" data-testid="delete-heading">Delete your {co.app_name} account</h1>
        <p className="text-sm text-slate-600 mb-6">
          Use this page to permanently delete your <strong>{co.app_name}</strong> account and the personal data {co.name} holds about you.
          You do not need the app installed. This is the same request you can make inside the app under <em>Profile → Account → Delete account</em>.
        </p>

        <div className="rounded-xl border border-[#C8A96A]/30 bg-white p-6 sm:p-7 space-y-5">
          {phase !== "done" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2" data-testid="delete-info-box">
              <p className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" /> What will be deleted</p>
              <ul className="list-disc pl-5 space-y-1 text-[13px]">
                <li>Your profile: name, mobile number, shop name, location and preferences</li>
                <li>Your enquiries, orders in progress, cart, wishlist, reward points and support notes</li>
                <li>Your enrollment record on this website (deleted immediately) and your app account (within {co.deletion_sla_days} days)</li>
              </ul>
              <p className="text-[13px]">
                We keep only what Indian tax and company law require (invoices and completed sales records) and a masked record of this request.
                Deletion is permanent and cannot be undone.
              </p>
            </div>
          )}

          {phase === "phone" && (
            <form onSubmit={sendOtp} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="del-phone" className="text-sm font-semibold text-[#0B1F3B]">Registered mobile number</Label>
                <div className="flex">
                  <span className="inline-flex items-center rounded-l-lg border border-r-0 border-[hsl(var(--input))] bg-[#FBF7F0] px-3 text-sm font-semibold text-slate-600 font-mono-nums">+91</span>
                  <Input id="del-phone" type="tel" inputMode="numeric" maxLength={10} value={phone}
                    onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }}
                    placeholder="10-digit mobile number" className="h-11 rounded-l-none rounded-r-lg bg-white font-mono-nums tracking-wider"
                    data-testid="delete-phone-input" />
                </div>
                <p className="text-xs text-slate-500">We will send a one-time password to this number to confirm that the account belongs to you.</p>
              </div>
              {error && <p className="text-sm font-medium text-[#C21F2B]" role="alert" data-testid="delete-error">{error}</p>}
              <Button type="submit" disabled={loading || phone.length !== 10} className="h-11 w-full bg-[#0B1F3B] hover:bg-[#081a31] font-semibold" data-testid="delete-send-otp-button">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send OTP to continue"}
              </Button>
            </form>
          )}

          {phase === "otp" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 text-center">
                Enter the 4-digit OTP sent to <span className="font-mono-nums font-semibold text-[#0B1F3B]" data-testid="delete-phone-display">+91 {phone}</span>
              </p>
              <div className="flex justify-center" data-testid="delete-otp-input">
                <InputOTP maxLength={4} value={otp} onChange={(v) => { setOtp(v); setError(""); }} disabled={loading} autoFocus autoComplete="one-time-code" inputMode="numeric">
                  <InputOTPGroup className="gap-2.5">
                    {[0, 1, 2, 3].map((i) => (
                      <InputOTPSlot key={i} index={i} className="h-14 w-12 sm:w-14 rounded-xl border border-slate-300 bg-white text-xl font-bold first:rounded-l-xl last:rounded-r-xl" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="del-reason" className="text-sm font-semibold text-[#0B1F3B]">Reason (optional)</Label>
                <Textarea id="del-reason" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} placeholder="Tell us why you are leaving - it helps us improve" className="bg-white" rows={2} data-testid="delete-reason-input" />
              </div>
              <div className="flex items-start gap-2.5 rounded-lg bg-[#FBF7F0] border border-[#C8A96A]/30 p-3.5">
                <Checkbox id="del-ack" checked={ack} onCheckedChange={(v) => { setAck(!!v); setError(""); }} className="mt-0.5" data-testid="delete-ack-checkbox" />
                <Label htmlFor="del-ack" className="text-xs sm:text-sm leading-snug text-slate-700 font-normal cursor-pointer">
                  I understand that my account and personal data will be permanently deleted and this cannot be undone.
                </Label>
              </div>
              {error && <p className="text-center text-sm font-medium text-[#C21F2B]" role="alert" data-testid="delete-error">{error}</p>}
              <Button onClick={confirm} disabled={loading || otp.length !== 4 || !ack} className="h-12 w-full bg-[#C21F2B] hover:bg-[#a01a24] text-base font-bold" data-testid="delete-confirm-button">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="flex items-center gap-2"><Trash2 className="h-4 w-4" /> Permanently delete my account</span>}
              </Button>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => { setPhase("phone"); setOtp(""); setError(""); }} className="text-xs font-medium text-slate-500 hover:text-[#0B1F3B]" data-testid="delete-change-phone">Use a different number</button>
                <Button variant="ghost" size="sm" onClick={sendOtp} disabled={cooldown > 0 || loading} className="text-xs font-semibold text-[#0B1F3B] disabled:text-slate-400" data-testid="delete-resend-button">
                  {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
                </Button>
              </div>
            </div>
          )}

          {phase === "done" && result && (
            <div className="space-y-4 text-center" data-testid="delete-success">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#0F766E]/10">
                <CheckCircle2 className="h-8 w-8 text-[#0F766E]" />
              </div>
              <h2 className="font-heading text-2xl font-bold text-[#0B1F3B]">Deletion request received</h2>
              <p className="text-sm text-slate-700">{result.message}</p>
              <div className="rounded-lg bg-[#FBF7F0] border border-[#C8A96A]/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your reference number</p>
                <p className="font-mono-nums text-2xl font-bold text-[#0B1F3B]" data-testid="delete-reference">{result.reference}</p>
              </div>
              <p className="text-xs text-slate-500">Questions? Contact {co.support_email} or {co.support_phone} quoting this reference.</p>
              <Link to="/" className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#0B1F3B] hover:bg-slate-50" data-testid="delete-home-link">Back to home</Link>
            </div>
          )}
        </div>

        {phase !== "done" && (
          <p className="mt-5 text-xs text-slate-500 flex items-start gap-2">
            <Phone className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Prefer to talk to someone? Call or WhatsApp {co.support_phone}, or e-mail <a href={`mailto:${co.support_email}`} className="underline underline-offset-2">{co.support_email}</a> with the subject "Delete my account".</span>
          </p>
        )}
      </div>
      <PublicFooter />
    </div>
  );
}
