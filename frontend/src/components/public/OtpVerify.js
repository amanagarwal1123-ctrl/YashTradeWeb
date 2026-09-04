import React, { useEffect, useRef, useState } from "react";
import { Loader2, PencilLine, ShieldCheck } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

const RESEND_COOLDOWN = 30;
const OTP_TTL = 600;

export const OtpVerify = ({ phone, onVerified, onChangeDetails }) => {
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [ttl, setTtl] = useState(OTP_TTL);
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
      setTtl((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const verify = async (code) => {
    const value = code || otp;
    if (value.length !== 4) {
      setError("Please enter the 4-digit OTP");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const res = await api.post("/enroll/verify-otp", { phone, otp: value });
      toast.success("Phone verified — enrollment complete!");
      onVerified(res.data);
    } catch (err) {
      const msg = errMsg(err, "Invalid OTP");
      setError(msg);
      setShake(true);
      setTimeout(() => setShake(false), 400);
      setOtp("");
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError("");
    try {
      const res = await api.post("/enroll/resend-otp", { phone });
      if (res.data?.sms_sent === false) {
        toast.error("OTP could not be resent right now. Please try again in a moment.");
        return;
      }
      toast.success(res.data.message || "OTP resent");
      setCooldown(RESEND_COOLDOWN);
      setTtl(OTP_TTL);
      setOtp("");
    } catch (err) {
      toast.error(errMsg(err), { duration: 8000 });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#0B1F3B]/5">
          <ShieldCheck className="h-6 w-6 text-[#0B1F3B]" />
        </div>
        <h3 className="font-heading text-xl font-semibold text-[#0B1F3B]">Verify your phone</h3>
        <p className="text-sm text-slate-600">
          Enter the 4-digit OTP sent to{" "}
          <span className="font-mono-nums font-semibold text-[#0B1F3B]" data-testid="public-otp-phone-display">+91 {phone}</span>
        </p>
      </div>

      <div className={`flex justify-center ${shake ? "otp-shake" : ""}`} data-testid="public-otp-input">
        <InputOTP maxLength={4} value={otp} onChange={(v) => { setOtp(v); setError(""); if (v.length === 4) verify(v); }} disabled={verifying}>
          <InputOTPGroup className="gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="h-14 w-12 sm:w-14 rounded-xl border border-slate-300 bg-white text-xl font-bold text-slate-900 shadow-sm first:rounded-l-xl last:rounded-r-xl"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {error && (
        <p className="text-center text-sm font-medium text-[#C21F2B]" role="alert" data-testid="public-otp-error">{error}</p>
      )}

      <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
        {ttl > 0 ? (
          <span>
            OTP expires in <span className="font-mono-nums font-semibold text-[#0B1F3B]" data-testid="public-otp-timer">{fmt(ttl)}</span>
          </span>
        ) : (
          <span className="font-medium text-[#C21F2B]">OTP expired — please resend</span>
        )}
      </div>

      <Button
        onClick={() => verify()}
        disabled={verifying || otp.length !== 4}
        className="h-12 w-full rounded-lg bg-[#0B1F3B] text-white text-base font-bold shadow-sm hover:bg-[#081a31] active:scale-[0.98] transition-colors"
        data-testid="public-otp-verify-button"
      >
        {verifying ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</span> : "Verify OTP"}
      </Button>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onChangeDetails}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0B1F3B] transition-colors"
          data-testid="public-otp-change-details-button"
        >
          <PencilLine className="h-3.5 w-3.5" /> Change details
        </button>
        <Button
          variant="ghost"
          onClick={resend}
          disabled={cooldown > 0 || resending}
          className="text-sm font-semibold text-[#0B1F3B] disabled:text-slate-400"
          data-testid="public-otp-resend-button"
        >
          {resending ? "Resending…" : cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
        </Button>
      </div>
    </div>
  );
};
