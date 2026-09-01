import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { Stepper } from "@/components/public/Stepper";
import { EnrollForm } from "@/components/public/EnrollForm";
import { OtpVerify } from "@/components/public/OtpVerify";
import { SuccessStep } from "@/components/public/SuccessStep";
import { Card, CardContent } from "@/components/ui/card";

const HERO_IMG = "https://images.unsplash.com/photo-1580582183555-3224a02343c8?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85&w=900";

export default function Landing() {
  const [phase, setPhase] = useState("form"); // form | otp | success
  const [formData, setFormData] = useState(null);
  const [result, setResult] = useState(null);

  const stepNumber = phase === "success" ? 2 : 1;

  return (
    <div className="min-h-screen flex flex-col hero-wash relative">
      <div className="noise-overlay pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden="true" />
      <PublicHeader />

      <main className="flex-1 w-full">
        <section className="mx-auto max-w-[1100px] px-4 sm:px-6 pt-6 pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div className="text-center lg:text-left space-y-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C21F2B]/8 border border-[#C21F2B]/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#C21F2B]">
                <Sparkles className="h-3.5 w-3.5" /> Yash Ornaments Scheme
              </span>
              <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight tracking-[-0.02em] text-[#0B1F3B]" data-testid="public-hero-heading">
                Become a Part of the <span className="text-[#C21F2B]">Yash Ornaments</span> Scheme
              </h1>
              <p className="text-sm sm:text-base text-slate-600 max-w-lg mx-auto lg:mx-0">
                Enroll with your phone number, verify it once, and manage your jewellery business
                on the Yash Trade App. Registration takes less than two minutes.
              </p>
            </div>
            <div className="hidden lg:block">
              <div className="relative overflow-hidden rounded-2xl border border-[#C8A96A]/30 shadow-lg shadow-[#0B1F3B]/5">
                <img src={HERO_IMG} alt="Fine jewellery craftsmanship" className="h-[300px] w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3B]/50 via-transparent to-transparent" />
                <p className="absolute bottom-4 left-4 font-heading text-lg font-semibold text-white">
                  Crafted trust. Delivered daily.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[560px] px-4 sm:px-6 pb-14">
          <div className="mb-6">
            <Stepper current={stepNumber} />
          </div>

          <Card className="rounded-2xl border border-[#C8A96A]/30 bg-white shadow-xl shadow-[#0B1F3B]/5">
            <CardContent className="p-5 sm:p-7">
              <AnimatePresence mode="wait">
                {phase === "form" && (
                  <motion.div key="form" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.28 }}>
                    <div className="mb-5 text-center">
                      <h2 className="font-heading text-xl sm:text-2xl font-semibold text-[#0B1F3B]">Customer Enrollment</h2>
                      <p className="text-xs sm:text-sm text-slate-500 mt-1">All fields are mandatory</p>
                    </div>
                    <EnrollForm
                      defaults={formData}
                      onOtpSent={(data) => { setFormData(data); setPhase("otp"); }}
                    />
                  </motion.div>
                )}
                {phase === "otp" && (
                  <motion.div key="otp" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.28 }}>
                    <OtpVerify
                      phone={formData?.phone}
                      onVerified={(data) => { setResult(data); setPhase("success"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      onChangeDetails={() => setPhase("form")}
                    />
                  </motion.div>
                )}
                {phase === "success" && (
                  <motion.div key="success" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    <SuccessStep customer={result?.customer} download={result?.download} />
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
