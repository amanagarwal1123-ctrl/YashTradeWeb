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


# ---------------------------------------------------------------------------
# Staff (users & roles) - contract in docs/YASH_TRADE_APP_INTEGRATION.md
# ---------------------------------------------------------------------------
STAFF_ROLES = ("admin", "telecaller", "billing_executive")
staff_users: dict = {}   # id -> user


def _find_staff(id_or_phone: str):
    if id_or_phone in staff_users:
        return staff_users[id_or_phone]
    digits = "".join(ch for ch in str(id_or_phone) if ch.isdigit())
    if len(digits) in (10, 12):
        p = norm(digits)
        for u in staff_users.values():
            if u["phone"] == p:
                return u
    return None


def _validate_staff(body: dict, partial: bool = False) -> dict:
    out = {}
    if "phone" in body or not partial:
        out["phone"] = norm(body.get("phone", ""))
    if "name" in body or not partial:
        name = str(body.get("name") or "").strip()
        if len(name) < 2:
            raise HTTPException(422, "name must be at least 2 characters")
        out["name"] = name[:100]
    if "role" in body or not partial:
        role = str(body.get("role") or "").strip()
        if role not in STAFF_ROLES:
            raise HTTPException(422, f"role must be one of {', '.join(STAFF_ROLES)}")
        out["role"] = role
    if "code" in body:
        out["code"] = (str(body.get("code") or "").strip()[:30]) or None
    if "status" in body:
        st = str(body.get("status") or "active")
        if st not in ("active", "disabled"):
            raise HTTPException(422, "status must be active or disabled")
        out["status"] = st
    return out


@app.get("/api/integrations/staff")
async def staff_list(role: str = None, status: str = None, x_integration_key: str = Header(default="")):
    auth(x_integration_key)
    users = [u for u in staff_users.values() if u["status"] != "removed"]
    if role:
        users = [u for u in users if u["role"] == role]
    if status:
        users = [u for u in users if u["status"] == status]
    return {"users": sorted(users, key=lambda u: u["created_at"])}


@app.post("/api/integrations/staff")
async def staff_upsert(request: Request, x_integration_key: str = Header(default="")):
    auth(x_integration_key)
    body = await request.json()
    data = _validate_staff(body)
    now = datetime.now(timezone.utc).isoformat()
    existing = _find_staff(data["phone"])
    if existing and existing["status"] == "removed":
        existing = None
    if existing:
        existing.update({k: v for k, v in data.items() if k != "phone"})
        existing["updated_at"] = now
        return {"created": False, "user": existing}
    if data["phone"] in customers and customers[data["phone"]].get("status") == "active":
        # the app decides whether a customer may also become staff; mock allows and flags it
        pass
    user = {"id": str(uuid.uuid4()), "phone": data["phone"], "name": data["name"], "role": data["role"],
            "code": data.get("code"), "status": data.get("status", "active"), "created_at": now, "updated_at": now,
            "last_login": None}
    staff_users[user["id"]] = user
    return {"created": True, "user": user}


@app.patch("/api/integrations/staff/{id_or_phone}")
async def staff_update(id_or_phone: str, request: Request, x_integration_key: str = Header(default="")):
    auth(x_integration_key)
    user = _find_staff(id_or_phone)
    if not user or user["status"] == "removed":
        raise HTTPException(404, "Staff user not found")
    body = await request.json()
    data = _validate_staff(body, partial=True)
    if "phone" in data and data["phone"] != user["phone"]:
        other = _find_staff(data["phone"])
        if other and other["id"] != user["id"] and other["status"] != "removed":
            raise HTTPException(409, "Another staff user already has this phone number")
    user.update(data)
    user["updated_at"] = datetime.now(timezone.utc).isoformat()
    return {"user": user}


@app.delete("/api/integrations/staff/{id_or_phone}")
async def staff_delete(id_or_phone: str, hard: bool = False, x_integration_key: str = Header(default="")):
    auth(x_integration_key)
    user = _find_staff(id_or_phone)
    if not user or user["status"] == "removed":
        raise HTTPException(404, "Staff user not found")
    if hard:
        staff_users.pop(user["id"], None)
        return {"deleted": True, "hard": True, "user": user}
    user["status"] = "disabled"
    user["updated_at"] = datetime.now(timezone.utc).isoformat()
    return {"deleted": True, "hard": False, "user": user}


