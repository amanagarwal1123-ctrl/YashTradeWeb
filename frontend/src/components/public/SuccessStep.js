import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Smartphone, RotateCcw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const AndroidIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.46 11.46 0 00-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48A10.81 10.81 0 001 18h22a10.81 10.81 0 00-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
  </svg>
);

const AppleIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

export const SuccessStep = ({ customer, download, onStartOver }) => {
  const androidUrl = download?.android_url;
  const iosUrl = download?.ios_url;
  return (
    <div className="space-y-6 text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#0F766E]/10"
      >
        <CheckCircle2 className="h-9 w-9 text-[#0F766E]" strokeWidth={2.2} />
      </motion.div>

      <div className="space-y-2">
        <h3 className="font-heading text-2xl font-bold text-[#0B1F3B]" data-testid="public-success-heading">
          Enrollment Successful!
        </h3>
        <p className="text-sm text-slate-600">
          Welcome to the Yash Ornaments Scheme{customer?.name ? `, ${customer.name}` : ""}.
        </p>
      </div>

      <div className="rounded-xl border border-[#C8A96A]/40 bg-[#FBF7F0] p-4 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your verified phone number</p>
        <p className="font-mono-nums text-2xl font-bold text-[#0B1F3B]" data-testid="public-success-verified-phone">
          +91 {customer?.phone}
        </p>
        <p className="text-xs font-medium text-[#0F766E] flex items-center justify-center gap-1">
          <Smartphone className="h-3.5 w-3.5" /> This is your Yash Trade App login number
        </p>
      </div>

      <p className="text-sm leading-relaxed text-slate-700 px-1" data-testid="public-success-instructions">
        Your registration is complete. Download the Yash Trade App and log in using your registered phone
        number and a fresh OTP to complete the process in the app.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {androidUrl ? <a
          href={androidUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 shadow-sm hover:bg-slate-50 active:scale-[0.98] transition-colors"
          data-testid="public-download-android-button"
        >
          <AndroidIcon className="h-7 w-7 text-[#3DDC84]" />
          <span className="text-left leading-tight">
            <span className="block text-[10px] uppercase tracking-wide text-slate-500">Get it on</span>
            <span className="block text-sm font-bold text-[#0B1F3B]">Google Play</span>
          </span>
        </a> : <p data-testid="android-release-unavailable" className="text-sm border p-3 rounded-lg"><AndroidIcon className="h-7 w-7 mx-auto" />Android release unavailable</p>}
        {iosUrl ? <a
          href={iosUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 shadow-sm hover:bg-slate-50 active:scale-[0.98] transition-colors"
          data-testid="public-download-ios-button"
        >
          <AppleIcon className="h-7 w-7 text-slate-900" />
          <span className="text-left leading-tight">
            <span className="block text-[10px] uppercase tracking-wide text-slate-500">Download on the</span>
            <span className="block text-sm font-bold text-[#0B1F3B]">App Store</span>
          </span>
        </a> : <p data-testid="ios-release-unavailable" className="text-sm border p-3 rounded-lg"><AppleIcon className="h-7 w-7 mx-auto" />iOS release unavailable</p>}
      </div>

      {androidUrl && <div className="flex flex-col items-center gap-2 pt-1">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="public-success-qr">
          <QRCodeSVG value={androidUrl} size={150} fgColor="#0B1F3B" />
        </div>
        <p className="text-xs text-slate-500">Scan to download the Yash Trade App</p>
      </div>}

      {onStartOver && (
        <button
          type="button"
          onClick={onStartOver}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#0B1F3B] underline underline-offset-2 transition-colors"
          data-testid="public-success-start-over-button"
        >
          <RotateCcw className="h-3 w-3" /> Enroll another customer
        </button>
      )}
    </div>
  );
};
