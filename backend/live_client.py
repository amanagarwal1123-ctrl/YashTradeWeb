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

LIVE_DEMO_OTP = os.environ.get("LIVE_BACKEND_DEMO_OTP", "1234")
TIMEOUT = 25

# ---------------------------------------------------------------------------
# Server-to-server integration (see docs/YASH_TRADE_APP_INTEGRATION.md)
# Config comes from env, and can be overridden at runtime from the admin panel
# (stored in Mongo) so a deployment can be pointed at the app backend without
# touching deployment secrets. Env is the baseline; DB values win when present.
# ---------------------------------------------------------------------------
_cfg = {
    "base": (os.environ.get("LIVE_BACKEND_BASE") or "https://yash-tryon-test.emergent.host").rstrip("/"),
    "enroll_path": os.environ.get("LIVE_INTEGRATION_PATH") or "/api/integrations/enrollments",
    "customer_path": os.environ.get("LIVE_INTEGRATION_CUSTOMER_PATH") or "/api/integrations/customers/{phone}",
    "key": (os.environ.get("LIVE_INTEGRATION_KEY") or "").strip(),
    "source": "environment",
}
# Emergency-only: the old "log in as the customer with the demo OTP" method. Off by default.
ALLOW_OTP_FALLBACK = (os.environ.get("LIVE_ALLOW_OTP_FALLBACK") or "false").lower() in ("1", "true", "yes")

# Backwards-compatible aliases used elsewhere
LIVE_BASE = _cfg["base"]
LIVE_INTEGRATION_KEY = _cfg["key"]
LIVE_INTEGRATION_PATH = _cfg["enroll_path"]


def configure_integration(base: str = None, enroll_path: str = None, key: str = None, source: str = "admin"):
    """Apply runtime overrides (called at startup from the DB and when an admin saves settings)."""
    global LIVE_BASE, LIVE_INTEGRATION_KEY, LIVE_INTEGRATION_PATH
    if base:
        _cfg["base"] = base.strip().rstrip("/")
    if enroll_path:
        _cfg["enroll_path"] = enroll_path.strip() if enroll_path.strip().startswith("/") else "/" + enroll_path.strip()
    if key is not None:
        _cfg["key"] = key.strip()
    _cfg["source"] = source
    LIVE_BASE, LIVE_INTEGRATION_KEY, LIVE_INTEGRATION_PATH = _cfg["base"], _cfg["key"], _cfg["enroll_path"]


def integration_config() -> dict:
    """Non-secret view of the current integration configuration."""
    k = _cfg["key"]
    return {
        "base_url": _cfg["base"],
        "enrollments_path": _cfg["enroll_path"],
        "customer_path": _cfg["customer_path"],
        "key_configured": bool(k),
        "key_hint": f"{k[:4]}…{k[-4:]}" if len(k) >= 12 else ("set" if k else None),
        "source": _cfg["source"],
        "otp_fallback_allowed": ALLOW_OTP_FALLBACK,
    }


def _hdr() -> dict:
    return {"X-Integration-Key": _cfg["key"], "Content-Type": "application/json", "Accept": "application/json"}


def _body(r: httpx.Response):
    try:
        b = r.json()
        return b if isinstance(b, dict) else {"raw": b}
    except Exception:
        return {"raw": (r.text or "")[:300]}

# Fields the website sends and expects the shared backend to store verbatim
SYNC_FIELDS = ("name", "shop_name", "location", "city", "registration_source", "onboarding_status", "registered_at")


def sync_method() -> str:
    if _cfg["key"]:
        return "integration_key"
    return "customer_otp_login" if ALLOW_OTP_FALLBACK else "not_configured"


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
            r = await c.post(_cfg["enroll_path"], json=payload, headers=_hdr())
        return r.status_code, _body(r)
    except Exception as e:
        logger.error("live integration upsert failed: %s", e)
        return 502, {"detail": f"Live backend unreachable: {type(e).__name__}"}