# ---------------------------------------------------------------------------
# Staff console (Part 2): token on behalf + the app's own staff-scoped endpoints,
# mirrored with the real app's request/response shapes so the website can be tested
# end-to-end before the real app ships `POST /api/integrations/staff/{id_or_phone}/token`.
# ---------------------------------------------------------------------------
import secrets as _secrets
from datetime import timedelta as _td
from fastapi import UploadFile as _UploadFile, File as _File

tokens: dict = {}        # token -> {user_id, phone, role, expires_at}
products: dict = {}
requests_db: dict = {}
tele_customers: dict = {}
tele_activity: dict = {}
rates_history: list = []
rate_slabs: dict = {}
uploads: dict = {}
CATEGORIES = ["bangles", "chain", "earrings", "necklace", "payal", "pendant", "ring"]
METALS = ["gold", "silver"]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _seed_console():
    if products:
        return
    for i, (title, cat, metal, stock) in enumerate([
        ("Bhakti Payal 38", "payal", "silver", "in_stock"), ("Ghungroo Anklet", "payal", "silver", "limited"),
        ("Antique Necklace Set", "necklace", "gold", "in_stock"), ("Kids Kadaa", "bangles", "silver", "in_stock"),
    ]):
        pid = f"prod-{i+1:03d}"
        products[pid] = {"id": pid, "title": title, "description": f"{title} description", "metal_type": metal, "category": cat,
                         "subcategory": "", "images": [f"https://images.example.com/{pid}.jpg"] if i % 2 == 0 else [],
                         "storage_path": "" if i % 2 == 0 else f"yash-trade/originals/{pid}.jpg",
                         "thumbnail_path": "" if i % 2 == 0 else f"yash-trade/thumbs/{pid}.jpg",
                         "video_url": "", "approx_weight": "", "purity": "", "selling_touch": "", "selling_label": "",
                         "stock_status": stock, "tags": [metal, cat], "is_pinned": False, "is_new_arrival": True, "is_trending": False,
                         "visibility": "all", "post_type": "product", "views": 0, "is_deleted": False, "created_at": _now(), "updated_at": _now()}
    for i, (name, phone, city, lead) in enumerate([("Ramesh Kumar", "9876512345", "Pune", "new"), ("Sita Devi", "9876512346", "Jaipur", "contacted")]):
        cid = f"cust-{i+1:03d}"
        tele_customers[cid] = {"id": cid, "name": name, "phone": phone, "city": city, "shop_name": f"{name.split()[0]} Jewellers",
                               "lead_status": lead, "last_contacted_at": None, "follow_up_at": None, "assigned_to": None}
        tele_activity[cid] = []
    for i, (rtype, status, cid) in enumerate([("callback", "pending", "cust-001"), ("product_enquiry", "in_progress", "cust-002"), ("order", "completed", "cust-001")]):
        rid = f"req-{i+1:03d}"
        c = tele_customers[cid]
        requests_db[rid] = {"id": rid, "request_type": rtype, "status": status, "category": "payal", "preferred_time": "morning",
                            "notes": "Customer wants a call", "product_id": "prod-001", "product_ids": [], "customer_id": cid,
                            "customer_name": c["name"], "customer_phone": c["phone"], "city": c["city"], "assigned_to": "", "handled_by": "",
                            "created_at": _now(), "updated_at": _now(),
                            "history": [{"status": status, "by": "system", "notes": "created", "at": _now()}]}
    rates_history.append({"id": str(uuid.uuid4()), "silver_dollar_rate": 32.5, "silver_mcx_rate": 97.25, "silver_physical_rate": 98.0,
                          "silver_physical_mode": "manual", "silver_physical_premium": 0, "silver_physical_base": "mcx", "silver_movement": "stable",
                          "gold_dollar_rate": 2400.0, "gold_mcx_rate": 7420.0, "gold_physical_rate": 7500.0, "gold_physical_mode": "manual",
                          "gold_physical_premium": 0, "gold_physical_base": "mcx", "gold_movement": "stable", "market_summary": "Seed rates",
                          "updated_by": "seed", "created_at": _now(), "silver_rate": 98.0, "gold_rate": 7500.0})
    for i, (item, cat, purity) in enumerate([("Bhakti payal", "Payal", "38"), ("AODX", "Payal", "45")]):
        sid = f"slab-{i+1:03d}"
        rate_slabs[sid] = {"id": sid, "metal_type": "silver", "item_name": item, "category": cat, "subcategory": "", "purity": purity,
                           "wastage": "7", "labour_kg": "0", "order": i + 1, "created_at": _now(), "updated_at": _now()}


