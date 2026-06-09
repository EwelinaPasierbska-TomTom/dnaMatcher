---
change_id: testing-api-security
title: API security and data integrity — Phase 2 of test-plan rollout
status: implemented
created: 2026-06-08
updated: 2026-06-09
archived_at: null
---

## Notes

Rollout Phase 2 of context/foundation/test-plan.md: "API security and data integrity".
Risks covered: #3 (IDOR — authenticated user A reads/modifies user B's data via
route layer) and #4 (raw DNA persistence — a processing error or future route change
accidentally writes raw CSV bytes or allele strings to the database).

Risk response intent:
- Risk #3: call GET/POST/DELETE on user B's resource authenticated as user A; assert
  403 or 404 at the route layer. Existing tests cover DELETE wrong-user but not GET
  or POST cross-user access — those gaps must be closed here.
- Risk #4: after POST /api/comparisons succeeds, assert that the Supabase mock insert
  calls contain only the expected column schema — no raw CSV bytes, no raw allele
  strings outside the segment result schema. Test the error paths too.
Test types: route integration tests with mocked Supabase + mock call assertions.
Pattern: httpx + FastAPI TestClient with dependency_overrides for Supabase + auth mocks.
