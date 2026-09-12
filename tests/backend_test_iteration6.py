"""Backend API tests for Yash Ornaments enrollment website.
Tests the admin login fix (same-origin API + CORS + non-blocking verify-otp) and admin/stats rewrite.
"""
import requests
import sys
import os
import uuid
from datetime import datetime, timezone, timedelta

# Base URL from frontend/.env
BASE_URL = "https://silver-checkout-1.preview.emergentagent.com"

class BackendTester:
    def __init__(self, base_url=BASE_URL):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, test_func):
        """Run a single test and track results"""
        self.tests_run += 1
        print(f"\n{'='*60}")
        print(f"🔍 Test {self.tests_run}: {name}")
        print(f"{'='*60}")
        
        try:
            test_func()
            self.tests_passed += 1
            print(f"✅ PASSED: {name}")
            return True
        except AssertionError as e:
            print(f"❌ FAILED: {name}")
            print(f"   Error: {str(e)}")
            self.failed_tests.append({"test": name, "error": str(e)})
            return False
        except Exception as e:
            print(f"❌ ERROR: {name}")
            print(f"   Exception: {str(e)}")
            self.failed_tests.append({"test": name, "error": f"Exception: {str(e)}"})
            return False

    def test_health_check(self):
        """Test 1: GET /api/health returns 200, build == '2026.09.10-login-v10', sms.provider_check == 'ok'"""
        r = requests.get(f"{self.base_url}/api/health", timeout=10)
        print(f"Status: {r.status_code}")
        print(f"Response: {r.json()}")
        
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        
        data = r.json()
        assert data.get("build") == "2026.09.10-login-v10", f"Expected build '2026.09.10-login-v10', got '{data.get('build')}'"
        
        sms_check = data.get("sms", {}).get("provider_check")
        assert sms_check == "ok", f"Expected SMS provider_check 'ok', got '{sms_check}'"
        
        print(f"✓ Build version: {data.get('build')}")
        print(f"✓ SMS provider check: {sms_check}")

    def test_cors_authorized_origins(self):
        """Test 2: CORS - OPTIONS preflight with authorized origins"""
        origins = [
            "https://register.yashsilver.com",
            "https://yash-register.emergent.host"
        ]
        
        for origin in origins:
            print(f"\nTesting origin: {origin}")
            r = requests.options(
                f"{self.base_url}/api/admin/auth/send-otp",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type"
                },
                timeout=10
            )
            print(f"Status: {r.status_code}")
            print(f"Headers: {dict(r.headers)}")
            
            acao = r.headers.get("access-control-allow-origin", "")
            acac = r.headers.get("access-control-allow-credentials", "")
            
            assert acao == origin, f"Expected access-control-allow-origin '{origin}', got '{acao}'"
            assert acac.lower() == "true", f"Expected access-control-allow-credentials 'true', got '{acac}'"
            
            print(f"✓ Origin {origin}: CORS headers correct")

    def test_cors_unauthorized_origin(self):
        """Test 3: CORS - OPTIONS preflight with unauthorized origin should NOT get access-control-allow-origin"""
        origin = "https://evil.example.com"
        print(f"\nTesting unauthorized origin: {origin}")
        
        r = requests.options(
            f"{self.base_url}/api/admin/auth/send-otp",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type"
            },
            timeout=10
        )
        print(f"Status: {r.status_code}")
        print(f"Headers: {dict(r.headers)}")
        
        acao = r.headers.get("access-control-allow-origin", "")
        
        # Should NOT echo the evil origin
        assert acao != origin, f"Unauthorized origin '{origin}' should NOT be echoed in access-control-allow-origin"
        
        print(f"✓ Unauthorized origin correctly rejected")

    def test_admin_unauthorized_phone(self):
        """Test 4: POST /api/admin/auth/send-otp with unauthorized phone -> 403"""
        # Use unauthorized phone (max 3 attempts to avoid lockout)
        phone = "9000000077"
        
        print(f"\nTesting unauthorized phone: {phone}")
        r = requests.post(
            f"{self.base_url}/api/admin/auth/send-otp",
            json={"phone": phone},
            timeout=10
        )
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:200]}")
        
        assert r.status_code == 403, f"Expected 403 for unauthorized phone, got {r.status_code}"
        
        data = r.json()
        detail = data.get("detail", "")
        assert "not authorized" in detail.lower(), f"Expected 'not authorized' in error message, got '{detail}'"
        
        print(f"✓ Unauthorized phone correctly rejected with 403")

    def test_enrollment_validation(self):
        """Test 5: Enrollment validation - invalid phone and missing consent"""
        # Test invalid phone
        print("\nTesting invalid phone '12345'")
        r = requests.post(
            f"{self.base_url}/api/enroll/send-otp",
            json={
                "name": "Test User",
                "phone": "12345",
                "shop_name": "Test Shop",
                "location": "Test Location",
                "consent_terms": True,
                "consent_privacy": True
            },
            timeout=10
        )
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:200]}")
        
        assert r.status_code == 422, f"Expected 422 for invalid phone, got {r.status_code}"
        print(f"✓ Invalid phone correctly rejected with 422")
        
        # Test missing consent
        print("\nTesting missing consent")
        r = requests.post(
            f"{self.base_url}/api/enroll/send-otp",
            json={
                "name": "Test User",
                "phone": "9876543210",
                "shop_name": "Test Shop",
                "location": "Test Location",
                "consent_terms": False,
                "consent_privacy": True
            },
            timeout=10
        )
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:200]}")
        
        assert r.status_code == 422, f"Expected 422 for missing consent, got {r.status_code}"
        print(f"✓ Missing consent correctly rejected with 422")

    def test_verify_otp_without_challenge(self):
        """Test 6: POST /api/enroll/verify-otp for a phone with no challenge -> 400"""
        # Use a phone that has no OTP challenge
        phone = "9000000088"
        
        print(f"\nTesting verify-otp without challenge for phone: {phone}")
        r = requests.post(
            f"{self.base_url}/api/enroll/verify-otp",
            json={"phone": phone, "otp": "1234"},
            timeout=10
        )
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:200]}")
        
        assert r.status_code == 400, f"Expected 400 for OTP not found, got {r.status_code}"
        
        data = r.json()
        detail = data.get("detail", "")
        assert "otp not found" in detail.lower(), f"Expected 'OTP not found' in error message, got '{detail}'"
        
        print(f"✓ Verify-otp without challenge correctly rejected with 400")

    def test_unauthenticated_requests(self):
        """Test 7: Unauthenticated requests to admin endpoints -> 401"""
        endpoints = [
            "/api/admin/auth/me",
            "/api/admin/customers",
            "/api/admin/stats"
        ]
        
        for endpoint in endpoints:
            print(f"\nTesting unauthenticated request to: {endpoint}")
            r = requests.get(f"{self.base_url}{endpoint}", timeout=10)
            print(f"Status: {r.status_code}")
            print(f"Response: {r.text[:200]}")
            
            assert r.status_code == 401, f"Expected 401 for {endpoint}, got {r.status_code}"
            print(f"✓ {endpoint} correctly returns 401 without auth")

    def print_summary(self):
        """Print test summary"""
        print(f"\n{'='*60}")
        print(f"📊 TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Total tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {len(self.failed_tests)}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.failed_tests:
            print(f"\n❌ Failed tests:")
            for i, fail in enumerate(self.failed_tests, 1):
                print(f"  {i}. {fail['test']}")
                print(f"     {fail['error']}")
        
        return len(self.failed_tests) == 0


def main():
    print("="*60)
    print("Yash Ornaments Backend API Tests")
    print("Build: 2026.09.10-login-v10")
    print("="*60)
    
    tester = BackendTester()
    
    # Run all tests
    tester.run_test("Health Check", tester.test_health_check)
    tester.run_test("CORS - Authorized Origins", tester.test_cors_authorized_origins)
    tester.run_test("CORS - Unauthorized Origin", tester.test_cors_unauthorized_origin)
    tester.run_test("Admin Auth - Unauthorized Phone", tester.test_admin_unauthorized_phone)
    tester.run_test("Enrollment Validation", tester.test_enrollment_validation)
    tester.run_test("Verify OTP Without Challenge", tester.test_verify_otp_without_challenge)
    tester.run_test("Unauthenticated Requests", tester.test_unauthenticated_requests)
    
    # Print summary
    success = tester.print_summary()
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
