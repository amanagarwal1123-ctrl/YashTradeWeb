"""Aggressive load test for the Yash Ornaments enrollment backend.

Safe: never hits an endpoint that sends SMS (only validation-failing OTP requests).

Usage:
  python tests/load_test.py --base https://yash-scheme-hub.preview.emergentagent.com \
      --requests 3000 --concurrency 100 [--cookie yash_admin_session=TOKEN] [--out report.json]
"""
import argparse
import asyncio
import json
import random
import statistics
import time

import httpx

SCENARIOS = [
    # name, weight, method, path, json body, expected statuses
    ("health", 2, "GET", "/api/health", None, {200}),
    ("public_config", 3, "GET", "/api/public/config", None, {200}),
    ("frontend_index", 1, "GET", "/", None, {200}),
    ("enroll_send_otp_invalid_phone", 3, "POST", "/api/enroll/send-otp",
     {"name": "Load Test", "phone": "12345", "shop_name": "LT", "location": "LT", "consent_terms": True, "consent_privacy": True}, {422}),
    ("enroll_send_otp_no_consent", 2, "POST", "/api/enroll/send-otp",
     {"name": "Load Test", "phone": "9000000001", "shop_name": "LT", "location": "LT", "consent_terms": False, "consent_privacy": False}, {422}),
    ("enroll_verify_no_challenge", 2, "POST", "/api/enroll/verify-otp", {"phone": "9000000001", "otp": "1111"}, {400}),
    ("admin_send_otp_unauthorized", 2, "POST", "/api/admin/auth/send-otp", {"phone": "9000000002"}, {403, 429}),
    ("admin_me_unauth", 1, "GET", "/api/admin/auth/me", None, {401}),
    ("delete_send_otp_invalid", 1, "POST", "/api/account/delete/send-otp", {"phone": "12345"}, {422}),
]
ADMIN_SCENARIOS = [
    ("admin_stats", 2, "GET", "/api/admin/stats", None, {200}),
    ("admin_customers", 2, "GET", "/api/admin/customers?page_size=25", None, {200}),
    ("admin_sms_logs", 1, "GET", "/api/admin/sms/logs?page_size=25", None, {200}),
    ("admin_deletion_requests", 1, "GET", "/api/admin/deletion-requests", None, {200}),
    ("admin_audit", 1, "GET", "/api/admin/audit-logs?page_size=25", None, {200}),
]


def pct(values, p):
    if not values:
        return 0.0
    values = sorted(values)
    k = (len(values) - 1) * p / 100
    f, c = int(k), min(int(k) + 1, len(values) - 1)
    return values[f] + (values[c] - values[f]) * (k - f)


async def worker(client, queue, results, base, headers):
    while True:
        try:
            name, method, path, body, expected = queue.get_nowait()
        except asyncio.QueueEmpty:
            return
        t0 = time.perf_counter()
        try:
            hdrs = headers if name.startswith("admin_") and name != "admin_send_otp_unauthorized" and name != "admin_me_unauth" else {}
            r = await client.request(method, base + path, json=body, headers=hdrs, timeout=60)
            dt = (time.perf_counter() - t0) * 1000
            ok = r.status_code in expected
            snippet = None
            if not ok:
                ctype = r.headers.get("content-type", "")
                snippet = f"[{ctype[:30]}] server={r.headers.get('server','?')} body={r.text[:120]!r}"
            results.append((name, dt, r.status_code, ok, snippet))
        except Exception as e:
            dt = (time.perf_counter() - t0) * 1000
            results.append((name, dt, 0, False, f"{type(e).__name__}: {str(e)[:80]}"))


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--requests", type=int, default=2000)
    ap.add_argument("--concurrency", type=int, default=50)
    ap.add_argument("--cookie", default="")
    ap.add_argument("--out", default="")
    ap.add_argument("--only-read", action="store_true", help="only GET health/config/index (for production)")
    ap.add_argument("--skip-index", action="store_true", help="skip the frontend index scenario (direct backend runs)")
    args = ap.parse_args()

    scenarios = SCENARIOS if not args.only_read else [s for s in SCENARIOS if s[2] == "GET" and s[0] != "admin_me_unauth"]
    if args.skip_index:
        scenarios = [s for s in scenarios if s[0] != "frontend_index"]
    scenarios += (ADMIN_SCENARIOS if args.cookie else [])
    weighted = []
    for name, w, m, p, b, exp in scenarios:
        weighted += [(name, m, p, b, exp)] * w
    queue = asyncio.Queue()
    rnd = random.Random(42)
    for _ in range(args.requests):
        queue.put_nowait(rnd.choice(weighted))

    headers = {"Cookie": args.cookie} if args.cookie else {}
    results = []
    limits = httpx.Limits(max_connections=args.concurrency, max_keepalive_connections=args.concurrency)
    t0 = time.perf_counter()
    async with httpx.AsyncClient(limits=limits, http2=False) as client:
        await asyncio.gather(*[worker(client, queue, results, args.base.rstrip("/"), headers) for _ in range(args.concurrency)])
    wall = time.perf_counter() - t0

    lat = [r[1] for r in results]
    failures = [r for r in results if not r[3]]
    by = {}
    for name, dt, code, ok, err in results:
        d = by.setdefault(name, {"n": 0, "fail": 0, "lat": [], "codes": {}})
        d["n"] += 1
        d["fail"] += 0 if ok else 1
        d["lat"].append(dt)
        d["codes"][str(code)] = d["codes"].get(str(code), 0) + 1
    report = {
        "base": args.base, "requests": len(results), "concurrency": args.concurrency, "wall_seconds": round(wall, 2),
        "rps": round(len(results) / wall, 1),
        "latency_ms": {"p50": round(pct(lat, 50)), "p90": round(pct(lat, 90)), "p95": round(pct(lat, 95)), "p99": round(pct(lat, 99)),
                       "max": round(max(lat)) if lat else 0, "mean": round(statistics.fmean(lat)) if lat else 0},
        "failures": len(failures), "failure_rate_pct": round(100 * len(failures) / max(1, len(results)), 2),
        "failure_samples": [{"scenario": f[0], "status": f[2], "error": f[4]} for f in failures[:10]],
        "scenarios": {k: {"n": v["n"], "fail": v["fail"], "p50": round(pct(v["lat"], 50)), "p95": round(pct(v["lat"], 95)),
                          "p99": round(pct(v["lat"], 99)), "codes": v["codes"]} for k, v in sorted(by.items())},
    }
    print(json.dumps(report, indent=1))
    if args.out:
        with open(args.out, "w") as fh:
            json.dump(report, fh, indent=1)


if __name__ == "__main__":
    asyncio.run(main())
