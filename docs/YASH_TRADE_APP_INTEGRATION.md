# Shared integration — canonical reference

The former website-specific enrollment/portal-token schemas are superseded. Do not implement against the old local-OTP + background-token design.

Authoritative app source: [c4ee70d8134625a1a4e04073c43b9460c3c4e40d](https://github.com/amanagarwal1123-ctrl/YashTradeApp/tree/c4ee70d8134625a1a4e04073c43b9460c3c4e40d).

Read at that commit: YASH_SHARED_API_CONTRACT.md, WEBSITE_HANDOFF.md, IDENTITY_EXPORT_CONTRACT.md, PDF_VALIDATION_EVIDENCE.md, RELEASE_READINESS.md, STORAGE_CAPACITY.md and contracts/openapi.shared-v1.json. The website's pinned schema is `/contracts/openapi.shared-v1.json`.

Current website implementation/evidence: `WEBSITE_IMPLEMENTATION_REPORT.md`; route/role/feature inventory: `ADMIN_PARITY_CHECKLIST.md`; readiness/operator actions: `WEBSITE_RELEASE_READINESS.md`; only new precise app/config dependencies: `APP_TEAM_HANDOFF.md`.

Browser → same-origin website BFF → explicitly approved canonical HTTPS/api. Canonical roles/currentstatus/IDs/customerprofile/businessrecords/media remain authoritative. Server-only rotatingtokens and distinctkeypurposes. No deployment/cutover/identitymutation is authorized by these documents.