def reset_console():
    for d in (tokens, products, requests_db, tele_customers, tele_activity, rate_slabs, uploads):
        d.clear()
    rates_history.clear()
    _seed_console()


def _bearer(authorization: str) -> dict:
    tok = (authorization or "").replace("Bearer ", "").strip()
    t = tokens.get(tok)
    if not t:
        raise HTTPException(401, "Invalid or expired token")
    if datetime.fromisoformat(t["expires_at"]) <= datetime.now(timezone.utc):
        raise HTTPException(401, "Token expired")
    return t


def _need(t: dict, *roles):
    if t["role"] not in roles and t["role"] != "admin":
        raise HTTPException(403, f"Role {t['role']} may not do this")


@app.post("/api/integrations/staff/{id_or_phone}/token")
async def staff_token(id_or_phone: str, x_integration_key: str = Header(default="")):
    auth(x_integration_key)
    user = _find_staff(id_or_phone)
    if not user or user["status"] == "removed":
        raise HTTPException(404, "Staff user not found")
    if user["status"] != "active":
        raise HTTPException(409, "Staff user is disabled")
    tok = "mock-" + _secrets.token_urlsafe(24)
    exp = (datetime.now(timezone.utc) + _td(hours=12)).isoformat()
    tokens[tok] = {"user_id": user["id"], "phone": user["phone"], "role": user["role"], "expires_at": exp}
    user["last_login"] = _now()
    return {"token": tok, "expires_at": exp, "user": {"id": user["id"], "name": user["name"], "role": user["role"], "phone": user["phone"]}}


