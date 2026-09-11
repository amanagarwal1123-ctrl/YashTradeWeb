# Prompt for the Yash Trade App backend team / agent

> Copy everything below the line and paste it to whoever maintains the Yash Trade App backend
> (`https://yash-tryon-test.emergent.host`, FastAPI + MongoDB). It is self-contained; the full
> spec with tables and curl tests is `docs/YASH_TRADE_APP_INTEGRATION.md` (attach it if you can).

---

**Task: extend the existing `X-Integration-Key` integration API so the Yash Ornaments enrollment website can manage staff and act as staff (admin / telecaller / billing executive). Do not change any customer-facing behaviour or existing endpoint shapes.**

## Context

* You already expose `POST /api/integrations/enrollments`, `GET/DELETE /api/integrations/customers/{phone}` protected by the header `X-Integration-Key` (compared with env `ENROLLMENT_INTEGRATION_KEY`). That part is live and working — keep it.
* The website (`https://yash-register.emergent.host`) now has a staff portal. Staff log in there with their phone + OTP (website side). For anything that touches app data the website wants to **act as that staff member against your existing endpoints**, so your role checks, validation and attribution (`handled_by`, `updated_by`, history "by") stay the single source of truth.
* Roles used by the website — please accept these exact strings in the API and translate internally if needed: `admin`, `telecaller`, `billing_executive`. (Your `executives` collection with role `executive` is probably the telecaller.)
* Everything below must return JSON errors with a human `detail`. A `404` for "unknown user" must **not** be the FastAPI default `{"detail": "Not Found"}` — the website uses that exact text to detect "endpoint not deployed yet". Please ship all endpoints in one release.

## 1. Staff directory — `/api/integrations/staff` (all require `X-Integration-Key`)

User object returned everywhere:
```json
{ "id": "…", "phone": "9876543210", "name": "Ravi Kumar", "role": "admin | telecaller | billing_executive",
  "code": "TC-07", "status": "active | disabled", "last_login": "…|null", "created_at": "…", "updated_at": "…" }
```

| Method & path | Behaviour |
|---|---|
| `GET /api/integrations/staff?role=&status=` | List non-deleted staff, optional filters → `200 {"users": [ … ]}` |
| `POST /api/integrations/staff` body `{phone, name, role, code?, status?}` | **Upsert by phone.** Existing non-removed user → update, `"created": false`. `phone`, `name`, `role` required; `status` default `active`. If the phone belongs to a **customer**, either promote it (keep the record, add the role) or answer `409` with a clear `detail` — document which. → `200 {"created": true|false, "user": {…}}` · `422` · `401` |
| `PATCH /api/integrations/staff/{id_or_phone}` body any of `name, phone, role, code, status` | `{id_or_phone}` = your `id` **or** a 10-digit phone. Phone must stay unique (`409`). Role/status changes take effect immediately — invalidate that user's app sessions/tokens when disabled or when `admin` is removed. → `200 {"user": {…}}` · `404 {"detail": "Staff user not found"}` · `409` · `422` |
| `DELETE /api/integrations/staff/{id_or_phone}[?hard=true]` | Default **soft** (status `disabled`, sessions invalidated, history kept). `?hard=true` removes the record. → `200 {"deleted": true, "hard": false, "user": {…}}` · `404` |

## 2. Act-as-staff token — `POST /api/integrations/staff/{id_or_phone}/token`

Header `X-Integration-Key`; body `{"issued_via": "website"}` (informational).

1. Find an **active** staff user by id or phone.
2. Issue **the same kind of bearer token your own login issues** for that user (so every existing `Authorization: Bearer …` check works unchanged). Lifetime ≥ 12 h recommended; the website re-requests a token automatically when you answer `401`. **Never send an SMS** here.
3. Optionally stamp `last_login` / `site_last_login`.

Response `200`:
```json
{ "token": "<jwt>", "expires_at": "2026-09-11T20:00:00+00:00",
  "user": { "id": "…", "name": "Ravi Kumar", "role": "telecaller", "phone": "9876543210" } }
```
Errors: `401` bad key · `404 {"detail": "Staff user not found"}` · `409 {"detail": "Staff user is disabled"}` · `422`.
Tokens must stop working when the user is disabled / removed / changes role (role or token-version claim checked per request, or a blacklist).

## 3. Role rules to enforce for those tokens on your existing endpoints

