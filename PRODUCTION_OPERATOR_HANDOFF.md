# Production operator handoff — scoped owner-admin recovery + private settings

Single consolidated runbook for the one authorized operator who holds private production
access to BOTH the Yash Trade App and this website. It cross-links, and does not replace,
`PRODUCTION_AUTH_CONFIGURATION.md` (website settings detail), `PRODUCTION_AUTH_RCA.md`
(root cause) and the app repository's `PRODUCTION_ADMIN_RECOVERY.md` (role repair).

## Access limitation (stated once)
Neither coding workspace has a production settings writer for either project, nor a
production Mongo connection. Nothing below has been applied by this workspace. No preview
change, environment-presence flag or deployment message counts as production recovery.
Secret values must be entered only through the private platform settings facility; never
in chat, source, screenshots or frontend bundles.

## Pinned references (retrievable from GitHub, already committed)
| Item | Reference |
|---|---|
| App contract commit | `6a6cdddb81a4c27b387144746a7b6cf7fefc85c2` (build `shared-v1-owner-recovery-2026-09-12`) |
| App runbook | `PRODUCTION_ADMIN_RECOVERY.md` at that commit |
| App operator command | `backend/tools/recover_owner_admin.py` (`shared/admin_recovery.py`) at that commit |
| App readiness contract | `backend/shared/readiness.py`; OpenAPI `contracts/openapi.shared-v1.json` (120 paths) |
| Website readiness adapter | `backend/bff/readiness.py`, `backend/bff/canonical.py` (this release, build `website-shared-v1-readiness-adapter-v2`) |
| Website `BUILD_COMMIT` | Set at deploy time to the WEBSITE release SHA (never the app SHA) |

## Target account (preserve; never recreate or merge)
- Phone `9999813334`, canonical ID `bcdf18c9-dc87-4d46-b580-30cf519103df`, currently role
  `customer`, active, phone verified (app read-only check, 12 Sep 2026).
- Authorized scope: same-ID customer → admin only. No identity export, no duplicate,
  no website-local admin, no secret rotation, no other users touched.

## Step 1 — Private settings (both projects)
App production (`https://yash-tryon-test.emergent.host/api`): add ONE strong random
`STAFF_SERVICE_KEY` (≥32 chars, ideally 48 random bytes encoded), different from the
existing `ENROLLMENT_INTEGRATION_KEY`. Leave JWT/SMS/Mongo/enrollment settings unchanged.
Restart the app.

Website production (both domains share one runtime configuration):
| Setting | Action |
|---|---|
| `CANONICAL_API_BASE_URL` | `https://yash-tryon-test.emergent.host/api` |
| `ENROLLMENT_INTEGRATION_KEY` | Privately migrate the existing matching `LIVE_INTEGRATION_KEY` value (match confirmed earlier by a non-phone GET 422). No code fallback, no rotation |
| `STAFF_SERVICE_KEY` | The same new app staff value above |
| `BFF_ALLOWED_ORIGINS` | `https://register.yashsilver.com,https://yash-register.emergent.host` |
| `BFF_INGRESS_ORIGINS` | Only verified ingress Origin aliases; no wildcard, no Host reflection |
| `SESSION_SECRET` | Keep existing website secret |
| `TRUSTED_INGRESS_CIDRS` / `FORWARD_CANONICAL_CLIENT_IP` | Leave unset until actual proxy peers are verified |
| `BUILD_COMMIT` | Website release SHA |
Restart the website. Restart also clears the in-process readiness cache.

## Step 2 — No-SMS settings verification (GET only, no phone, no OTP)
1. App: `GET /api/health/live` → 200 alive. `GET /api/health` → 200 `status=ok`,
   `flows.staff.ready=true`. Still 503 with `flows.staff.issues=["STAFF_SERVICE_KEY"]`
   means Step 1 (app side) is not active.
2. Website, each domain: `GET /api/health/ready` → 200, `integration_ready=true`,
   `upstream.contract="credential_readiness"`, `key_matching_verified_by_this_check=true`,
   every `flows.*.credential_verified=true`.
   - `CANONICAL_CREDENTIAL_MISMATCH` on a flow = that website key differs from the app's.
   - `CANONICAL.STAFF_SERVICE_KEY` = app staff key still missing.
   - `CANONICAL_UNAVAILABLE_OR_INCOMPATIBLE` = wrong base URL / unreachable / non-JSON.
3. Website, each domain: `GET /api/public/auth-status?website_origin=<that exact origin>`
   → `origin_allowed=true` and all three flows `available=true`.
4. Optional: `WEBSITE_CHECK_ORIGINS=https://register.yashsilver.com,https://yash-register.emergent.host python tools/check_auth_readiness.py` → exit 0.

## Step 3 — Role repair (canonical app backend only)
Preferred if another genuine app admin exists: that admin's real OTP login, then
`POST /api/integrations/staff/9999813334/convert` with
`{"role":"admin","confirm_user_id":"bcdf18c9-dc87-4d46-b580-30cf519103df","reason":"Owner explicitly authorised correction of the existing app customer to admin"}`.

Otherwise, the operator-only command (from the app repo at `6a6cddd`, run in the app
maintenance environment whose `MONGO_URL`/`DB_NAME` point at the LIVE canonical DB):
1. Prerequisites: verify live `DB_NAME`; pause auth/identity writes; take and verify a
   restorable backup; keep the receipt privately.
2. Dry run (no writes):
   ```bash
   cd backend && python tools/recover_owner_admin.py \
     --phone 9999813334 --user-id bcdf18c9-dc87-4d46-b580-30cf519103df \
     --expected-db '<VERIFIED_PRODUCTION_DB_NAME>' --operation-id owner-admin-recovery-20260912 \
     --operator '<AUTHORISED_OPERATOR_ID>' \
     --reason 'Owner authorised same-ID customer-to-admin correction for 9999813334'
   ```
   Review `database`, `user_id`, `phone_suffix`, `from_role=customer`, `account_status`,
   `report_sha256`. Any conflict/duplicate/deleted/mismatch result blocks; nothing is created.
3. Apply: the identical command plus
   `--apply --approved-report-sha256 '<REVIEWED_SHA>' --backup-ref '<BACKUP_RECEIPT>' --maintenance-confirmed`.
   One atomic user update: `role=admin`, `session_version+1`, audit event; old sessions revoked.
4. Repeat the dry run → expect `already_admin=true`, same ID. Resume writes.

## Step 4 — Genuine login verification (owner-approved, one real OTP)
Only after Steps 1–3 pass: the owner signs in once on each website domain. Confirm
website `/api/admin/auth/me` and app `/api/auth/me` return the SAME ID
`bcdf18c9-dc87-4d46-b580-30cf519103df` with `role=admin`; a customer account is denied;
telecaller/billing roles route correctly. Until then no real login is verified.

## Report back (names/status only, never values)
- App: build, `flows.staff.ready`, backup receipt name, recovery `operation_id`, replay dry-run result.
- Website per domain: `build`, `commit`, `integration_ready`, `key_matching_verified_by_this_check`, `origin_allowed`.
- Owner login: same canonical ID + `role=admin` observed on app and both website domains (yes/no).
