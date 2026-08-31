"""Yash Ornaments - Customer Enrollment Website + Private Admin Portal backend.

Public APIs   : /api/public/*  and /api/enroll/*   (customer enrollment, OTP)
Admin APIs    : /api/admin/*   (cookie-session, role protected)
Shared truth  : live Yash Trade App backend (proxied via live_client)
"""
import os
import re
import csv
import io
import hmac
import hashlib
import secrets
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Optional
import uuid

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, field_validator

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from sms import send_otp_sms  # noqa: E402
from live_client import (  # noqa: E402
    live_admin_request, get_customer_token, sync_enrollment_to_live, live_get_me,
)

# ------------------------------------------------------------------
# Setup
# ------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s')
logger = logging.getLogger("yash.server")

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").lower()
IS_PROD = ENVIRONMENT == "production"
SESSION_SECRET = os.environ.get("SESSION_SECRET", "change-me")
ADMIN_PHONES = {p.strip() for p in os.environ.get("ADMIN_PHONES", "").split(",") if p.strip()}
TELECALLER_PHONES = {p.strip() for p in os.environ.get("TELECALLER_PHONES", "").split(",") if p.strip()}
ANDROID_APP_URL = os.environ.get("ANDROID_APP_URL", "https://play.google.com/store/apps/details?id=in.yashornaments.trade")
IOS_APP_URL = os.environ.get("IOS_APP_URL", "https://apps.apple.com/app/yash-trade/id0000000000")

IST = ZoneInfo("Asia/Kolkata")
OTP_TTL_SECONDS = 300
MAX_VERIFY_ATTEMPTS = 5
MAX_SENDS_PER_10MIN = 5
MAX_RESENDS_PER_CHALLENGE = 3
SEND_COOLDOWN_SECONDS = 30
ADMIN_SESSION_HOURS = 12
ADMIN_IDLE_MINUTES = 120
ADMIN_MAX_FAILED = 5
ADMIN_LOCKOUT_MINUTES = 15

PHONE_RE = re.compile(r"^[6-9]\d{9}$")

app = FastAPI(title="Yash Ornaments Enrollment API")
api = APIRouter(prefix="/api")


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return now_utc().isoformat()


def normalize_phone(raw: str) -> Optional[str]:
    """Normalize to a bare 10-digit Indian mobile. Returns None if invalid."""
    if not raw:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if PHONE_RE.match(digits):
        return digits
    return None


def strict_public_phone(raw: str) -> Optional[str]:
    """Strict validation for the public enrollment form: exactly 10 digits,
    no letters, spaces or country codes accepted."""
    s = (str(raw) if raw is not None else "").strip()
    if not re.fullmatch(r"[6-9]\d{9}", s):
        return None
    return s


def hash_otp(phone: str, otp: str) -> str:
    return hmac.new(SESSION_SECRET.encode(), f"{phone}:{otp}".encode(), hashlib.sha256).hexdigest()


def gen_otp() -> str:
    return f"{secrets.randbelow(9000) + 1000}"  # 1000-9999, always 4 digits


def mask_phone(phone: str) -> str:
    return f"******{phone[-4:]}" if phone and len(phone) >= 4 else "******"


def clean(doc):
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


async def audit(actor: str, action: str, target: str = "", details: dict = None, actor_role: str = "admin"):
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "actor": actor,
        "actor_role": actor_role,
        "action": action,
        "target": target,
        "details": details or {},
        "created_at": iso_now(),
    })


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return (fwd.split(",")[0].strip() if fwd else request.client.host) or "unknown"


# ------------------------------------------------------------------
# OTP challenge engine
# ------------------------------------------------------------------

async def create_otp_challenge(phone: str, purpose: str, ip: str, pending_data: dict = None) -> dict:
    now = now_utc()
    ten_min_ago = (now - timedelta(minutes=10)).isoformat()
    hour_ago = (now - timedelta(hours=1)).isoformat()

    sends_recent = await db.otp_challenges.count_documents({
        "phone": phone, "purpose": purpose, "created_at": {"$gt": ten_min_ago}})
    if sends_recent >= MAX_SENDS_PER_10MIN:
        raise HTTPException(429, "Too many OTP requests for this number. Please try again after 10 minutes.")

    ip_sends = await db.otp_challenges.count_documents({"ip": ip, "created_at": {"$gt": hour_ago}})
    if ip_sends >= 15:
        raise HTTPException(429, "Too many OTP requests. Please try again later.")

    last = await db.otp_challenges.find_one({"phone": phone, "purpose": purpose}, sort=[("created_at", -1)])
    if last:
        last_dt = datetime.fromisoformat(last["created_at"])
        if (now - last_dt).total_seconds() < SEND_COOLDOWN_SECONDS:
            raise HTTPException(429, f"Please wait {SEND_COOLDOWN_SECONDS} seconds before requesting another OTP.")

    otp = gen_otp()
    challenge = {
        "id": str(uuid.uuid4()),
        "phone": phone,
        "purpose": purpose,
        "otp_hash": hash_otp(phone, otp),
        "attempts": 0,
        "resend_count": 0,
        "verified": False,
        "consumed": False,
        "ip": ip,
        "pending_data": pending_data or {},
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(seconds=OTP_TTL_SECONDS)).isoformat(),
        "expire_marker": now + timedelta(hours=2),  # TTL cleanup
    }
    await db.otp_challenges.insert_one(challenge)

    sms = await send_otp_sms(phone, otp)
    if not IS_PROD:
        logger.info("[DEV ONLY] OTP for %s (%s): %s", mask_phone(phone), purpose, otp)
    return {"challenge_id": challenge["id"], "sms_sent": sms.get("sent", False)}


