# YashTradeWeb — WEBSITE staging implementation

Date: 11 September 2026. This report describes WEBSITE work, not the app's historical54-test report.

## Provenance and scope
- Website branch: `main`. Starting/reviewed HEAD: `bf7808e27129de2b6ec8a5d521c1705f44fa7725`. That is **NOT** this implementation's SHA. Final read-only GitHub API check returned200 and the same baselineSHA on remote main: **these implementation changes are not synced to GitHub**. No new implementation commit/link exists at verification. Git write actions were not performed.
- Website build: `website-shared-v1-staging-2026-09-11`; `BUILD_COMMIT` is absent and health truthfully returns `unrecorded`.
- Website preview: https://yash-scheme-hub.preview.emergentagent.com
- App contract pinned to **c4ee70d8134625a1a4e04073c43b9460c3c4e40d**, not3079699 and not a claim about deployed source.
- Fetched the exact app archive from GitHub and read all six requested Markdown documents, OpenAPI, relevant `backend/shared`, catalog fixtures/generator and follow-up test reports. Historical statements about unavailable GitHub commits were not treated as current blockers.
- Pinned OpenAPI copied to `contracts/openapi.shared-v1.json`:116paths; file SHA256 `e70f4703fcc8ce95b9ba10fe619557749d2a8db54b653a2b7ba5483c48a1e24f`.
- No production identity, secrets, storage/provider, capacity, service deployment or database reconciliation changes were made. Website-only staging code and nonsecret origin settings changed.

## Implemented

### Identity, sessions and enrollment
Replaced the2,435-line legacy runtime with small FastAPI BFF modules. Removed runtime website OTP/SMS dispatch, background app unlocking, local role allowlists/seeds, password bypass, old token minting/sync adapters and obsolete demo credential hints. Existing website historical records remain untouched; pre-v1 sessions are not accepted by the new runtime.

Canonical portal OTP, purpose/channel/key separation, `/auth/me` before new random website cookie, live role/status on each protected action, executive→telecaller canonical adapter, staff-only routing. Browser gets no canonical access/refresh tokens. Opaque session IDs are SHA256-indexed in Mongo. Secure/HttpOnly/SameSite Lax `__Host-` cookies, website-owned CSRF HMAC, exact origins, fixation prevention,2-hour idle and30-day family cap, persistent CAS refresh coordination across workers, fail-closed refresh ambiguity/reuse, no automatic mutation replay, local logout even when canonical revocation is uncertain.

Public two-step Yash Ornaments page retained. All four profile fields and explicit consent required on both surfaces; purpose-bound challenge metadata drives4-digit OTP/expiry/resend UI. Leading zeros stay strings. Verification grants and stable logical submission/idempotency payload remain server-side. Step2 appears only after canonical persistence. Uncertain writes retry the same payload; no second SMS automatically. Expired grants require renewed verification. No fake IDs/passwords/store URLs. Unverified Android/iOS releases show unavailable.

### Canonical administration
- Customers: canonical full-dataset pages/search/account/mobile-login/onboarding/assignment/IST dates, row numbers, canonical details, labelled recent-history limits, profile/status/assignment PATCH and named active telecallers. Targeted phone edits rejected, not impersonated. See parity document for exact full-query-detail limitation.
- Staff: canonical create/idempotent replay, PATCH edits, soft disable, explicit customer conversion with reason/exact-ID confirmation; no unrestricted deletion/promotion. Canonical last-admin/current-role controls retained.
- Queries: every catalog type, All/Mine/Unassigned, server pagination/counts/search/date/age/type/status/assignee/resolver/sort, personal/team metrics and event-period drilldowns. Notes/history/resolver attribution, optimistic versions, stable operation keys and deliberate conflict reload. Billing can read all types/history but cannot mutate queries or read team metrics. Leads remain separate. Queues refresh on focus/visibility and approximately15seconds while visible.
- Rates: both metals; physical/MCX INR/g and dollar USD/troy_oz; changed fields only; canonical version conflicts and audit. Slabs preserve original labour display and ambiguous historical units; structured INR kg/10g/piece changes and versioned soft delete.
- Catalog: Silver-default Silver/Gold/Diamond filters; bounded40-row stable pages, indexed words/exact `product_code`, virtualized thumbnail-first list. Required create fields, hidden drafts, changed-only edits, gallery additions/removals preserving original scans, diamond setting/stone data. No second product or photo master.
- Supporting canonical screens: dashboard, lead CRM, batches, banners, reward/billing operations, app content, media usage and privacy/settings. Remaining limitations are listed rather than disguised with local records.

### Media and PDF
Bounded multipart uploads/private streamed downloads, no-store preserved, exact canonical media path rewriting (no double `/api`), private Blob images revoked on cleanup, no credential forwarding to legacy external hosts and no browser-selected proxy destination. Lifecycle audit displays audited/zero deletions/provider unsupported, not freed space. Tracked counts/bytes/groups/high watermark/incomplete inventory displayed; application guards are not provider entitlement.

