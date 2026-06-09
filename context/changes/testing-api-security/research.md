---
date: 2026-06-08T21:18:13+00:00
researcher: claude-sonnet-4-6
git_commit: 9624fe6
branch: main
repository: dnaMatcher
topic: "API security and data integrity — IDOR at route layer and raw DNA persistence"
tags: [research, api-security, idor, supabase, dna-persistence, fastapi]
status: complete
last_updated: 2026-06-08
last_updated_by: claude-sonnet-4-6
---

# Research: API Security and Data Integrity

**Date**: 2026-06-08T21:18:13+00:00
**Researcher**: claude-sonnet-4-6
**Git Commit**: 9624fe6
**Branch**: main
**Repository**: dnaMatcher

## Research Question

Phase 2 of the test-plan rollout covers two risks:
- **Risk #3 (IDOR)**: Authenticated user A reads or modifies user B's comparisons or annotations via the API route layer.
- **Risk #4 (raw DNA persistence)**: A processing error or future route change accidentally persists raw CSV bytes or allele data to the database.

Research goals:
1. Map every route that handles comparisons/annotations/ancestors — which check ownership, which don't.
2. Trace the full comparison upload path to determine what Supabase writes and whether raw bytes or allele strings can reach them.
3. Identify what test infrastructure already exists so Phase 2 tests can reuse it.

---

## Summary

**Risk #3 (IDOR):** The route layer is more fully protected than the original test-plan risk brief assumed. Every resource route performs an explicit `.eq("user_id", str(current_user.id))` filter in its Supabase query — returning 404 (not 403) when the row belongs to another user. Supabase RLS policies provide a second enforcement layer. The only gap found is a business-logic inconsistency in `POST /comparisons/{comparison_id}/annotations`: it verifies that `profile_id` belongs to the requesting user but does not verify that `profile_id` belongs to the specified comparison. This is not a cross-user IDOR but it is a logic defect worth a test.

The test gap identified in the risk brief ("only DELETE is tested for wrong-user") is real in a different sense: most existing tests mock the DB to return the happy-path data. There are no tests that assert the 404 behavior by mocking an empty DB result (simulating a wrong-user request). These tests are still worth writing — they pin the `.eq("user_id", ...)` guard in place so a future refactor that removes it will fail tests, not just fail silently in production.

**Risk #4 (raw DNA persistence):** The current implementation strictly respects the AGENTS.md privacy rule. Raw bytes are explicitly deleted (`del content`) before the first DB write. The `Segment` dataclass has no allele fields — alleles are consumed inside `getSnpMachting()` and discarded. All error paths run only DELETE cleanups, never additional inserts. There are no Supabase Storage or S3 writes anywhere in the codebase.

However, a **latent refactor risk** exists: the `parsed` list (holding `SNPRecord` objects with `.allele1`/`.allele2` fields) remains in scope during all three DB insert calls. The current code never passes those fields to a write dict, but there is no type-level guard preventing a future developer from accidentally doing so. Tests that assert on Supabase mock call arguments are the right guard — they will catch any new column added to a write dict that contains raw allele data.

---

## Detailed Findings

### Route Inventory and Ownership Checks

**Authentication mechanism** (`src/auth/dependencies.py:16–48`)  
All protected routes declare `Depends(get_current_user)`. This dependency extracts the Bearer JWT, calls `client.auth.get_user()` to validate it server-side, and returns a `CurrentUser(id: UUID, email: str, access_token: str)`. There is no global auth middleware — protection is per-route via the dependency declaration.

**Ownership enforcement pattern** used on every resource route:
```python
.eq("user_id", str(current_user.id))   # appended to every Supabase query
```
When this filter excludes the row (belongs to another user), the result set is empty and the route raises `HTTPException(status_code=404)`. The choice of 404 over 403 prevents resource-existence enumeration.

**Complete route inventory:**