async def resend_otp_challenge(phone: str, purpose: str) -> dict:
    ch = await db.otp_challenges.find_one(
        {"phone": phone, "purpose": purpose, "consumed": False}, sort=[("created_at", -1)])
    if not ch:
        raise HTTPException(400, "No active OTP request found. Please start again.")
    if ch["resend_count"] >= MAX_RESENDS_PER_CHALLENGE:
        raise HTTPException(429, "Resend limit reached. Please start again after some time.")
    now = now_utc()
    last_send = datetime.fromisoformat(ch.get("last_resend_at") or ch["created_at"])
    if (now - last_send).total_seconds() < SEND_COOLDOWN_SECONDS:
        raise HTTPException(429, f"Please wait {SEND_COOLDOWN_SECONDS} seconds before resending.")
    otp = gen_otp()
    await db.otp_challenges.update_one({"id": ch["id"]}, {"$set": {
        "otp_hash": hash_otp(phone, otp),
        "expires_at": (now + timedelta(seconds=OTP_TTL_SECONDS)).isoformat(),
        "last_resend_at": now.isoformat(),
        "attempts": 0,
    }, "$inc": {"resend_count": 1}})
    sms = await send_otp_sms(phone, otp)
    if not IS_PROD:
        logger.info("[DEV ONLY] OTP (resend) for %s (%s): %s", mask_phone(phone), purpose, otp)
    return {"sms_sent": sms.get("sent", False), "resends_left": MAX_RESENDS_PER_CHALLENGE - ch["resend_count"] - 1}


async def verify_otp_challenge(phone: str, purpose: str, otp: str) -> dict:
    """Returns the challenge doc on success; raises HTTPException otherwise."""
    ch = await db.otp_challenges.find_one(
        {"phone": phone, "purpose": purpose, "consumed": False}, sort=[("created_at", -1)])
    if not ch:
        raise HTTPException(400, "OTP not found. Please request a new OTP.")
    if datetime.fromisoformat(ch["expires_at"]) <= now_utc():
        raise HTTPException(400, "OTP has expired. Please request a new one.")
    if ch["attempts"] >= MAX_VERIFY_ATTEMPTS:
        raise HTTPException(429, "Too many incorrect attempts. Please request a new OTP.")

    dev_bypass = (not IS_PROD) and otp == "1234"
    valid = dev_bypass or hmac.compare_digest(ch["otp_hash"], hash_otp(phone, otp))
    if not valid:
        await db.otp_challenges.update_one({"id": ch["id"]}, {"$inc": {"attempts": 1}})
        left = MAX_VERIFY_ATTEMPTS - ch["attempts"] - 1
        raise HTTPException(400, f"Invalid OTP. {max(left,0)} attempts remaining.")

    res = await db.otp_challenges.update_one(
        {"id": ch["id"], "consumed": False}, {"$set": {"verified": True, "consumed": True}})
    if res.modified_count != 1:
        raise HTTPException(400, "OTP already used. Please request a new one.")
    return ch


# ------------------------------------------------------------------
# Models
# ------------------------------------------------------------------

