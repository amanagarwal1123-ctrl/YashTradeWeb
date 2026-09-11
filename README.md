# Yash Ornaments — customer enrollment and staff console

Website staging implementation of the canonical YashTradeApp shared-v1 contract, pinned to app commit `c4ee70d8134625a1a4e04073c43b9460c3c4e40d`.

- Public two-step enrollment; staff-only `/admin` for admin, telecaller and billing_executive.
- React website → same-origin FastAPI BFF → explicitly configured canonical API. Mongo holds website sessions/minimal drafts, not a competing customer/product master.
- Canonical purpose-bound OTP, server-only rotating tokens, opaque secure cookies, current-role checks, private canonical media and reviewed PDF import.
- No demo OTPs/password login, local role grants, automatic production fallback or duplicate photo store.

## Review deliverables
1. `WEBSITE_IMPLEMENTATION_REPORT.md`
2. `ADMIN_PARITY_CHECKLIST.md`
3. `WEBSITE_RELEASE_READINESS.md`
4. `APP_TEAM_HANDOFF.md`
5. `evidence/shared-v1/FINAL_VALIDATION_REPORT.json`, JUnit/logs and synthetic screenshots
6. `tests/shared_v1/README.md` for reproducible isolated tests

Current status: code-review stage, not approved for live cross-system testing or cutover. Private two-sided keys, verified staging isolation, canonical dependencies, provider/native/resource acceptance and identity reconciliation approval remain gates. No production changes were made by this task.

Never place credentials, private identity exports, backups or real customer screenshots in this repository. Export tooling is manually invoked with a dedicated read-only credential and writes outside the repository.