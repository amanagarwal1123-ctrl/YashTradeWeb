# Yash Trade App backend ↔ Enrollment website — integration spec

> **Status 2026-09-11**
>
> | Part | What | App backend | Website |
> |---|---|---|---|
> | 1 | Customer enrollment sync (`/api/integrations/enrollments`, `/api/integrations/customers/{phone}`) | ✅ live (build `2026.09.09-integration-v7`, demo mode OFF) | ✅ live, verified against production |
> | 2 | Staff directory (`/api/integrations/staff*`) | ⏳ **not deployed yet** (404) | ✅ built; records show *Pending app sync* until the app ships |
> | 3 | Staff console — act-as-staff token + product photos + role rules | ⏳ **not deployed yet** (404) | ✅ built; Products/Rates readable now, writes + Queries switch on automatically |
>
> The website detects each part on its own (no redeploy needed on the website side): the
> moment the endpoints answer, **Manage Users → Sync all** pushes the staff list and the
> header badge changes from *App access pending — read-only* to *Connected to app*.
> A ready-to-send brief for the app team is in `docs/PROMPT_FOR_TRADE_APP.md`.
>
> App backend: `https://yash-tryon-test.emergent.host` · Website: `https://yash-register.emergent.host`
> (also `https://register.yashsilver.com`). Shared secret: app env `ENROLLMENT_INTEGRATION_KEY`
> = website env `LIVE_INTEGRATION_KEY`. The customer-OTP fallback is disabled
> (`LIVE_ALLOW_OTP_FALLBACK=false`).
>
> **Website configuration** (either one works; the admin panel wins when both are set):
> * Deployment secrets: `LIVE_BACKEND_BASE`, `LIVE_INTEGRATION_PATH`, `LIVE_INTEGRATION_KEY`
> * Admin → Settings → "Data Sharing Check" → *Integration settings* → paste URL/path/key → **Save & test**
>   (stored in Mongo `app_settings`, applied instantly, probed against the app backend).

**Purpose:** make customer data sharing between the enrollment website
(`https://yash-register.emergent.host`) and the Yash Trade App backend
(`LIVE_BACKEND_BASE`, currently `https://yash-tryon-test.emergent.host`) work in
**production**, i.e. once the app stops accepting the demo OTP `1234`.

## Current situation (verified 2026-09-09)

| Item | Status |
|---|---|
| Customer record created on the app backend at enrollment | ✅ works (via customer OTP login with demo OTP) |
| `name`, `location`, `city` stored on the app backend | ✅ |
| `shop_name`, `registration_source="website"`, `onboarding_status="registered"`, `registered_at` | ❌ **silently ignored** by `PUT /api/auth/profile` |
| Dependence on app OTP demo mode | ⚠️ The website logs in *as the customer* using OTP `1234`. When `OTP_DEMO_MODE` is switched off, every sync fails **and** the app backend sends a real duplicate OTP SMS to the customer |
| Account deletion | ⚠️ Website can only de-identify the profile (`name="Deleted User"`, blank shop/location). Full record removal needs staff action or the endpoint below |

## What the app backend needs to add (one endpoint, ~40 lines)

### `POST /api/integrations/enrollments`

*Header:* `X-Integration-Key: <shared secret>` — compare with env `ENROLLMENT_INTEGRATION_KEY`
using a constant-time comparison; reject with 401 otherwise. No OTP, no user token.

*Body (JSON):*
```json
{
  "phone": "9876543210",
  "name": "Ramesh Kumar",
  "shop_name": "Kumar Jewellers",
  "location": "Chandni Chowk, Delhi",
  "city": "Delhi",
  "registration_source": "website",
  "registered_at": "2026-09-09T10:15:00+00:00",
  "onboarding_status": "registered",
  "phone_verified": true,
  "consent_terms": true,
  "consent_privacy": true
}
```

*Behaviour:* upsert the customer by `phone` (create if missing, otherwise update the
fields above **without** touching `last_login` / `has_logged_in`; the website has already
verified the phone with its own OTP). Do **not** send any SMS.