class EnrollStart(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str
    shop_name: str = Field(min_length=2, max_length=150)
    location: str = Field(min_length=2, max_length=150)
    consent_terms: bool
    consent_privacy: bool

    @field_validator("name", "shop_name", "location")
    @classmethod
    def strip_fields(cls, v):
        v = (v or "").strip()
        if len(v) < 2:
            raise ValueError("This field is required (minimum 2 characters)")
        return v


class PhoneOnly(BaseModel):
    phone: str


class OtpVerify(BaseModel):
    phone: str
    otp: str = Field(pattern=r"^\d{4}$")


class AdminOtpVerify(BaseModel):
    phone: str
    otp: str = Field(pattern=r"^\d{4}$")


class CustomerEdit(BaseModel):
    name: Optional[str] = None
    shop_name: Optional[str] = None
    location: Optional[str] = None
    city: Optional[str] = None


class StatusChange(BaseModel):
    account_status: str = Field(pattern=r"^(active|inactive)$")
    reason: Optional[str] = ""


class NoteAdd(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class PhoneChangeInit(BaseModel):
    new_phone: str


class PhoneChangeVerify(BaseModel):
    otp: str = Field(pattern=r"^\d{4}$")


# ------------------------------------------------------------------
# PUBLIC: config
# ------------------------------------------------------------------

@api.get("/public/config")
async def public_config():
    return {
        "environment": ENVIRONMENT,
        "dev_otp_enabled": not IS_PROD,
        "android_url": ANDROID_APP_URL,
        "ios_url": IOS_APP_URL,
        "otp_ttl_seconds": OTP_TTL_SECONDS,
        "resend_cooldown_seconds": SEND_COOLDOWN_SECONDS,
    }


# ------------------------------------------------------------------
# PUBLIC: enrollment flow
# ------------------------------------------------------------------

@api.post("/enroll/send-otp")
async def enroll_send_otp(body: EnrollStart, request: Request):
    phone = strict_public_phone(body.phone)
    if not phone:
        raise HTTPException(422, "Please enter a valid 10-digit mobile number (no spaces or country code).")
    if not body.consent_terms or not body.consent_privacy:
        raise HTTPException(422, "Please accept the Terms and Privacy Policy to continue.")

    existing = await db.enrollments.find_one({"phone": phone})
    if existing and existing.get("account_status") == "inactive":
        raise HTTPException(403, "This account has been deactivated. Please contact Yash Ornaments support.")

    pending = {
        "name": body.name,
        "shop_name": body.shop_name,
        "location": body.location,
        "consent_terms": True,
        "consent_privacy": True,
    }
    result = await create_otp_challenge(phone, "enroll", client_ip(request), pending)
    return {
        "message": f"OTP sent to {mask_phone(phone)}",
        "phone": phone,
        "expires_in": OTP_TTL_SECONDS,
        "resend_after": SEND_COOLDOWN_SECONDS,
        "sms_sent": result["sms_sent"],
    }


@api.post("/enroll/resend-otp")
async def enroll_resend_otp(body: PhoneOnly):
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(422, "Invalid phone number.")
    result = await resend_otp_challenge(phone, "enroll")
    return {"message": f"OTP resent to {mask_phone(phone)}", **result}


@api.post("/enroll/verify-otp")
async def enroll_verify_otp(body: OtpVerify):
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(422, "Invalid phone number.")

    ch = await verify_otp_challenge(phone, "enroll", body.otp)
    data = ch.get("pending_data") or {}
    now_iso = iso_now()

    existing = await db.enrollments.find_one({"phone": phone})
    if existing and existing.get("account_status") == "inactive":
        raise HTTPException(403, "This account has been deactivated. Please contact Yash Ornaments support.")

    registered_at = existing["registered_at"] if existing else now_iso
    enrollment = {
        "phone": phone,
        "name": data.get("name", ""),
        "shop_name": data.get("shop_name", ""),
        "location": data.get("location", ""),
        "city": data.get("location", ""),
        "role": "customer",
        "phone_verified": True,
        "onboarding_status": "registered",
        "account_status": "active",
        "registration_source": "website",
        "registered_at": registered_at,
        "updated_at": now_iso,
        "consent_terms": True,
        "consent_privacy": True,
    }
    if not existing:
        enrollment.update({
            "id": str(uuid.uuid4()),
            "has_logged_in": False,
            "first_login_at": None,
            "last_login_at": None,
            "created_at": now_iso,
        })
        await db.enrollments.update_one({"phone": phone}, {"$setOnInsert": enrollment}, upsert=True)
    else:
        await db.enrollments.update_one({"phone": phone}, {"$set": enrollment})

    # --- Sync to the shared live Yash Trade App backend (source of truth) ---
    sync = await sync_enrollment_to_live(
        phone=phone, name=enrollment["name"], shop_name=enrollment["shop_name"],
        location=enrollment["location"], city=enrollment["city"], registered_at=registered_at)

    sync_set = {
        "live_sync_status": sync["status"],
        "live_synced_at": iso_now(),
    }
    if sync["status"] == "ok":
        sync_set.update({
            "live_user_id": sync.get("live_user_id"),
            "live_snapshot": sync.get("snapshot"),
            "synced_last_login": sync.get("synced_last_login"),
            "live_sync_error": None,
        })
    else:
        sync_set["live_sync_error"] = sync.get("error")
        logger.error("Live sync failed for %s: %s", mask_phone(phone), sync.get("error"))
    await db.enrollments.update_one({"phone": phone}, {"$set": sync_set})

    doc = clean(await db.enrollments.find_one({"phone": phone}))
    return {
        "success": True,
        "message": "Registration complete",
        "customer": {
            "name": doc["name"],
            "phone": doc["phone"],
            "shop_name": doc["shop_name"],
            "location": doc["location"],
        },
        "download": {"android_url": ANDROID_APP_URL, "ios_url": IOS_APP_URL},
    }


# ------------------------------------------------------------------
# ADMIN: auth
# ------------------------------------------------------------------

SESSION_COOKIE = "yash_admin_session"


async def check_admin_lockout(phone: str, ip: str):
    cutoff = (now_utc() - timedelta(minutes=ADMIN_LOCKOUT_MINUTES)).isoformat()
    fails = await db.audit_logs.count_documents({
        "action": "admin_login_failed",
        "$or": [{"actor": phone}, {"details.ip": ip}],
        "created_at": {"$gt": cutoff},
    })
    if fails >= ADMIN_MAX_FAILED:
        raise HTTPException(429, "Too many failed attempts. Please try again in 15 minutes.")


@api.post("/admin/auth/send-otp")
async def admin_send_otp(body: PhoneOnly, request: Request):
    ip = client_ip(request)
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(422, "Please enter a valid 10-digit mobile number.")
    await check_admin_lockout(phone, ip)

    if phone not in ADMIN_PHONES and phone not in TELECALLER_PHONES:
        await audit(phone, "admin_login_failed", details={"ip": ip, "reason": "unauthorized_phone"}, actor_role="unknown")
        raise HTTPException(403, "This number is not authorized for the admin portal.")

    result = await create_otp_challenge(phone, "admin", ip)
    return {"message": f"OTP sent to {mask_phone(phone)}", "expires_in": OTP_TTL_SECONDS, "sms_sent": result["sms_sent"]}


@api.post("/admin/auth/verify-otp")
async def admin_verify_otp(body: AdminOtpVerify, request: Request, response: Response):
    ip = client_ip(request)
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(422, "Invalid phone number.")
    await check_admin_lockout(phone, ip)

    try:
        await verify_otp_challenge(phone, "admin", body.otp)
    except HTTPException as e:
        if e.status_code == 400:
            await audit(phone, "admin_login_failed", details={"ip": ip, "reason": "bad_otp"}, actor_role="unknown")
        raise

    role = "admin" if phone in ADMIN_PHONES else "telecaller"

    # Attempt to unlock live-backend admin capabilities for this session
    live_token, live_role = None, None
    if role == "admin":
        auth = await get_customer_token(phone)
        if auth:
            live_token = auth["token"]
            live_role = (auth.get("user") or {}).get("role")

    now = now_utc()
    token = secrets.token_urlsafe(32)
    await db.admin_sessions.insert_one({
        "token": token,
        "phone": phone,
        "role": role,
        "live_token": live_token,
        "live_role": live_role,
        "created_at": now.isoformat(),
        "last_active": now.isoformat(),
        "expires_at": (now + timedelta(hours=ADMIN_SESSION_HOURS)).isoformat(),
        "expire_marker": now + timedelta(hours=ADMIN_SESSION_HOURS),
        "ip": ip,
    })
    await audit(phone, "admin_login_success", details={"ip": ip, "role": role}, actor_role=role)

    response.set_cookie(
        SESSION_COOKIE, token,
        max_age=ADMIN_SESSION_HOURS * 3600,
        httponly=True, secure=True, samesite="lax", path="/",
    )
    return {"success": True, "role": role, "phone": phone,
            "live_admin_unlocked": live_role == "admin"}


async def get_session(request: Request) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, "Not authenticated")
    sess = await db.admin_sessions.find_one({"token": token})
    if not sess:
        raise HTTPException(401, "Session expired. Please log in again.")
    now = now_utc()
    if datetime.fromisoformat(sess["expires_at"]) <= now:
        await db.admin_sessions.delete_one({"token": token})
        raise HTTPException(401, "Session expired. Please log in again.")
    idle = now - datetime.fromisoformat(sess["last_active"])
    if idle > timedelta(minutes=ADMIN_IDLE_MINUTES):
        await db.admin_sessions.delete_one({"token": token})
        raise HTTPException(401, "Session timed out due to inactivity.")
    await db.admin_sessions.update_one({"token": token}, {"$set": {"last_active": now.isoformat()}})
    return sess


async def require_admin(request: Request) -> dict:
    sess = await get_session(request)
    if sess.get("role") != "admin":
        raise HTTPException(403, "Forbidden: admin role required.")
    return sess


@api.post("/admin/auth/logout")
async def admin_logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        sess = await db.admin_sessions.find_one({"token": token})
        if sess:
            await audit(sess["phone"], "admin_logout", actor_role=sess.get("role", "admin"))
        await db.admin_sessions.delete_one({"token": token})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"success": True}


