> Dated document. The single current owner checklist is `PRODUCTION_OPERATOR_HANDOFF.md`; contract pin is now app `9596a5578a61bb1fb187e63345b7f93eda95bc9c`.

# WEBSITE release readiness — not a cutover approval

As of11September2026, this build is suitable for **website code review with disclosed unfinished parity/validation**. It is **NOT ready for live cross-system acceptance**, **NOT cutover-ready**, and does not prove native store readiness.

## Build identities (separate systems)
| Surface | Last read-only result |
|---|---|
| This website preview | website-shared-v1-staging-2026-09-11; own commit unrecorded; integration_ready=false |
| App contract source | c4ee70d8134625a1a4e04073c43b9460c3c4e40d on GitHub; exact pinned source read |
| App preview pagination-ui-boost | Initiallyshared-v1-followup-2026-09-11/unrecorded with matching116-path schema and staffkeyabsent; latest16:07UTC404 |
| App production yash-tryon-test.emergent.host | shared-v1-followup-2026-09-11/unrecorded; schemaequals116-pathpin; staffkeyfalse. This differs from the supplied older v7 observation and was not changed by us |
| Website production register.yashsilver.com |2026.09.10-login-v10 |
| Website production yash-register.emergent.host |2026.09.10-login-v10 |

Protected app PDF capabilities returned401 without login. Configured64MiB/200page/1MiB limits were read from pinned source and exercised in isolated tests, not authorized live provider acceptance. Never treat schema equality as commit identity/isolation.

## Configuration presence and minimum operator actions

| Name | Website staging now | Required action |
|---|---|---|
| CANONICAL_API_BASE_URL |Absent |Explicit approved, isolated HTTPS target ending `/api`; app preview currently404; do not fall back to production |
| ENROLLMENT_INTEGRATION_KEY |Absent |Provision same value privately on both approved staging systems; deliberate migration from old LIVE_INTEGRATION_KEY, which new runtime ignores |
| STAFF_SERVICE_KEY |Absent |Provision a separate strong value privately on BOTH systems; app's checkedhealthalsoabsent. Must differ from enrollmentkey |
| SESSION_SECRET |Present, websiteowned |Keep private; never import appJWT_SECRET |
| BUILD_COMMIT |Absent |After website implementation commit exists, record its actual SHA, not baseline/appSHA |
| BFF_ALLOWED_ORIGINS |Present |Exact currentwebsitepreview. Replace/set approved websiteorigin list for coordinated cutover |
| BFF_INGRESS_ORIGINS |Present |Exact observed preview ingressalias only. Alias requires browser X-Website-Origin + CSRF/Fetch-Metadata; no wildcard/missing-Origin fallback |
| TRUSTED_INGRESS_CIDRS |Absent |Verify actual peer chain and configure trustedCIDRs. Do not trust arbitraryXFF |
| FORWARD_CANONICAL_CLIENT_IP |Disabled |Only enable after canonical proxy trust is configured for exactBFFpeer; absent trust currentlymayaggregate legitimateusersunderoneIP |
| ANDROID_APP_URL / IOS_APP_URL |Legacy unverified values retained but ignored |Genuine releases plus ANDROID_RELEASE_VERIFIED/IOS_RELEASE_VERIFIED=true only afterverification; unavailablelabelsnow |
| IDENTITY_EXPORT_READONLY_MONGO_URL / IDENTITY_EXPORT_DIR |Not provisioned |Read-only websiteDB credential/private0700outside-repo path, approvedrecipient/retention; no chatsecrets |

The website never uses app JWT_SECRET, appMongo access, MSG91 secrets or provider storage credentials. Old website environment keys are retained privately but ignored by migrated flows, not rotated or sent upstream. No setting in this website configures the app's half.

**Matching STAFF_SERVICE_KEY is NOT configured and real canonical portal login is NOT verified.** Configure secrets via the authorized private settings workflow, never ordinary chat/publicfiles. Staging origin changes were nonsecret and did not affect production.

## Verification gates
- [x] Static build and Pythoncompile; inspect final build log.
- [x] Final27passed (26backend +1multi-flow browser),0unexpected failures,0skipped;3strict XFAIL canonicaldependenciesD2/D3/D4. See finalJUnit/report, not earlier intermediate counts.
- [x] Authenticated browser journey against realReact+BFF+canonicalASGI, with realFilebytes, OTPcapture, roles, crops and hiddenPDFcommit after relayfix. See finalreport for formexport/result refinements.
- [ ] Exhaustive acceptance permutations: exact date-boundary cases; tied/all-zero winners and every metric drilldown; all roles/continuity races; every auxiliary CRUD; PDF wrong-file/resume/restart/owner/duplicate/partial/publication permutations. Basic customer pagination/filters, metrics/reopen, deletion/no-resurrection and units/versioning passed. D4 deletion backlog and historical linkage cleanup remain blocked. Tests not run remain unverified.
- [ ] Exact website commit/build provenance + remote synchronization and independentreview. GitHub main was checked and still points to baseline bf7808e27129de2b6ec8a5d521c1705f44fa7725; this implementation is not yet synced.
- [ ] Isolated shared staging app restored/approved; private two-sided keys; ingress end-to-endclientIP/Origin and no sharedreviewidentity.
- [ ] Controlled realSMSdispatch AND receipt, fresh appOTP/mobilelogin timestamps, canonical cross-client records/counts, storagewrite/readback, real providerfailurepaths.
- [ ] Private identityexport/validated counts + testedrestorablebackup + owner approvalof exactconflictreporthash and per-ID mappings. Reconciliation remainsDRYRUN; no promote/merge/delete/seed authorized.
- [ ] Preserve ownerexistingcanonicalID/history and usableadmin continuity at approvedcutover; oldsessions revoked deliberately; testedrollback; maintenancewindow; both websitedomains checked.
- [ ] NativeAndroid/iOSphysicaldevice/reviewer/storeacceptance. Browserdeviceemulation is not nativeproof.
- [ ] Actual providerallowance/bandwidth/compute/backups/costs/deletion.2,000,000,000bytes/10,000objects are appguards only.10,000photos need≥20,000objects; no capacitypurchase/limitincrease performed.
- [ ] Complete adminparity gaps and backenddependencies in companionchecklist/handoff.

## Identity count-only snapshot
Only read-only COUNT operations ran against the existing website snapshot: customers0; staff_users2; admin_sessions0; otp_challenges0; deletion_requests2; app_settings0. The2deletion references have stored live_user_id fields; identity collections have0stored canonical links. New bff_sessions/drafts/cache/outbox contain0records at final count. Publishable count-only manifest: `evidence/shared-v1/IDENTITY_COUNT_MANIFEST.json`. No genuine record was exported/modified. Counts are not a production backup/export or reconciliation proof. Private export tooling is ready; approved read-only credentials/transfer remain pending.

## Release decision
Do not activate this newcontract under the oldwebsite unexpectedly. The appproductionbuild changed outside thistask: investigate provenance/compatibility independently before approval. No real/provider/native signoff and no automatic productiontargetfallback. Next step is code review + completion of stated parity/validation, then separatelyauthorized controlledcross-systemtesting; only afterwards propose cutover.