*Response 200:*
```json
{ "created": true, "customer": { "id": "...", "phone": "...", "name": "...", "shop_name": "...", "location": "...", "city": "...", "registration_source": "website", "onboarding_status": "registered", "registered_at": "...", "last_login": null, "...": "all other customer fields" } }
```

The website compares `customer.*` with what it sent and shows any dropped field in the
admin panel (Customer → "Verify on app backend").

### `DELETE /api/integrations/customers/{phone}` (recommended)

Same header. Permanently deletes the customer and all personal data (profile, cart,
wishlist, enquiries, reward balance, notes), keeping only legally required sales/invoice
records in de-identified form. Response `200 {"deleted": true}` / `404`.
Used by the website's `/delete-account` flow so requests complete automatically instead of
waiting for staff.

### `PUT /api/auth/profile` (optional but useful)

Accept and persist `shop_name` (already exists on the customer model — the admin
`PATCH /api/customers/{id}` accepts it), `registration_source`, `onboarding_status`,
`registered_at` when supplied by the customer's own token.

## Website side (already implemented)

* `backend/live_client.py` → `sync_enrollment_to_live()` tries
  `POST {LIVE_BACKEND_BASE}{LIVE_INTEGRATION_PATH}` first when `LIVE_INTEGRATION_KEY` is
  set, and falls back to the customer-OTP method only if the endpoint returns 404.
* Env vars to add on the website deployment (Deployments → Secrets → Custom Keys):
  * `LIVE_INTEGRATION_KEY` = the same secret as the app backend's `ENROLLMENT_INTEGRATION_KEY`
  * `LIVE_INTEGRATION_PATH` = `/api/integrations/enrollments` (default)
  * `LIVE_BACKEND_BASE` = the **production** app backend URL (confirm — the current value has "test" in its name)
* Admin → Settings → "Shared Yash Trade App Backend — Data Sharing Check" shows: app backend
  build, OTP mode (demo/real), sync method, synced / partial / failed counts and which fields
  the app backend drops.

## How to verify (anyone, any time)

1. Website admin → **Settings** → the "Data Sharing Check" card must show *Healthy*, OTP
   mode *Real OTPs* (in production), sync method *Server-to-server integration key*.
2. Website admin → **Customers** → open a customer → **Verify on app backend** → the
   field table must show *All fields match*.
3. Website `/api/health` → `status: ok`; app backend `/api/health` → `demo_mode: false`.

---

# Part 2 — Staff (users & roles) integration  `NEW · requested 2026-09-11`

The website admin portal gets a **Manage Users** tab: one list of the people who run the
business — role `admin`, `telecaller`, `billing_executive` — with add / edit (name, phone,
role, code, status) / remove. That list must be the same set of users the Yash Trade App
uses, so the website needs four more endpoints on the app backend, protected by the same
`X-Integration-Key` header (`ENROLLMENT_INTEGRATION_KEY`) as Part 1.

The website already implements its side (client, mirror, retry, import) and a spec mock
(`tests/mock_app_backend.py`, contract tests `tests/test_staff_contract.py`). Until the app
ships these endpoints the tab works locally and shows every record as *Pending app sync*;
the moment the endpoints appear, **Manage Users → Sync all** pushes everything.

## Data model the website expects

```jsonc
{
  "id": "uuid-or-any-string",        // stable id of the user on the app
  "phone": "9876543210",             // 10 digits, unique among non-removed staff
  "name": "Ravi Kumar",
  "role": "admin | telecaller | billing_executive",
  "code": "TC-07",                   // optional employee code (nullable)
  "status": "active | disabled",
  "last_login": "2026-09-10T08:12:00+00:00",  // nullable
  "created_at": "...", "updated_at": "..."
}
```

Map to your existing users/executives collection however you like (e.g. `role` may live on
the user document; `telecaller` might be your `executive` role — please keep the three role
names above **exactly** in the API, translating internally if needed).

## Endpoints (all require `X-Integration-Key`)

### `GET /api/integrations/staff?role=&status=`
List staff (exclude hard-deleted). Optional filters. `200 {"users": [ {...}, ... ]}`.