async def live_integration_get(phone: str):
    """GET /api/integrations/customers/{phone}. Returns (status, body)."""
    try:
        async with await _client() as c:
            r = await c.get(_cfg["customer_path"].format(phone=phone), headers=_hdr())
        return r.status_code, _body(r)
    except Exception as e:
        logger.error("live integration get failed: %s", e)
        return 502, {"detail": f"Live backend unreachable: {type(e).__name__}"}


async def live_integration_delete(phone: str):
    """DELETE /api/integrations/customers/{phone}. Returns (status, body)."""
    try:
        async with await _client() as c:
            r = await c.delete(_cfg["customer_path"].format(phone=phone), headers=_hdr())
        return r.status_code, _body(r)
    except Exception as e:
        logger.error("live integration delete failed: %s", e)
        return 502, {"detail": f"Live backend unreachable: {type(e).__name__}"}


def _explain(code: int, body: dict, action: str) -> str:
    detail = str((body or {}).get("detail") or (body or {}).get("raw") or "")[:160]
    if code == 401 or code == 403:
        return f"App backend rejected the integration key ({code}). Check LIVE_INTEGRATION_KEY matches the app's ENROLLMENT_INTEGRATION_KEY."
    if code == 404 and ("not found" in detail.lower() and "customer" not in detail.lower() or detail.strip('"') in ("Not Found", "Route Missing", "")):
        return "Integration endpoint not found on the app backend - its build with /api/integrations/* is not deployed yet."
    if code == 404:
        return f"App backend has no record for this customer ({detail})."
    if code == 409:
        return f"App backend refused: {detail or 'this number belongs to a staff account'}."
    if code == 400 or code == 422:
        return f"App backend rejected the data: {detail}"
    if code >= 500:
        return f"App backend error {code} during {action}: {detail}"
    return f"Unexpected {code} from app backend during {action}: {detail}"


async def integration_probe() -> dict:
    """Is the app backend's integration endpoint live and does it accept our key?
    Uses a synthetic phone that can never exist, so nothing is created or changed."""
    cfg = integration_config()
    res = {"configured": cfg["key_configured"], "endpoint_live": None, "key_accepted": None, "detail": None}
    if not cfg["key_configured"]:
        res["detail"] = "LIVE_INTEGRATION_KEY is not configured on this server."
        return res
    health = await live_health()
    integ = health.get("integration") if isinstance(health.get("integration"), dict) else None
    res["app_reports_integration"] = integ
    code, body = await live_integration_get("9000000000")
    if code == 401 or code == 403:
        res.update(endpoint_live=True, key_accepted=False, detail="Endpoint is live but the app backend rejected our key.")
    elif code == 404:
        detail = str(body.get("detail") or body.get("raw") or "")
        if integ or ("customer" in detail.lower()):
            res.update(endpoint_live=True, key_accepted=True, detail="Endpoint live and key accepted.")
        else:
            res.update(endpoint_live=False, detail=f"App backend build {health.get('build')} does not expose /api/integrations/* yet (404 '{detail[:40]}').")
    elif code == 200:
        res.update(endpoint_live=True, key_accepted=True, detail="Endpoint live and key accepted.")
    elif code == 502:
        res.update(endpoint_live=None, detail=str(body.get("detail")))
    else:
        res.update(endpoint_live=True, key_accepted=None, detail=_explain(code, body, "probe"))
    return res


# ---------------------------------------------------------------------------
# Staff (app users with roles admin / telecaller / billing_executive)
# Contract: docs/YASH_TRADE_APP_INTEGRATION.md -> "Staff (users & roles)"
#   GET    {staff_path}                 list   (?role=&status=)
#   POST   {staff_path}                 upsert by phone {phone,name,role,code,status}
#   PATCH  {staff_path}/{id_or_phone}   partial update
#   DELETE {staff_path}/{id_or_phone}   soft-disable (?hard=true removes)
# ---------------------------------------------------------------------------
_cfg["staff_path"] = os.environ.get("LIVE_INTEGRATION_STAFF_PATH") or "/api/integrations/staff"
STAFF_ROLES = ("admin", "telecaller", "billing_executive")
STAFF_TIMEOUT = 12  # staff calls happen inside admin requests - keep them snappy


