import React from "react";
import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const steps = [
  { n: 1, label: "Enroll and verify" },
  { n: 2, label: "Download and log in" },
];

export const Stepper = ({ current }) => {
  return (
    <div className="w-full" data-testid="public-step-indicator" aria-label={`Step ${current} of 2`}>
      <div className="flex items-center justify-center gap-3 sm:gap-4">
        {steps.map((s, i) => {
          const done = current > s.n;
          const active = current === s.n;
          return (
            <React.Fragment key={s.n}>
              <div className="flex items-center gap-2.5">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0.6 }}
                  animate={{ scale: active ? 1.02 : 1, opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold",
                    done && "border-[#C8A96A] bg-[#C8A96A]/15 text-[#8a6d35]",
                    active && "border-[#0B1F3B] bg-[#0B1F3B] text-white shadow-md shadow-[#0B1F3B]/20",
                    !done && !active && "border-slate-300 bg-white text-slate-400"
                  )}
                >
                  {done ? <Check className="h-4.5 w-4.5" strokeWidth={3} /> : s.n}
                </motion.div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Step {s.n}</span>
                  <span
                    className={cn(
                      "text-xs sm:text-sm font-semibold leading-tight",
                      active ? "text-[#0B1F3B]" : done ? "text-[#8a6d35]" : "text-slate-400"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className={cn("h-0.5 w-8 sm:w-16 rounded-full", current > 1 ? "bg-[#C8A96A]" : "bg-slate-200")} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