| Route | File:line | Auth | Ownership check | Verdict |
|-------|-----------|------|-----------------|---------|
| GET /me | me.py:10 | ✓ | returns current_user | secure |
| POST /comparisons | comparisons.py:148 | ✓ | writes `user_id` on insert | secure |
| GET /comparisons | comparisons.py:291 | ✓ | `.eq("user_id")` at :300 | secure |
| GET /comparisons/{id} | comparisons.py:326 | ✓ | `.eq("user_id")` at :337 | secure |
| DELETE /comparisons/{id} | comparisons.py:407 | ✓ | `.eq("user_id")` at :418 | secure |
| GET /comparisons/{id}/annotations | annotations.py:67 | ✓ | verifies comparison `.eq("user_id")` at :82 | secure |
| POST /comparisons/{id}/annotations | annotations.py:101 | ✓ | verifies profile `.eq("user_id")` at :117; **no comparison ownership check** | logic gap (see below) |
| DELETE /annotations/{id} | annotations.py:144 | ✓ | `.eq("user_id")` at :156 | secure |
| GET /ancestors | ancestors.py:50 | ✓ | `.eq("user_id")` at :59 | secure |
| POST /ancestors | ancestors.py:66 | ✓ | writes `user_id` at :78 | secure |
| PUT /ancestors/{id} | ancestors.py:96 | ✓ | `.eq("user_id")` at :109 | secure |
| DELETE /ancestors/{id} | ancestors.py:123 | ✓ | `.eq("user_id")` at :134 | secure |
| GET /health | main.py:34 | ✗ | N/A — public | intentional |
| GET /{path:path} | main.py:50 | ✗ | N/A — SPA serve | intentional |

**Logic gap — POST /comparisons/{comparison_id}/annotations (annotations.py:101–141):**  
The handler verifies that `body.profile_id` belongs to the requesting user (line 117) but never verifies that `profile_id` is one of the profiles in the specified comparison. An authenticated user could POST their own `profile_id` to a `comparison_id` that belongs to them but that doesn't contain that profile, silently associating an annotation with the wrong comparison. This is not a cross-user IDOR — the requesting user owns both resources — but it is a business logic defect. Supabase RLS does not protect against this because `user_id` is correct. Worth a dedicated test.

**Defense in depth — Supabase RLS** (`supabase/migrations/001_initial_schema.sql:112–180`):  
All four tables (`dna_profiles`, `comparisons`, `comparison_results`, `ancestor_annotations`) have RLS enabled. All policies require `auth.uid() = user_id` (or for `comparison_results`, that the parent comparison belongs to `auth.uid()`). The FastAPI ownership checks and the RLS policies are independent — either layer alone would prevent cross-user access. Both must regress simultaneously for an IDOR to succeed.

### Comparison Upload Write Path (Risk #4 Deep Dive)

**Route:** `POST /api/comparisons` (`src/routers/comparisons.py:148–288`)  
**Input:** multipart/form-data — `name`, `person_names[]`, `files[]` (CSV uploads)

**Phase A — Parse and immediately discard raw bytes (lines 169–182):**
```python
content = await f.read(_MAX_CSV_BYTES + 1)
parsed.append(parse_myheritage_csv(content))
del content   # explicit deletion before loop continues
```
`content` (raw `bytes`) is deleted at line 182. The first DB write is at line 195. There is no code path between these two points that touches a DB write with `content` in scope.

**Phase B — `dna_profiles` insert (lines 187–197):**
```python
profile_rows = [{
    "user_id": str(current_user.id),
    "name": person_names[i],
    "original_filename": files[i].filename or f"profile_{i + 1}.csv",
}]
```
Columns written: `user_id`, `name`, `original_filename`. No CSV bytes. No allele strings. `original_filename` is the client-supplied filename string (e.g. `"mamaSample.csv"`), not file content.

**Phase C — `comparisons` insert (lines 200–218):**
```python
{
    "user_id": str(current_user.id),
    "name": name,                   # user-supplied label string
    "profile_ids": profile_ids,     # list[UUID str]
}
```
No CSV bytes. No alleles.

**Phase D — `comparison_results` insert (lines 221–271):**  
`_segment_to_row()` at lines 78–94 maps a `Segment` object to a row dict:
```python
{
    "comparison_id": str,
    "chromosome": str,        # e.g. "1", "X"
    "start_position": int,
    "end_position": int,
    "snp_count": int,
    "classification": str,    # "full_match"|"half_match"|"no_match"
    "start_cm": float|None,
    "end_cm": float|None,
    "length_bp": int,
    "length_cm": float|None,
    "density": float|None,
    "pair_profile_ids": list[str],
}
```
The `Segment` dataclass (`src/dna/models.py:13–24`) has no allele fields. Alleles are consumed inside `getSnpMachting()` in `segment_matcher.py`, which returns only a classification string (`"full"/"half"/"none"`). That classification is transformed to `"full_match"|"half_match"|"no_match"` via `_MATCH_TYPE_TO_DB` and stored. The allele characters are discarded at the point of comparison, long before the segment list reaches Phase D.

