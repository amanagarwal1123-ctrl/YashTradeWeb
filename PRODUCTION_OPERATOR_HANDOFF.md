# Production operator handoff — the single current owner checklist (2026-09-12, v4: app pin a0b1e80)

This is the only current checklist. `PRODUCTION_AUTH_CONFIGURATION.md`, `PRODUCTION_AUTH_RCA.md`,
`WEBSITE_RELEASE_READINESS.md` and `APP_TEAM_HANDOFF.md` are dated background and link here; the
app repository's `PRODUCTION_ADMIN_RECOVERY.md` is the role-recovery reference and is owned by
the app chat. Older staging-only / no-SMS / unknown-app-commit instructions are superseded.

## Settled decisions
- One authentication and customer system: the app backend owns identity, role, customer profile,
  requests, metrics and rates. The website database holds only BFF sessions, drafts, caches and
  integration state. No website-local admin, reviewer auth, demo OTP or role override — ever.
- Default administrator (owner decision 12 Sep 2026): phone `9999813334`, canonical ID
  `bcdf18c9-dc87-4d46-b580-30cf519103df`, is admin on the app AND the website in every environment.
  The **app backend applies it itself at every start** (`OWNER_ADMIN_PHONE`, app `shared/owner_admin.py`:
  same canonical record, history kept, sessions revoked once) and reports it on `GET /api/health` as
  `flows.owner_admin.state` (`created` / `promoted` / `already_admin`). The website never creates,
  stores or promotes a local record for it — it reads `role=admin` from canonical `/auth/me` after the
  staff OTP exchange (channel `portal`, server-only `X-Staff-Service-Key`) like every other staff account,
  and routes that role to `/admin`; customers receive `403 STAFF_ONLY`. Matching service keys never
  assign a role.
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
| App contract source (isolated fixture + `CONTRACT_COMMIT`) | `281067bb04bd8bd82a01cb7a34099bd8762de611` ("Google Play submission changes", build `shared-v1-store-submission-2026-09-13`, 14 Sep 2026 privacy/deletion contract `required_acknowledgements=["website"]`; previous pins a0b1e80, 9596a55, 6a6cddd, c4ee70d) |
| App whole-source provenance | VERIFIED 2026-09-12 against `WEBSITE_RELEASE_HANDOFF.zip` from packaging commit `9e5aa3e` (manifest `source_commit=a0b1e80`): all 8 handoff-file sha256 + Git blob ids match; whole-tree digest `6834fad2…` over 394 blobs matches. Note: the ZIP inside `a0b1e80` itself is the previous package (built from `84a11f9`) — by the app's packaging model the rebuilt ZIP lives in the next commit. |
| Website build | `website-shared-v1-owner-admin-pin-v4` |
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
Live read-only 12 Sep (after the a0b1e80 release): `GET https://yash-tryon-test.emergent.host/api/health`
→ 200, `capabilities.owner_admin_bootstrap=1`, `flows.owner_admin = {ready:true, state:"already_admin",
phone_suffix:"3334"}`, `flows.staff/enrollment/deletion ready`, `configuration.STAFF_SERVICE_KEY=true`,
`OWNER_ADMIN_PHONE=true`, `BUILD_COMMIT=false`. The app steps below are therefore DONE except `BUILD_COMMIT`.
1. Normal **Re-publish changes** of the saved app so its newly declared key names register in Secrets. — done
2. Manage Publishes → Secrets (existing-key editor): privately set `STAFF_SERVICE_KEY` (strong,
   independent, ≠ enrollment key), the distinct review database name (optional), the actual app build SHA
   (`BUILD_COMMIT`, still placeholder) and the correct frontend production origin as the app runbook requires.
   Keep `ENROLLMENT_INTEGRATION_KEY`, JWT, SMS and Mongo values unchanged.
3. **Re-publish changes** again. Check `GET .../api/health`: 200, `flows.staff.ready=true`,
   `flows.owner_admin.state` = `promoted` or `already_admin` (`created` would mean the record was missing),
   `capabilities.customer_id_history=1`, `deletion_outbox_cursor=1`, `owner_admin_bootstrap=1`.

### 3. Website project (this repo) — owner
Live read-only 12 Sep (latest): BOTH `register.yashsilver.com` and `yash-register.emergent.host` return
`GET /api/health/ready` → 200, `integration_ready=true`, `configuration_state` valid for
`CANONICAL_API_BASE_URL` / `ENROLLMENT_INTEGRATION_KEY` / `STAFF_SERVICE_KEY` / `SESSION_SECRET`,
`origin_entries` both valid, all three flows `ready + credential_verified=true`,
`key_matching_verified_by_this_check=true`. Remaining: `BUILD_COMMIT` = `placeholder` (release-gate
requirement only; login is not blocked by it) and the deployed build is still
`website-shared-v1-d2d3d4-consumers-v3` — republish to serve `website-shared-v1-owner-admin-pin-v4`
(surfaces `upstream.owner_admin` and `owner_admin_bootstrap`; no setting names changed).
1. Chat **Save → Save to GitHub** (`amanagarwal1123-ctrl/YashTradeWeb`, `main`); copy the new SHA from
   GitHub (the platform shows none).