Canonical sample PDF and form-based authoring through owner upload `storage_path`→`photo_path`→`/pdf-template/export`; exports do not publish products. Limits64MiB/200pages/1MiB chunks and20products/32MiB input photos displayed as configured limits, not proven production capacity.

Reviewed import: browser incremental SHA256; same-file identity + acknowledged chunks; resume metadata scoped to canonical owner; separate byte/page/product progress; explicit pause/resume/cancel; actual selected file bytes; paginated private previews; labelled fields/exclusions/duplicate policy; versioned corrections; responsive drag/resize square mapped to unrotated PDF points. Hidden-by-default commit, deliberate publication/partial flags, recovered outcome counts/rows. Closing UI is not cancel/restart. Canonical `error` phase is resumable. Legacy direct PDF import is not used.

### Deletion and identity safety
Canonical deletion-purpose challenge/grant and key, matching local session/draft cleanup and conservative event acknowledgement. Unknown pre-ID drafts or historical linkage records block acknowledgements instead of falsely claiming erasure. Privacy text acknowledges pending provider/backup retention and unsupported object deletion. No outbox can recreate tombstoned customers; no canonical master writes outside supported APIs.

`tools/export_identity_readonly.py` prepares the minimum private UTF8array, strict field projection, source-format phones, stored canonical links only, unknown evidence null,0600files outside repository in0700directory and count-only reference manifest. It requires an explicitly provisioned read-only credential; **actual export and reconciliation were not run**.

## Final verification and honest boundaries
- **Final combined suite:27passed,0unexpected failures,0skipped,3strict XFAIL dependencies**. This comprises26passing backend tests and1passing authenticated multi-flow browser scenario. Source: testing agent iteration10; finalJUnit/logs are authoritative. Main's final rerun retained the same counts after strengthening seven-type creation to use actual canonical customer APIs and adding the recent rate-history view.
- Backend isolated contract suite:18/18passed in testing agent iteration9, including split-login/session/CAS, ingress-origin fix, canonical grant enrollment/replay, billing restrictions, query claim conflict, real image multipart+JPEG/thumbnail semantics and sample/chunk acknowledgement.
- Authenticated browser journey subsequently passed after correcting the TEST-ONLY XHR multipart relay and isolating PyMuPDF1.28 diagnostic stdout. The same website→BFF→pinned canonical source ran with isolated Mongo and SMS/storage transports: public enrollment Step2, admin Customers/Queries/Rates, product creation with real photo bytes, sample download, four actual PDF chunks, three products/two in one page/all metals, title+crop edits, hidden commit, telecaller queue and billing queue/rates. Responsive overflow assertions at320/768/1024/1440. Final rerun/evidence may extend this baseline; authoritative counts are the final JUnit/report files.
- `evidence/shared-v1/backend-junit.xml`, `backend-tests.log`, `browser-junit.xml`, `browser-tests.log`, `authenticated-browser-journeys-events.json`, screenshots and final validation report.
- TEST DOUBLES: canonical network uses ASGI in-process transport; SMS is captured rather than dispatched; object storage is an isolated byte store; Mongo databases are fresh synthetic `website_test_*` and `canonical_test_*`. These are not mocked frontend success responses. No mock-success mode exists in the running preview.
- Tests do NOT prove real SMS delivery, cloud storage writes/erasure, production load, review isolation, multiple actual server process kills or native Android/iOS acceptance. Two BFF app instances sharing Mongo test the CAS protocol, not a cloud chaos exercise.
- Further focused backend tests passed for >20customer pagination/search/assignment/basic IST date forwarding, seven actual customer-created enquiry types across allthree staffqueues, older-enquiry resolution/reopen/history/idempotency/metrics, untouched gold/versioned rates and slab units/delete, verified deletion/no-resurrection/media audit and synthetic identity-export projection. Browser also passed rate/slab saves, batch image panel, lead summary, companion JSON download, PDF form export and no publication on export.
- Full exhaustive acceptance matrix is **not yet claimed**: exact date-boundary permutations, tied/all-zero metrics and every daily drilldown denominator, staff continuity races, every auxiliary CRUD, partial/duplicate/explicit-publication/restart PDF permutations and provider failure/load remain untested. The deletion-backlog failure is reproduced as D4, not concealed. Untested is not marked passed.

## Read-only build recheck
At task start app production already reported `shared-v1-followup-2026-09-11` (unrecorded commit), unlike the supplied earlier v7 observation. At16:07UTC it still did, with `STAFF_SERVICE_KEY:false`; its116-path OpenAPI exactly matched the pinned schema. Protected capabilities read without credentials returned401 (expected, not a capability success test).

App preview initially returned the shared-v1 build and matching schema; by final16:07UTC check it returned404. No other target was substituted. Both website production domains independently remain `2026.09.10-login-v10`. These external changes were observed, not performed by this task. Schema equality does not prove running source identity or isolation.

## Status
**Ready for website code review with explicit remaining validation/features in the checklist. Not ready for live controlled cross-system testing until target/isolation/two-sided keys are provided. Not ready for separately approved cutover.** No real canonical portal login is claimed.