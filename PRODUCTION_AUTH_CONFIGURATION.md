# One coordinated private configuration correction

User approved configuration corrections without changing identities or rotating
existing secrets. Production access to both settings stores is required. Values
must be entered using the authorized PRIVATE runtime settings workflow, not chat,
GitHub, browser JavaScript, screenshots or public documents.

## Canonical app production
Keep its existing ENROLLMENT_INTEGRATION_KEY, JWT_SECRET, Mongo, SMS and storage
settings unchanged. Provision the currently missing STAFF_SERVICE_KEY once using
a cryptographically random secret of at least32characters. It must differ from
the existing enrollment key. Use that SAME new staff value on the website.
This is initial provisioning, not a rotation of an existing staff credential.

## Website production (both website domains)
| Setting | Exact action |
|---|---|
| CANONICAL_API_BASE_URL | Set to `https://yash-tryon-test.emergent.host/api` for the approved production integration; do NOT set this as a staging default |
| ENROLLMENT_INTEGRATION_KEY | Deliberately copy the current private LIVE_INTEGRATION_KEY value; its match was confirmed by the non-phone GET check. Keep the app's enrollment value unchanged |
| STAFF_SERVICE_KEY | Same separately provisioned app staff value above, not the enrollment key |
| BFF_ALLOWED_ORIGINS | Explicitly include `https://register.yashsilver.com,https://yash-register.emergent.host` |
| BFF_INGRESS_ORIGINS | Preserve/add ONLY actual verified production ingress Origin aliases if the ingress rewrites Origin. Do not copy preview aliases speculatively or allow wildcards |
| SESSION_SECRET | Preserve the existing website-owned secret; do not import app JWT_SECRET |
| BUILD_COMMIT | Record this website release's actual commit in the normal release process, not the app SHA |

Environment-injected values take precedence over `.env`. Apply settings to the
actual production runtime, not only the preview workspace or an ignored env file.
Retain historical configuration privately until the migration is confirmed; do
not add a code fallback from staging to LIVE_BACKEND_BASE.

Trusted ingress/client-IP configuration also needs its existing operational review;
do not enable arbitrary forwarded headers or bypass canonical rate limits.

## Zero-SMS verification
The existing shared-v1 production login can first be restored by the private runtime
configuration correction above; the guardrail code is a separate tested change. Do not
mistake an old build's404 on the new readiness endpoint for proof that a subsequently
corrected secret is invalid. Confirm the running build before selecting its health contract.

After the corrected code/configuration are active:
1. Check `/api/health/ready` on each website: expect HTTP200/integration_ready=true.
2. Check `/api/public/auth-status?website_origin=<that-exact-origin>`: staff,
   enrollment and deletion should be available and origin_allowed=true.
3. `/api/health/live` is process liveness only, NOT a release/readiness check.
4. Use `tools/check_auth_readiness.py` with privately configured
   WEBSITE_CHECK_ORIGINS containing the two website origins. It only performs GETs,
   never passes secret values and returns a nonzero exit code for incomplete setup.
5. Keep login/OTP/role regression verification in the isolated test suite. Presence
   flags are not proof of matching secret values or real SMS delivery. No production
   phone, account promotion, admin seeding or OTP dispatch is required by this task.

Production is NOT corrected merely because the local preview has the new code or
because a health route returns HTTP200. Do not publish an unready build over a working
one, and do not put `.env` into a public repository to transfer secrets.