@api.get("/admin/auth/me")
async def admin_me(sess: dict = Depends(get_session)):
    return {
        "phone": sess["phone"],
        "role": sess["role"],
        "live_admin_unlocked": sess.get("live_role") == "admin",
        "expires_at": sess["expires_at"],
    }


# ------------------------------------------------------------------
# ADMIN: dashboard stats
# ------------------------------------------------------------------

@api.get("/admin/stats")
async def admin_stats(sess: dict = Depends(require_admin)):
    now_ist = datetime.now(IST)
    today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
    week_start = (now_ist - timedelta(days=7)).astimezone(timezone.utc).isoformat()
    month_start = now_ist.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()

    total = await db.enrollments.count_documents({})
    today = await db.enrollments.count_documents({"registered_at": {"$gte": today_start}})
    week = await db.enrollments.count_documents({"registered_at": {"$gte": week_start}})
    month = await db.enrollments.count_documents({"registered_at": {"$gte": month_start}})
    completed = await db.enrollments.count_documents({"phone_verified": True})
    logged_in = await db.enrollments.count_documents({"has_logged_in": True})
    never_logged = await db.enrollments.count_documents({"has_logged_in": {"$ne": True}})
    active = await db.enrollments.count_documents({"account_status": "active"})
    inactive = await db.enrollments.count_documents({"account_status": "inactive"})
    sync_failed = await db.enrollments.count_documents({"live_sync_status": {"$ne": "ok"}})

    # 30-day registration trend (IST days)
    thirty_days_ago = (now_ist - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
    trend_map = {}
    cursor = db.enrollments.find({"registered_at": {"$gte": thirty_days_ago.astimezone(timezone.utc).isoformat()}}, {"registered_at": 1})
    async for docu in cursor:
        try:
            d = datetime.fromisoformat(docu["registered_at"]).astimezone(IST).strftime("%Y-%m-%d")
            trend_map[d] = trend_map.get(d, 0) + 1
        except Exception:
            continue
    trend = []
    for i in range(30):
        day = (thirty_days_ago + timedelta(days=i)).strftime("%Y-%m-%d")
        trend.append({"date": day, "count": trend_map.get(day, 0)})

    recent_regs = [clean(d) async for d in db.enrollments.find({}, sort=[("registered_at", -1)], limit=8)]
    recent_logins = [clean(d) async for d in db.enrollments.find(
        {"has_logged_in": True, "last_login_at": {"$ne": None}}, sort=[("last_login_at", -1)], limit=8)]

    return {
        "totals": {
            "total_customers": total,
            "registrations_today": today,
            "registrations_week": week,
            "registrations_month": month,
            "completed_enrollment": completed,
            "logged_in": logged_in,
            "never_logged_in": never_logged,
            "active": active,
            "inactive": inactive,
            "sync_failed": sync_failed,
        },
        "trend": trend,
        "recent_registrations": recent_regs,
        "recent_logins": recent_logins,
        "live_admin_unlocked": sess.get("live_role") == "admin",
    }


# ------------------------------------------------------------------
# ADMIN: customers list / export / detail / actions
# ------------------------------------------------------------------

def build_customer_query(q, login_status, account_status, location, shop_name, reg_from, reg_to, login_from, login_to, sync_status=None):
    query = {}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": rx}, {"phone": rx}, {"shop_name": rx}, {"location": rx}]
    if login_status == "logged_in":
        query["has_logged_in"] = True
    elif login_status == "never":
        query["has_logged_in"] = {"$ne": True}
    if account_status in ("active", "inactive"):
        query["account_status"] = account_status
    if location:
        query["location"] = {"$regex": re.escape(location), "$options": "i"}
    if shop_name:
        query["shop_name"] = {"$regex": re.escape(shop_name), "$options": "i"}
    if reg_from or reg_to:
        rng = {}
        if reg_from:
            rng["$gte"] = f"{reg_from}T00:00:00+00:00"
        if reg_to:
            rng["$lte"] = f"{reg_to}T23:59:59+00:00"
        query["registered_at"] = rng
    if login_from or login_to:
        rng = {}
        if login_from:
            rng["$gte"] = f"{login_from}T00:00:00+00:00"
        if login_to:
            rng["$lte"] = f"{login_to}T23:59:59+00:00"
        query["last_login_at"] = rng
    if sync_status:
        query["live_sync_status"] = sync_status
    return query


@api.get("/admin/customers")
async def admin_customers(
    sess: dict = Depends(require_admin),
    q: Optional[str] = None,
    login_status: Optional[str] = Query(None, pattern="^(logged_in|never)$"),
    account_status: Optional[str] = Query(None, pattern="^(active|inactive)$"),
    location: Optional[str] = None,
    shop_name: Optional[str] = None,
    reg_from: Optional[str] = None,
    reg_to: Optional[str] = None,
    login_from: Optional[str] = None,
    login_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=100),
):
    query = build_customer_query(q, login_status, account_status, location, shop_name, reg_from, reg_to, login_from, login_to)
    total = await db.enrollments.count_documents(query)
    skip = (page - 1) * page_size
    items = [clean(d) async for d in db.enrollments.find(query, sort=[("registered_at", -1)], skip=skip, limit=page_size)]
    for i, item in enumerate(items):
        item["serial"] = skip + i + 1
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "pages": max(1, -(-total // page_size))}


@api.get("/admin/customers/export")
async def admin_customers_export(
    sess: dict = Depends(require_admin),
    q: Optional[str] = None,
    login_status: Optional[str] = None,
    account_status: Optional[str] = None,
    location: Optional[str] = None,
    shop_name: Optional[str] = None,
    reg_from: Optional[str] = None,
    reg_to: Optional[str] = None,
    login_from: Optional[str] = None,
    login_to: Optional[str] = None,
):
    query = build_customer_query(q, login_status, account_status, location, shop_name, reg_from, reg_to, login_from, login_to)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["S.No", "Name", "Phone", "Shop Name", "Location", "Enrollment Status",
                     "Login Status", "Account Status", "Registered At", "First Login", "Last Login", "Live Sync"])
    i = 0
    async for d in db.enrollments.find(query, sort=[("registered_at", -1)]):
        i += 1
        writer.writerow([
            i, d.get("name", ""), d.get("phone", ""), d.get("shop_name", ""), d.get("location", ""),
            d.get("onboarding_status", ""),
            "Logged in" if d.get("has_logged_in") else "Never logged in",
            d.get("account_status", ""),
            d.get("registered_at", ""), d.get("first_login_at") or "", d.get("last_login_at") or "",
            d.get("live_sync_status", ""),
        ])
    await audit(sess["phone"], "csv_export", details={"filters": {k: v for k, v in {
        "q": q, "login_status": login_status, "account_status": account_status, "location": location,
        "shop_name": shop_name, "reg_from": reg_from, "reg_to": reg_to}.items() if v}, "rows": i})
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=yash-customers-{datetime.now(IST).strftime('%Y%m%d-%H%M')}.csv"})


async def build_timeline(customer: dict) -> list:
    events = []
    if customer.get("registered_at"):
        events.append({"type": "registered", "at": customer["registered_at"],
                       "title": "Enrolled via website", "detail": f"Shop: {customer.get('shop_name','')}, Location: {customer.get('location','')}"})
    if customer.get("live_synced_at"):
        ok = customer.get("live_sync_status") == "ok"
        events.append({"type": "sync", "at": customer["live_synced_at"],
                       "title": "Synced to Yash Trade App backend" if ok else "Live backend sync failed",
                       "detail": customer.get("live_sync_error") or "Profile pushed to shared backend"})
    if customer.get("first_login_at"):
        events.append({"type": "login", "at": customer["first_login_at"], "title": "First app login", "detail": ""})
    if customer.get("last_login_at") and customer.get("last_login_at") != customer.get("first_login_at"):
        events.append({"type": "login", "at": customer["last_login_at"], "title": "Most recent app login", "detail": ""})
    async for log in db.audit_logs.find({"target": customer.get("id", "")}, sort=[("created_at", -1)], limit=50):
        events.append({"type": "admin", "at": log["created_at"],
                       "title": log["action"].replace("_", " ").title(),
                       "detail": f"By {mask_phone(log.get('actor',''))}" + (f" - {log['details'].get('reason')}" if log.get("details", {}).get("reason") else "")})
    events.sort(key=lambda e: e["at"], reverse=True)
    return events


async def reconcile_live_login(customer: dict, live_user: dict):
    """Detect real app logins by comparing live last_login against our synced snapshot."""
    if not live_user:
        return customer
    live_last = live_user.get("last_login")
    synced_last = customer.get("synced_last_login")
    updates = {"live_snapshot": live_user}
    if live_last and live_last != synced_last:
        updates["has_logged_in"] = True
        updates["last_login_at"] = live_last
        if not customer.get("first_login_at"):
            updates["first_login_at"] = live_last
    await db.enrollments.update_one({"id": customer["id"]}, {"$set": updates})
    return clean(await db.enrollments.find_one({"id": customer["id"]}))


@api.get("/admin/customers/{customer_id}")
async def admin_customer_detail(customer_id: str, sess: dict = Depends(require_admin)):
    customer = clean(await db.enrollments.find_one({"id": customer_id}))
    if not customer:
        raise HTTPException(404, "Customer not found")

    # Refresh live data if live admin proxy is unlocked
    live_activity = None
    if sess.get("live_role") == "admin" and customer.get("live_user_id"):
        code, body = await live_admin_request("GET", f"/api/customers/{customer['live_user_id']}", sess["live_token"])
        if code == 200:
            customer = await reconcile_live_login(customer, body if isinstance(body, dict) else None)
            live_activity = body

    notes = [clean(n) async for n in db.admin_notes.find({"customer_id": customer_id}, sort=[("created_at", -1)])]
    timeline = await build_timeline(customer)
    return {"customer": customer, "notes": notes, "timeline": timeline, "live_profile": customer.get("live_snapshot"),
            "live_activity": live_activity, "live_admin_unlocked": sess.get("live_role") == "admin"}


@api.patch("/admin/customers/{customer_id}")
async def admin_customer_edit(customer_id: str, body: CustomerEdit, sess: dict = Depends(require_admin)):
    customer = await db.enrollments.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(404, "Customer not found")
    updates = {k: v.strip() for k, v in body.model_dump(exclude_none=True).items() if isinstance(v, str) and v.strip()}
    if not updates:
        raise HTTPException(422, "No valid fields to update.")
    updates["updated_at"] = iso_now()
    await db.enrollments.update_one({"id": customer_id}, {"$set": updates})
    await audit(sess["phone"], "customer_edited", target=customer_id,
                details={"fields": list(updates.keys()), "before": {k: customer.get(k) for k in updates}, "after": updates})

    # Push to live backend (source of truth)
    push = {k: v for k, v in updates.items() if k in ("name", "shop_name", "location", "city")}
    if push:
        auth = await get_customer_token(customer["phone"])
        if auth:
            from live_client import live_update_profile
            await live_update_profile(auth["token"], push)
            me = await live_get_me(auth["token"])
            if me:
                await db.enrollments.update_one({"id": customer_id}, {"$set": {
                    "live_snapshot": me, "synced_last_login": me.get("last_login"), "live_sync_status": "ok", "live_synced_at": iso_now()}})
    return {"success": True, "customer": clean(await db.enrollments.find_one({"id": customer_id}))}


@api.post("/admin/customers/{customer_id}/status")
async def admin_customer_status(customer_id: str, body: StatusChange, sess: dict = Depends(require_admin)):
    customer = await db.enrollments.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(404, "Customer not found")
    await db.enrollments.update_one({"id": customer_id}, {"$set": {
        "account_status": body.account_status, "updated_at": iso_now()}})
    await audit(sess["phone"], f"customer_{'deactivated' if body.account_status == 'inactive' else 'activated'}",
                target=customer_id, details={"reason": body.reason or ""})
    # Push status to live backend if admin proxy unlocked
    if sess.get("live_role") == "admin" and customer.get("live_user_id"):
        await live_admin_request("PATCH", f"/api/customers/{customer['live_user_id']}", sess["live_token"],
                                 payload={"status": body.account_status})
    return {"success": True, "account_status": body.account_status}


@api.post("/admin/customers/{customer_id}/notes")
async def admin_add_note(customer_id: str, body: NoteAdd, sess: dict = Depends(require_admin)):
    customer = await db.enrollments.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(404, "Customer not found")
    note = {
        "id": str(uuid.uuid4()), "customer_id": customer_id, "note": body.note.strip(),
        "author": sess["phone"], "created_at": iso_now(),
    }
    await db.admin_notes.insert_one(dict(note))
    await audit(sess["phone"], "note_added", target=customer_id, details={"note_id": note["id"]})
    return {"success": True, "note": note}


@api.post("/admin/customers/{customer_id}/retry-sync")
async def admin_retry_sync(customer_id: str, sess: dict = Depends(require_admin)):
    customer = clean(await db.enrollments.find_one({"id": customer_id}))
    if not customer:
        raise HTTPException(404, "Customer not found")
    sync = await sync_enrollment_to_live(
        phone=customer["phone"], name=customer["name"], shop_name=customer["shop_name"],
        location=customer["location"], city=customer.get("city", ""), registered_at=customer["registered_at"])
    sync_set = {"live_sync_status": sync["status"], "live_synced_at": iso_now()}
    if sync["status"] == "ok":
        sync_set.update({"live_user_id": sync.get("live_user_id"), "live_snapshot": sync.get("snapshot"),
                         "synced_last_login": sync.get("synced_last_login"), "live_sync_error": None})
    else:
        sync_set["live_sync_error"] = sync.get("error")
    await db.enrollments.update_one({"id": customer_id}, {"$set": sync_set})
    await audit(sess["phone"], "sync_retried", target=customer_id, details={"result": sync["status"]})
    return {"success": sync["status"] == "ok", "status": sync["status"], "error": sync.get("error")}


# --- Protected phone change (OTP re-verification to the NEW number) ---

@api.post("/admin/customers/{customer_id}/phone-change/init")
async def admin_phone_change_init(customer_id: str, body: PhoneChangeInit, request: Request, sess: dict = Depends(require_admin)):
    customer = await db.enrollments.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(404, "Customer not found")
    new_phone = normalize_phone(body.new_phone)
    if not new_phone:
        raise HTTPException(422, "Please enter a valid 10-digit mobile number.")
    if new_phone == customer["phone"]:
        raise HTTPException(422, "New number is the same as the current number.")
    dup = await db.enrollments.find_one({"phone": new_phone})
    if dup:
        raise HTTPException(409, "Another customer is already registered with this number.")
    await create_otp_challenge(new_phone, f"phone_change:{customer_id}", client_ip(request))
    await audit(sess["phone"], "phone_change_initiated", target=customer_id, details={"new_phone_masked": mask_phone(new_phone)})
    return {"message": f"Verification OTP sent to {mask_phone(new_phone)}", "expires_in": OTP_TTL_SECONDS}


@api.post("/admin/customers/{customer_id}/phone-change/verify")
async def admin_phone_change_verify(customer_id: str, body: PhoneChangeVerify, sess: dict = Depends(require_admin)):
    customer = await db.enrollments.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(404, "Customer not found")
    ch = await db.otp_challenges.find_one(
        {"purpose": f"phone_change:{customer_id}", "consumed": False}, sort=[("created_at", -1)])
    if not ch:
        raise HTTPException(400, "No pending phone change. Please start again.")
    new_phone = ch["phone"]
    await verify_otp_challenge(new_phone, f"phone_change:{customer_id}", body.otp)
    old_phone = customer["phone"]
    await db.enrollments.update_one({"id": customer_id}, {"$set": {
        "phone": new_phone, "updated_at": iso_now(),
        "live_sync_status": "pending",
        "live_sync_error": "Phone changed on website; a fresh app profile will be linked on next sync.",
    }})
    await audit(sess["phone"], "phone_changed", target=customer_id,
                details={"old": mask_phone(old_phone), "new": mask_phone(new_phone)})
    # Re-sync under the new phone so the shared backend has the record
    customer = clean(await db.enrollments.find_one({"id": customer_id}))
    sync = await sync_enrollment_to_live(
        phone=new_phone, name=customer["name"], shop_name=customer["shop_name"],
        location=customer["location"], city=customer.get("city", ""), registered_at=customer["registered_at"])
    if sync["status"] == "ok":
        await db.enrollments.update_one({"id": customer_id}, {"$set": {
            "live_sync_status": "ok", "live_user_id": sync.get("live_user_id"),
            "live_snapshot": sync.get("snapshot"), "synced_last_login": sync.get("synced_last_login"),
            "live_sync_error": None, "live_synced_at": iso_now()}})
    return {"success": True, "phone": new_phone}


# ------------------------------------------------------------------
# ADMIN: audit logs / reports
# ------------------------------------------------------------------

@api.get("/admin/audit-logs")
async def admin_audit_logs(sess: dict = Depends(require_admin), page: int = Query(1, ge=1), page_size: int = Query(25, ge=5, le=100)):
    total = await db.audit_logs.count_documents({})
    skip = (page - 1) * page_size
    items = [clean(d) async for d in db.audit_logs.find({}, sort=[("created_at", -1)], skip=skip, limit=page_size)]
    return {"items": items, "total": total, "page": page, "pages": max(1, -(-total // page_size))}


# ------------------------------------------------------------------
# ADMIN: live backend module proxy (read + write, whitelisted)
# Excludes removed workflows: Live Bhav (live-rates) and AI Try-On (ai/*)
# ------------------------------------------------------------------

LIVE_PROXY_PREFIXES = (
    "products", "categories", "batches", "requests", "executives", "rates",
    "stories", "schemes", "brands", "showroom", "exhibitions", "knowledge",
    "analytics", "customers", "rewards", "about", "rate-list", "cart/orders",
)


@api.get("/admin/live/status")
async def admin_live_status(sess: dict = Depends(require_admin)):
    return {
        "live_admin_unlocked": sess.get("live_role") == "admin",
        "live_role": sess.get("live_role"),
        "live_backend": os.environ.get("LIVE_BACKEND_BASE"),
        "note": None if sess.get("live_role") == "admin" else
        "Your phone is connected to the live Yash Trade App backend but does not yet have the admin role there. "
        "Ask the Yash Trade App team to grant role 'admin' to your phone, then log in again to unlock these modules.",
    }


@api.api_route("/admin/live/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def admin_live_proxy(path: str, request: Request, sess: dict = Depends(require_admin)):
    if not any(path == p or path.startswith(p.rstrip('/') + "/") or path.startswith(p) for p in LIVE_PROXY_PREFIXES):
        raise HTTPException(403, "This live module is not enabled.")
    if not sess.get("live_token"):
        raise HTTPException(503, "No live backend session. Please log in again.")
    payload = None
    if request.method in ("POST", "PUT", "PATCH"):
        try:
            payload = await request.json()
        except Exception:
            payload = None
    code, body = await live_admin_request(request.method, f"/api/{path}", sess["live_token"],
                                          params=dict(request.query_params), payload=payload)
    if request.method != "GET":
        await audit(sess["phone"], "live_module_write", target=path, details={"method": request.method, "status": code})
    if code >= 400:
        raise HTTPException(code if code in (400, 401, 403, 404, 422, 429) else 502,
                            body.get("detail", "Live backend error") if isinstance(body, dict) else "Live backend error")
    return body


# ------------------------------------------------------------------
# App wiring
# ------------------------------------------------------------------

app.include_router(api)

cors_origins = os.environ.get("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins.split(",")] if cors_origins != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.enrollments.create_index("phone", unique=True)
    await db.enrollments.create_index("registered_at")
    await db.enrollments.create_index("account_status")
    await db.enrollments.create_index("has_logged_in")
    await db.enrollments.create_index("role")
    await db.otp_challenges.create_index("expire_marker", expireAfterSeconds=0)
    await db.otp_challenges.create_index([("phone", 1), ("purpose", 1), ("created_at", -1)])
    await db.admin_sessions.create_index("expire_marker", expireAfterSeconds=0)
    await db.admin_sessions.create_index("token", unique=True)
    await db.audit_logs.create_index([("created_at", -1)])
    await db.audit_logs.create_index("target")
    await db.admin_notes.create_index("customer_id")
    logger.info("Yash Ornaments enrollment backend ready (env=%s)", ENVIRONMENT)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
