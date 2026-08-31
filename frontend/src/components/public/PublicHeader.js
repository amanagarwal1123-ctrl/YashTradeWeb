import React from "react";
import { ShieldCheck, Clock, BadgeCheck } from "lucide-react";

export const PublicHeader = () => {
  return (
    <header className="w-full">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 pt-6 pb-2 flex flex-col items-center gap-4">
        <img
          src="/brand/yash-logo-hd.png"
          alt="Yash Ornaments"
          className="brand-logo h-20 sm:h-24 w-auto drop-shadow-sm"
          data-testid="public-brand-logo"
        />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs text-slate-700 backdrop-blur">
            <ShieldCheck className="h-3.5 w-3.5 text-[#0F766E]" /> Secure OTP verification
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs text-slate-700 backdrop-blur">
            <Clock className="h-3.5 w-3.5 text-[#0B1F3B]" /> Takes under 2 minutes
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs text-slate-700 backdrop-blur">
            <BadgeCheck className="h-3.5 w-3.5 text-[#C8A96A]" /> Trusted jewellery house
          </span>
        </div>
      </div>
    </header>
  );
};
