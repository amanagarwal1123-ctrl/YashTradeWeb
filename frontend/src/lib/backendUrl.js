/**
 * Decide which origin the browser should call for /api.
 *
 * The build bakes in REACT_APP_BACKEND_URL, but a published app can be reached on more
 * than one host (e.g. https://yash-register.emergent.host AND the custom domain
 * https://register.yashsilver.com). Every host that serves the frontend also routes /api
 * to the backend, and the admin session is a SameSite cookie - so the only setup that is
 * always correct is: call the API on the SAME origin the page was loaded from.
 *
 * Rules:
 *  - page served from http(s) host  -> use the page origin (same-origin; cookies + no CORS)
 *  - local dev / file / unknown     -> fall back to the baked-in env URL
 */
export function resolveBackendUrl(envUrl, pageOrigin) {
  const env = String(envUrl || "").trim().replace(/\/+$/, "");
  const origin = String(pageOrigin || "").trim().replace(/\/+$/, "");
  const isHttp = /^https?:\/\//i.test(origin);
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(origin);
  if (isHttp && !isLocal) return origin;
  return env || origin;
}

export function currentBackendUrl() {
  const pageOrigin = typeof window !== "undefined" && window.location ? window.location.origin : "";
  return resolveBackendUrl(process.env.REACT_APP_BACKEND_URL, pageOrigin);
}
