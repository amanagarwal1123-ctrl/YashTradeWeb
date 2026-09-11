# Narrow app/config follow-up — shared-v1 WEBSITE stage

Pinned implementation **c4ee70d8134625a1a4e04073c43b9460c3c4e40d** is available and was read. Do not resend the old broad app prompt. No change to that app source was made here. This handoff contains only dependencies found during website implementation; unimplemented website controls are listed in `ADMIN_PARITY_CHECKLIST.md`, not assigned to the app team.

## Operational blockers (one coordinated action list)
1. Restore/select an approved isolated canonical staging target: supplied apppreview now404. Confirm DB/test-data isolation and permission before realOTP/records. Appproduction currentlyreports shared-v1/unrecorded instead of earlier v7; record actual deployedSHA and investigate that externalchange. Do not use production as fallback.
2. Provision **distinct matching** ENROLLMENT_INTEGRATION_KEY and STAFF_SERVICE_KEY on website+app privately; appstaffkeyabsent. Configure website CANONICAL_API_BASE_URL ending/api. Website changes do not configure appsettings. No secretvalues needed in chat.
3. Verify ingressheaderbehavior/peerchain on bothsystems. Websitepreview ingressrewritesOrigin to exact clusteralias, guarded with customsame-originheader+CSRF and no wildcard. Configure trustedCIDRs/forwardedclientIP only after exactBFFupstreamtrust; preserve canonicalratelimits.
4. Controlled SMSreceipt, storagewrite/readback and providerlifecycle, private reviewers, realresources/nativeacceptance remain gates. No provider remote deletion; auditreports0. No capacitypurchase/migration authorized.
5. Read-onlyidentityexporttransfer, testedrestorablebackup, exactconflicthash/per-IDownerapproval, admincontinuity and rollback before any coordinatedcutover. Owner9999813334 preservesexistingappID/history; no automatic promotion from website-roleclaims.

## D1 — targeted customer phone correction (optional backend addition)
Existing `POST /auth/phone-change/request` and `/verify` in `shared/auth.py` use the authenticated subject. They do not accept a targetcustomerID or authorize an admin to impersonate thatcustomer. Website refuses `PATCH /customers/{id}` with phone; isolated regression `test_admin_customer_phone_patch_blocked_at_bff` verifies this safety boundary.

If admin-targeted correction is required, define a **separate explicitly authorized, verified, conflict-safe, audited target-ID operation**, preservingID/history/revokingaffectedfamilies. No endpointname/schema is invented here. Until documented/tested, website phone is read-only. Existing self-phone endpoints do not solve this dependency.

## D2 — static customer search shadowed by dynamic profile route
`shared/install.py` includes `people.router` before remaining legacy routes; `people.py` registers `/customers/{uid}`. Legacy `server.py` later registers `/customers/search` for admin/billing rewardlookup. Consequently the literal `search` can be handled as a customerreference rather than the intended staticlookup (and BFFdynamic-roleallowlist must also avoid thiscollision).

Expected: documented GET `/customers/search?q=...` reaches its explicit A/Bauthorizedsearchhandler and returns itscustomerlookupenvelope, never `/customers/{uid}`. Put staticsearch before dynamicroute or publish an unambiguous supportedlookup path. Do not expose an unrestrictedcustomerdirectory to billing. Website currentlysupports explicitcanonical-IDrewardlookup, not a bogussearchcontrol. Reproduced strict XFAIL in `tests/shared_v1/test_bff_followup_core_regressions.py`; final evidence in `evidence/shared-v1/final-junit.xml`.

## D3 — immutable customer-ID paginated enquiry history
`GET /customers/{uid}` returns `queries` and `activity` with `detail_limit` (recent100). `GET /requests` in `shared/queries.py` supports full-datasettextsearch and the supplied queryfilters but **no customer_id filter**. Website labels the cap and links to paginatedphonesearch; this is not guaranteed exact-IDhistory for changed/deleted/legacyphones.

Expected addition if exactcustomerhistory is required: current-role-authorized paginated requestlist scoped by immutablecanonicalcustomerID, using thesameenrichment/permissions/totals and allhistory. Document actualparameter/schema; do not silently ignore an unsupportedcustomer_id. No web-local reconstruction/master is created.

## D4 — deletion outbox consumer can stall after100 acknowledged events
Source: `shared/people.py:302–311`: GET `/integrations/deletions` filters `{type:'account_erased',status:'pending'}` and applies `.limit(100)` without pagination or excluding website acknowledgements. POST `/{event_id}/ack` only adds `website` to acknowledged and does not changependingstatus (otherprovideracksremainpending). After the first100 pendingrecords have websiteacknowledgements, later websitecleanup can become unreachable.

Expected: sameintegration-keyauthorization; stable bounded pagination/cursor OR filter out events alreadyacknowledgedbywebsite, retainingotherproviders' pendingstatus. Acknowledgementmust remain idempotent and consumer-specific, not fakeglobalerasure. Regression scenario: seed101syntheticevents, websiteackfirst100, nextGETmust include101st. Current source cannot guarantee this. Website does not guessglobalstatus or acknowledge unknowncleanup.

## Test-environment note, not an app rollout request
The website test runner installed PyMuPDF1.28.2. Its legacy `fitz` deprecationdiagnostic went tostdout and corrupted the pinned workerJSON, misleadingly surfacingRENDER_RESOURCE_LIMIT. Test fixture sets PYMUPDF_MESSAGE=fd:2; no canonicalsource/limits changed. Keep app's validateddependencyenvironment or independentlyassess this behavior on libraryupgrade. This was not measuredcapacityexhaustion.

## Not backend requests
No new local roles/demo OTPs/reviewer passwords, storage provider change, public CDN cache, unit conversion guesses, second photo library, implicit identity merge or broad app rewrite. Batch image selection, recent rate history, lead summary and companion download are now implemented on the website. The app's legacy product DELETE hard-deletes metadata; the BFF deliberately does not expose it. Safe versioned unpublish and batch soft-delete remain available. Exhaustive verification remains the website team's responsibility.

## Final reproducible dependency evidence
`tests/shared_v1/test_bff_followup_core_regressions.py` contains three **strict XFAIL** cases for D2/D3/D4. They assert desired behavior and reproduce current unmet behavior against the pinned app source; they are not passed integrations. `evidence/shared-v1/FINAL_VALIDATION_REPORT.json` and `test_reports/iteration_10.json` record the results. No canonical source changes were made to make them pass.