# Production login incident — root cause and recovery boundary

## Confirmed observations
Both `register.yashsilver.com` and `yash-register.emergent.host` are now serving
`website-shared-v1-staging-2026-09-11`, commit unrecorded. This is different from
the earlier production login-v10 observation. Deployment audit history is not
available here, so this report does not attribute who promoted it or when.

Public production health reports these WEBSITE settings absent:
- CANONICAL_API_BASE_URL
- ENROLLMENT_INTEGRATION_KEY
- STAFF_SERVICE_KEY

The canonical app at `https://yash-tryon-test.emergent.host/api` reports its
ENROLLMENT_INTEGRATION_KEY present and STAFF_SERVICE_KEY absent.

The existing privately held website LIVE_INTEGRATION_KEY was checked using GET
`/api/integrations/customers/not-a-phone`. The pinned route validates the integration
key first; then rejects this invalid non-phone before a customer lookup. Production
returned422 INVALID_PHONE. This confirms the existing enrollment key still matches
without sending SMS, looking up a genuine person, or changing any record. No key
value was printed or copied into public files.

A deliberately invalid-body website request (no possible OTP dispatch) gave:
- register.yashsilver.com:422 field validation, proving its origin check passed.
- yash-register.emergent.host:403 ORIGIN_REJECTED, proving a second domain-specific
  configuration problem independent of the missing canonical URL.

## Exact causes
1. The shared-v1 BFF replaced legacy LIVE_BACKEND_BASE/LIVE_INTEGRATION_KEY usage,
   but production did not receive the corresponding new configuration names.
   `Canonical.headers()` rejected the missing base before dispatching or checking
   the user's canonical role. This produced the screenshot's staging-API message.
2. Even after setting the URL, both required website credentials are absent; and
   the app's staff credential is absent too. A website-only setting cannot complete
   the staff handshake. Reusing the enrollment key for staff is invalid and unsafe.
3. The hosted website origin is not accepted by the running production origin
   policy/ingress combination. The custom-domain request passed the equivalent
   safe probe. Both origins need explicit authorized configuration, not CORS `*`.
4. The old `/api/health` returned HTTP200/statusok even with integration_ready=false.
   There was no HTTP readiness gate to reject this unconfigured build. Whether the
   actual rollout checked this route cannot be established without deployment logs.
5. The error copy mentioned staging even on production, making a shared service
   failure look like a phone-specific login problem.

This is NOT evidence of a bad OTP, wrong owner phone, disabled user, or lost role.
No genuine user's canonical role/status was queried or changed. All three staff
roles share the same failing upstream authentication path. Enrollment and deletion
also depend on the missing base/enrollment credential.

## Code corrections prepared and isolated verification
- Central per-flow readiness for staff, enrollment and deletion. Missing app-side
  staff configuration blocks staff only; it does not invent a reason to block an
  otherwise configured enrollment flow.
- `/api/health` and `/api/health/ready` return503 when dependencies/configuration are
  not ready; `/api/health/live` separately reports process liveness. Removed the
  hardcoded production_changed_by_this_task field, which cannot establish provenance.
- Public auth status checks the actual page origin against the explicit allowlist.
  Forms show a neutral service-availability message before an unusable submission,
  retain entered details and allow status refresh. No silent local login fallback.
- Missing/reused/wrong service credentials remain fail-closed with no local staff
  session. Canonical role, inactive-account and customer denial remain authoritative.
- A read-only, non-SMS readiness script checks BOTH explicitly supplied website
  origins and exits nonzero if either remains unready.

Readiness reads only the canonical public health route. It does NOT verify OTPs,
create challenges, enumerate people, prove secret equality, or assert SMS delivery.
Role/token checks are never served from this short-lived operational-status cache.

## Production correction access and current status
User approved production configuration corrections via authorized private settings,
with all login verification isolated and no real SMS. The tools/workspace available
here expose the local preview env and read-only public production endpoints, NOT
an authenticated settings writer for both production website and canonical app.
Production configuration has therefore NOT been changed by this repair. Editing the
preview `.env` would not prove production was configured and would risk connecting
staging to real data; this was deliberately not done.

The deployment scanner suggested committing `.env` files. That is NOT an acceptable
repair for this public repository and was not followed. Runtime secret injection is
required; the confirmed missing settings, not a guessed gitignore rule, are the
actionable blocker. Existing private values stay private.

See `PRODUCTION_AUTH_CONFIGURATION.md` for the single coordinated operator action
needed to restore configuration. Do not describe production login as restored until
those settings are applied and its read-only readiness/origin checks pass. Real OTP
verification remains out of scope per the user's instruction.

## Verified result and remaining blocker
Testing agent report `test_reports/iteration_11.json`: full isolated suite33passed,
3strict XFAIL for the previously documented unrelated canonical D2/D3/D4 dependencies.
Added readiness/per-flow/origin/read-only-checker regressions; the existing authenticated
admin/telecaller/billing/customer browser journeys remain passing. Preview checks showed
disabled unavailable submit controls and0OTP mutation calls. SMS/storage are TEST-ONLY
doubles; actual canonical code and separate synthetic Mongo DBs are used for auth journeys.

The final static deployment scan passed code/configuration structure checks. It did NOT
validate production secret provisioning, real login or both live origin policies; its
generic CORS observation must not override the confirmed BFF origin rejection. Production
still lacks the new readiness routes (404) and required configuration. Code is verified;
live restoration is NOT completed. No production configuration was changed here.