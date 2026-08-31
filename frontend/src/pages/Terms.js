import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PublicFooter } from "@/components/public/PublicFooter";

export default function Terms() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FBF7F0]">
      <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6 py-10 flex-1">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0B1F3B] mb-6" data-testid="terms-back-link">
          <ArrowLeft className="h-4 w-4" /> Back to enrollment
        </Link>
        <img src="/brand/yash-logo-hd.png" alt="Yash Ornaments" className="brand-logo h-16 w-auto mb-6" />
        <h1 className="font-heading text-3xl font-bold text-[#0B1F3B] mb-6">Terms &amp; Conditions</h1>
        <div className="space-y-4 text-sm leading-relaxed text-slate-700 bg-white rounded-xl border border-[#C8A96A]/30 p-6">
          <p><strong>1. Scheme Enrollment.</strong> By enrolling in the Yash Ornaments Scheme, you confirm that the details provided (name, phone number, shop name, and location) are accurate and belong to you or your business.</p>
          <p><strong>2. Phone Number Identity.</strong> Your verified phone number acts as your unique login identity for the Yash Trade App. You are responsible for maintaining access to this number.</p>
          <p><strong>3. OTP Verification.</strong> A one-time password (OTP) will be sent to your phone for verification. Do not share OTPs with anyone. Yash Ornaments will never ask for your OTP over a call.</p>
          <p><strong>4. Use of the Yash Trade App.</strong> Access to scheme benefits, rates, catalogues, and rewards is governed by the Yash Trade App terms of use in addition to these terms.</p>
          <p><strong>5. Account Status.</strong> Yash Ornaments reserves the right to deactivate accounts that provide false information or misuse the scheme.</p>
          <p><strong>6. Changes.</strong> These terms may be updated from time to time. Continued use of the scheme constitutes acceptance of updated terms.</p>
          <p><strong>7. Contact.</strong> For questions regarding these terms, please contact your Yash Ornaments representative.</p>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