2. **Republish → Re-publish changes** once (only if the names are not yet in Secrets): the five names
   register in production Secrets (placeholders keep readiness 503 — this publication does NOT restore login).
   `/api/health/ready` also returns `configuration_state` per name: `placeholder` = production Secrets still
   hold the bootstrap value (edit it in Secrets; a republish alone never replaces it), `missing` = not set,
   `valid` = usable. `origin_entries` lists each `BFF_ALLOWED_ORIGINS` entry by position with `valid` and a
   `reason` (`scheme_not_https`, `path_present`, `placeholder`, `non_default_port`, `missing_host`) — one malformed
   entry fails the whole list closed by design; the value must be exactly the two origins, comma-separated, no spaces,
   no trailing slash, no `/admin`.
3. Manage Publishes → **Secrets** → edit existing keys privately (already valid in production; listed for completeness):
   `CANONICAL_API_BASE_URL` = `https://yash-tryon-test.emergent.host/api`;
   `ENROLLMENT_INTEGRATION_KEY` = the app's existing production enrollment key (same value as the
   website's private `LIVE_INTEGRATION_KEY`; preserve the app's value);
   `STAFF_SERVICE_KEY` = identical to the app value from step 2;
   `BFF_ALLOWED_ORIGINS` = both origins above (edit the existing key; `.env` cannot overwrite it);
   `BUILD_COMMIT` = the website SHA from 3.1 (**still to do**). Keep `SESSION_SECRET`; keep only verified ingress aliases.
4. **Re-publish changes** (normal). Both `register.yashsilver.com` and `yash-register.emergent.host`
   are updated by the same deploy.
   If an already-registered key cannot be edited in Secrets, that is a platform permission issue on
   the Secrets panel for this project — raise it once with Emergent support; do not work around it in code.

### 4. Verification (no SMS first, then one genuine login per origin)
1. Release gate from any machine with Python + httpx (read-only GETs, no secrets):
   `WEBSITE_CHECK_ORIGINS=https://register.yashsilver.com,https://yash-register.emergent.host EXPECTED_WEBSITE_BUILD=website-shared-v1-owner-admin-pin-v4 EXPECTED_WEBSITE_COMMIT=<website SHA> EXPECTED_APP_CONTRACT_COMMIT=a0b1e8085ba6ac679fa0f5ec4e106d928057ed8f EXPECTED_UPSTREAM_BUILD=<app build from /api/health> EXPECTED_UPSTREAM_COMMIT=<app BUILD_COMMIT> PUBLICATION_RECEIPT=<publish id/date> python tools/check_auth_readiness.py`
   → exit 0 only when both origins report `integration_ready=true`, `upstream.contract=credential_readiness`,
   `key_matching_verified_by_this_check=true`, all flows `credential_verified=true`, `origin_allowed=true`,
   public flows available. `CANONICAL_CREDENTIAL_MISMATCH` = website key ≠ app key; `CANONICAL.STAFF_SERVICE_KEY`
   = app step 2 not active; `CANONICAL_UNAVAILABLE_OR_INCOMPATIBLE` = base/upstream problem.
   `upstream.owner_admin` on `/api/health/ready` (and Admin → Settings & Privacy → "Canonical app connection")
   mirrors the app's bootstrap state read-only: `state=already_admin|promoted`, `phone_suffix=3334` expected.
2. Deployed-source identification: `commit` on `/api/health/ready` must equal the GitHub SHA you set.
3. Owner role: no manual recovery is needed any more — the app bootstrap already reports
   `already_admin` for `…3334`. If `GET /api/admin/auth/me` after a genuine login were still `customer`,
   stop and report to the app chat (`flows.owner_admin.issues` names the reason); never fix it on the website.
4. Genuine admin login (owner only): open `<origin>/admin/login`, enter `9999813334`, **Send OTP**
   (one SMS), enter the received code on the page (never in chat). Expect `/admin` with role badge
   `admin`; in the same tab `<origin>/api/admin/auth/me` → `id=enrollment-bff`,
   `role=admin`. Reload (session persists), open `/admin/users` → a customer → complete enquiry
   history; `/admin/queries`; `/admin/rates`; **Sign out** → `/api/admin/auth/me` = 401. Repeat on
   the second origin (separate cookie, second SMS). Record dispatch / receipt / verification /
   ID+role / dashboard / reload / logout separately.

### 5. Assigned, not complete
- App team: private reviewer provisioning note for store review (isolated review DB); website has
  and needs no reviewer auth. App `BUILD_COMMIT` Secret still placeholder (`commit: unrecorded`).
- App team + provider: media/SMS provider erasure acknowledgements (`required_acknowledgements`
  beyond `website`); a website ack never proves provider deletion.
