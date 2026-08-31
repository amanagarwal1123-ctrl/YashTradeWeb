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
TIMEOUT = 25


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
    Returns {status, live_user_id?, snapshot?, synced_last_login?, error?}"""
    auth = await get_customer_token(phone)
    if not auth:
        return {"status": "failed", "error": "Could not reach live backend auth"}
    token = auth["token"]
    live_user = auth["user"]
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
    prof = await live_update_profile(token, updates)
    me = await live_get_me(token) or prof
    if not prof:
        return {"status": "failed", "error": "Live profile update failed", "live_user_id": live_user.get("id")}
    snapshot = me or prof
    return {
        "status": "ok",
        "live_user_id": live_user.get("id"),
        "snapshot": snapshot,
        "synced_last_login": snapshot.get("last_login"),
    }
