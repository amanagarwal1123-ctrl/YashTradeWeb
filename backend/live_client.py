"""Client for the shared live Yash Trade App backend.
The live backend is the shared source of truth for customer records.
All interaction happens over its public REST APIs - never direct DB access.
"""
import os
import asyncio
import logging
from typing import Optional

import httpx

logger = logging.getLogger("yash.live")

LIVE_BASE = os.environ.get("LIVE_BACKEND_BASE", "https://yash-tryon-test.emergent.host").rstrip("/")
LIVE_DEMO_OTP = os.environ.get("LIVE_BACKEND_DEMO_OTP", "1234")
# Production-safe server-to-server path (see docs/YASH_TRADE_APP_INTEGRATION.md).
# When the Yash Trade App backend exposes the integration endpoint and this key is
# configured, enrollments are upserted directly - no customer OTP login is needed.
LIVE_INTEGRATION_KEY = (os.environ.get("LIVE_INTEGRATION_KEY") or "").strip()
LIVE_INTEGRATION_PATH = os.environ.get("LIVE_INTEGRATION_PATH", "/api/integrations/enrollments")
TIMEOUT = 25

# Fields the website sends and expects the shared backend to store verbatim
SYNC_FIELDS = ("name", "shop_name", "location", "city", "registration_source", "onboarding_status", "registered_at")


def sync_method() -> str:
    return "integration_key" if LIVE_INTEGRATION_KEY else "customer_otp_login"


def compare_profile(sent: dict, stored: dict) -> list:
    """Field-by-field check of what the website sent vs what the shared backend kept."""
    out = []
    stored = stored or {}
    for f in SYNC_FIELDS:
        s = sent.get(f)
        if s in (None, ""):
            continue
        v = stored.get(f)
        match = str(v or "").strip() == str(s).strip()
        if f == "registered_at" and not match and v and s:
            # The app backend stamps its own creation time; anything within 5 minutes is the same event
            try:
                from datetime import datetime as _dt
                a = _dt.fromisoformat(str(s).replace("Z", "+00:00"))
                b = _dt.fromisoformat(str(v).replace("Z", "+00:00"))
                if a.tzinfo is None or b.tzinfo is None:
                    a, b = a.replace(tzinfo=None), b.replace(tzinfo=None)
                match = abs((a - b).total_seconds()) <= 300
            except Exception:
                match = str(v)[:16] == str(s)[:16]
        out.append({"field": f, "sent": s, "stored": v if v not in (None, "") else None, "match": match})
    return out


async def live_health() -> dict:
    """Read the shared backend's own /api/health (build, demo_mode, SMS status...)."""
    try:
        async with await _client() as c:
            r = await c.get("/api/health")
        try:
            body = r.json()
        except Exception:
            body = {"raw": r.text[:300]}
        return {"reachable": r.status_code == 200, "http_status": r.status_code, **(body if isinstance(body, dict) else {"raw": body})}
    except Exception as e:
        return {"reachable": False, "error": f"{type(e).__name__}: {str(e)[:150]}"}


async def live_integration_upsert(payload: dict):
    """POST the enrollment to the shared backend's integration endpoint. Returns (status, body)."""
    try:
        async with await _client() as c:
            r = await c.post(LIVE_INTEGRATION_PATH, json=payload,
                             headers={"X-Integration-Key": LIVE_INTEGRATION_KEY, "Content-Type": "application/json"})
        try:
            body = r.json()
        except Exception:
            body = {"raw": r.text[:300]}
        return r.status_code, body
    except Exception as e:
        logger.error("live integration upsert failed: %s", e)
        return 502, {"detail": f"Live backend unreachable: {type(e).__name__}"}


async def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=LIVE_BASE, timeout=TIMEOUT)


async def live_send_otp(phone: str, retries: int = 3) -> bool:
    for attempt in range(retries):
        try:
            async with await _client() as c:
                r = await c.post("/api/auth/send-otp", json={"phone": phone})
            if r.status_code == 200:
                return True
            logger.warning("live send-otp attempt %s -> %s %s", attempt + 1, r.status_code, r.text[:120])
        except Exception as e:
            logger.error("live send-otp attempt %s failed: %s", attempt + 1, e)
        if attempt < retries - 1:
            await asyncio.sleep(1.5 * (attempt + 1))
    return False