### `POST /api/integrations/staff`  — create or update **by phone**
```json
{"phone": "9876543210", "name": "Ravi Kumar", "role": "telecaller", "code": "TC-07", "status": "active"}
```
* `phone` + `name` + `role` required; `code`, `status` optional (default `active`).
* If a non-removed staff user with this phone exists → update it and return `"created": false`.
* If the phone belongs to a **customer**, decide your policy: either promote it (keep the
  customer record, add the role) or answer `409` with a clear `detail`. Please document which.
* `200 {"created": true|false, "user": {...}}` · `422` validation (`detail` string) · `401` bad key.

### `PATCH /api/integrations/staff/{id_or_phone}` — partial update
Body: any of `name`, `phone`, `role`, `code`, `status`. `{id_or_phone}` is the user `id`
**or** a 10-digit phone (website may not hold your id yet).
* Changing `phone` must keep phones unique → `409` on conflict.
* Changing `role` / `status` must take effect on the app immediately (invalidate that user's
  app tokens/sessions when they are disabled or lose `admin`).
* `200 {"user": {...}}` · `404 {"detail": "Staff user not found"}` · `409` · `422`.

### `DELETE /api/integrations/staff/{id_or_phone}[?hard=true]`
Default = **soft disable** (`status: disabled`, sessions invalidated, history kept).
`?hard=true` removes the user record. `200 {"deleted": true, "hard": false, "user": {...}}` · `404`.

