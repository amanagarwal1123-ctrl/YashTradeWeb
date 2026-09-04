/**
 * Persistence for the public enrollment flow.
 *
 * Mobile browsers frequently discard the page when the customer switches to the
 * SMS app to read the OTP; when they come back the page reloads from scratch.
 * We therefore keep the whole flow state (typed form values, consent, current
 * step, OTP sent time, success payload) in localStorage with sensible TTLs so
 * the customer lands exactly where they left off.
 */
const KEY = "yash_enroll_state_v1";

export const OTP_TTL_SECONDS = 600; // matches backend + SMS text ("Valid for 10 Minutes")
export const RESEND_COOLDOWN_SECONDS = 30;
const OTP_TTL_MS = OTP_TTL_SECONDS * 1000;
const SUCCESS_TTL_MS = 30 * 60 * 1000; // keep the download screen for 30 min
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // keep a half-filled form for a day

export const emptyForm = { name: "", phone: "", shop_name: "", location: "", consent: false };

export function loadEnrollState() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return null;
    const now = Date.now();
    const form = { ...emptyForm, ...(s.formData || {}) };

    if (s.phase === "otp") {
      if (!s.otpSentAt || now - s.otpSentAt > OTP_TTL_MS) {
        // OTP expired while the customer was away - go back to the form but keep every value
        return { phase: "form", formData: form, otpSentAt: null, result: null, otpExpired: true };
      }
      return { phase: "otp", formData: form, otpSentAt: s.otpSentAt, result: null };
    }
    if (s.phase === "success") {
      if (!s.completedAt || now - s.completedAt > SUCCESS_TTL_MS || !s.result) {
        clearEnrollState();
        return null;
      }
      return { phase: "success", formData: form, otpSentAt: null, result: s.result, completedAt: s.completedAt };
    }
    if (s.savedAt && now - s.savedAt > DRAFT_TTL_MS) {
      clearEnrollState();
      return null;
    }
    return { phase: "form", formData: form, otpSentAt: null, result: null };
  } catch {
    return null;
  }
}

export function saveEnrollState(state) {
  try {
    const payload = {
      phase: state.phase,
      formData: state.formData || emptyForm,
      otpSentAt: state.otpSentAt || null,
      result: state.phase === "success" ? state.result : null,
      completedAt: state.completedAt || null,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable (private mode) - flow still works in memory */
  }
}

export function clearEnrollState() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