async def live_verify_otp(phone: str, otp: str = None) -> Optional[dict]:
    """Returns {token, user} or None."""
    try:
        async with await _client() as c:
            r = await c.post("/api/auth/verify-otp", json={"phone": phone, "otp": otp or LIVE_DEMO_OTP})
        if r.status_code == 200:
            return r.json()
        logger.warning("live verify-otp %s -> %s %s", phone[-4:], r.status_code, r.text[:150])
        return None
    except Exception as e:
        logger.error("live verify-otp failed: %s", e)
        return None


async def live_update_profile(token: str, updates: dict) -> Optional[dict]:
    try:
        async with await _client() as c:
            r = await c.put("/api/auth/profile", json=updates, headers={"Authorization": f"Bearer {token}"})
        if r.status_code == 200:
            return r.json()
        logger.warning("live profile update -> %s %s", r.status_code, r.text[:150])
        return None
    except Exception as e:
        logger.error("live profile update failed: %s", e)
        return None


async def live_get_me(token: str) -> Optional[dict]:
    try:
        async with await _client() as c:
            r = await c.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        return r.json() if r.status_code == 200 else None
    except Exception as e:
        logger.error("live get me failed: %s", e)
        return None


async def live_admin_request(method: str, path: str, token: str, params: dict = None, payload=None):
    """Generic proxy request to live backend with a bearer token.
    Returns (status_code, body)."""
    try:
        async with await _client() as c:
            r = await c.request(
                method,
                path,
                params=params,
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )
        try:
            body = r.json()
        except Exception:
            body = {"raw": r.text[:500]}
        return r.status_code, body
    except Exception as e:
        logger.error("live proxy %s %s failed: %s", method, path, e)
        return 502, {"detail": "Live backend unreachable"}


async def get_customer_token(phone: str) -> Optional[dict]:
    """Obtain a live-backend token for a given customer phone using the
    live backend's OTP flow (demo OTP works on the connected test host).
    Returns {token, user} or None. NOTE: this updates last_login on the live
    record, so callers must refresh the synced_last_login snapshot after use."""
    ok = await live_send_otp(phone)
    if not ok:
        return None
    return await live_verify_otp(phone)


async def sync_enrollment_to_live(phone: str, name: str, shop_name: str, location: str, city: str, registered_at: str) -> dict:
    """Create/update the customer on the live backend with full enrollment data.
    Returns {status, method, live_user_id?, snapshot?, synced_last_login?, field_check?, error?}"""
    updates = {
        "name": name,
        "city": city or location,
        "shop_name": shop_name,
        "location": location,
        "phone_verified": True,
        "onboarding_status": "registered",
        "registration_source": "website",
        "registered_at": registered_at,
        "has_logged_in": False,
        "account_status": "active",
    }

    # 1) Preferred: server-to-server upsert (works even when the app uses real OTPs)
    if LIVE_INTEGRATION_KEY:
        code, body = await live_integration_upsert({"phone": phone, **updates, "consent_terms": True, "consent_privacy": True})
        if code == 200 and isinstance(body, dict):
            cust = body.get("customer") or body
            return {
                "status": "ok", "method": "integration_key",
                "live_user_id": cust.get("id"), "snapshot": cust,
                "synced_last_login": cust.get("last_login"),
                "field_check": compare_profile(updates, cust),
            }
        if code != 404:  # 404 = endpoint not deployed yet on the app backend -> fall back below
            return {"status": "failed", "method": "integration_key",
                    "error": f"Integration endpoint returned {code}: {str(body.get('detail') if isinstance(body, dict) else body)[:150]}"}
        logger.warning("Integration endpoint %s not available (404) - falling back to customer OTP login sync", LIVE_INTEGRATION_PATH)

    # 2) Fallback: log in as the customer (only possible while the app backend accepts the demo OTP)
    auth = await get_customer_token(phone)
    if not auth:
        return {"status": "failed", "method": "customer_otp_login",
                "error": "Could not reach live backend auth (customer OTP login rejected - is the app backend still in OTP demo mode?)"}
    token = auth["token"]
    live_user = auth["user"]
    prof = await live_update_profile(token, updates)
    me = await live_get_me(token) or prof
    if not prof:
        return {"status": "failed", "method": "customer_otp_login", "error": "Live profile update failed", "live_user_id": live_user.get("id")}
    snapshot = me or prof
    return {
        "status": "ok", "method": "customer_otp_login",
        "live_user_id": live_user.get("id"),
        "snapshot": snapshot,
        "synced_last_login": snapshot.get("last_login"),
        "field_check": compare_profile(updates, snapshot),
    }
