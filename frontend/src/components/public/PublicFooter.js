import React from "react";
import { Link } from "react-router-dom";

export const PublicFooter = () => (
  <footer className="mt-auto w-full border-t border-[#C8A96A]/20 bg-white/60">
    <div className="mx-auto max-w-[1100px] px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-xs text-slate-500">
        © {new Date().getFullYear()} Yash Ornaments. All rights reserved.
      </p>
      <div className="flex items-center gap-4">
        <Link to="/terms" className="text-xs font-medium text-slate-600 hover:text-[#0B1F3B] transition-colors" data-testid="public-footer-terms-link">
          Terms &amp; Conditions
        </Link>
        <Link to="/privacy" className="text-xs font-medium text-slate-600 hover:text-[#0B1F3B] transition-colors" data-testid="public-footer-privacy-link">
          Privacy Policy
        </Link>
      </div>
    </div>
  </footer>
);