def staff_path() -> str:
    return _cfg["staff_path"]


async def _staff_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=_cfg["base"], timeout=STAFF_TIMEOUT)


async def _staff_call(method: str, path: str, **kw):
    if not _cfg["key"]:
        return 0, {"detail": "LIVE_INTEGRATION_KEY is not configured on this server."}
    try:
        async with await _staff_client() as c:
            r = await c.request(method, path, headers=_hdr(), **kw)
        return r.status_code, _body(r)
    except Exception as e:
        logger.error("live staff %s %s failed: %s", method, path, e)
        return 502, {"detail": f"Live backend unreachable: {type(e).__name__}"}


async def live_staff_list(role: str = None, status: str = None):
    params = {k: v for k, v in (("role", role), ("status", status)) if v}
    return await _staff_call("GET", _cfg["staff_path"], params=params)


async def live_staff_upsert(payload: dict):
    return await _staff_call("POST", _cfg["staff_path"], json=payload)


async def live_staff_update(id_or_phone: str, updates: dict):
    return await _staff_call("PATCH", f"{_cfg['staff_path']}/{id_or_phone}", json=updates)


async def live_staff_delete(id_or_phone: str, hard: bool = False):
    return await _staff_call("DELETE", f"{_cfg['staff_path']}/{id_or_phone}", params={"hard": "true"} if hard else None)


def staff_endpoint_missing(code: int, body: dict) -> bool:
    """True when the app build does not expose the staff endpoints yet (plain FastAPI 404)."""
    if code != 404:
        return False
    detail = str((body or {}).get("detail") or (body or {}).get("raw") or "").strip().strip('"')
    return detail in ("Not Found", "Route Missing", "") or "integrations/staff" in detail


async def staff_integration_probe() -> dict:
    """Is the staff endpoint deployed on the app and does it accept our key? Read-only (GET list)."""
    cfg = integration_config()
    res = {"configured": cfg["key_configured"], "endpoint_live": None, "key_accepted": None,
           "detail": None, "path": _cfg["staff_path"], "app_user_count": None}
    if not cfg["key_configured"]:
        res["detail"] = "LIVE_INTEGRATION_KEY is not configured on this server."
        return res
    code, body = await live_staff_list()
    if code == 200:
        users = body.get("users") if isinstance(body, dict) else None
        res.update(endpoint_live=True, key_accepted=True, detail="Staff endpoint live and key accepted.",
                   app_user_count=len(users) if isinstance(users, list) else None)
    elif code in (401, 403):
        res.update(endpoint_live=True, key_accepted=False, detail="Staff endpoint is live but the app backend rejected our key.")
    elif staff_endpoint_missing(code, body):
        res.update(endpoint_live=False, detail="The Yash Trade App backend has not deployed the staff endpoints (/api/integrations/staff) yet. Changes are saved here and will sync once it does.")
    elif code == 502 or code == 0:
        res.update(endpoint_live=None, detail=str(body.get("detail")))
    else:
        res.update(endpoint_live=True, key_accepted=None, detail=_explain(code, body, "staff probe"))
    return res


async def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=_cfg["base"], timeout=TIMEOUT)


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


# ---------------------------------------------------------------------------
# Act-as-staff (token on behalf) + public reads - see docs Part 2 "Staff console"
#   POST {staff_path}/{id_or_phone}/token  (X-Integration-Key)  -> {token, expires_at, user}
# ---------------------------------------------------------------------------
_cfg["upload_path"] = os.environ.get("LIVE_PRODUCT_IMAGE_UPLOAD_PATH") or "/api/banners/upload"


