"""Comprehensive staff role-based access control tests.
Tests the NEW staff-role features end-to-end for regressions.

Run: cd /app && python tests/test_staff_roles_comprehensive.py
"""
import os
import sys
import secrets
import asyncio
from datetime import datetime, timezone, timedelta

import httpx
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

# Use the PUBLIC endpoint from frontend/.env
BASE = "https://enroll-preview-2.preview.emergentagent.com/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# Test phones
ADMIN_PHONE = "9999813334"
TELECALLER_PHONE = "9999900001"
BILLING_PHONE = "9000000777"
TEST_STAFF_PHONE = "9000000123"  # For CRUD tests

class TestRunner:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []
        self.admin_session = None
        self.telecaller_session = None
        self.billing_session = None
        self.db = None
        
    async def setup(self):
        """Create test sessions in MongoDB"""
        print("\n🔧 Setting up test sessions...")
        client = AsyncIOMotorClient(MONGO_URL)
        self.db = client[DB_NAME]
        
        # Seed staff directory from env if needed
        await self._seed_staff()
        
        # Create admin session
        admin_token = "TEMPTEST_" + secrets.token_urlsafe(24)
        now = datetime.now(timezone.utc)
        await self.db.admin_sessions.insert_one({
            "token": admin_token,
            "phone": ADMIN_PHONE,
            "role": "admin",
            "live_token": None,
            "live_role": None,
            "live_token_expires_at": None,
            "app_token_status": "pending",
            "app_token_error": None,
            "app_user": None,
            "live_unlock_pending": False,
            "created_at": now.isoformat(),
            "last_active": now.isoformat(),
            "expires_at": (now + timedelta(hours=12)).isoformat(),
            "expire_marker": now + timedelta(hours=12),
            "ip": "127.0.0.1"
        })
        self.admin_session = {"Cookie": f"yash_admin_session={admin_token}"}
        print(f"✓ Admin session created (phone: {ADMIN_PHONE})")
        
        # Create telecaller session
        telecaller_token = "TEMPTEST_" + secrets.token_urlsafe(24)
        await self.db.admin_sessions.insert_one({
            "token": telecaller_token,
            "phone": TELECALLER_PHONE,
            "role": "telecaller",
            "live_token": None,
            "live_role": None,
            "live_token_expires_at": None,
            "app_token_status": "pending",
            "app_token_error": None,
            "app_user": None,
            "live_unlock_pending": False,
            "created_at": now.isoformat(),
            "last_active": now.isoformat(),
            "expires_at": (now + timedelta(hours=12)).isoformat(),
            "expire_marker": now + timedelta(hours=12),
            "ip": "127.0.0.1"
        })
        self.telecaller_session = {"Cookie": f"yash_admin_session={telecaller_token}"}
        print(f"✓ Telecaller session created (phone: {TELECALLER_PHONE})")
        
        # Create billing executive session
        billing_token = "TEMPTEST_" + secrets.token_urlsafe(24)
        await self.db.admin_sessions.insert_one({
            "token": billing_token,
            "phone": BILLING_PHONE,
            "role": "billing_executive",
            "live_token": None,
            "live_role": None,
            "live_token_expires_at": None,
            "app_token_status": "pending",
            "app_token_error": None,
            "app_user": None,
            "live_unlock_pending": False,
            "created_at": now.isoformat(),
            "last_active": now.isoformat(),
            "expires_at": (now + timedelta(hours=12)).isoformat(),
            "expire_marker": now + timedelta(hours=12),
            "ip": "127.0.0.1"
        })
        self.billing_session = {"Cookie": f"yash_admin_session={billing_token}"}
        print(f"✓ Billing executive session created (phone: {BILLING_PHONE})")
        
        # Ensure billing executive exists in staff_users
        billing_exists = await self.db.staff_users.find_one({"phone": BILLING_PHONE})
        if not billing_exists:
            await self.db.staff_users.insert_one({
                "id": secrets.token_urlsafe(16),
                "name": "Test Billing Executive",
                "phone": BILLING_PHONE,
                "role": "billing_executive",
                "code": None,
                "status": "active",
                "source": "test",
                "app_user_id": None,
                "app_sync_status": "pending",
                "app_sync_error": None,
                "app_synced_at": None,
                "app_last_login": None,
                "site_last_login": None,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "created_by": "test",
                "updated_by": "test"
            })
            print(f"✓ Billing executive added to staff_users")
        
    async def _seed_staff(self):
        """Seed staff directory from env if needed"""
        admin_exists = await self.db.staff_users.find_one({"phone": ADMIN_PHONE})
        telecaller_exists = await self.db.staff_users.find_one({"phone": TELECALLER_PHONE})
        now = datetime.now(timezone.utc).isoformat()
        
        if not admin_exists:
            await self.db.staff_users.insert_one({
                "id": secrets.token_urlsafe(16),
                "name": f"Admin {ADMIN_PHONE[-4:]}",
                "phone": ADMIN_PHONE,
                "role": "admin",
                "code": None,
                "status": "active",
                "source": "env",
                "app_user_id": None,
                "app_sync_status": "pending",
                "app_sync_error": None,
                "app_synced_at": None,
                "app_last_login": None,
                "site_last_login": None,
                "created_at": now,
                "updated_at": now,
                "created_by": "system",
                "updated_by": "system"
            })
            
        if not telecaller_exists:
            await self.db.staff_users.insert_one({
                "id": secrets.token_urlsafe(16),
                "name": f"Telecaller {TELECALLER_PHONE[-4:]}",
                "phone": TELECALLER_PHONE,
                "role": "telecaller",
                "code": None,
                "status": "active",
                "source": "env",
                "app_user_id": None,
                "app_sync_status": "pending",
                "app_sync_error": None,
                "app_synced_at": None,
                "app_last_login": None,
                "site_last_login": None,
                "created_at": now,
                "updated_at": now,
                "created_by": "system",
                "updated_by": "system"
            })
        
    async def cleanup(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up test data...")
        if self.db is not None:
            # Delete test sessions
            await self.db.admin_sessions.delete_many({"token": {"$regex": "^TEMPTEST_"}})
            # Delete test staff
            await self.db.staff_users.delete_many({"phone": TEST_STAFF_PHONE})
            # Delete billing executive if created by test
            billing_staff = await self.db.staff_users.find_one({"phone": BILLING_PHONE})
            if billing_staff and billing_staff.get("source") == "test":
                await self.db.staff_users.delete_one({"phone": BILLING_PHONE})
            print("✓ Test data cleaned up")
    
    def test(self, name, condition, details=""):
        """Record a test result"""
        if condition:
            self.passed += 1
            print(f"  ✓ {name}")
            self.tests.append({"name": name, "passed": True, "details": details})
        else:
            self.failed += 1
            print(f"  ✗ {name} {details}")
            self.tests.append({"name": name, "passed": False, "details": details})
    
    async def run_all_tests(self):
        """Run all test suites"""
        await self.test_admin_access()
        await self.test_telecaller_access()
        await self.test_billing_executive_access()
        await self.test_no_cookie_access()
        await self.test_auth_me_endpoints()
        await self.test_staff_directory_crud()
        await self.test_validation()
        await self.test_regression()
    
    async def test_admin_access(self):
        """Test admin session access"""
        print("\n📋 Testing ADMIN session access...")
        async with httpx.AsyncClient(base_url=BASE, timeout=30) as client:
            # Admin should have access to products
            r = await client.get("/portal/products", params={"page": 1, "limit": 3}, headers=self.admin_session)
            self.test("Admin GET /portal/products?page=1&limit=3", r.status_code == 200, f"(got {r.status_code})")
            
            # Admin should have access to products with search
            r = await client.get("/portal/products", params={"search": "ring", "limit": 2}, headers=self.admin_session)
            self.test("Admin GET /portal/products?search=ring&limit=2", r.status_code == 200, f"(got {r.status_code})")
            if r.status_code == 200:
                data = r.json()
                products = data.get("products", [])
                # Verify search filter is reflected
                has_ring = any("ring" in str(p.get("title", "")).lower() or "ring" in str(p.get("description", "")).lower() or "ring" in str(p.get("tags", [])).lower() for p in products)
                self.test("Search filter reflected in results", len(products) == 0 or has_ring, f"(products: {len(products)})")
            
            # Admin should have access to categories
            r = await client.get("/portal/categories", headers=self.admin_session)
            self.test("Admin GET /portal/categories", r.status_code == 200, f"(got {r.status_code})")
            
            # Admin should have access to rates
            r = await client.get("/portal/rates/latest", headers=self.admin_session)
            self.test("Admin GET /portal/rates/latest", r.status_code == 200, f"(got {r.status_code})")
            
            # Admin should have access to rate history
            r = await client.get("/portal/rates/history", params={"days": 7}, headers=self.admin_session)
            self.test("Admin GET /portal/rates/history?days=7", r.status_code == 200, f"(got {r.status_code})")
            
            # Admin should have access to rate list
            r = await client.get("/portal/rate-list", params={"metal_type": "silver"}, headers=self.admin_session)
            self.test("Admin GET /portal/rate-list?metal_type=silver", r.status_code == 200, f"(got {r.status_code})")
            if r.status_code == 200:
                data = r.json()
                slabs = data if isinstance(data, list) else data.get("slabs", [])
                # Verify all slabs have metal_type silver
                all_silver = all(s.get("metal_type") == "silver" for s in slabs)
                self.test("All rate list slabs have metal_type silver", len(slabs) == 0 or all_silver, f"(slabs: {len(slabs)})")
    
    async def test_telecaller_access(self):
        """Test telecaller session access"""
        print("\n📋 Testing TELECALLER session access...")
        async with httpx.AsyncClient(base_url=BASE, timeout=30) as client:
            # Telecaller should get 403 on products
            r = await client.get("/portal/products", headers=self.telecaller_session)
            self.test("Telecaller GET /portal/products -> 403", r.status_code == 403, f"(got {r.status_code})")
            
            # Telecaller should get 403 on rates
            r = await client.get("/portal/rates/latest", headers=self.telecaller_session)
            self.test("Telecaller GET /portal/rates/latest -> 403", r.status_code == 403, f"(got {r.status_code})")
            
            # Telecaller should get 403 on admin stats
            r = await client.get("/admin/stats", headers=self.telecaller_session)
            self.test("Telecaller GET /admin/stats -> 403", r.status_code == 403, f"(got {r.status_code})")
            
            # Telecaller should get 403 on staff directory
            r = await client.get("/admin/staff", headers=self.telecaller_session)
            self.test("Telecaller GET /admin/staff -> 403", r.status_code == 403, f"(got {r.status_code})")
            
            # Telecaller should have access to categories (public read)
            r = await client.get("/portal/categories", headers=self.telecaller_session)
            self.test("Telecaller GET /portal/categories -> 200", r.status_code == 200, f"(got {r.status_code})")
            
            # Telecaller should get 503 on requests (app endpoint not deployed yet - EXPECTED)
            r = await client.get("/portal/requests", headers=self.telecaller_session)
            self.test("Telecaller GET /portal/requests -> 503 (expected)", r.status_code == 503, f"(got {r.status_code})")
            if r.status_code == 503:
                detail = r.json().get("detail", "")
                has_expected_msg = "has not enabled website access" in detail.lower() or "staff" in detail.lower()
                self.test("503 response has graceful error message", has_expected_msg, f"(detail: {detail[:80]})")
    
    async def test_billing_executive_access(self):
        """Test billing executive session access"""
        print("\n📋 Testing BILLING EXECUTIVE session access...")
        async with httpx.AsyncClient(base_url=BASE, timeout=30) as client:
            # Billing should have access to rates
            r = await client.get("/portal/rates/latest", headers=self.billing_session)
            self.test("Billing GET /portal/rates/latest -> 200", r.status_code == 200, f"(got {r.status_code})")
            
            # Billing should have access to rate list
            r = await client.get("/portal/rate-list", headers=self.billing_session)
            self.test("Billing GET /portal/rate-list -> 200", r.status_code == 200, f"(got {r.status_code})")
            
            # Billing should get 403 on products
            r = await client.get("/portal/products", headers=self.billing_session)
            self.test("Billing GET /portal/products -> 403", r.status_code == 403, f"(got {r.status_code})")
            
            # Billing should get 403 on requests
            r = await client.get("/portal/requests", headers=self.billing_session)
            self.test("Billing GET /portal/requests -> 403", r.status_code == 403, f"(got {r.status_code})")
            
            # Billing POST rates should get 503 (app endpoint not deployed - EXPECTED, not 500)
            r = await client.post("/portal/rates", json={"silver_mcx_rate": 97.25}, headers=self.billing_session)
            self.test("Billing POST /portal/rates -> 503 (expected, not 500)", r.status_code == 503, f"(got {r.status_code})")
            if r.status_code == 503:
                detail = r.json().get("detail", "")
                has_expected_msg = "has not enabled" in detail.lower() or "staff" in detail.lower() or "token" in detail.lower()
                self.test("503 response has graceful error message", has_expected_msg, f"(detail: {detail[:80]})")
    
    async def test_no_cookie_access(self):
        """Test access without authentication"""
        print("\n📋 Testing NO COOKIE access...")
        async with httpx.AsyncClient(base_url=BASE, timeout=30) as client:
            # No cookie should get 401 on products
            r = await client.get("/portal/products")
            self.test("No cookie GET /portal/products -> 401", r.status_code == 401, f"(got {r.status_code})")
            
            # No cookie should get 401 on staff directory
            r = await client.get("/admin/staff")
            self.test("No cookie GET /admin/staff -> 401", r.status_code == 401, f"(got {r.status_code})")
    
    async def test_auth_me_endpoints(self):
        """Test /admin/auth/me for each role"""
        print("\n📋 Testing /admin/auth/me endpoints...")
        async with httpx.AsyncClient(base_url=BASE, timeout=30) as client:
            # Admin /me
            r = await client.get("/admin/auth/me", headers=self.admin_session)
            self.test("Admin GET /admin/auth/me -> 200", r.status_code == 200, f"(got {r.status_code})")
            if r.status_code == 200:
                data = r.json()
                self.test("Admin /me has role field", "role" in data, f"(keys: {list(data.keys())})")
                self.test("Admin /me has role_label field", "role_label" in data, f"(keys: {list(data.keys())})")
                self.test("Admin /me has app_token_status field", "app_token_status" in data, f"(keys: {list(data.keys())})")
                self.test("Admin /me role is 'admin'", data.get("role") == "admin", f"(role: {data.get('role')})")
                status = data.get("app_token_status")
                self.test("Admin /me app_token_status is valid", status in ["pending", "failed", "ok", "disabled", "not_configured"], f"(status: {status})")
            
            # Telecaller /me
            r = await client.get("/admin/auth/me", headers=self.telecaller_session)
            self.test("Telecaller GET /admin/auth/me -> 200", r.status_code == 200, f"(got {r.status_code})")
            if r.status_code == 200:
                data = r.json()
                self.test("Telecaller /me role is 'telecaller'", data.get("role") == "telecaller", f"(role: {data.get('role')})")
            
            # Billing /me
            r = await client.get("/admin/auth/me", headers=self.billing_session)
            self.test("Billing GET /admin/auth/me -> 200", r.status_code == 200, f"(got {r.status_code})")
            if r.status_code == 200:
                data = r.json()
                self.test("Billing /me role is 'billing_executive'", data.get("role") == "billing_executive", f"(role: {data.get('role')})")
    
    async def test_staff_directory_crud(self):
        """Test staff directory CRUD operations (admin only)"""
        print("\n📋 Testing STAFF DIRECTORY CRUD (admin only)...")
        async with httpx.AsyncClient(base_url=BASE, timeout=30) as client:
            # GET staff list
            r = await client.get("/admin/staff", headers=self.admin_session)
            self.test("Admin GET /admin/staff -> 200", r.status_code == 200, f"(got {r.status_code})")
            if r.status_code == 200:
                data = r.json()
                items = data.get("items", [])
                # Should have seeded admin and telecaller
                has_admin = any(u.get("phone") == ADMIN_PHONE for u in items)
                has_telecaller = any(u.get("phone") == TELECALLER_PHONE for u in items)
                self.test("Staff list contains seeded admin", has_admin, f"(items: {len(items)})")
                self.test("Staff list contains seeded telecaller", has_telecaller, f"(items: {len(items)})")
            
            # POST create new staff
            r = await client.post("/admin/staff", json={
                "name": "Test Biller",
                "phone": TEST_STAFF_PHONE,
                "role": "billing_executive",
                "code": "BX-1"
            }, headers=self.admin_session)
            self.test("Admin POST /admin/staff -> 201", r.status_code == 201, f"(got {r.status_code})")
            
            staff_id = None
            if r.status_code == 201:
                data = r.json()
                staff_id = data.get("id")
                self.test("Created staff has app_sync_status", "app_sync_status" in data, f"(keys: {list(data.keys())})")
                status = data.get("app_sync_status")
                # Expected: pending (app endpoint not deployed yet)
                self.test("Created staff app_sync_status is pending/failed/ok/not_configured", status in ["pending", "failed", "ok", "not_configured"], f"(status: {status})")
            
            # POST duplicate phone should get 409
            r = await client.post("/admin/staff", json={
                "name": "Duplicate",
                "phone": TEST_STAFF_PHONE,
                "role": "telecaller"
            }, headers=self.admin_session)
            self.test("Admin POST duplicate phone -> 409", r.status_code == 409, f"(got {r.status_code})")
            
            # POST invalid role should get 422
            r = await client.post("/admin/staff", json={
                "name": "Invalid Role",
                "phone": "9000000999",
                "role": "ceo"
            }, headers=self.admin_session)
            self.test("Admin POST invalid role -> 422", r.status_code == 422, f"(got {r.status_code})")
            
            if staff_id:
                # PATCH update staff
                r = await client.patch(f"/admin/staff/{staff_id}", json={"role": "telecaller"}, headers=self.admin_session)
                self.test("Admin PATCH /admin/staff/{id} -> 200", r.status_code == 200, f"(got {r.status_code})")
                if r.status_code == 200:
                    data = r.json()
                    self.test("Updated staff role is 'telecaller'", data.get("role") == "telecaller", f"(role: {data.get('role')})")
                
                # Try to demote yourself (should be blocked)
                # First get my staff id
                r = await client.get("/admin/staff", headers=self.admin_session)
                if r.status_code == 200:
                    items = r.json().get("items", [])
                    my_staff = next((u for u in items if u.get("phone") == ADMIN_PHONE), None)
                    if my_staff:
                        my_id = my_staff.get("id")
                        r = await client.patch(f"/admin/staff/{my_id}", json={"role": "telecaller"}, headers=self.admin_session)
                        self.test("Admin cannot demote self -> 4xx", r.status_code >= 400 and r.status_code < 500, f"(got {r.status_code})")
                
                # DELETE staff
                r = await client.delete(f"/admin/staff/{staff_id}", headers=self.admin_session)
                self.test("Admin DELETE /admin/staff/{id} -> 200", r.status_code == 200, f"(got {r.status_code})")
            
            # GET app-status
            r = await client.get("/admin/staff/app-status", headers=self.admin_session)
            self.test("Admin GET /admin/staff/app-status -> 200", r.status_code == 200, f"(got {r.status_code})")
            if r.status_code == 200:
                data = r.json()
                self.test("App status has endpoint_live field", "endpoint_live" in data, f"(keys: {list(data.keys())})")
                self.test("App status has detail field", "detail" in data, f"(keys: {list(data.keys())})")
                # Expected: endpoint_live = false (app hasn't deployed staff endpoints yet)
                endpoint_live = data.get("endpoint_live")
                detail = data.get("detail", "")
                if endpoint_live is False:
                    self.test("App status detail mentions staff endpoints not deployed", "staff" in detail.lower() and ("not" in detail.lower() or "endpoint" in detail.lower()), f"(detail: {detail[:80]})")
    
    async def test_validation(self):
        """Test validation and error handling"""
        print("\n📋 Testing VALIDATION and error handling...")
        async with httpx.AsyncClient(base_url=BASE, timeout=30) as client:
            # POST products with invalid body (title too short)
            r = await client.post("/portal/products", json={"title": "x"}, headers=self.admin_session)
            self.test("POST /portal/products with title too short -> 422", r.status_code == 422, f"(got {r.status_code})")
            
            # POST products/upload-image with wrong file type
            # Create a fake .txt file
            files = {"file": ("test.txt", b"not an image", "text/plain")}
            r = await client.post("/portal/products/upload-image", files=files, headers=self.admin_session)
            self.test("POST /portal/products/upload-image with .txt file -> 422", r.status_code == 422, f"(got {r.status_code})")
    
    async def test_regression(self):
        """Test regression - ensure existing features still work"""
        print("\n📋 Testing REGRESSION (existing features)...")
        async with httpx.AsyncClient(base_url=BASE, timeout=30) as client:
            # Public landing page health
            r = await client.get("/health")
            self.test("GET /api/health -> 200", r.status_code == 200, f"(got {r.status_code})")
            if r.status_code == 200:
                data = r.json()
                self.test("Health response has status field", "status" in data, f"(keys: {list(data.keys())})")
            
            # Public config
            r = await client.get("/public/config")
            self.test("GET /api/public/config -> 200", r.status_code == 200, f"(got {r.status_code})")
            
            # Admin dashboard stats (admin only)
            r = await client.get("/admin/stats", headers=self.admin_session)
            # May return 200 or 503 depending on data availability
            self.test("Admin GET /admin/stats -> 200 or 503", r.status_code in [200, 503], f"(got {r.status_code})")
            
            # Admin customers list
            r = await client.get("/admin/customers", headers=self.admin_session)
            self.test("Admin GET /admin/customers -> 200", r.status_code == 200, f"(got {r.status_code})")
    
    def print_summary(self):
        """Print test summary"""
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"📊 TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Total tests: {total}")
        print(f"✓ Passed: {self.passed}")
        print(f"✗ Failed: {self.failed}")
        print(f"Success rate: {(self.passed/total*100) if total > 0 else 0:.1f}%")
        
        if self.failed > 0:
            print(f"\n❌ FAILED TESTS:")
            for t in self.tests:
                if not t["passed"]:
                    print(f"  • {t['name']} {t['details']}")
        
        print(f"{'='*60}\n")
        return self.failed == 0

async def main():
    runner = TestRunner()
    try:
        await runner.setup()
        await runner.run_all_tests()
        success = runner.print_summary()
        return 0 if success else 1
    finally:
        await runner.cleanup()

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