# --- products (public read, admin write) ---
@app.get("/api/products")
async def products_list(page: int = 1, limit: int = 24, category: str = None, metal_type: str = None, search: str = None,
                        post_type: str = None, include_hidden: bool = False, ids: str = None):
    _seed_console()
    items = [p for p in products.values() if not p["is_deleted"] and (include_hidden or p["visibility"] != "hidden")]
    if category:
        items = [p for p in items if p["category"] == category]
    if metal_type:
        items = [p for p in items if p["metal_type"] == metal_type]
    if search:
        s = search.lower()
        items = [p for p in items if s in p["title"].lower() or s in p["description"].lower() or any(s in t for t in p["tags"])]
    total = len(items)
    start = (page - 1) * limit
    return {"products": items[start:start + limit], "total": total, "page": page, "pages": max(1, -(-total // limit))}


@app.get("/api/categories")
async def categories():
    return {"categories": CATEGORIES, "metal_types": METALS}


@app.get("/api/products/{product_id}")
async def product_get(product_id: str):
    _seed_console()
    p = products.get(product_id)
    if not p or p["is_deleted"]:
        raise HTTPException(404, "Product not found")
    return p


@app.post("/api/products")
async def product_create(request: Request, authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "admin")
    body = await request.json()
    if len(str(body.get("title") or "").strip()) < 2:
        raise HTTPException(422, "title is required")
    pid = str(uuid.uuid4())
    p = {"id": pid, "title": "", "description": "", "metal_type": "silver", "category": "", "subcategory": "", "images": [], "storage_path": "",
         "thumbnail_path": "", "video_url": "", "approx_weight": "", "purity": "", "selling_touch": "", "selling_label": "",
         "stock_status": "in_stock", "tags": [], "is_pinned": False, "is_new_arrival": True, "is_trending": False, "visibility": "all",
         "post_type": "product", "views": 0, "is_deleted": False, "created_at": _now(), "updated_at": _now(), "created_by": t["user_id"]}
    p.update({k: v for k, v in body.items() if k in p and k not in ("id", "created_at")})
    products[pid] = p
    return p


@app.put("/api/products/{product_id}")
async def product_update(product_id: str, request: Request, authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "admin")
    p = products.get(product_id)
    if not p or p["is_deleted"]:
        raise HTTPException(404, "Product not found")
    body = await request.json()
    p.update({k: v for k, v in body.items() if k in p and k not in ("id", "created_at")})
    p["updated_at"] = _now()
    return p


@app.delete("/api/products/{product_id}")
async def product_delete(product_id: str, authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "admin")
    p = products.get(product_id)
    if not p or p["is_deleted"]:
        raise HTTPException(404, "Product not found")
    p["is_deleted"] = True
    return {"deleted": True, "id": product_id}


@app.post("/api/banners/upload")
async def upload_image(file: _UploadFile = _File(...), authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "admin")
    content = await file.read()
    if not content:
        raise HTTPException(422, "empty file")
    key = f"yash-trade/uploads/{uuid.uuid4().hex}.jpg"
    uploads[key] = content
    return {"url": f"/api/files/{key}", "size": len(content)}


@app.get("/api/files/{file_path:path}")
async def serve_file(file_path: str):
    from fastapi.responses import Response as _Resp
    if file_path in uploads:
        return _Resp(content=uploads[file_path], media_type="image/jpeg")
    # 1x1 transparent PNG placeholder for seeded thumbs
    import base64
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
    return _Resp(content=png, media_type="image/png")


# --- requests / telecaller ---
@app.get("/api/requests")
async def requests_list(status: str = None, request_type: str = None, city: str = None, assigned_to: str = None, handled_by: str = None,
                        authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "telecaller", "billing_executive")
    _seed_console()
    items = list(requests_db.values())
    for k, v in (("status", status), ("request_type", request_type), ("city", city), ("assigned_to", assigned_to), ("handled_by", handled_by)):
        if v:
            items = [r for r in items if str(r.get(k) or "").lower() == v.lower()]
    return {"requests": [{k: v for k, v in r.items() if k != "history"} for r in items], "total": len(items)}


@app.patch("/api/requests/{request_id}")
async def request_update(request_id: str, request: Request, authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "telecaller")
    r = requests_db.get(request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    body = await request.json()
    status = str(body.get("status") or "").strip()
    if status not in ("pending", "in_progress", "completed", "cancelled"):
        raise HTTPException(422, "status must be pending, in_progress, completed or cancelled")
    r["status"] = status
    if body.get("assigned_to"):
        r["assigned_to"] = body["assigned_to"]
    r["handled_by"] = t["user_id"]
    r["updated_at"] = _now()
    r["history"].append({"status": status, "by": t["phone"], "notes": body.get("notes") or "", "at": _now()})
    return {k: v for k, v in r.items() if k != "history"}


@app.get("/api/requests/{request_id}/history")
async def request_history(request_id: str, authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "telecaller")
    r = requests_db.get(request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    return {"history": r["history"]}


@app.get("/api/telecaller/summary")
async def tele_summary(authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "telecaller")
    _seed_console()
    by = {}
    for r in requests_db.values():
        by[r["status"]] = by.get(r["status"], 0) + 1
    today = datetime.now(timezone.utc).date().isoformat()
    return {"total_customers": len(tele_customers), "pending_requests": by.get("pending", 0), "in_progress": by.get("in_progress", 0),
            "completed_today": sum(1 for r in requests_db.values() if r["status"] == "completed" and r["updated_at"][:10] == today),
            "follow_ups_due": sum(1 for c in tele_customers.values() if c.get("follow_up_at") and c["follow_up_at"][:10] <= today),
            "by_status": by}


@app.get("/api/telecaller/customers")
async def tele_customers_list(page: int = 1, limit: int = 25, search: str = None, lead_status: str = None, authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "telecaller")
    _seed_console()
    items = list(tele_customers.values())
    if search:
        s = search.lower()
        items = [c for c in items if s in c["name"].lower() or s in c["phone"] or s in (c.get("shop_name") or "").lower()]
    if lead_status:
        items = [c for c in items if c["lead_status"] == lead_status]
    start = (page - 1) * limit
    return {"customers": items[start:start + limit], "total": len(items), "page": page, "pages": max(1, -(-len(items) // limit))}


@app.post("/api/telecaller/customers/{customer_id}/action")
async def tele_action(customer_id: str, request: Request, authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "telecaller")
    c = tele_customers.get(customer_id)
    if not c:
        raise HTTPException(404, "Customer not found")
    body = await request.json()
    action = body.get("action") or "note"
    if action not in ("note", "call", "whatsapp", "follow_up", "status_change"):
        raise HTTPException(422, "unknown action")
    entry = {"id": str(uuid.uuid4()), "action": action, "notes": body.get("notes") or "", "new_status": body.get("new_status") or "",
             "follow_up_at": body.get("follow_up_at") or "", "by": t["phone"], "at": _now()}
    if body.get("new_status"):
        c["lead_status"] = body["new_status"]
    if body.get("follow_up_at"):
        c["follow_up_at"] = body["follow_up_at"]
    if action in ("call", "whatsapp"):
        c["last_contacted_at"] = _now()
    tele_activity.setdefault(customer_id, []).insert(0, entry)
    return {"success": True, "customer": c, "activity": entry}


@app.get("/api/telecaller/customers/{customer_id}/activity")
async def tele_activity_list(customer_id: str, authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "telecaller")
    if customer_id not in tele_customers:
        raise HTTPException(404, "Customer not found")
    return {"customer": tele_customers[customer_id], "activity": tele_activity.get(customer_id, [])}


# --- rates & rate list (public read, billing write) ---
@app.get("/api/rates/latest")
async def rates_latest():
    _seed_console()
    return rates_history[-1]


@app.get("/api/rates/history")
async def rates_hist(days: int = 30):
    _seed_console()
    return {"history": list(reversed(rates_history))[:200]}


@app.post("/api/rates")
async def rates_update(request: Request, authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "billing_executive")
    _seed_console()
    body = await request.json()
    new = {**rates_history[-1], **{k: v for k, v in body.items() if k in rates_history[-1]}}
    new.update({"id": str(uuid.uuid4()), "updated_by": t["user_id"], "created_at": _now(),
                "silver_rate": new["silver_physical_rate"], "gold_rate": new["gold_physical_rate"]})
    rates_history.append(new)
    return new


@app.get("/api/rate-list")
async def rate_list(metal_type: str = None):
    _seed_console()
    slabs = sorted(rate_slabs.values(), key=lambda s: (s["order"], s["created_at"]))
    if metal_type:
        slabs = [s for s in slabs if s["metal_type"] == metal_type]
    return {"slabs": slabs}


@app.post("/api/rate-list")
async def rate_slab_create(request: Request, authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "billing_executive")
    body = await request.json()
    if not body.get("metal_type"):
        raise HTTPException(422, "metal_type required")
    sid = str(uuid.uuid4())
    slab = {"id": sid, "metal_type": body["metal_type"], "item_name": body.get("item_name") or "", "category": body.get("category") or "",
            "subcategory": body.get("subcategory") or "", "purity": str(body.get("purity") or ""), "wastage": str(body.get("wastage") or ""),
            "labour_kg": str(body.get("labour_kg") or ""), "order": int(body.get("order") or 0), "created_at": _now(), "updated_at": _now()}
    rate_slabs[sid] = slab
    return slab


@app.put("/api/rate-list/{slab_id}")
async def rate_slab_update(slab_id: str, request: Request, authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "billing_executive")
    s = rate_slabs.get(slab_id)
    if not s:
        raise HTTPException(404, "Slab not found")
    body = await request.json()
    s.update({k: v for k, v in body.items() if k in s and k not in ("id", "created_at")})
    s["updated_at"] = _now()
    return s


@app.delete("/api/rate-list/{slab_id}")
async def rate_slab_delete(slab_id: str, authorization: str = Header(default="")):
    t = _bearer(authorization); _need(t, "billing_executive")
    if slab_id not in rate_slabs:
        raise HTTPException(404, "Slab not found")
    rate_slabs.pop(slab_id)
    return {"deleted": True, "id": slab_id}
