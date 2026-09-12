"""Shared-v1 authenticated browser journeys through routed /api -> isolated BFF ASGI.

# module: public enrollment OTP + admin users/queries/rates/products/pdf + telecaller/billing navigation + overflow checks
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import pytest
from httpx import ASGITransport, AsyncClient

from test_bff_auth_session import shared_apps

try:
    from playwright.async_api import async_playwright
except Exception:  # pragma: no cover
    async_playwright = None


from dotenv import dotenv_values
FRONTEND_URL = dotenv_values('/app/frontend/.env')['REACT_APP_BACKEND_URL']
IMAGE_FILE = Path("/root/yash-contract/backend/fixtures/catalog-v1/silver.jpg")
PDF_FILE = Path("/root/yash-contract/backend/fixtures/catalog-v1/sample.pdf")


async def _seed_browser_data(shared_apps_ctx: dict):
    db = shared_apps_ctx["canonical_db"]
    now = datetime.now(timezone.utc).isoformat()
    await db.requests.update_one(
        {"id": "ui-q-1"},
        {
            "$set": {
                "id": "ui-q-1",
                "request_type": "callback",
                "status": "pending",
                "user_id": "u_cust",
                "user_name": "TEST Customer",
                "user_phone": "9000000103",
                "user_city": "Pune",
                "shop_name": "TEST Shop",
                "assignee_id": "",
                "assigned_to": "",
                "created_at": now,
                "updated_at": now,
                "pending_since": now,
                "version": 0,
                "events": [
                    {
                        "id": "ui-q-1-e1",
                        "type": "creation",
                        "actor_id": "u_cust",
                        "actor_role": "customer",
                        "timestamp": now,
                        "status": "pending",
                    }
                ],
            }
        },
        upsert=True,
    )
    await db.batches.update_one(
        {"id": "b1"},
        {
            "$set": {
                "id": "b1",
                "name": "TEST Batch 1",
                "status": "active",
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )


async def _assert_no_overflow(page, width: int, height: int, label: str):
    await page.set_viewport_size({"width": width, "height": height})
    await page.wait_for_timeout(300)
    dims = await page.evaluate(
        """() => ({
            innerWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth
        })"""
    )
    assert dims["scrollWidth"] <= dims["innerWidth"] + 2, f"{label} overflow at {width}px: {dims}"


@pytest.mark.anyio
async def test_authenticated_browser_journeys_routed_to_isolated_bff(shared_apps):  # noqa: F811 - imported pytest fixture
    if async_playwright is None:
        pytest.skip("Playwright not installed")

    await _seed_browser_data(shared_apps)
    evidence_dir = Path("/app/evidence/shared-v1")
    evidence_dir.mkdir(parents=True, exist_ok=True)

    bridge_events: list[dict] = []
    api_events: list[dict] = []
    ui_issues: list[dict] = []

    async with AsyncClient(transport=ASGITransport(app=shared_apps["bff_app"]), base_url="https://website.test") as asgi_client:
        pw = await async_playwright().start()
        browser = await pw.chromium.launch(headless=True, args=["--disable-dev-shm-usage"])
        context = await browser.new_context(viewport={"width": 1440, "height": 1080}, accept_downloads=True)
        await context.add_init_script(
            """(() => {
                if (window.__asgiRouteMultipartInstalled) return;
                window.__asgiRouteMultipartInstalled = true;
                window.__asgiRouteMultipartQueue = [];
                const nativeOpen = XMLHttpRequest.prototype.open;
                const nativeSend = XMLHttpRequest.prototype.send;
                XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                    this.__testMethod = method; this.__testUrl = new URL(url, location.href).href;
                    return nativeOpen.call(this, method, url, ...rest);
                };
                XMLHttpRequest.prototype.send = function(body) {
                    if (!(body instanceof FormData)) return nativeSend.call(this, body);
                    // Snapshot actual File/Blob bytes before native XHR. Chromium's
                    // routed post_data_buffer omits file parts, including file inputs
                    // immediately cleared by the UI. This is TEST TRANSPORT ONLY.
                    const xhr = this;
                    const req = new Request(xhr.__testUrl, {method: xhr.__testMethod, body});
                    req.clone().arrayBuffer().then(ab => {
                        window.__asgiRouteMultipartQueue.push({url:req.url, method:req.method,
                            headers:Array.from(req.headers.entries()), bytes:Array.from(new Uint8Array(ab))});
                        nativeSend.call(xhr, body);
                    });
                };
                const nativeFetch = window.fetch.bind(window);
                window.fetch = async (input, init) => {
                    try {
                        const req = new Request(input, init);
                        const ct = (req.headers.get('content-type') || '').toLowerCase();
                        const hasFormDataBody = !!(init && init.body && typeof FormData !== 'undefined' && init.body instanceof FormData);
                        if (ct.includes('multipart/form-data') || hasFormDataBody) {
                            const ab = await req.clone().arrayBuffer();
                            const bytes = Array.from(new Uint8Array(ab));
                            window.__asgiRouteMultipartQueue.push({
                                url: req.url,
                                method: (req.method || 'GET').toUpperCase(),
                                headers: Array.from(req.headers.entries()),
                                bytes
                            });
                        }
                    } catch (_) {}
                    return nativeFetch(input, init);
                };
            })();"""
        )
        page = await context.new_page()

        async def route_to_asgi(route, request):
            parsed = urlparse(request.url)
            path = parsed.path + (f"?{parsed.query}" if parsed.query else "")
            headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
            method = request.method.upper()
            if method not in {"GET", "HEAD", "OPTIONS"}:
                headers["origin"] = "https://yash-scheme-hub.cluster-8.preview.emergentcf.cloud"
                headers["x-website-origin"] = "https://website.test"
                headers["sec-fetch-site"] = "same-origin"

            body = request.post_data_buffer or b""
            used_multipart_fallback = False
            if headers.get("content-type", "").lower().startswith("multipart/form-data"):
                fallback = await page.evaluate(
                    """({url, method}) => {
                        const queue = window.__asgiRouteMultipartQueue || [];
                        const idx = queue.findIndex((row) => row.url === url && row.method === method);
                        if (idx < 0) return null;
                        const row = queue[idx];
                        queue.splice(idx, 1);
                        return row;
                    }""",
                    {"url": request.url, "method": method},
                )
                if fallback and fallback.get("bytes"):
                    body = bytes(fallback["bytes"])
                    for k, v in fallback.get("headers", []):
                        if k.lower() != "host":
                            headers[k] = v
                    used_multipart_fallback = True
                if (
                    not used_multipart_fallback
                    and path.startswith("/api/bff/products/upload-image")
                    and len(body or b"") <= 512
                ):
                    reconstructed = await page.evaluate(
                        """async () => {
                            const input = document.querySelector('[data-testid="product-photo-upload"]');
                            const file = input?.files?.[0];
                            if (!file) return null;
                            const fd = new FormData();
                            fd.append('file', file);
                            const req = new Request('/api/bff/products/upload-image', { method: 'POST', body: fd });
                            const ab = await req.arrayBuffer();
                            return {
                                bytes: Array.from(new Uint8Array(ab)),
                                content_type: req.headers.get('content-type') || ''
                            };
                        }"""
                    )
                    if reconstructed and reconstructed.get("bytes"):
                        body = bytes(reconstructed["bytes"])
                        if reconstructed.get("content_type"):
                            headers["content-type"] = reconstructed["content_type"]
                        used_multipart_fallback = True

            response = await asgi_client.request(method, path, headers=headers, content=body)
            if method == 'POST' and path.endswith('/complete') and '/pdf-upload/' in path and response.status_code == 200:
                # Execute the pinned canonical worker synchronously in this isolated
                # test instead of starting production/provider background tasks.
                from shared import pdf_jobs
                from pymongo import ReturnDocument
                import uuid
                lease = uuid.uuid4().hex
                job = await shared_apps['canonical_db'].import_jobs.find_one_and_update(
                    {'id':path.split('/')[-2],'phase':'queued'},
                    {'$set':{'phase':'analyzing','lease':lease}},
                    projection={'_id':0},return_document=ReturnDocument.AFTER)
                if job:
                    await pdf_jobs.process_job(job)
            api_events.append({"method": method, "path": path, "status": response.status_code})
            bridge_events.append(
                {
                    "method": method,
                    "path": path,
                    "native_len": len(request.post_data_buffer or b""),
                    "forwarded_len": len(body or b""),
                    "multipart_fallback": used_multipart_fallback,
                }
            )
            safe_headers = {
                k: v
                for k, v in response.headers.items()
                if k.lower() not in {"content-encoding", "transfer-encoding", "connection", "content-length"}
            }
            await route.fulfill(status=response.status_code, headers=safe_headers, body=response.content)

        await context.route("**/api/**", route_to_asgi)

        try:
            await page.goto(FRONTEND_URL, wait_until="domcontentloaded")
            await page.wait_for_selector('[data-testid="public-enroll-phone-input"]', timeout=45000)

            # Public enrollment success step 2 via real OTP captured from isolated fixture.
            public_phone = "9000000119"
            await page.fill('[data-testid="public-enroll-name-input"]', "TEST Public User")
            await page.fill('[data-testid="public-enroll-phone-input"]', public_phone)
            await page.fill('[data-testid="public-enroll-shop-name-input"]', "TEST Public Shop")
            await page.fill('[data-testid="public-enroll-location-input"]', "Pune")
            await page.click('[data-testid="public-consent-checkbox"]', force=True)
            await page.click('[data-testid="public-enroll-send-otp-button"]', force=True)
            await page.wait_for_selector('[data-testid="public-otp-input"]', timeout=15000)
            otp_public = shared_apps["sent_otps"].get((public_phone, "enrollment"))
            assert otp_public and len(otp_public) == 4
            await page.fill('[data-testid="public-otp-input"]', otp_public)
            await page.click('[data-testid="public-otp-verify-button"]', force=True)
            await page.wait_for_selector('[data-testid="public-success-heading"]', timeout=20000)

            # Admin login + Users / Queries / Rates / Products with real upload bridging.
            await page.goto(f"{FRONTEND_URL}/admin/login", wait_until="domcontentloaded")
            await page.wait_for_selector('[data-testid="admin-login-phone-input"]', timeout=30000)
            admin_phone = "9000000101"
            await page.fill('[data-testid="admin-login-phone-input"]', admin_phone)
            await page.click('[data-testid="admin-login-send-otp-button"]', force=True)
            await page.wait_for_selector('[data-testid="admin-otp-input"]', timeout=15000)
            otp_admin = shared_apps["sent_otps"].get((admin_phone, "login"))
            assert otp_admin and len(otp_admin) == 4
            await page.fill('[data-testid="admin-otp-input"]', otp_admin)
            await page.click('[data-testid="admin-otp-verify-button"]', force=True)
            await page.wait_for_selector('[data-testid="nav-overview"]', timeout=20000)

            await page.click('[data-testid="nav-users"]', force=True)
            await page.wait_for_selector('[data-testid="customers-table"]', timeout=15000)
            for width in (320, 768, 1024, 1440):
                await _assert_no_overflow(page, width, 1080, "admin-users")
            await page.set_viewport_size({"width": 320, "height": 800})
            await page.screenshot(path=str(evidence_dir / "admin-staff-320.jpeg"), type="jpeg", quality=20, full_page=False)
            await page.set_viewport_size({"width": 1440, "height": 1080})
            await page.wait_for_timeout(300)
            await page.screenshot(path=str(evidence_dir / "admin-staff-1440.jpeg"), type="jpeg", quality=20, full_page=False)

            # D3 UI: complete paginated enquiry history by immutable canonical customer ID.
            await page.click('[data-testid="customer-open-u_cust"]', force=True)
            await page.wait_for_selector('[data-testid="customer-complete-history-table"]', timeout=15000)
            await page.wait_for_selector('[data-testid="customer-complete-history-row-ui-q-1"]', timeout=15000)
            assert (await page.inner_text('[data-testid="customer-complete-history-total"]')).strip() == "1"
            await page.select_option('[data-testid="history-status"]', "resolved")
            await page.wait_for_selector('[data-testid="customer-complete-history-empty"]', timeout=15000)
            await page.select_option('[data-testid="history-status"]', "all")
            await page.wait_for_selector('[data-testid="customer-complete-history-row-ui-q-1"]', timeout=15000)
            history_calls = [e for e in api_events if e["path"].startswith("/api/bff/requests?") and "customer_id=u_cust" in e["path"]]
            assert history_calls and all(e["status"] == 200 for e in history_calls)
            await page.screenshot(path=str(evidence_dir / "customer-complete-history-1440.jpeg"), type="jpeg", quality=20, full_page=False)

            await page.click('[data-testid="nav-queries"]', force=True)
            await page.wait_for_selector('[data-testid="queries-table"]', timeout=15000)
            await page.click('[data-testid="nav-rates"]', force=True)
            await page.wait_for_selector('[data-testid="rates-status"]', timeout=15000)
            async with page.expect_response(lambda r: "/api/bff/rates" in r.url and r.request.method == "POST") as rates_save_info:
                await page.fill('[data-testid="silver-physical_premium"]', "21.5")
                await page.click('[data-testid="rates-save"]', force=True)
            rates_save = await rates_save_info.value
            assert rates_save.status == 200, await rates_save.text()

            await page.click('[data-testid="slab-add"]', force=True)
            await page.wait_for_selector('[data-testid="slab-editor"]', timeout=10000)
            await page.fill('[data-testid="slab-item_name"]', "TEST UI slab")
            await page.fill('[data-testid="slab-category"]', "chain")
            await page.fill('[data-testid="slab-labour-amount"]', "120")
            async with page.expect_response(lambda r: "/api/bff/rate-list" in r.url and r.request.method == "POST") as slab_save_info:
                await page.click('[data-testid="slab-save"]', force=True)
            slab_save = await slab_save_info.value
            assert slab_save.status == 200, await slab_save.text()
            await page.wait_for_selector('[data-testid="slab-editor"]', state='hidden', timeout=10000)

            await page.click('[data-testid="nav-leads"]', force=True)
            await page.wait_for_selector('[data-testid="lead-summary-status"]', timeout=15000)
            await page.wait_for_selector('[data-testid="lead-cohort-total"]', timeout=15000)

            await page.click('[data-testid="nav-batches"]', force=True)
            await page.wait_for_selector('[data-testid="batches-table"]', timeout=15000)
            batch_images_btn = page.locator('button[data-testid^="batch-images-"]').first
            if await batch_images_btn.count() > 0:
                await batch_images_btn.click(force=True)
                await page.wait_for_selector('[data-testid="batch-image-panel"]', timeout=15000)
                await page.click('[data-testid="batch-images-close"]', force=True)

            await page.click('[data-testid="nav-products"]', force=True)
            await page.wait_for_selector('[data-testid="product-add"]', timeout=15000)
            await page.click('[data-testid="product-add"]', force=True)
            await page.wait_for_selector('[data-testid="product-editor"]', timeout=10000)
            await page.fill('[data-testid="product-product_code"]', "TEST-UI-ADMIN-001")
            await page.fill('[data-testid="product-title"]', "TEST UI Admin Product")
            await page.fill('[data-testid="product-category"]', "chain")
            async with page.expect_response(
                lambda r: "/api/bff/products/upload-image" in r.url and r.request.method == "POST"
            ) as upload_info:
                await page.set_input_files('[data-testid="product-photo-upload"]', str(IMAGE_FILE))
            upload_response = await upload_info.value
            if upload_response.status != 200:
                ui_issues.append(
                    {
                        "flow": "admin products photo upload",
                        "status": upload_response.status,
                        "body": await upload_response.text(),
                    }
                )
            await page.wait_for_timeout(1000)
            await page.click('[data-testid="product-save"]', force=True)
            await page.wait_for_timeout(1500)
            assert upload_response.status == 200, await upload_response.text()
            stored_product = await shared_apps['canonical_db'].products.find_one({'product_code':'TEST-UI-ADMIN-001'}, {'_id':0})
            assert stored_product and len(stored_product['images']) == 1

            await page.click('[data-testid="products-import"]', force=True)
            await page.wait_for_selector('[data-testid="pdf-file-input"]', timeout=15000)
            async with page.expect_download() as sample_info:
                await page.click('[data-testid="pdf-download-sample"]', force=True)
            sample_download = await sample_info.value
            assert sample_download.suggested_filename.endswith(".pdf")
            async with page.expect_download() as authoring_info:
                await page.click('[data-testid="pdf-download-authoring-json"]', force=True)
            authoring_download = await authoring_info.value
            assert authoring_download.suggested_filename.endswith(".json")
            await page.select_option('[data-testid="pdf-batch"]', "b1")
            await page.set_input_files('[data-testid="pdf-file-input"]', str(PDF_FILE))
            await page.click('[data-testid="pdf-upload-start"]', force=True)
            try:
                await page.wait_for_selector('[data-testid="pdf-resume-identity"]', timeout=25000)
                await page.wait_for_selector('[data-testid="pdf-byte-progress"]', timeout=25000)
                await page.wait_for_selector('[data-testid="pdf-preview-table"]', timeout=30000)
                previews = page.locator('button[data-testid^="pdf-review-"]')
                assert await previews.count() == 3
                await previews.first.click()
                await page.get_by_test_id('pdf-row-title').fill('TEST Reviewed silver item')
                await page.get_by_test_id('crop-shrink').click()
                crop = page.get_by_test_id('crop-move')
                box = await crop.bounding_box()
                await page.mouse.move(box['x']+20,box['y']+20)
                await page.mouse.down()
                await page.mouse.move(box['x']+23,box['y']+23)
                await page.mouse.up()
                for width in (320,768,1024,1440):
                    await _assert_no_overflow(page,width,1080,'pdf-crop-review')
                await page.screenshot(path=str(evidence_dir / 'pdf-crop-review-1440.jpeg'),type='jpeg',quality=20,full_page=False)
                await page.get_by_test_id('pdf-row-save').click()
                await page.get_by_test_id('pdf-row-editor').wait_for(state='hidden')
                await page.get_by_test_id('pdf-confirm').check()
                await page.get_by_test_id('pdf-commit').click()
                await page.get_by_test_id('pdf-result').wait_for(state='visible',timeout=20000)
                assert await page.get_by_test_id('pdf-result-created').inner_text() == '3'
                imported = await shared_apps['canonical_db'].products.find({'source_upload_id':{'$exists':True}},{'_id':0}).to_list(20)
                assert len(imported)==3 and {p['metal_type'] for p in imported}=={'silver','gold','diamond'}
                assert all(p['visibility']=='hidden' for p in imported)
                await page.screenshot(path=str(evidence_dir / 'pdf-hidden-result.jpeg'),type='jpeg',quality=20,full_page=False)
                await page.click('[data-testid="nav-catalog-author"]')
                await page.get_by_test_id('author-product_code').fill('TEST-FORM-EXPORT-01')
                await page.get_by_test_id('author-title').fill('TEST form authored gold pendant')
                await page.get_by_test_id('author-category').fill('pendant')
                await page.get_by_test_id('author-metal_type').select_option('gold')
                await page.set_input_files('[data-testid="author-photo-upload"]',str(IMAGE_FILE))
                await page.get_by_test_id('author-photo-preview').wait_for()
                await page.get_by_test_id('author-add-entry').click()
                async with page.expect_download() as authored_download:
                    await page.get_by_test_id('author-export').click()
                exported = await authored_download.value
                export_path = await exported.path()
                assert Path(export_path).read_bytes().startswith(b'%PDF')
                assert await shared_apps['canonical_db'].products.count_documents({'product_code':'TEST-FORM-EXPORT-01'}) == 0
            except Exception as exc:
                ui_issues.append(
                    {
                        "flow": "admin pdf upload",
                        "status": "resume_or_progress_missing",
                        "body": str(exc)[:500],
                        "jobs": await shared_apps['canonical_db'].import_jobs.find({}, {'_id':0,'phase':1,'error':1}).to_list(10),
                    }
                )

            # Telecaller: Queries navigation.
            await page.click('[data-testid="admin-logout-button"]', force=True)
            await page.wait_for_selector('[data-testid="admin-login-phone-input"]', timeout=15000)
            tele_phone = "9000000102"
            await page.fill('[data-testid="admin-login-phone-input"]', tele_phone)
            await page.click('[data-testid="admin-login-send-otp-button"]', force=True)
            await page.wait_for_selector('[data-testid="admin-otp-input"]', timeout=15000)
            otp_tele = shared_apps["sent_otps"].get((tele_phone, "login"))
            assert otp_tele
            await page.fill('[data-testid="admin-otp-input"]', otp_tele)
            await page.click('[data-testid="admin-otp-verify-button"]', force=True)
            await page.wait_for_selector('[data-testid="nav-queries"]', timeout=15000)
            await page.click('[data-testid="nav-queries"]', force=True)
            await page.wait_for_selector('[data-testid="queries-table"]', timeout=15000)

            # Billing: Queries + Rates navigation.
            await page.click('[data-testid="admin-logout-button"]', force=True)
            await page.wait_for_selector('[data-testid="admin-login-phone-input"]', timeout=15000)
            billing_phone = "9000000104"
            await page.fill('[data-testid="admin-login-phone-input"]', billing_phone)
            await page.click('[data-testid="admin-login-send-otp-button"]', force=True)
            await page.wait_for_selector('[data-testid="admin-otp-input"]', timeout=15000)
            otp_billing = shared_apps["sent_otps"].get((billing_phone, "login"))
            assert otp_billing
            await page.fill('[data-testid="admin-otp-input"]', otp_billing)
            await page.click('[data-testid="admin-otp-verify-button"]', force=True)
            await page.wait_for_selector('[data-testid="nav-queries"]', timeout=15000)
            await page.click('[data-testid="nav-queries"]', force=True)
            await page.wait_for_selector('[data-testid="queries-table"]', timeout=15000)
            await page.click('[data-testid="nav-rates"]', force=True)
            await page.wait_for_selector('[data-testid="rates-status"]', timeout=15000)

            # D2 UI: billing customer search envelope via the static canonical search route.
            await page.click('[data-testid="nav-rewards"]', force=True)
            await page.wait_for_selector('[data-testid="reward-customer-search"]', timeout=15000)
            await page.fill('[data-testid="reward-customer-search"]', "T")
            assert "at least 2" in await page.inner_text('[data-testid="reward-search-scope"]')
            await page.fill('[data-testid="reward-customer-search"]', "TEST Customer")
            await page.wait_for_selector('[data-testid="reward-search-pick-u_cust"]', timeout=15000)
            search_calls = [e for e in api_events if e["path"].startswith("/api/bff/customers/search?")]
            assert search_calls and all(e["status"] == 200 for e in search_calls)
            await page.click('[data-testid="reward-search-pick-u_cust"]', force=True)
            await page.wait_for_selector('[data-testid="reward-balance"]', timeout=15000)
            await page.screenshot(path=str(evidence_dir / "billing-customer-search-1440.jpeg"), type="jpeg", quality=20, full_page=False)

            upload_events = [e for e in bridge_events if "/api/bff/products/upload-image" in e["path"] and e["method"] == "POST"]
            if not (upload_events and any(e["forwarded_len"] > 1024 for e in upload_events)):
                ui_issues.append({"flow": "multipart-bridge product upload", "status": "missing_or_tiny_payload"})
            pdf_chunk_events = [e for e in bridge_events if "/api/bff/pdf-upload/" in e["path"] and "/chunk" in e["path"]]
            if not (pdf_chunk_events and any(e["forwarded_len"] > 0 for e in pdf_chunk_events)):
                ui_issues.append({"flow": "multipart-bridge pdf chunk", "status": "missing_payload"})

            (evidence_dir / "authenticated-browser-journeys-events.json").write_text(
                json.dumps({"bridge_events": bridge_events, "api_events": api_events, "issues": ui_issues}, indent=2)
            )
            assert not ui_issues, f"Browser journey issues: {ui_issues}"
        finally:
            await context.close()
            await browser.close()
            await pw.stop()