"""End-to-end admin login check WITHOUT sending an SMS.

Seeds an `otp_challenges` doc (purpose=admin) for a phone that is in ADMIN_PHONES, then
drives the real HTTP flow against the deployed/preview host:
  verify-otp -> Set-Cookie -> /admin/auth/me -> /admin/stats -> logout -> /me == 401

Usage:  python tests/test_admin_login_e2e.py [--base https://host] [--phone 9999813334]
"""
import argparse
import asyncio
import os
import sys
import time
import uuid
from datetime import timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

import httpx  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

import server  # noqa: E402  (uses the same SESSION_SECRET / hash_otp as the running app)


async def seed_challenge(db, phone: str, otp: str, purpose: str = "admin") -> str:
    now = server.now_utc()
    doc = {
        "id": str(uuid.uuid4()), "phone": phone, "purpose": purpose,
        "otp_hash": server.hash_otp(phone, otp), "attempts": 0, "resend_count": 0,
        "verified": False, "consumed": False, "ip": "e2e-test", "pending_data": {},
        "sms_request_id": "E2E_TEST", "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=5)).isoformat(),
        "expire_marker": now + timedelta(minutes=10),
    }
    await db.otp_challenges.insert_one(doc)
    return doc["id"]


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.environ.get("E2E_BASE", "http://localhost:8001"))
    ap.add_argument("--phone", default="9999813334")
    ap.add_argument("--origin", default="https://register.yashsilver.com", help="Origin header to simulate a custom domain")
    args = ap.parse_args()

    mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = mongo[os.environ.get("DB_NAME", "yash_ornaments")]
    otp = "4321"
    ch_id = await seed_challenge(db, args.phone, otp)
    ok_all = True
    try:
        async with httpx.AsyncClient(base_url=args.base, timeout=90, headers={"Origin": args.origin}) as c:
            # 1) wrong OTP must be rejected with a human message
            r = await c.post("/api/admin/auth/verify-otp", json={"phone": args.phone, "otp": "0000"})
            print(f"[1] wrong otp -> {r.status_code} {r.text[:90]}")
            ok_all &= r.status_code == 400 and "Invalid OTP" in r.text

            # 2) correct OTP -> cookie
            t0 = time.perf_counter()
            r = await c.post("/api/admin/auth/verify-otp", json={"phone": args.phone, "otp": otp})
            dt = time.perf_counter() - t0
            print(f"[2] verify -> {r.status_code} in {dt:.2f}s body={r.text[:120]}")
            print(f"    set-cookie: {r.headers.get('set-cookie', '')[:140]}")
            print(f"    access-control-allow-origin: {r.headers.get('access-control-allow-origin')}")
            ok_all &= r.status_code == 200 and server.SESSION_COOKIE in r.headers.get("set-cookie", "")
            if dt > 5:
                print(f"    !! verify took {dt:.1f}s - too slow for a login")
                ok_all = False

            # 3) session works
            r = await c.get("/api/admin/auth/me")
            print(f"[3] me -> {r.status_code} {r.text[:120]}")
            ok_all &= r.status_code == 200 and r.json().get("role") == "admin"

            r = await c.get("/api/admin/stats")
            print(f"[4] stats -> {r.status_code} {r.text[:100]}")
            ok_all &= r.status_code == 200

            # 4) replaying the same OTP must fail (consumed)
            r = await c.post("/api/admin/auth/verify-otp", json={"phone": args.phone, "otp": otp})
            print(f"[5] replay otp -> {r.status_code} {r.text[:90]}")
            ok_all &= r.status_code == 400

            # 5) logout kills the session
            r = await c.post("/api/admin/auth/logout")
            print(f"[6] logout -> {r.status_code}")
            r = await c.get("/api/admin/auth/me")
            print(f"[7] me after logout -> {r.status_code}")
            ok_all &= r.status_code == 401
    finally:
        await db.otp_challenges.delete_many({"id": ch_id})
        await db.otp_challenges.delete_many({"sms_request_id": "E2E_TEST"})
        await db.audit_logs.delete_many({"actor": args.phone, "action": "admin_login_failed", "details.ip": {"$in": ["e2e-test", "127.0.0.1"]}})
        mongo.close()

    print("\nRESULT:", "PASS" if ok_all else "FAIL")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    asyncio.run(main())