async def live_staff_token(id_or_phone: str):
    """Ask the app for a short-lived token for this staff member. Returns (status, body)."""
    return await _staff_call("POST", f"{_cfg['staff_path']}/{id_or_phone}/token", json={"issued_via": "website"})


async def live_public_get(path: str, params: dict = None, retries: int = 2):
    """Unauthenticated read of the app's public catalogue/rates endpoints. Returns (status, body).
    Retries once on transient transport errors (connection reset, incomplete read...)."""
    last = None
    for attempt in range(retries):
        try:
            async with await _staff_client() as c:
                r = await c.get(path, params=params)
            return r.status_code, _body(r)
        except Exception as e:
            last = e
            logger.warning("live public GET %s attempt %s failed: %r", path, attempt + 1, e)
            if attempt < retries - 1:
                await asyncio.sleep(0.4)
    return 502, {"detail": f"Live backend unreachable: {type(last).__name__}"}


async def live_as_user(method: str, path: str, token: str, params: dict = None, payload=None):
    """Request to the app as a staff member (bearer token). Returns (status, body). GETs retry once."""
    retries = 2 if method.upper() == "GET" else 1
    last = None
    for attempt in range(retries):
        try:
            async with await _staff_client() as c:
                r = await c.request(method, path, params=params, json=payload,
                                    headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
            return r.status_code, _body(r)
        except Exception as e:
            last = e
            logger.warning("live as-user %s %s attempt %s failed: %r", method, path, attempt + 1, e)
            if attempt < retries - 1:
                await asyncio.sleep(0.4)
    return 502, {"detail": f"Live backend unreachable: {type(last).__name__}"}


async def _upload_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=_cfg["base"], timeout=60)


async def live_upload_image(token: str, filename: str, content: bytes, content_type: str, field: str = "file"):
    """Multipart upload of one image to the app's object storage. Returns (status, body) - body carries the served url."""
    try:
        async with await _upload_client() as c:
            r = await c.post(_cfg["upload_path"], files={field: (filename, content, content_type)},
                             headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
        return r.status_code, _body(r)
    except Exception as e:
        logger.error("live upload failed: %s", e)
        return 502, {"detail": f"Live backend unreachable: {type(e).__name__}"}


def upload_path() -> str:
    return _cfg["upload_path"]


async def get_customer_token(phone: str, retries: int = 3) -> Optional[dict]:
    """Obtain a live-backend token for a given customer phone using the
    live backend's OTP flow (demo OTP works on the connected test host).
    Returns {token, user} or None. NOTE: this updates last_login on the live
    record, so callers must refresh the synced_last_login snapshot after use."""
    ok = await live_send_otp(phone, retries=retries)
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

    # 1) Server-to-server upsert (the production method - works regardless of the app's OTP mode)
    if _cfg["key"]:
        code, body = await live_integration_upsert({"phone": phone, **updates, "consent_terms": True, "consent_privacy": True})
        if code == 200 and isinstance(body, dict):
            cust = body.get("customer") or body
            return {
                "status": "ok", "method": "integration_key",
                "live_user_id": cust.get("id"), "snapshot": cust,
                "created": body.get("created"),
                "synced_last_login": cust.get("last_login"),
                "field_check": compare_profile(updates, cust),
            }
        return {"status": "failed", "method": "integration_key", "http_status": code,
                "error": _explain(code, body, "enrollment upsert")}

    if not ALLOW_OTP_FALLBACK:
        return {"status": "failed", "method": "not_configured",
                "error": "LIVE_INTEGRATION_KEY is not configured - set it in the deployment secrets or in Admin > Settings > Integration."}

    # 2) Emergency-only legacy path (LIVE_ALLOW_OTP_FALLBACK=true): log in as the customer with the demo OTP
    logger.warning("Using legacy customer-OTP sync for %s (LIVE_ALLOW_OTP_FALLBACK=true)", phone[-4:])
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
