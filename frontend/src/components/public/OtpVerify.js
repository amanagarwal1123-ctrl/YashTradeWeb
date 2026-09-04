import React, { useCallback, useEffect, useState } from "react";
import { Loader2, PencilLine, ShieldCheck } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { api, errMsg } from "@/lib/api";
import { OTP_TTL_SECONDS, RESEND_COOLDOWN_SECONDS } from "@/lib/enrollState";
import { toast } from "sonner";

// Timers are derived from the real send timestamp (not a local counter) so they stay
// correct after the customer switches to the SMS app, the tab is throttled, or the
// page reloads.
const remaining = (sentAt) => {
  const elapsed = sentAt ? Math.floor((Date.now() - sentAt) / 1000) : 0;
  return {
    cooldown: Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed),
    ttl: Math.max(0, OTP_TTL_SECONDS - elapsed),
  };
};

export const OtpVerify = ({ phone, sentAt, onResent, onVerified, onChangeDetails }) => {
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [timers, setTimers] = useState(() => remaining(sentAt));
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");

  const tick = useCallback(() => setTimers(remaining(sentAt)), [sentAt]);

  useEffect(() => {
    tick();
    const id = setInterval(tick, 1000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [tick]);

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
      onResent?.(Date.now());
      setOtp("");
    } catch (err) {
      const msg = errMsg(err);
      // If the server says there is no active OTP (e.g. it expired), send the customer back
      // to the pre-filled form so a single tap requests a fresh one.
      if (err?.response?.status === 400 && /no active otp/i.test(msg)) {
        toast.error("Your OTP session expired. Your details are saved - please send a new OTP.", { duration: 6000 });
        onChangeDetails?.();
        return;
      }
      toast.error(msg, { duration: 8000 });
    } finally {
      setResending(false);
    }
  };

  const { cooldown, ttl } = timers;

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
        <p className="text-xs text-slate-500">You can switch to your messages and come back — this page will be waiting for you.</p>
      </div>

      <div className={`flex justify-center ${shake ? "otp-shake" : ""}`} data-testid="public-otp-input">
        <InputOTP
          maxLength={4}
          value={otp}
          onChange={(v) => { setOtp(v); setError(""); if (v.length === 4) verify(v); }}
          disabled={verifying}
          autoFocus
          autoComplete="one-time-code"
          inputMode="numeric"
        >
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
          <span className="font-medium text-[#C21F2B]" data-testid="public-otp-expired">OTP expired — please resend</span>
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
