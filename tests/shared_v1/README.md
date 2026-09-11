# Reproduce website shared-v1 evidence

These are WEBSITE tests, not the historical app54-test report. Root `pytest.ini` restricts default discovery to this isolated suite. Do not explicitly run old legacy website tests against real accounts or providers.

Prerequisites: normal website dependencies + pytest/pytest-asyncio/playwright/PyMuPDF/Pillow; configured local MONGO_URL; Chromium. Fetch the pinned app archive **c4ee70d8134625a1a4e04073c43b9460c3c4e40d** into private `/root/yash-contract` (the source/tests/fixtures remain outside the public website repository). No production key or realSMS is needed.

```sh
pytest tests/shared_v1/test_bff_auth_session.py tests/shared_v1/test_bff_feature_matrix.py -q --junitxml=evidence/shared-v1/backend-junit.xml
pytest tests/shared_v1/test_bff_authenticated_browser_journeys.py -q --junitxml=evidence/shared-v1/browser-junit.xml
```

Fixture creates two randomlynamed Mongo databases, random per-run integration/signing secrets, canonical-only synthetic identities and testSMS/objecttransports, then drops the testdatabases. No productionsecret or `.env`DB_NAME is modified persistently. All canonicalcalls use isolated ASGI. Browser tests use running websiteReact and route `/api` to the actual BFF/canonicalfixture, not fakeUIresponses.

Chromium's route.post_data_buffer omits fileparts forXHRFormData. Test-only nativeXHR/fetchsnapshot relays actual selectedFile/Blobbytes with its matchingboundary. This is not runtime behavior, a fakeimage or a runtimebypass. PyMuPDF1.28 testdiagnostics go tostderr via PYMUPDF_MESSAGE to preserve the pinnedworkerJSONstdout; no limitsraised or appsourcepatched.

Reports/screenshots contain synthetic names/counts only. `iteration_8/9` are historical intermediate reports; finalJUnit/logs/validationreport supersede harness-only failures. Sourceusesfixedfixturephones solely in isolatedtestDBs, never runtimeuniversalOTPs or reusable revieweraccess. Genuine recordtesting requires separateapproval.