### Error contract (same as Part 1)
`401` invalid/missing key · `404` unknown user (**must** carry a `detail` other than the
FastAPI default `"Not Found"` — the website uses the default text to detect "endpoint not
deployed yet") · `409` conflicts · `422` validation with a human `detail`.

## Website side (already implemented, build `2026.09.11-staff-v11`)

* Mongo `staff_users` is the website's mirror; every add/edit/remove is written locally first,
  then pushed via the endpoints above; the record carries `app_sync_status` (`ok` / `pending`
  = endpoint not deployed / `failed` = app refused, with the reason shown in the UI) and a
  **Retry** button. `Sync all` re-pushes everything not yet `ok`.
* **Import from app** (`GET` list → create missing local users, link existing by phone) lets
  the website adopt whatever staff already exist on the app on day one.
* The same list decides who may log in to the website admin portal (role `admin` = full
  access). Safety rules: an admin cannot remove/disable/demote themselves; the last active
  admin cannot be removed or demoted; `ADMIN_PHONES` from the env only acts as a bootstrap
  seed and as a fallback when the directory has no active admin at all.
* Optional env on the website: `LIVE_INTEGRATION_STAFF_PATH` (default `/api/integrations/staff`).

## How to verify (after deploying)

1. Website admin → **Manage Users** → the status card must read *Staff endpoint live and key accepted*.
2. Click **Import from app** → your existing admins / telecallers / billing executives appear.
3. Add a test telecaller on the website → it shows *Synced*; `GET /api/integrations/staff`
   on the app returns it; log in to the app with that number → role telecaller.
4. Change its role to `billing_executive`, then remove it → the app reflects each step.
5. `cd /app && python -m pytest tests/test_staff_contract.py -q` (contract) and
   `STAFF_CONTRACT_LIVE=1 ... -k real_app -s` (read-only probe of the real backend).

---

# Part 3 — Staff console: act-as-staff token, role rules, product photos  `NEW · requested 2026-09-11`

The website now gives every staff member a **workspace that mirrors the app**:

| Role | Website workspace | What they do there |
|---|---|---|
| `admin` | Everything below + Dashboard, Customers, Manage Users, Reports, Settings | Full product catalogue (343 items): add / edit / delete products, **add & remove product photographs** |
| `telecaller` | **Queries** (`/admin/queries`) | Customer requests: change status, add notes, **mark completed**; telecaller customer list: call outcomes, follow-ups, activity, summary |
| `billing_executive` | **Rates** (`/admin/rates`) | Publish today's silver / gold rates, edit the item-wise rate list (slabs) |

Design principle (agreed 2026-09-11): the website **acts as the logged-in staff member**
against the app's *existing* endpoints. Permissions, validation and attribution
(`handled_by`, `updated_by`, history "by") stay inside the app — the website never
bypasses them. To do that it needs **one new endpoint** on the app plus a few guarantees.

## 3.1 `POST /api/integrations/staff/{id_or_phone}/token` — the only new endpoint

*Header:* `X-Integration-Key` (same as Parts 1-2). *Body:* `{"issued_via": "website"}` (informational).

*Behaviour:*
1. Look up an **active** staff user by `id` **or** 10-digit `phone` (same lookup as Part 2).
2. Issue **exactly the same kind of bearer token your own login issues** for that user, so
   every existing `Authorization: Bearer …` role check keeps working unchanged.
3. Lifetime **≥ 12 h** recommended (the website caches it per portal session and silently
   re-requests one when the app answers `401`). Do **not** send any SMS.
4. Optionally record `site_last_login` / `last_login` for the user.

*Response 200:*
```json
{ "token": "<jwt>", "expires_at": "2026-09-11T20:00:00+00:00",
  "user": { "id": "…", "name": "Ravi Kumar", "role": "telecaller", "phone": "9876543210" } }
```
*Errors:* `401` bad key · `404 {"detail": "Staff user not found"}` (**not** the FastAPI default
`"Not Found"` — the website treats the default text as "endpoint not deployed") ·
`409 {"detail": "Staff user is disabled"}` · `422` malformed id/phone.

*Revocation:* when a user is disabled / removed / changes role (Part 2 `PATCH`/`DELETE`, or in
the app's own admin UI) tokens issued here must stop working (token version / role claim
checked per request, or a token blacklist).

## 3.2 Role rules the app must enforce for those tokens

The website only forwards calls; **the app decides**. Please make sure these role names are
accepted (translate internally if your role for telecallers is `executive`):

| App endpoint (already exists) | admin | telecaller | billing_executive |
|---|:---:|:---:|:---:|
| `GET /api/products`, `/api/products/{id}`, `/api/categories`, `/api/rates/latest`, `/api/rates/history`, `/api/rate-list` | public | public | public |
| `POST /api/products`, `PUT /api/products/{id}`, `DELETE /api/products/{id}` | ✅ | ❌ 403 | ❌ 403 |
| `POST /api/banners/upload` *(or a dedicated product-image upload, see 3.3)* | ✅ | ❌ | ❌ |
| `GET /api/requests?status=&request_type=&city=&assigned_to=&handled_by=` | ✅ | ✅ | ❌ |
| `PATCH /api/requests/{id}` `{status, assigned_to, notes}` · `GET /api/requests/{id}/history` | ✅ | ✅ | ❌ |
| `GET /api/telecaller/summary` · `GET /api/telecaller/customers?page=&limit=&search=&lead_status=` | ✅ | ✅ | ❌ |
| `POST /api/telecaller/customers/{id}/action` `{action, new_status, notes, follow_up_at}` · `GET …/activity` | ✅ | ✅ | ❌ |
| `POST /api/rates` (RateUpdate) · `POST/PUT/DELETE /api/rate-list[/{slab_id}]` | ✅ | ❌ | ✅ |

Please keep the current request/response shapes (the website was built from your OpenAPI +
live responses): request `status` ∈ `pending | in_progress | completed | cancelled`;
telecaller `lead_status` ∈ `new | contacted | interested | not_interested | converted | follow_up`;
`history[]` items `{status, by, notes, at}`; activity items `{action, new_status, notes, at, by|by_name}`.
If you rename or add values the website shows them verbatim (title-cased), nothing breaks.

## 3.3 Product photographs (admin)

1. **Upload** — the website `POST`s one image at a time as `multipart/form-data`, field name
   `file` (JPG / PNG / WEBP / GIF, ≤ 8 MB), with the admin's bearer token, to
   `POST /api/banners/upload` (default; website env `LIVE_PRODUCT_IMAGE_UPLOAD_PATH` can point
   to any other path such as `POST /api/products/upload-image`). Response must contain the
   served URL: `{"url": "https://…"}` (`image_url` or `path` also accepted; a relative
   `/api/files/…` is prefixed with the app base URL). Please store product images
   **permanently** (not with banner expiry rules) if they share the banners bucket.
2. **Attach** — the website then `PUT /api/products/{id}` with the full list
   `{"images": [ …existing, "<new url>" ]}`. The app must persist `images[]` verbatim and
   render those URLs in the product gallery **together with** the catalogue scan it already
   keeps in `thumbnail_path` / `storage_path` (`GET /api/files/{path}`).
3. **Remove** — `PUT /api/products/{id}` with that URL removed from `images[]`. Deleting the
   orphaned file from storage is optional (nice to have).
4. Every product write is audited on the website (`product_created` / `product_updated` /
   `product_image_added` / `product_image_removed` / `product_deleted`, actor = staff phone)
   and carries the admin's token, so your own `updated_by` logic applies.

## 3.4 How the website behaves until you deploy

* `Manage Users` shows *Waiting for app update*; every user is *Pending app sync* (Part 2).
* Header badge *App access pending — read-only*: Products and Rates are **readable** (public
  endpoints), all writes and the whole Queries page show a clear message + **Reconnect**.
* Detection = `GET /api/integrations/staff` and the token endpoint returning a FastAPI-default
  `404 "Not Found"`. Any other answer (200/401/404-with-custom-detail/409) is treated as
  "deployed" — so please do not ship half of the endpoints.

## 3.5 Acceptance tests (run against your deployment; nothing here sends SMS)

```bash
APP=https://yash-tryon-test.emergent.host; KEY=<ENROLLMENT_INTEGRATION_KEY>
H='-H "X-Integration-Key: '$KEY'" -H "Content-Type: application/json"'

# Part 2 – staff list must answer 200 (not 404 "Not Found")
curl -s -H "X-Integration-Key: $KEY" $APP/api/integrations/staff | head -c 300
# upsert a test telecaller, then fetch a token for them
curl -s -X POST -H "X-Integration-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"phone":"9000000123","name":"Spec Test TC","role":"telecaller","code":"TC-99"}' $APP/api/integrations/staff
TOKEN=$(curl -s -X POST -H "X-Integration-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"issued_via":"website"}' $APP/api/integrations/staff/9000000123/token | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
# telecaller may read requests, may NOT write products (expect 200 then 403)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" "$APP/api/requests?status=pending"
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"x"}' $APP/api/products
# unknown user → 404 with a custom detail; wrong key → 401
curl -s -X POST -H "X-Integration-Key: $KEY" -H "Content-Type: application/json" -d '{}' $APP/api/integrations/staff/9000000000/token
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "X-Integration-Key: wrong" $APP/api/integrations/staff/9000000123/token
# clean up
curl -s -X DELETE -H "X-Integration-Key: $KEY" "$APP/api/integrations/staff/9000000123?hard=true"
```

Website-side verification afterwards: log in to the portal as an admin → header badge reads
*Connected to app*; **Manage Users → Re-check** → *Staff endpoint live and key accepted* →
**Sync all**; open **Products** → pick a product → **Add photo** → the photo appears in the
app; log in as a telecaller → **Queries** lists live requests → **Mark completed** → the
request shows as completed (handled by that telecaller) in the app.

## 3.6 Website reference (already implemented, build `2026.09.11-console-v12`)

* `backend/live_client.py`: `live_staff_token()`, `live_public_get()`, `live_as_user()`,
  `live_upload_image()`; `backend/server.py`: `/api/portal/*` role-allow-listed proxies,
  token acquired in the background after login (`acquire_app_token`, 12 s cap, never blocks
  login), refreshed once on `401`, every write audited.
* Spec mock + contract tests: `tests/mock_app_backend.py`, `tests/test_staff_contract.py`
  (`cd /app && python -m pytest tests/test_staff_contract.py tests/test_staff_api.py -q`).
* Website env (optional): `LIVE_INTEGRATION_STAFF_PATH` (default `/api/integrations/staff`),
  `LIVE_PRODUCT_IMAGE_UPLOAD_PATH` (default `/api/banners/upload`), `LIVE_ADMIN_UNLOCK`
  (default true), `LIVE_ADMIN_UNLOCK_TIMEOUT` (default 12 s).
