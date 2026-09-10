# plan.md

## STATUS (updated)
- Phase 1 POC: DONE (MSG91 send works w/o template_id; live sync verify-otp(1234)->PUT profile->GET me OK, name+city persist; admin phone role=customer on live -> local-first admin + auto-unlock proxy; MSG91 balance=0 so no real SMS delivery yet)
- Phase 2 V1: BUILT (backend server.py+sms.py+live_client.py; public landing form->otp->success; admin login/dashboard/users/detail/reports/settings/live modules; DEMO_LOGIN_CREDENTIALS.txt)
- Testing agent E2E: PASSED 99% (66/67). Fixed: strict country-code rejection on /api/enroll/send-otp, chart sizing warning. V1 COMPLETE & DELIVERED.
- 2026-09-01: Demo OTP 1234 removed; MSG91 moved to Flow API (template is a Flow template).
- Phase 5 (2026-09-04) "OTP not arriving on deployed site" — COMPLETED (build 2026.09.04-sms-v4):
  - ROOT CAUSE: MSG91 flow API answers {"type":"success"} + request id even for a wrong authkey/template and then silently drops the SMS (no dashboard log). Old code trusted that answer; frontend ignored `sms_sent`; so the site said "OTP sent" while nothing was sent. Deployed env evidently sends with a config MSG91 does not accept (or runs an older build).
  - FIX: pre-flight authkey/template validation (flow-detail API, cached 5 min) before every send; challenge persisted only after MSG91 accepts; 503 JSON error with the real reason (not 502 - Cloudflare rewrites 502); every attempt logged in `sms_logs`; background delivery confirmation via MSG91 log API (+6s/+20s/+60s) -> Delivered / Failed / not_logged(dropped); GET /api/health with build+provider check; admin Settings "SMS Provider (MSG91) - Live Diagnostics" (status, DLT approval, 24h counters, test send, per-message delivery status + re-check).
  - VERIFIED: OTPs to 9711881372 and 9999813334 confirmed Delivered by MSG91 log API. Regression suite tests/test_sms_pipeline.py (12 pass, safe). Testing agent iteration_2: all pass.
  - USER ACTION: Redeploy, then open https://<deployed-domain>/api/health -> must show build 2026.09.04-sms-v4 and sms.provider_check "ok"; Admin > Settings shows the same diagnostics from the deployed server.
- Phase 6 (2026-09-04, build 2026.09.04-sms-v5) — COMPLETED:
  - Deployed instance https://yash-register.emergent.host: /api/health proved MSG91_TEMPLATE_ID (added to .env after first deploy) + ENVIRONMENT are absent there (Emergent snapshots deployment secrets at first deploy; new keys must be added in Deployments > app > Secrets > Edit > Custom Keys, then Redeploy).
  - Code hardening: MSG91_TEMPLATE_ID now defaults in code (non-secret business constant 61baece18e964726da04e8c5, env overrides); /api/health lists env_keys_present (names only); not-configured error names the missing key.
  - Public enrollment UX: full flow state (form values + consent, step, OTP send time, success payload) persisted in localStorage (src/lib/enrollState.js) -> survives reload / switching to SMS app; OTP timers derived from timestamps; browser back on OTP screen returns to pre-filled form (history pushState/popstate); "Change details" keeps consent; expired-OTP restore falls back to filled form; success screen kept 30 min with "Enroll another customer"; OTP input has autocomplete=one-time-code.
  - USER ACTION: Redeploy (works immediately thanks to the default); additionally add MSG91_TEMPLATE_ID + ENVIRONMENT=production as custom secret keys for cleanliness.
- Phase 7 (2026-09-09, build 2026.09.09-privacy-v6) — COMPLETED:
  - Google Play / App Store compliant Privacy Policy at /privacy (16 sections: entity Yash Silver House Pvt. Ltd., contact info@yashornaments.in, data types, sharing parties incl. MSG91/cloud/AI providers, permissions, retention table, rights, deletion process, grievance officer). Company details served from GET /api/public/config -> company{} (env: COMPANY_NAME, LEGAL_ENTITY, COMPANY_ADDRESS, SUPPORT_EMAIL, SUPPORT_PHONE, PRIVACY_UPDATED, APP_NAME).
  - Account deletion web page /delete-account (Play "Delete account URL"): phone -> OTP -> confirm. Backend POST /api/account/delete/{send-otp,resend-otp,confirm}: deletes local enrollment + notes, masks sms_logs, de-identifies app-backend profile (name "Deleted User"), queues deletion_requests (30-day SLA, reference DEL-YYYYMMDD-XXXXXX). Admin Reports shows the queue with "Mark completed" (purges phone).
  - Data-sharing verification tooling: GET /api/admin/live/health (app backend health incl. demo_mode, sync stats, dropped fields, warnings) shown in Settings; POST /api/admin/customers/{id}/verify-sync + field-by-field table in customer detail; sync results now store live_field_check / live_fields_unsynced / live_sync_method.
  - FINDINGS on the shared Yash Trade App backend (yash-tryon-test.emergent.host): name/location/city sync OK; shop_name, registration_source, onboarding_status are IGNORED by its PUT /api/auth/profile; it is in OTP DEMO MODE and the website sync depends on that (breaks + duplicate SMS when real OTPs are enabled). Spec for the fix (integration endpoint + LIVE_INTEGRATION_KEY, already supported client-side in live_client.py) in docs/YASH_TRADE_APP_INTEGRATION.md. Production app backend URL must be confirmed by the user.
  - Tests: tests/test_privacy_deletion.py (7) + tests/test_sms_pipeline.py (12); testing agent iteration_3: 17/17 pass.
