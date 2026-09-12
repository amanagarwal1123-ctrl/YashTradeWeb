# Production handoff — owner-executed settings, redeploy, role repair and live login test

Single consolidated runbook. The **owner** executes every production step through the
Emergent platform (Manage Publishes → Secrets / Database, Republish) and GitHub. No other
operator is required. It cross-links `PRODUCTION_AUTH_CONFIGURATION.md` (website settings
detail), `PRODUCTION_AUTH_RCA.md` (root cause) and the app repository's
`PRODUCTION_ADMIN_RECOVERY.md` (role repair, owned by the app chat).

## Access model (stated once)
The coding agent works in the preview workspace only: it can register setting NAMES with
non-working placeholders in `backend/.env`, run isolated tests and read public production
endpoints. It cannot read or write production Secrets or the production database, and it
cannot type an OTP into the owner's browser. Real values are entered only in Manage
Publishes → Secrets; they must never appear in chat, GitHub, logs, screenshots or the
frontend bundle. Editing preview `.env` never changes an existing production value.

## Change states (keep these distinct)
| State | Meaning | How to observe |
|---|---|---|
| Staged | In the preview workspace, not yet in git | Preview URL / editor |
| Committed (local) | Platform auto-commit in the workspace repo | `git log` in workspace; not on GitHub until Save to GitHub |
| Committed (GitHub) | Pushed to `amanagarwal1123-ctrl/YashTradeWeb` `main` | SHA on GitHub.com |
| Deployed | Snapshot of the workspace at the moment of Republish | `GET /api/health/ready` → `build`, `commit` (BUILD_COMMIT) |

Deployed code comes from the workspace snapshot at Republish time, not from GitHub. Save
to GitHub and Republish are independent; do both so the SHA and the deployment match.

## Pinned references
| Item | Reference |
|---|---|
| App contract commit | `6a6cdddb81a4c27b387144746a7b6cf7fefc85c2` (build `shared-v1-owner-recovery-2026-09-12`, `capabilities.credential_readiness=1`) |
| App runbook / command | `PRODUCTION_ADMIN_RECOVERY.md`, `backend/tools/recover_owner_admin.py` at that commit (app chat owns this) |
| Website build | `website-shared-v1-readiness-adapter-v2` (`backend/bff/readiness.py`, `backend/bff/canonical.py`) |
| Website BUILD_COMMIT | The website's own GitHub SHA after Save to GitHub — never the app SHA |

## Target account (preserve; never recreate, merge or override on the website)
Phone `9999813334`, canonical ID `bcdf18c9-dc87-4d46-b580-30cf519103df`, currently role
`customer`, active, verified. The only authorized change is the same-ID customer → admin
correction **in the canonical app database**. The website has no local role authority and
must not get one.

## Coordinated order: app backend first, then website

### A. App (Yash Trade App project — coordinated with the app chat)
1. Manage Publishes → Secrets: add `STAFF_SERVICE_KEY` = one strong, independently generated
   secret (≥32 characters; 48 random bytes encoded is ideal), different from
   `ENROLLMENT_INTEGRATION_KEY`. Leave JWT/SMS/Mongo/enrollment values unchanged.
2. Republish → **Re-publish changes** (normal; preserves the database). Never use
   *Replace with a fresh database*.
3. Verify (no SMS): `GET https://yash-tryon-test.emergent.host/api/health` → HTTP 200,
   `status=ok`, `flows.staff.ready=true`. While it is 503 with
   `flows.staff.issues=["STAFF_SERVICE_KEY"]`, the app step is not active.
4. Role repair (app side): either an existing genuine app admin uses
   `POST /api/integrations/staff/9999813334/convert` with
   `{"role":"admin","confirm_user_id":"bcdf18c9-dc87-4d46-b580-30cf519103df","reason":"Owner explicitly authorised correction of the existing app customer to admin"}`,
   or the committed operator command is run per `PRODUCTION_ADMIN_RECOVERY.md`
   (dry-run → reviewed hash → `--apply`). Emergent support does not run scripts; the app
   chat's runbook also documents the audited single-document path for the owner via
   Manage Publishes → Database (Database Manager, edit mode acts on live data with no undo,
   so back up first and change only `role` for the exact ID above and bump
   `session_version`). Keep the backup receipt privately.

### B. Website (this project) — Secrets checklist
Setting names already exist in `backend/.env` with non-working placeholders
(`PLACEHOLDER_NOT_CONFIGURED…`), so they appear under Custom Keys after the first Republish.

