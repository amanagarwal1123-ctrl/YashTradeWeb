import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, User, Phone, Store, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";
import { AuthAvailability, useAuthAvailability } from './AuthAvailability';

export const EnrollForm = ({ onOtpSent, defaults, onChange }) => {
  const [form, setForm] = useState({
    name: defaults?.name || "",
    phone: defaults?.phone || "",
    shop_name: defaults?.shop_name || "",
    location: defaults?.location || "",
  });
  const [consent, setConsent] = useState(!!defaults?.consent);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const availability = useAuthAvailability('enrollment');

  // Report every keystroke to the parent so a half-filled form survives a reload,
  // a switch to the SMS app, or the browser back button.
  useEffect(() => {
    onChange?.({ ...form, consent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, consent]);

  const set = (k) => (e) => {
    let v = e.target.value;
    if (k === "phone") v = v.replace(/\D/g, "").slice(0, 10);
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const validate = () => {
    const er = {};
    if (form.name.trim().length < 2) er.name = "Please enter your full name";
    if (!/^[6-9]\d{9}$/.test(form.phone))
      er.phone = form.phone.length !== 10
        ? "Phone number must be exactly 10 digits"
        : "Please enter a valid Indian mobile number";
    if (form.shop_name.trim().length < 2) er.shop_name = "Please enter your shop name";
    if (form.location.trim().length < 2) er.location = "Please enter your location";
    if (!consent) er.consent = "Please accept the Terms & Conditions and Privacy Policy to continue";
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!availability.available) return;
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await api.post("/enroll/send-otp", {
        ...form,
        name: form.name.trim(),
        shop_name: form.shop_name.trim(),
        location: form.location.trim(),
        consent_terms: consent,
        consent_privacy: consent,
      });
      if (res.data?.sms_sent === false) {
        toast.error("OTP could not be sent right now. Please try again in a moment.");
        return;
      }
      toast.success(res.data.message || "OTP sent");
      onOtpSent({ ...form, consent: true }, res.data);
    } catch (err) {
      toast.error(errMsg(err), { duration: 8000 });
    } finally {
      setLoading(false);
    }
  };

  const field = (key, label, icon, props = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`enroll-${key}`} className="text-sm font-semibold text-[#0B1F3B]">
        {label} <span className="text-[#C21F2B]">*</span>
      </Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        <Input
          id={`enroll-${key}`}
          value={form[key]}
          onChange={set(key)}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `enroll-${key}-error` : undefined}
          className={`h-11 rounded-lg bg-white pl-10 ${errors[key] ? "border-[#C21F2B] focus-visible:ring-[#C21F2B]" : ""}`}
          data-testid={`public-enroll-${key.replace("_", "-")}-input`}
          {...props}
        />
      </div>
      {errors[key] && (
        <p id={`enroll-${key}-error`} className="text-xs font-medium text-[#C21F2B]" data-testid={`public-enroll-${key.replace("_", "-")}-error`}>
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {field("name", "Customer Name", <User className="h-4 w-4" />, { placeholder: "e.g. Ramesh Kumar", autoComplete: "name", maxLength: 100 })}
      <div className="space-y-1.5">
        <Label htmlFor="enroll-phone" className="text-sm font-semibold text-[#0B1F3B]">
          Phone Number <span className="text-[#C21F2B]">*</span>
        </Label>
        <div className="flex">
          <span className="inline-flex items-center rounded-l-lg border border-r-0 border-[hsl(var(--input))] bg-[#FBF7F0] px-3 text-sm font-semibold text-slate-600 font-mono-nums">
            +91
          </span>
          <div className="relative flex-1">
            <Input
              id="enroll-phone"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={set("phone")}
              placeholder="10-digit mobile number"
              maxLength={10}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "enroll-phone-error" : "enroll-phone-help"}
              className={`h-11 rounded-l-none rounded-r-lg bg-white font-mono-nums tracking-wider ${errors.phone ? "border-[#C21F2B] focus-visible:ring-[#C21F2B]" : ""}`}
              data-testid="public-enroll-phone-input"
            />
          </div>
        </div>
        {errors.phone ? (
          <p id="enroll-phone-error" className="text-xs font-medium text-[#C21F2B]" data-testid="public-enroll-phone-error">{errors.phone}</p>
        ) : (
          <p id="enroll-phone-help" className="text-xs text-slate-500">This number will be your Yash Trade App login identity.</p>
        )}
      </div>
      {field("shop_name", "Shop Name", <Store className="h-4 w-4" />, { placeholder: "e.g. Kumar Jewellers", maxLength: 150 })}
      {field("location", "Location", <MapPin className="h-4 w-4" />, { placeholder: "e.g. Pune, Maharashtra", maxLength: 150 })}

      <div className="space-y-2.5 rounded-lg bg-[#FBF7F0] p-3.5 border border-[#C8A96A]/30">
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="consent"
            checked={consent}
            onCheckedChange={(v) => { setConsent(!!v); setErrors((er) => ({ ...er, consent: undefined })); }}
            className="mt-0.5"
            data-testid="public-consent-checkbox"
          />
          <Label htmlFor="consent" className="text-xs sm:text-sm leading-snug text-slate-700 font-normal cursor-pointer">
            I agree to the{" "}
            <Link to="/terms" target="_blank" className="font-semibold text-[#0B1F3B] underline underline-offset-2" data-testid="public-terms-link">
              Terms &amp; Conditions
            </Link>{" "}
            and the{" "}
            <Link to="/privacy" target="_blank" className="font-semibold text-[#0B1F3B] underline underline-offset-2" data-testid="public-privacy-link">
              Privacy Policy
            </Link>
          </Label>
        </div>
        {errors.consent && <p className="text-xs font-medium text-[#C21F2B] pl-7" data-testid="public-consent-error">{errors.consent}</p>}
      </div>

      <AuthAvailability state={availability} prefix="enrollment" />
      <Button
        type="submit"
        disabled={loading || !availability.available || availability.checking}
        className="h-12 w-full rounded-lg bg-[#0B1F3B] text-white text-base font-bold shadow-sm hover:bg-[#081a31] active:scale-[0.98] transition-colors"
        data-testid="public-enroll-send-otp-button"
      >
        {loading ? (
          <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Sending OTP…</span>
        ) : (
          "Send OTP"
        )}
      </Button>
    </form>
  );
};