- Phase 8 (2026-09-10, build 2026.09.10-integration-v7) — COMPLETED:
  - Switched website→app sync to the server-to-server integration (POST /api/integrations/enrollments, GET/DELETE /api/integrations/customers/{phone}, header X-Integration-Key). Customer-OTP fallback disabled (LIVE_ALLOW_OTP_FALLBACK=false). Runtime-configurable integration (env baseline + admin override in Mongo app_settings via GET/PUT /api/admin/integration; Settings page form "Integration settings" with Save & test). integration_probe() distinguishes "endpoint not deployed" / "key rejected" / "live".
  - /delete-account and admin "Mark completed" call the app DELETE → requests complete automatically with app reference + kept fields. Admin edit-customer pushes via the upsert. verify-sync reads via integration GET.
  - VERIFIED ON PRODUCTION app backend (build 2026.09.09-integration-v7, demo_mode false): upsert all 7 fields match; GET ok; DELETE ok. Legacy pending deletion completed. Contract tests tests/test_integration_contract.py (8) + mock tests/mock_app_backend.py; total 27 pass.
  - Deployment: agent cannot set deployment secrets (platform). Keys are in backend/.env; user must add LIVE_BACKEND_BASE / LIVE_INTEGRATION_PATH / LIVE_INTEGRATION_KEY in Deployments > Secrets (or paste them in Admin > Settings > Integration settings on the deployed site) and Redeploy.
- Phase 9 (2026-09-10, build 2026.09.10-integration-v8) — COMPLETED: ROOT CAUSE of "new secrets never reach the deployment": auto-generated .gitignore rules `.env` / `.env.*` / `*.env` excluded backend/.env from the publish snapshot (file was never committed). Removed the rules, staged backend/.env + frontend/.env; deployment scan gitignore_blocks_required_files=false. /api/health env_keys_present now lists all keys + app_integration block for post-publish verification. Testing agent iteration_5: 12/12. USER: re-publish, then check https://yash-register.emergent.host/api/health shows build v8 and LIVE_INTEGRATION_KEY true.
- Backlog: real Play Store / App Store links (env ANDROID_APP_URL / IOS_APP_URL); admin alert on each new enrollment; admin live-modules unlock now that demo mode is off.

## 1) Objectives
- Deliver a mobile-first Yash Ornaments enrollment website (public) that verifies phone via OTP (MSG91) and then syncs the verified customer profile into the live Yash Trade App backend.
- Provide a private `/admin` portal (no public links) for authorized staff to monitor enrollments, manage customer records (website mirror + proxy to live backend where possible), and export reports.
- Ensure secure OTP handling, robust sync (retry + status), and clean UX: Step 1 enroll/verify → Step 2 app download instructions.

## 2) Implementation Steps

### Phase 1 — Core Workflow POC (isolation; do not proceed until green)
**User stories (POC)**
1. As a customer, I can request an OTP to my phone and receive it via MSG91.
2. As a customer, I can submit the OTP and be verified only if the OTP is correct and unexpired.
3. As the system, once verified I can upsert the customer profile into the live backend and confirm it persists.
4. As an admin, I can confirm whether my admin phone has sufficient permissions on the live backend for customer listing.
5. As the system, if live-backend sync fails, the registration is saved locally as “pending_sync” for retry.

**Steps**
- Create `test_core.py` (single file) that:
  - A) Sends OTP via MSG91 using authkey from env; validate response.
  - B) Exercises live backend sync: `verify-otp(1234)` → token → `PUT /api/auth/profile` with `{name, shop_name, location, city, onboarding_status, registration_source, registered_at, phone_verified}` → `GET /api/auth/me` confirm fields.
  - C) Admin feasibility: `verify-otp` for `9999813334` → attempt `GET /api/customers` with token; record whether allowed.
- Websearch playbook: MSG91 OTP API requirements (DLT/template_id, sender ID), rate limits, and recommended parameters; update integration accordingly.
- Gate: POC must pass in this environment (or document exact MSG91 template requirements and provide a working dev-mode fallback).

### Phase 2 — V1 App Development (public site + backend APIs + minimal admin)
**User stories (public enrollment)**
1. As a customer, I see a clear 2-step indicator (Enroll/Verify → Download & Log In).
2. As a customer, I get immediate field-level errors when phone is not exactly 10 digits.
3. As a customer, I must accept Terms + Privacy before I can submit.
4. As a customer, I can resend OTP after a timer and see remaining time.
5. As a customer, after verification I see success + app download buttons + QR and instructions.

