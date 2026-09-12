# Production operator handoff — the single current owner checklist (2026-09-12, v3)

This is the only current checklist. `PRODUCTION_AUTH_CONFIGURATION.md`, `PRODUCTION_AUTH_RCA.md`,
`WEBSITE_RELEASE_READINESS.md` and `APP_TEAM_HANDOFF.md` are dated background and link here; the
app repository's `PRODUCTION_ADMIN_RECOVERY.md` (with `backend/tools/recover_owner_admin.py` and
`backend/tools/windows/Recover-OwnerAdmin.ps1`) is the exact role-recovery reference and is owned by
the app chat. Older staging-only / no-SMS / unknown-app-commit instructions are superseded.

## Settled decisions
- One authentication and customer system: the app backend owns identity, role, customer profile,
  requests, metrics and rates. The website database holds only BFF sessions, drafts, caches and
  integration state. No website-local admin, reviewer auth, demo OTP or role override — ever.
- Owner-admin correction is authorized for phone `9999813334`, canonical ID
  `bcdf18c9-dc87-4d46-b580-30cf519103df` (preserve ID and history; app-side only; verify the current
  role first; matching service keys never promote anyone).
- Controlled genuine OTP login testing to `9999813334` is authorized: one normal login per website
  origin, at most one resend after the real cooldown, stop on unexpected errors. No other numbers.
  Real codes/tokens never appear in reports.
- The owner is the production operator via Emergent **Manage Publishes → Secrets / Database** and
  normal **Re-publish changes**. Never *Replace with a fresh database*. Emergent support runs no scripts.
- Access limitation (stated once): the website agent works in preview. It edited the actual
  `backend/.env` (gitignored) to declare names and non-secret values, finished code and isolated
  tests, and can read public production endpoints. It cannot write production Secrets/Database,
  cannot see private values and cannot type an OTP into the owner's browser.

## Pins and identities
| Item | Value |
|---|---|
| App contract source (isolated fixture + `CONTRACT_COMMIT`) | `9596a5578a61bb1fb187e63345b7f93eda95bc9c` (build `shared-v1-review-fonts-2026-09-12`, OpenAPI 123 paths, byte-identical to the ZIP schema) |
| App whole-source provenance | NOT verified (ZIP full-source digest ≠ saved tree); contract docs/schema only |
| Website build | `website-shared-v1-d2d3d4-consumers-v3` |
| Website GitHub `main` at audit | `c1ef7d84609e0d0eff0258601b2fc1a84076189e` — newer local work is NOT on GitHub until Save to GitHub |
| Website `BUILD_COMMIT` | The website GitHub SHA after Save to GitHub; never the app SHA; placeholder = `unrecorded` |

## Ordered checklist

### 1. Agent-completed (names only) — DONE in preview, needs Save to GitHub + Republish
`backend/.env` (actual file, gitignored; each name exactly once):
- updated `BFF_ALLOWED_ORIGINS=https://register.yashsilver.com,https://yash-register.emergent.host`
- updated `CANONICAL_API_BASE_URL=https://yash-tryon-test.emergent.host/api`
- updated `ENROLLMENT_INTEGRATION_KEY=SET_IN_PUBLISH_SECRETS` (no valid private value existed under this name)
- updated `STAFF_SERVICE_KEY=SET_IN_PUBLISH_SECRETS`
- updated `BUILD_COMMIT=SET_IN_PUBLISH_SECRETS`
- already present, untouched: `SESSION_SECRET`, `MONGO_URL`, `DB_NAME`, `BFF_INGRESS_ORIGINS`, `LIVE_INTEGRATION_KEY` (existing private enrollment value), MSG91/legacy settings.
Placeholder markers (`SET_IN_PUBLISH_SECRETS`, `PLACEHOLDER`, `REPLACE_ME`, `CHANGE_ME`, `UNCONFIGURED`)
are rejected in code (`bff/config.py`) and tested; runtime Secrets always win over `.env`
(`load_dotenv` never overrides). Code: per-flow credential-verified readiness, D2/D3/D4 consumers
(customer search, complete customer_id history, cursor deletion feed), strict release gate
`tools/check_auth_readiness.py`, isolated tests (see `evidence/auth-production-incident/readiness-adapter-v2/RUN_SUMMARY.json`).

### 2. App project (Yash Trade App) — owner, coordinated with the app chat
1. Normal **Re-publish changes** of the saved app so its newly declared key names register in Secrets.
2. Manage Publishes → Secrets (existing-key editor): privately set `STAFF_SERVICE_KEY` (strong,
   independent, ≠ enrollment key), the distinct review database name, the actual app build SHA and
   the correct frontend production origin as the app runbook requires. Keep `ENROLLMENT_INTEGRATION_KEY`,
   JWT, SMS and Mongo values unchanged.
3. **Re-publish changes** again. Check `GET https://yash-tryon-test.emergent.host/api/health`:
   200, `flows.staff.ready=true`, `capabilities.customer_id_history=1`, `deletion_outbox_cursor=1`.

