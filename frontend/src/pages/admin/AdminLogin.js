import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Card, CardContent } from "@/components/ui/card";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("phone"); // phone | otp
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendOtp = async (e) => {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError("Please enter a valid 10-digit mobile number");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.post("/admin/auth/send-otp", { phone });
      toast.success("OTP sent");
      setPhase("otp");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const verify = async (code) => {
    const value = code || otp;
    if (value.length !== 4) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/admin/auth/verify-otp", { phone, otp: value });
      if (res.data.role !== "admin") {
        setError("Access denied: your account does not have the admin role (403 Forbidden).");
        setLoading(false);
        return;
      }
      toast.success("Welcome back");
      navigate("/admin");
    } catch (err) {
      setError(errMsg(err, "Verification failed"));
      setOtp("");
      setLoading(false);
    }
  };

  return (
    <div className="admin-scope min-h-screen bg-[hsl(var(--background))] flex items-center justify-center px-4">
      <Card className="w-full max-w-sm rounded-xl border border-slate-200 shadow-lg">
        <CardContent className="p-7 space-y-6">
          <div className="text-center space-y-2">
            <img src="/brand/yash-mark-hd.png" alt="Yash Ornaments" className="brand-logo mx-auto h-14 w-14 rounded-xl" />
            <h1 className="font-heading text-xl font-bold text-[#0B1F3B]">Admin Portal</h1>
            <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
              <Lock className="h-3 w-3" /> Authorized personnel only
            </p>
          </div>

          {phase === "phone" && (
            <form onSubmit={sendOtp} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="admin-phone" className="text-sm font-semibold">Admin phone number</Label>
                <Input
                  id="admin-phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }}
                  placeholder="10-digit mobile number"
                  className="h-11 font-mono-nums"
                  data-testid="admin-login-phone-input"
                />
              </div>
              {error && <p className="text-sm font-medium text-[#C21F2B]" role="alert" data-testid="admin-login-error">{error}</p>}
              <Button type="submit" disabled={loading} className="h-11 w-full bg-[#0B1F3B] hover:bg-[#081a31] font-semibold" data-testid="admin-login-send-otp-button">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send OTP"}
              </Button>
            </form>
          )}

          {phase === "otp" && (
            <div className="space-y-4">
              <p className="text-center text-sm text-slate-600">
                Enter the OTP sent to <span className="font-mono-nums font-semibold">+91 {phone}</span>
              </p>
              <div className="flex justify-center" data-testid="admin-login-otp-input">
                <InputOTP maxLength={4} value={otp} onChange={(v) => { setOtp(v); setError(""); if (v.length === 4) verify(v); }} disabled={loading}>
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <InputOTPSlot key={i} index={i} className="h-12 w-12 rounded-lg border border-slate-300 bg-white text-lg font-bold first:rounded-l-lg last:rounded-r-lg" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {error && <p className="text-center text-sm font-medium text-[#C21F2B]" role="alert" data-testid="admin-login-error">{error}</p>}
              <Button onClick={() => verify()} disabled={loading || otp.length !== 4} className="h-11 w-full bg-[#0B1F3B] hover:bg-[#081a31] font-semibold" data-testid="admin-login-verify-button">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Log In"}
              </Button>
              <button type="button" onClick={() => { setPhase("phone"); setOtp(""); setError(""); }} className="w-full text-center text-xs font-medium text-slate-500 hover:text-[#0B1F3B]" data-testid="admin-login-change-phone">
                Use a different number
              </button>
            </div>
          )}

          <p className="flex items-center justify-center gap-1 text-[10px] text-slate-400">
            <ShieldCheck className="h-3 w-3" /> Protected by OTP authentication, rate limiting and audit logging
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
