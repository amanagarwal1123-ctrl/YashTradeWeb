# Canonical phone-OTP incident regression plan

No email/password auth, local role allowlists, OTP bypass, admin seeding or real SMS.
Use `/app/tests/shared_v1` fixtures with random separate website/canonical Mongo DBs,
actual pinned canonical source and a captured SMS transport. See
`memory/test_credentials.md` for synthetic fixtures only.

Reproduce production configuration states without touching production:
- All3new settings absent: health/readiness503; liveness200; all verification flows
  unavailable; zero calls to canonical send/verify and no local sessions.
- Valid URL and enrollment key but no staff key on website or app: enrollment and
  deletion configured independently; staff denied for admin/telecaller/billing.
- Wrong/reused keys and upstream outage: no privileged local session or repeated SMS.
- Correct distinct keys on both isolated sides: all3staff roles get canonical IDs and
  workspace routing. Customer denied/admin, inactive/demoted/current-role checks kept.
- Both production-like website origins and the preview origin explicitly allowed in
  TEST settings; reject unknown origins, missing/incorrect CSRF and cross-site posts.
  Use the existing XHR multipart bridge for full browser regression, not mocked UI JSON.
- Neutral blocked-service state on mobile/desktop, disabled unavailable submit controls,
  retained form values, Checkagain recovery and no misleading staging-API error.
- Readiness only GETs canonical `/health`; it never tests OTPs, creates records, sends
  credentials to health/external origins, or claims key-matching/live-provider proof.
- Keep known canonical D2/D3/D4 strict XFAIL regressions separate from this auth repair.

The live production fix remains blocked on private settings access. Tests must NOT
change genuine records or treat the actual production app as a test target.