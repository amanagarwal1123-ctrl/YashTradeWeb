# Yash Trade App backend ↔ Enrollment website — integration spec

> **Status 2026-09-10: IMPLEMENTED on both sides and verified against production.**
> App backend build `2026.09.09-integration-v7` at `https://yash-tryon-test.emergent.host`
> (integration enabled, demo mode OFF). Website build `2026.09.10-integration-v7`.
> Verified: upsert → all 7 fields match; GET used by "Verify on app backend";
> DELETE completes `/delete-account` requests automatically (app keeps name, shop_name,
> location, phone as a de-activated record). The customer-OTP fallback is disabled
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
