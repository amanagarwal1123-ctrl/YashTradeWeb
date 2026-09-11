# Admin parity and endpoint inventory — pinned shared-v1

Scope:116paths in `contracts/openapi.shared-v1.json`, exact app commit c4ee70d8134625a1a4e04073c43b9460c3c4e40d. This is a functional/source audit, not a claim all endpoints were exercised in a browser. Runtime allowlist: `backend/bff/proxy.py`; source roles: app `shared/core.py`, `shared/install.py`, route dependencies in `server.py` and shared modules.

Legend: **I** implemented website flow; **D** exact dependency; **O** explicitly operator-gated/not enabled here; **X** customer/mobile-only or superseded surface, not staff parity. Admin=A, telecaller=T, billing=B. Every upstream action still has canonical bearer permission enforcement in addition to BFF checks.

| Canonical operation(s), without /api | Roles / website equivalent | Status / limits |
|---|---|---|
| POST auth/send-otp, auth/verify-otp; GET auth/me; POST auth/refresh, auth/logout | All auth; only current A/T/B receive website staff session | I — server tokens; no customer /admin |
| PUT auth/profile; auth/phone-change/request, /verify | Authenticated person's own profile/phone only | X — no arbitrary customer phone override; D1 below |
| POST integrations/enrollments; GET integrations/customers/{number} | Enrollment key with verified grant; lookup not a public directory | I — grant persistence; lookup not exposed as browser identity enumeration |
| GET/POST integrations/staff; PATCH/DELETE integrations/staff/{ref}; POST /convert | A Staff directory | I — reason and exact identity conversion, canonical continuity guards |
| POST integrations/staff/{ref}/token | Same-subject bearer + staff key | X — deliberately use ordinary OTP/refresh; no impersonation fallback |
| GET/POST executives; PUT/DELETE executives/{ref} | Canonical legacy alias of staff workflow | I equivalent through canonical staff directory, no separate credential system |
| GET customers; GET/PATCH customers/{uid} | A Customers/list/detail/edit/assignment | I — backend full filters, unknown mobile dates, recent detail caps |
| GET customers/search | Legacy A/B rewards customer search | D2 — prior dynamic route shadows static search; billing currently uses explicit canonical customer ID in rewards |
| GET requests/catalog, requests/staff-options, requests, requests/{rid}/history | A/T/B queue, catalog, names/history | I — all7types; staff name options capped500; D3 customer-ID history filter |
| POST requests; GET requests/my | Customer-originated app enquiry creation / personal queue | X — customer app only; new unassigned rows read by all3website staff roles |
| PATCH requests/{rid}; POST requests/{rid}/claim | A/T permitted assignment/claim/process/reopen | I — version+stable key, B denied |
| GET requests/metrics/summary | A team, T own canonical scope; B denied | I — cohort/throughput, ties/nonzero, event-period daily drilldowns; exhaustive reconciliation tests remaining |
| GET/POST products; PUT products/{pid}; GET/DELETE products/{product_id}; GET categories | A Collections | I create/edit/unpublish/gallery. Legacy product DELETE hard-deletes metadata, so BFF rejects it; safe versioned unpublish is the website equivalent. Category options read-only because no category-write route exists |
| POST products/upload-image; GET files/{path} | A uploads; canonical-authorized private read | I —8MiB/manualJPEG/permanentpaths/private blobs; no second store |
| POST products/bulk | Legacy A batch create without full shared SKU discipline | X replacement: validated single create or reviewed PDF commit. No unsafe bulk bypass |
| GET/POST batches; GET/PUT/DELETE batches/{batch_id}; PATCH /visibility | A Batches | I — create/rename/publish-hide/archive; up to200nonarchived list; no full paginated archive endpoint |
| GET batches/{id}/images; POST /images/delete | A batch media selection | I — bounded20-row pages, private thumbnails, explicit selected-product soft deletion; provider media remains retained |
| POST batches/{id}/upload | Legacy A unstructured batch-photo product creation | X replacement via reviewedPDF/canonical product form; cannot silently bypass required SKU fields |
| POST batches/{id}/import-pdf |410 REVIEWED_IMPORT_REQUIRED | X — never used |
| GET rates/latest, rates/audit; POST rates | A/B staff rates; T denied | I — changed metal only/version conflicts; audit shows latest30events, no lifetime claim |
| GET rates/history | Canonical history API | I — bounded recent snapshot view. Actual legacy `days` parameter limits records to days×3, NOT a real date filter; UI labels counts honestly |
| GET/POST rate-list; PUT/DELETE rate-list/{sid} | A/B slab management | I — unitreview/structuredlabour/versionDELETE; T write denied |
| GET pdf-template/capabilities, sample.pdf, authoring.json; POST export | A/owningadmin PDF authoring/sample | I — form+photo_path/privatePDF; sample and companion JSON downloads verified |
| POST pdf-upload/init; POST {jid}/chunk,complete,pause,resume,cancel; GET status | A/owningadmin reviewed transfer | I — no direct importer; hash/size/chunk reconciliation; savedowner-scoped minimal metadata |
| GET pdf-upload/{jid}/preview, rows/{rid}/image, pages/{page}/image; PATCH rows/{rid} | A/owningadmin review | I — private pagination, fields, cropgeometry, versions, exclusions, duplicates |
| POST pdf-upload/{jid}/commit | A/owningadmin | I hiddendefault/publication/partial flags+rowoutcomes; browserhidden3verified; more permutations remain |
| GET admin/media/usage; POST admin/media/lifecycle-audit | A media | I — actualgroups/trackedbytes/objects/incompleteinventory;0remote deletions |
| GET admin/sms/diagnostics; POST admin/sms/test; POST admin/sms/logs/{id}/recheck | Canonical A operations | O — not exposed in website; app owns SMS. No provider dispatch/recheck without isolation/operatorapproval |
| GET telecaller/customers, telecaller/summary, customers/{id}/activity; POST customers/{id}/action | A/T Lead CRM separate from enquiries | I actions/search/status/recent100activity and summary. Legacy lead-summary day uses UTC and is labelled UTC, not confused with IST enquiry metrics |
| GET/POST rewards/config; POST rewards/credit,deduct; GET rewards/customer/{id} | A settings; A/B transactions | I — explicit confirmations; recent100history, no manufactured lifetime totals; D2 search |
| GET rewards/wallet, rewards/history; POST rewards/redeem | Customer app wallet | X — no customer wallet on enrollment website |
| GET/POST about; DELETE about/{section} | A content | I |
| GET/POST schemes,brands,showroom,exhibitions; PUT/DELETE each/{id} | A content | I forms and image hosting via canonical upload; some legacy lists active-only/capped; inactive-history parity unproven |
| GET/POST knowledge; GET knowledge/{article_id}; GET/POST stories | A create / canonical public read | I list/create; no update/delete routes exist in contract; no fake edit controls |
| GET/POST banners; GET banners/all; PUT/DELETE banners/{id}; POST banners/upload | A banners | I metadata/upload/canonicaltarget fields; remaining CRUD browser coverage required |
| GET analytics/dashboard; POST analytics/event | A counts; event is app usage | I dashboard; X event publication from enrollment to avoid manufacturing mobile activity |
| POST auth/delete-account/request, /confirm | Customer bearer self-deletion in app | X; website uses deletion-purpose grant routes below |
| DELETE integrations/customers/{number}; GET integrations/deletions; POST /{event_id}/ack | Enrollment-key verified deletion / websiteconsumer | I conservative cleanup before ack; D4 cappedpending-outbox starvation; linked historicalcleanup requires private approval |
| GET admin/deletion-requests; GET admin/ai/reports | A privacy/moderation reads | I boundedlists; no global-erasure claim |
| POST ai/reports; POST ai/chat; GET ai/suggestions | Existing separate customer assistant | X — not reintroducing removed AI Try-On |
| POST wishlist/toggle; GET wishlist; POST cart/add,cart/submit; GET cart,cart/count,cart/orders; DELETE cart/{id} | Customer commerce app | X — enrollment website has no customer catalog/cart workflow |
| GET health | Nonsecret build/presence metadata | I — ownbuild separate pinnedcontract; no signingkeys |

## Remaining parity and validation
The core website equivalents are implemented, including batch image selection, recent rate history, lead summary and companion download. Full acceptance is **not100%**: targeted phone correction, exact-ID full customer enquiry history, billing name/phone lookup, and deletion backlog handling depend on canonical changes below. Provider SMS administration remains an operator-only gate, not a nonfunctional website control. Canonical hard-delete is deliberately unavailable; safe unpublish and batch soft-delete retain history. All auxiliary CRUD permutations and large-data/native/provider acceptance still require verification; implemented is not synonymous with tested.

## Necessary backend/config dependencies only
See `APP_TEAM_HANDOFF.md`: D1 admin-targeted verified phone correction absent; D2 static customer search shadowing; D3 immutable-ID full customer query filter absent; D4 website deletion backlog pagination/unacknowledged filtering absent; provider deletion and live isolation/key/capacity are separate operational gates. No request to resend or redo the previous broad app implementation.