**Error paths — what gets written on failure:**

| Error scenario | What happens | Any new write? |
|---------------|-------------|---------------|
| Parse error on CSV (line 180) | `HTTPException(400)` raised before first insert | No |
| `dna_profiles` insert fails (lines 212–217) | DELETE the profile rows just inserted, then `HTTPException(500)` | No new rows |
| Zero segments produced (lines 258–268) | DELETE comparisons + dna_profiles rows, then `HTTPException(400)` | No new rows |

No `finally` block, no error-logging sink, no path that writes raw data on failure.

**Latent refactor risk:**  
`parsed` (a `list[list[SNPRecord]]`, where `SNPRecord` has `.allele1: str` and `.allele2: str` fields) lives in scope from line 170 through at least line 245 — spanning all three insert calls. The current code never references `parsed[i].allele1` in any insert dict. But there is no type-level restriction (e.g., a separate DTO type) that would prevent a future developer from accidentally doing so. A test that asserts on Supabase mock call arguments will catch this if it ever happens.

**Storage writes:**  
None. No Supabase Storage bucket, no S3, no filesystem writes for CSV data exist anywhere in the Python codebase.

### Existing Test Infrastructure

**Test files for routes** (all use `fastapi.testclient.TestClient`):
- `tests/test_auth.py` — covers `/health` (unauthenticated) and `/api/me` (authenticated)
- `tests/test_cors.py` — CORS preflight for `/api/me`
- `tests/test_comparisons_api.py` — POST and GET `/api/comparisons`
- `tests/test_ancestors_api.py` — GET/POST/PUT/DELETE `/api/ancestors`; includes `test_delete_wrong_user_ancestor_returns_404()`
- `tests/test_annotations_api.py` — GET/POST/DELETE for annotations routes

**Two-dependency override pattern** (established across all route test files):
```python
app.dependency_overrides[get_current_user] = lambda: FAKE_USER
app.dependency_overrides[get_supabase_client] = lambda: supabase_mock
```
`conftest.py:8–11` provides an autouse fixture that clears `app.dependency_overrides` after each test.

**Mock user constant** (replicated in each test file; not yet in a shared fixture):
```python
FAKE_USER = CurrentUser(
    id=UUID("00000000-0000-0000-0000-000000000001"),
    email="test@example.com",
    access_token="fake-token",
)
```

**Supabase mock builder pattern** (most composable version in `tests/test_ancestors_api.py:28–88`):
```python
def _make_db_mock(**table_overrides):   # line 28
    ...                                 # returns MagicMock with chained Supabase call shape

def _anc_delete_table(found: bool):    # line 63
    m = MagicMock()
    m.delete.return_value.eq.return_value.eq.return_value.execute.return_value.data = \
        [ANCESTOR_ROW] if found else []
    return m
```
The pattern in `test_annotations_api.py` is similar. The monolithic `_make_supabase_mock()` in `test_comparisons_api.py:30–97` is less reusable.

**Wrong-user test pattern** (from `tests/test_ancestors_api.py:134–142`):  
Simulates wrong-user by returning an empty DB response (what happens when `.eq("user_id")` filters out the row):
```python
def test_delete_wrong_user_ancestor_returns_404() -> None:
    supabase_mock = _make_db_mock(ancestors=_anc_delete_table(found=False))
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock
    client = TestClient(app)
    response = client.delete(f"/api/ancestors/{ANCESTOR_ID}")
    assert response.status_code == 404
```
This pattern (mock returns empty → assert 404) is the correct approach for the route layer — it tests that the route raises 404 when the DB filter produces no results, which is what happens when user A requests user B's resource. Phase 2 should reuse this pattern for comparisons and annotations.

**Cross-user GET/POST gap in existing tests:**  
`test_comparisons_api.py` and `test_annotations_api.py` do not have tests that assert 404 when the mock DB returns empty (simulating a wrong-user request). `test_ancestors_api.py` does, but only for DELETE. The gap is real — these tests are worth writing for GET /comparisons/{id}, GET /comparisons/{id}/annotations, and POST /comparisons/{id}/annotations (wrong profile).

---

## Code References