- Owner/app team: physical native builds and store acceptance. Google Play listing "Yash Silver"
  (`https://play.google.com/store/apps/details?id=com.emergent.yashtryontest.lt5e6b`) is live and is the
  website default since build `website-shared-v1-import-busy-2026-09-14` (14 Sep 2026): the success page
  shows the Google Play button + QR after the website republish; `ANDROID_RELEASE_VERIFIED=false` hides it,
  `ANDROID_APP_URL` overrides. iOS stays "unavailable" until `IOS_APP_URL` + `IOS_RELEASE_VERIFIED=true`
  are set (owner is preparing the App Store listing).
- Website: D2/D3/D4 + owner-admin consumer tests pass against pin `a0b1e80`
  (`evidence/owner-admin-pin-v4/`); re-pin only after inspecting any later app commit.

## Website-local, consent-based retention (added 13 Sep 2026) — what the website keeps after a deletion
Deleted ACCOUNT data is never kept (the D4 acknowledgement remains truthful). The website keeps only:
- `bff_winback_contacts`: name/phone/shop/place of customers who **ticked the optional offers box** on
  the website deletion page or **asked for a callback before deleting** (`/api/delete/callback`, account
  kept). 12-month expiry; "Opt out" in Admin → Win-back & Churn erases the details immediately.
- `bff_churn`: anonymous deletion statistics (month, place, reason, website/app) — no identifier.
- `bff_deleted_numbers`: keyed one-way hash of a deleted number (24 months) to flag a returning
  registration to staff (`/admin/users` "Returning" badge). Effective only if the app ever allows a deleted
  number to register again — today the app tombstones deleted numbers (`DELETED_IDENTITY`).
Privacy policy (website `/privacy` §9) lists these three rows. The app's Data Safety form should declare
the same purposes if the in-app deletion screen ever mirrors the opt-in.

## Reviewed PDF import on the live app server (13 Sep 2026)
Observed: `Silver_Upload_01.pdf` (152 pages, 300 products, valid template v1) uploaded fully, then the app
analysis stopped at page 20 with `RENDER_TIMEOUT: page exceeds the resource budget`. That is the **app
server's** per-page budget (`page_timeout_seconds = 25`, worker CPU 22 s / 512 MiB in
`shared/pdf_jobs.py` + `tools/parse_catalog_page.py`), not the file — the same PDF needs ~0.6 s per page here.
- Website now keeps the import moving: after *Upload & analyze* or *Resume analysis* the BFF watches the
  job with the operator's own session and re-queues from the saved checkpoint after a transient page
  failure (≤5 attempts per page, backoff 15–60 s, ≤400 resumes, ≤6 h). It stands down on Pause/Cancel,
  on PDF defects (`BOUNDARY_*`, `UNSUPPORTED_LAYOUT`, …), and when the website session ends
  (the website never keeps a session alive by itself). The import page shows the state and what to do.
- App team (owner to request in the app chat): raise `page_timeout_seconds` to ~90 s and/or give the
  app container more CPU; optionally cache the opened document per job instead of reopening the 24 MB
  file for every page. Until then a page that consistently needs > 25 s will exhaust the 5 attempts.


## "Another update is in progress; retry shortly" during upload and commit (14 Sep 2026)
Observed on production: resuming `Silver_Upload_03/04.pdf` failed on every chunk with that message, and
*Commit* on a reviewed import showed the same message. Both are the app's `409 OPERATION_IN_PROGRESS`.
- Root cause (app): `shared/media_lifecycle.py::tracked_put` takes ONE global Mongo lock `media-budget`
  for **every** storage write — PDF chunks, analysis preview crops and the two product images written per
  committed row — with `wait_seconds=0`, so any concurrent write is refused instantly. The commit itself
  (`pdf_jobs.commit`) runs all rows in one request under `import:<jid>`; for 300 rows that is 600 image
  writes and several minutes on the live server, longer than the browser (45 s) or website proxy (90 s)
  wait, so a second click meets the still-held lock. A commit that races with another import's analysis
  can also mark rows "Storage/database operation failed; row remains recoverable" — committing again
  retries only those rows (already-created products are kept).
- Website build `website-shared-v1-import-busy-2026-09-14`: the proxy resends a refused chunk up to 5×
  (0.5–2.5 s), the page keeps retrying each chunk with backoff for up to 4 min and shows "App server busy
  writing another import — retrying chunk k of N…"; *Commit* now waits for the outcome (status poll every
  5 s, idempotent re-attempt, 30 min budget) instead of failing, and explains failed rows + re-commit; the
  tab warns before leaving mid-upload; re-selected files are labelled "resumes the interrupted transfer".
  Needs Save to GitHub → BUILD_COMMIT → Republish (production still serves an older build).
- App team (owner to request in the app chat): make `tracked_put` wait for the lock (e.g. `wait_seconds=30`)
  or scope it per job instead of globally; return `202` + progress for commits of more than ~50 rows (or
  commit in the background worker) so the browser never has to hold a multi-minute request.