### 3. Website project (this repo) — owner
Fresh read-only check (12 Sep, after this work started): both production domains already run
`website-shared-v1-readiness-adapter-v2` (an earlier republish from the workspace), so the names
`CANONICAL_API_BASE_URL`, `ENROLLMENT_INTEGRATION_KEY`, `STAFF_SERVICE_KEY`, `BUILD_COMMIT` are
probably already registered in Secrets with `PLACEHOLDER_NOT_CONFIGURED` values. Open the Secrets
tab first: if they are listed, edit them directly (step 3) and skip the registration republish (step 2).
1. Chat **Save → Save to GitHub** (`amanagarwal1123-ctrl/YashTradeWeb`, `main`); copy the new SHA from
   GitHub (the platform shows none).
2. **Republish → Re-publish changes** once (only if the names are not yet in Secrets): the five names
   register in production Secrets (placeholders keep readiness 503 — this publication does NOT restore login).
   `/api/health/ready` now also returns `configuration_state` per name: `placeholder` = production Secrets still
   hold the bootstrap value (edit it in Secrets; a republish alone never replaces it), `missing` = not set,
   `valid` = usable. Live on 12 Sep both domains showed `CANONICAL_API_BASE_URL` invalid because the Secret
   holds the earlier placeholder — the `.env` URL cannot override an existing Secret.
3. Manage Publishes → **Secrets** → edit existing keys privately:
   `CANONICAL_API_BASE_URL` = `https://yash-tryon-test.emergent.host/api`;
   `ENROLLMENT_INTEGRATION_KEY` = the app's existing production enrollment key (same value as the
   website's private `LIVE_INTEGRATION_KEY`; preserve the app's value);
   `STAFF_SERVICE_KEY` = identical to the app value from step 2;
   `BFF_ALLOWED_ORIGINS` = both origins above (edit the existing key; `.env` cannot overwrite it);
   `BUILD_COMMIT` = the website SHA from 3.1. Keep `SESSION_SECRET`; keep only verified ingress aliases.
4. **Re-publish changes** (normal). Both `register.yashsilver.com` and `yash-register.emergent.host`
   are updated by the same deploy.
   If an already-registered key cannot be edited in Secrets, that is a platform permission issue on
   the Secrets panel for this project — raise it once with Emergent support; do not work around it in code.

### 4. Verification (no SMS first, then one genuine login per origin)
1. Release gate from any machine with Python + httpx (read-only GETs, no secrets):
   `WEBSITE_CHECK_ORIGINS=https://register.yashsilver.com,https://yash-register.emergent.host EXPECTED_WEBSITE_BUILD=website-shared-v1-d2d3d4-consumers-v3 EXPECTED_WEBSITE_COMMIT=<website SHA> EXPECTED_APP_CONTRACT_COMMIT=9596a5578a61bb1fb187e63345b7f93eda95bc9c EXPECTED_UPSTREAM_BUILD=<app build from /api/health> EXPECTED_UPSTREAM_COMMIT=<app BUILD_COMMIT> PUBLICATION_RECEIPT=<publish id/date> python tools/check_auth_readiness.py`
   → exit 0 only when both origins report `integration_ready=true`, `upstream.contract=credential_readiness`,
   `key_matching_verified_by_this_check=true`, all flows `credential_verified=true`, `origin_allowed=true`,
   public flows available. `CANONICAL_CREDENTIAL_MISMATCH` = website key ≠ app key; `CANONICAL.STAFF_SERVICE_KEY`
   = app step 2 not active; `CANONICAL_UNAVAILABLE_OR_INCOMPATIBLE` = base/upstream problem.
2. Deployed-source identification: `commit` on `/api/health/ready` must equal the GitHub SHA you set.
3. Owner role recovery if `GET /api/auth/me` after login is still `customer`: app chat's guarded
   procedure (backup → dry-run → reviewed report hash → targeted apply → audit → session invalidation).
4. Genuine admin login (owner only): open `<origin>/admin/login`, enter `9999813334`, **Send OTP**
   (one SMS), enter the received code on the page (never in chat). Expect `/admin` with role badge
   `admin`; in the same tab `<origin>/api/admin/auth/me` → `id=bcdf18c9-dc87-4d46-b580-30cf519103df`,
   `role=admin`. Reload (session persists), open `/admin/users` → a customer → complete enquiry
   history; `/admin/queries`; `/admin/rates`; **Sign out** → `/api/admin/auth/me` = 401. Repeat on
   the second origin (separate cookie, second SMS). Record dispatch / receipt / verification /
   ID+role / dashboard / reload / logout separately.

### 5. Assigned, not complete
- App team: private reviewer provisioning note for store review (isolated review DB); website has
  and needs no reviewer auth.
- App team + provider: media/SMS provider erasure acknowledgements (`required_acknowledgements`
  beyond `website`); a website ack never proves provider deletion.
- Owner/app team: physical native builds and store acceptance; real Play/App Store links
  (`ANDROID_APP_URL`/`IOS_APP_URL` with `*_RELEASE_VERIFIED=true`) once published.
- Website: D2/D3/D4 tests now pass against pin `9596a55`; re-run when the app publishes its narrow
  packaging correction and update the pin only after inspecting that commit.