| Endpoint (already exists) | admin | telecaller | billing_executive |
|---|:---:|:---:|:---:|
| `GET /api/products`, `/api/products/{id}`, `/api/categories`, `/api/rates/latest`, `/api/rates/history`, `/api/rate-list` | public | public | public |
| `POST /api/products`, `PUT /api/products/{id}`, `DELETE /api/products/{id}` | ✅ | 403 | 403 |
| `POST /api/banners/upload` (or a dedicated product-image upload, see §4) | ✅ | 403 | 403 |
| `GET /api/requests?status=&request_type=&city=&assigned_to=&handled_by=` · `PATCH /api/requests/{id}` `{status, assigned_to, notes}` · `GET /api/requests/{id}/history` | ✅ | ✅ | 403 |
| `GET /api/telecaller/summary` · `GET /api/telecaller/customers?page=&limit=&search=&lead_status=` · `POST /api/telecaller/customers/{id}/action` `{action, new_status, notes, follow_up_at}` · `GET /api/telecaller/customers/{id}/activity` | ✅ | ✅ | 403 |
| `POST /api/rates` (RateUpdate) · `POST /api/rate-list` · `PUT/DELETE /api/rate-list/{slab_id}` | ✅ | 403 | ✅ |

Keep the current response shapes. Values the website understands: request `status` ∈ `pending | in_progress | completed | cancelled`; telecaller `lead_status` ∈ `new | contacted | interested | not_interested | converted | follow_up`; `history[]` items `{status, by, notes, at}`; activity items `{action, new_status, notes, at, by|by_name}`. Extra values are displayed verbatim, nothing breaks.

## 4. Product photographs (admin adds / removes photos from the website)

1. **Upload**: the website sends one image at a time as `multipart/form-data`, field `file` (JPG/PNG/WEBP/GIF ≤ 8 MB) with the admin's bearer token to `POST /api/banners/upload` (default). Reply `{"url": "https://…"}` (`image_url` or `path` also accepted; a relative `/api/files/…` is fine). If you prefer a dedicated `POST /api/products/upload-image`, tell us the path — it is one env var on our side. Product photos must be stored **permanently** (no banner-expiry rules).
2. **Attach**: the website then calls `PUT /api/products/{id}` with the complete list `{"images": [ …existing, "<new url>" ]}`. Persist `images[]` verbatim and render those URLs in the product gallery **together with** the catalogue scan you keep in `thumbnail_path` / `storage_path` (`GET /api/files/{path}`).
3. **Remove**: `PUT /api/products/{id}` with the URL removed from `images[]`. Deleting the orphaned file is optional.

## 5. Acceptance tests (no SMS is sent by any of these)

```bash
APP=https://yash-tryon-test.emergent.host; KEY=<ENROLLMENT_INTEGRATION_KEY>
curl -s -H "X-Integration-Key: $KEY" $APP/api/integrations/staff | head -c 300            # 200 {"users":[…]}
curl -s -X POST -H "X-Integration-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"phone":"9000000123","name":"Spec Test TC","role":"telecaller","code":"TC-99"}' $APP/api/integrations/staff   # 200 created:true
TOKEN=$(curl -s -X POST -H "X-Integration-Key: $KEY" -H "Content-Type: application/json" -d '{"issued_via":"website"}' \
  $APP/api/integrations/staff/9000000123/token | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" "$APP/api/requests?status=pending"      # 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"x"}' $APP/api/products                                                                             # 403 (telecaller)
curl -s -X POST -H "X-Integration-Key: $KEY" -H "Content-Type: application/json" -d '{}' $APP/api/integrations/staff/9000000000/token  # 404 "Staff user not found"
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "X-Integration-Key: wrong" $APP/api/integrations/staff/9000000123/token           # 401
curl -s -X PATCH -H "X-Integration-Key: $KEY" -H "Content-Type: application/json" -d '{"status":"disabled"}' $APP/api/integrations/staff/9000000123
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" "$APP/api/requests"                     # 401 (token revoked)
curl -s -X DELETE -H "X-Integration-Key: $KEY" "$APP/api/integrations/staff/9000000123?hard=true"                  # clean up
```

Also: `GET /api/health` should list the new capability, e.g. `"integration": {"enabled": true, "staff": true, "staff_token": true}` (optional but helps us show the right status).

## 6. Please reply with

1. The deployed build id and confirmation that **all** endpoints in §1–§2 are live at once.
2. Your policy when a staff phone already belongs to a customer (promote vs `409`).
3. The image upload path you want us to use (default `/api/banners/upload`) and the exact response field carrying the URL.
4. Any role-name mapping you applied (e.g. `telecaller` ⇄ `executive`).
5. Token lifetime and how revocation works.

Nothing has to change on the website when you deploy: it probes `GET /api/integrations/staff` and the token endpoint, flips from *read-only* to *connected* automatically, and **Manage Users → Sync all** pushes the current staff list to you.
