import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PublicFooter } from "@/components/public/PublicFooter";

export default function Privacy() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FBF7F0]">
      <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6 py-10 flex-1">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0B1F3B] mb-6" data-testid="privacy-back-link">
          <ArrowLeft className="h-4 w-4" /> Back to enrollment
        </Link>
        <img src="/brand/yash-logo-hd.png" alt="Yash Ornaments" className="brand-logo h-16 w-auto mb-6" />
        <h1 className="font-heading text-3xl font-bold text-[#0B1F3B] mb-6">Privacy Policy</h1>
        <div className="space-y-4 text-sm leading-relaxed text-slate-700 bg-white rounded-xl border border-[#C8A96A]/30 p-6">
          <p><strong>1. Information We Collect.</strong> During enrollment we collect your name, phone number, shop name, and location. This information is used to create and manage your Yash Trade App customer profile.</p>
          <p><strong>2. How We Use It.</strong> Your details are used to verify your identity, provide scheme benefits, communicate important updates, and personalise your experience on the Yash Trade App.</p>
          <p><strong>3. OTP &amp; Security.</strong> OTPs are stored securely in hashed form, expire quickly, and are never shared. Your data is transmitted over encrypted connections.</p>
          <p><strong>4. Data Sharing.</strong> Your profile is shared only with the Yash Trade App platform operated by Yash Ornaments. We do not sell your personal information to third parties.</p>
          <p><strong>5. SMS Communication.</strong> By enrolling you consent to receive OTP and service SMS messages related to your account.</p>
          <p><strong>6. Data Retention.</strong> Your profile is retained while your account remains active. You may request correction of your details through Yash Ornaments support.</p>
          <p><strong>7. Contact.</strong> For privacy questions or data requests, please contact your Yash Ornaments representative.</p>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