- `src/auth/dependencies.py:16–48` — `get_current_user` dependency; Bearer JWT extraction and Supabase validation
- `src/auth/models.py` — `CurrentUser(id, email, access_token)` model
- `src/routers/comparisons.py:148–288` — `POST /comparisons` full handler; raw bytes deleted at :182
- `src/routers/comparisons.py:78–94` — `_segment_to_row()` maps Segment to DB dict; no allele fields
- `src/routers/comparisons.py:291–325` — `GET /comparisons`; `.eq("user_id")` at :300
- `src/routers/comparisons.py:326–405` — `GET /comparisons/{id}`; `.eq("user_id")` at :337
- `src/routers/comparisons.py:407–465` — `DELETE /comparisons/{id}`; `.eq("user_id")` at :418
- `src/routers/annotations.py:67–99` — `GET /comparisons/{id}/annotations`; comparison owner check at :82
- `src/routers/annotations.py:101–141` — `POST /comparisons/{id}/annotations`; profile owner check at :117; **no comparison-membership check**
- `src/routers/annotations.py:144–168` — `DELETE /annotations/{id}`; `.eq("user_id")` at :156
- `src/routers/ancestors.py:50–143` — all ancestor routes; `.eq("user_id")` on all
- `src/dna/models.py:13–24` — `Segment` dataclass; no allele fields
- `src/dna/models.py:4–10` — `SNPRecord` dataclass; has `.allele1` and `.allele2`
- `supabase/migrations/001_initial_schema.sql:112–180` — RLS policies for all four tables
- `tests/conftest.py:8–11` — autouse `clear_dependency_overrides` fixture
- `tests/test_ancestors_api.py:28–68` — composable mock builder pattern (template for Phase 2)
- `tests/test_ancestors_api.py:134–142` — `test_delete_wrong_user_ancestor_returns_404`; reference for wrong-user pattern
- `tests/test_comparisons_api.py:11–19` — `FAKE_USER`, `PROFILE_ID_A`, `PROFILE_ID_B` constants
- `AGENTS.md:7` — hard rule: "Never persist raw DNA CSV data."

---

## Architecture Insights

**Ownership check = query filter, not guard clause.** The pattern is `.eq("user_id", str(current_user.id))` embedded in the Supabase query, not an upfront ownership assertion. This means the route never knows whether the resource exists at all vs. whether it belongs to another user — both return 404. This is intentional (prevents enumeration) but means tests must mock the DB return value to simulate the "wrong user" scenario; they can't distinguish "no row" from "row belongs to other user" at the route level.

**Two-layer security, independently testable.** FastAPI query filters and Supabase RLS are separate enforcement points. Phase 2 tests should target the FastAPI layer only (by mocking the Supabase client). They prove the route code has the correct filter. They do not and should not test RLS (excluded in §7 of test-plan.md).

**`parsed` is the latent risk vector.** The only way raw allele strings could reach a DB write is if `parsed[i][j].allele1` (or similar) were passed into an insert dict. The `Segment` dataclass's absence of allele fields is the intended barrier, but it's a naming convention, not a type enforcement. Mock call assertion tests that capture and inspect `insert()` call arguments are the right guard: they fail immediately if any new field carrying raw data appears in the write dict.

**Mock builder patterns differ across test files.** The ancestors pattern (`_make_db_mock(**table_overrides)` + per-operation builders) is more composable than the comparisons `_make_supabase_mock()` monolith. Phase 2 should use the ancestors pattern as the template.

---

## Historical Context

No prior research artifacts in `context/changes/` or `context/archive/` cover API security or Supabase write paths. The `ui-overhaul` change (`context/changes/ui-overhaul/reviews/impl-review.md`) references auth and session handling but from the frontend perspective.

The `AGENTS.md` hard rule ("Never persist raw DNA CSV data") predates this rollout and was the original risk signal for Risk #4.

---

## Open Questions

1. **`POST /comparisons/{comparison_id}/annotations` — comparison-membership check.** The handler verifies `profile_id` belongs to the user but not that it belongs to the specified comparison. Should Phase 2 include a test for this logic gap, or defer to a separate change? (Recommendation: include it — it's in the same test file and the mock builder is already available.)

2. **`comparison_results` has no `user_id` column.** If a future route `GET /comparison_results/{result_id}` were added without a nested ownership check, it would be IDOR-vulnerable. Phase 5 (quality gates wiring) could add a CI lint rule or schema annotation to flag result-table routes without an owner check. Out of scope for Phase 2.

3. **Mock builder shared fixture.** `FAKE_USER` is copied across four test files. Should it be promoted to `conftest.py`? This is a refactor question, not a security question. Phase 2 should not change conftest.py structure unless it naturally fits; document for a future cleanup change.
