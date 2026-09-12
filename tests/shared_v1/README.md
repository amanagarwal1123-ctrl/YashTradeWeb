# Reproduce website shared-v1 evidence

These are WEBSITE tests, not the historical app54-test report. Root `pytest.ini` restricts default discovery to this isolated suite. Do not explicitly run old legacy website tests against real accounts or providers.

Prerequisites: normal website dependencies + pytest/pytest-asyncio/playwright/PyMuPDF/Pillow; configured local MONGO_URL; Chromium. Fetch the pinned app source **6a6cdddb81a4c27b387144746a7b6cf7fefc85c2** (build `shared-v1-owner-recovery-2026-09-12`) into private `/root/yash-contract` (the source/tests/fixtures remain outside the public website repository; earlier runs pinned c4ee70d). No production key or realSMS is needed.

```sh
pytest -q --junitxml=evidence/auth-production-incident/readiness-adapter-v2/junit.xml
```

`test_bff_readiness_adapter.py` runs the real `bff.canonical.Canonical`/`bff.readiness.Readiness` over `httpx.MockTransport` (MOCKED app readiness contract: structured 200/503 health, credential GETs, 401/503/HTML/redirect/timeout cases, coalescing, both website origins). The `shared_apps` fixture tests exercise the real pinned app over isolated ASGI, including its real `/health` and credential readiness routes. D2/D3/D4 remain strict XFAIL at 6a6cddd (unresolved app dependencies, not passes).

Fixture creates two randomlynamed Mongo databases, random per-run integration/signing secrets, canonical-only synthetic identities and testSMS/objecttransports, then drops the testdatabases. No productionsecret or `.env`DB_NAME is modified persistently. All canonicalcalls use isolated ASGI. Browser tests use running websiteReact and route `/api` to the actual BFF/canonicalfixture, not fakeUIresponses.

Chromium's route.post_data_buffer omits fileparts forXHRFormData. Test-only nativeXHR/fetchsnapshot relays actual selectedFile/Blobbytes with its matchingboundary. This is not runtime behavior, a fakeimage or a runtimebypass. PyMuPDF1.28 testdiagnostics go tostderr via PYMUPDF_MESSAGE to preserve the pinnedworkerJSONstdout; no limitsraised or appsourcepatched.

Reports/screenshots contain synthetic names/counts only. `iteration_8/9` are historical intermediate reports; finalJUnit/logs/validationreport supersede harness-only failures. Sourceusesfixedfixturephones solely in isolatedtestDBs, never runtimeuniversalOTPs or reusable revieweraccess. Genuine recordtesting requires separateapproval.