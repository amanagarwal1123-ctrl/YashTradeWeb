"""Local stand-in for the Yash Trade App backend integration API (docs/YASH_TRADE_APP_INTEGRATION.md).

Used ONLY to test the website's client against the contract when the real app backend
build is not reachable. Run:  uvicorn tests.mock_app_backend:app --port 8099
"""
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, Header, HTTPException, Request

app = FastAPI(title="Mock Yash Trade App backend (integration only)")
KEY = "CVO6i5qVspaaYOtn9Esh-KPOHmrgtI9Z4-KYFFtSJGUxeKmR"
STAFF = {"9999813334"}
customers: dict = {}
deleted: dict = {}


def norm(phone: str) -> str:
    p = "".join(ch for ch in str(phone) if ch.isdigit())
    if len(p) == 12 and p.startswith("91"):
        p = p[2:]
    if len(p) != 10 or p[0] not in "6789":
        raise HTTPException(400, "Invalid phone")
    return p


def auth(key):
    if key != KEY:
        raise HTTPException(401, "Invalid integration key")


@app.get("/api/health")
async def health():
    return {"status": "ok", "build": "2026.09.09-integration-v6", "demo_mode": True,
            "integration": {"enabled": True, "header": "X-Integration-Key",
                            "enrollments_path": "/api/integrations/enrollments", "delete_path": "/api/integrations/customers/{phone}"}}


@app.post("/api/integrations/enrollments")
async def upsert(request: Request, x_integration_key: str = Header(default="")):
    auth(x_integration_key)
    body = await request.json()
    phone = norm(body.get("phone", ""))
    if phone in STAFF:
        raise HTTPException(409, "This number belongs to a staff account")
    now = datetime.now(timezone.utc).isoformat()
    created = phone not in customers
    cust = customers.get(phone) or {"id": str(uuid.uuid4()), "phone": phone, "created_at": now, "has_logged_in": False,
                                    "last_login": None, "status": "active", "role": "customer"}
    for k, v in body.items():
        if k in ("phone", "has_logged_in", "last_login"):
            continue
        if isinstance(v, str) and v == "":
            continue  # empty strings never overwrite
        cust[k] = v
    cust["status"] = "active"  # re-enrolling a deleted customer re-activates it
    cust["updated_at"] = now
    customers[phone] = cust
    deleted.pop(phone, None)
    return {"created": created, "customer": cust}


@app.get("/api/integrations/customers/{phone}")
async def get_customer(phone: str, x_integration_key: str = Header(default="")):
    auth(x_integration_key)
    p = norm(phone)
    if p not in customers:
        raise HTTPException(404, "Customer not found")
    return {"customer": customers[p]}


@app.delete("/api/integrations/customers/{phone}")
async def delete_customer(phone: str, x_integration_key: str = Header(default="")):
    auth(x_integration_key)
    p = norm(phone)
    if p in deleted:
        return {"already_deleted": True, "reference": deleted[p]}
    if p not in customers:
        raise HTTPException(404, "Customer not found")
    c = customers.pop(p)
    ref = f"DEL-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    deleted[p] = ref
    kept = {k: c.get(k) for k in ("name", "shop_name", "location", "phone")}
    removed = {k: v for k, v in c.items() if k not in kept}
    customers[p] = {**kept, "status": "deactivated", "id": c["id"]}
    return {"deleted": True, "reference": ref, "removed": list(removed.keys()), "kept": list(kept.keys())}