**User stories (admin v1)**
1. As an admin, I can log into `/admin/login` using OTP to my approved phone.
2. As an admin, I am blocked (403/redirect) if not authenticated.
3. As an admin, I can see total registrations + today/7d/30d counts.
4. As an admin, I can view a paginated list of enrolled customers from the local mirror.
5. As an admin, I can export the filtered list to CSV.

**Backend (FastAPI) — build around proven POC**
- Config/env:
  - `MSG91_AUTHKEY`, `MSG91_SENDER/flow_id/template_id` (as needed), `LIVE_BACKEND_BASE=https://yash-tryon-test.emergent.host`, `DEMO_MODE`.
- Collections:
  - `otp_challenges` (phone_normalized, otp_hash, expires_at, attempts, resend_count, created_at).
  - `enrollments` (mirror: name, phone, shop_name, location, city, statuses, sync_status, live_user_id, timestamps).
  - `admin_sessions` + `audit_logs`.
- Public APIs (website-only):
  - `POST /api/enroll/send-otp` (validates phone; creates pending challenge only).
  - `POST /api/enroll/verify-otp` (verifies OTP; then performs live-backend sync; returns Step-2 payload).
- Live-backend proxy module:
  - `live_verify_otp(phone, "1234" in dev/staging only)`
  - `live_update_profile(token, updates)`
  - `live_get_me(token)`
  - Sync result stored in mirror with `sync_status: ok|pending|failed`.
- Admin APIs:
  - `POST /api/admin/send-otp`, `POST /api/admin/verify-otp` (only allow phone==9999813334 for session creation).
  - `GET /api/admin/stats`, `GET /api/admin/enrollments` (filters/pagination), `GET /api/admin/enrollments/export`.
- Security:
  - Hash OTPs (bcrypt/sha256+salt), strict expiry, attempt + resend limits, IP rate limit.
  - HTTP-only cookie session for admin; server-side session store.
  - Strict separation: no admin data in public endpoints.

**Frontend (React)**
- Public pages:
  - Landing + enrollment form (Step 1) with validation and consent checkboxes.
  - OTP screen component (countdown, resend, verify, loading/error states).
  - Success (Step 2): phone summary + download buttons (placeholder links) + QR placeholder.
  - Branding: pull logo from yashornaments.in; replace with crisp SVG/hi-res (or implement safe upscale + CSS sizing); gold/deep theme.
- Admin pages (separate route group):
  - `/admin/login` OTP flow.
  - `/admin` dashboard + enrollment table + CSV export.
- No navigation path from public site to `/admin`.

**End Phase 2**
- Run one round of end-to-end tests: customer enrollment → OTP → live backend sync → Step 2; admin login → list/export.

### Phase 3 — Feature Expansion (admin + sync resilience + proxy)
**User stories (expanded admin + ops)**
1. As an admin, I can search/filter by phone, shop name, location, date ranges, login status.
2. As an admin, I can open a customer detail page with full enrollment + sync status.
3. As an admin, I can edit safe fields (name/shop/location) and push updates to live backend.
4. As an admin, I can deactivate/activate (mirrored + push to live backend if supported).
5. As an admin, I can see a timeline/audit trail of changes.

**Steps**
- Add retry queue/worker endpoint (manual “retry failed sync” button) and scheduled retry logic (best-effort within app runtime).
- Implement admin customer detail view + internal notes + audit trail.
- Add live-backend proxy capabilities where permitted:
  - If admin token can access `GET /api/customers`, expose read-only views in `/admin`.
  - If not permitted, clearly label live data as unavailable; rely on local mirror + `/api/auth/profile` updates post-verify.
- Add “phone change” flow: requires OTP re-verification to new phone and careful upsert.

### Phase 4 — Hardening + comprehensive QA
**User stories (quality & safety)**
1. As a customer, I never see internal errors; I get actionable messages and can retry.
2. As an admin, I am auto-logged-out after inactivity.
3. As an admin, I can download CSV reports reliably for any filter.
4. As the system, I never leak OTPs/tokens in logs or responses.
5. As the business, deactivated customers are blocked from website enrollment actions.

**Steps**
- Add comprehensive validation tests, security checks, and regression suite.
- Ensure DB indexes (phone_normalized unique, registered_at, sync_status, statuses).
- Final styling pass (responsive + accessible) and performance pass.

## 3) Next Actions
1. Implement and run `test_core.py` POC (MSG91 send + live backend sync + admin feasibility).
2. Confirm MSG91 DLT/template requirements (if any) and finalize env vars.
3. Build Phase 2 V1 in one pass: backend APIs + React enrollment + minimal `/admin`.
4. Run E2E test checklist (Completion Requirements 1–12) and fix gaps.

## 4) Success Criteria
- POC green: MSG91 OTP send works; live backend profile upsert persists; admin feasibility outcome documented.
- Customer flow: invalid phone blocked; OTP verified; enrollment saved; live backend `/api/auth/me` returns name/shop/location; Step 2 shown.
- Admin flow: `/admin` fully private; OTP login for 9999813334; dashboard + list + CSV export works.
- Security: OTP hashed + expiry; resend/attempt limits; no admin data exposed on public endpoints; cookies httpOnly; no secrets in client.