| Secret | Value to enter (owner, privately) |
|---|---|
| `CANONICAL_API_BASE_URL` | `https://yash-tryon-test.emergent.host/api` |
| `ENROLLMENT_INTEGRATION_KEY` | Privately copy the app's existing production enrollment key (the value currently held as website `LIVE_INTEGRATION_KEY`). Do not rotate; preserve the app's value |
| `STAFF_SERVICE_KEY` | The identical new value set on the app in A.1 (must differ from the enrollment key) |
| `BFF_ALLOWED_ORIGINS` | `https://register.yashsilver.com,https://yash-register.emergent.host` (edit the EXISTING key in Secrets; it currently lists one origin) |
| `BFF_INGRESS_ORIGINS` | Keep only verified ingress Origin aliases; no wildcard |
| `SESSION_SECRET` | Keep the existing website value |
| `BUILD_COMMIT` | The website GitHub SHA from step B.2 |
| `TRUSTED_INGRESS_CIDRS`, `FORWARD_CANONICAL_CLIENT_IP` | Leave unset until proxy peers are verified |

Exact steps:
1. Click **Republish** → Overview → **Re-publish changes** once so the four new key names
   (with placeholders) register in Secrets. Readiness stays 503 by design at this point.
2. Chat input **Save** → **Save to GitHub** (account `amanagarwal1123-ctrl`, repo
   `YashTradeWeb`, branch `main`). Open GitHub → latest commit on `main` → copy the full SHA.
   The platform shows no SHA itself; verify the timestamp/files on GitHub.
3. Manage Publishes → **Secrets** → Custom Keys: **Edit** each row in the table above
   (new keys and the existing `BFF_ALLOWED_ORIGINS`), save. Paste the SHA into `BUILD_COMMIT`.
4. **Republish** → **Re-publish changes** (normal). Both `register.yashsilver.com` and
   `yash-register.emergent.host` are updated by the same redeploy.
5. Do not edit preview `.env` to change a value that already exists in Secrets (the deploy
   keeps the stored Secrets value).

### C. Website verification without SMS (both domains)
For `https://register.yashsilver.com` and `https://yash-register.emergent.host`:
1. `GET <origin>/api/health/live` → 200 `alive` (process only).
2. `GET <origin>/api/health/ready` → 200, `build=website-shared-v1-readiness-adapter-v2`,
   `commit=<your SHA>`, `integration_ready=true`, `upstream.contract=credential_readiness`,
   `key_matching_verified_by_this_check=true`, all `flows.*.credential_verified=true`.
   - `CANONICAL_CREDENTIAL_MISMATCH` → that website key differs from the app's.
   - `CANONICAL.STAFF_SERVICE_KEY` → app step A not active.
   - `CANONICAL_UNAVAILABLE_OR_INCOMPATIBLE` → wrong base URL / unreachable / undocumented response.
3. `GET <origin>/api/public/auth-status?website_origin=<origin>` → `origin_allowed=true`,
   all three flows `available=true`.
4. Optional: `WEBSITE_CHECK_ORIGINS=https://register.yashsilver.com,https://yash-register.emergent.host python tools/check_auth_readiness.py` → exit 0.

### D. Live OTP login test (owner-authorized for 9999813334 only)
Only after A and C pass. One initial SMS per login test; at most one resend after the
normal cooldown; stop on any unexpected error rather than resending.
1. Open `<origin>/admin/login`, enter `9999813334`, press **Send OTP** (one SMS).
2. Enter the received OTP on the page. Never paste OTPs into chat, logs or evidence.
3. Expected: redirect to `/admin` (Operations overview) with the header role badge
   `admin` (`data-testid="admin-role-badge"`) and your name.
4. In the same browser tab open `<origin>/api/admin/auth/me` → JSON with
   `id="bcdf18c9-dc87-4d46-b580-30cf519103df"` and `role="admin"`. Anything else = not verified.
5. Reload `/admin` (session persists), open a protected page (e.g. `/admin/products`),
   then **Sign out** → `/api/admin/auth/me` returns 401 `AUTH_REQUIRED`.
6. Repeat on the second domain (cookies are per domain; a second SMS is expected).
7. Additional live role tests use designated approved staff accounts only; automated
   regression stays mocked.

## Report back (names/status only, never values)
- App: build, `flows.staff.ready`, role repair receipt (operation ID or backup receipt name).
- Website per domain: `build`, `commit`, `integration_ready`,
  `key_matching_verified_by_this_check`, `origin_allowed`.
- Login per domain: SMS requested (yes/no), SMS received (yes/no), `/api/admin/auth/me`
  ID + role, dashboard opened, session persisted, logout confirmed — as separate outcomes.
