import axios from "axios";
import { currentBackendUrl } from "@/lib/backendUrl";

// Same-origin by default (see lib/backendUrl.js) - works on every host the app is published on.
const BACKEND_URL = currentBackendUrl();

export const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
  timeout: 45000,
  headers: { "Content-Type": "application/json" },
});

export const API_BASE = `${BACKEND_URL}/api`;

/**
 * Human-readable error for any axios failure.
 *  - FastAPI JSON detail (string or validation array) -> shown as-is
 *  - No response at all (network / CORS / offline / timeout) -> explicit connectivity message
 *  - Non-JSON HTTP error (proxy / gateway pages)      -> status-specific message
 */
export function errMsg(error, fallback = "Something went wrong. Please try again.") {
  const d = error?.response?.data?.detail;
  if (typeof d === "string" && d.trim()) return d;
  if (Array.isArray(d) && d.length) {
    const first = d[0];
    if (typeof first === "string") return first;
    if (first?.msg) return first.loc?.length ? `${String(first.loc[first.loc.length - 1]).replace(/_/g, " ")}: ${first.msg}` : first.msg;
  }
  if (error?.code === "ECONNABORTED" || /timeout/i.test(error?.message || "")) {
    return "The server took too long to respond. Please check your connection and try again.";
  }
  if (error && !error.response) {
    return "Could not reach the server. Please check your internet connection and try again.";
  }
  const status = error?.response?.status;
  const nonJson = typeof error?.response?.data === "string";
  if (status === 429) {
    return nonJson
      ? "Our security layer is checking your connection. Please wait a few seconds and try again."
      : "Too many attempts. Please wait a moment and try again.";
  }
  if (status === 401) return "Your session has expired. Please log in again.";
  if (status === 403) return "You are not allowed to do this.";
  if (status === 404) return "The requested item was not found.";
  if (status >= 500) return `The server hit a problem (${status}). Please try again in a moment.`;
  if (status) return `${fallback.replace(/\.?\s*$/, "")} (HTTP ${status}). If this keeps happening, refresh the page.`;
  return fallback;
}
