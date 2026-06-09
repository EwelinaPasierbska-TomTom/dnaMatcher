# API Security and Data Integrity — Phase 2 Implementation Plan

## Overview

Write a dedicated `tests/test_api_security.py` that pins two independent guards:
1. **Risk #3 (IDOR)**: every comparison/annotation route that checks `user_id` ownership has a test that asserts 404/403 when the DB filter produces no results — so a future refactor silently removing `.eq("user_id", ...)` will fail tests, not just fail silently in production.
2. **Risk #4 (raw DNA persistence)**: tests assert on the exact set of column keys passed to each Supabase `insert()` call in the comparison upload path — catching any future change that accidentally adds raw bytes or allele strings to a write dict.

## Current State Analysis

All routes already perform `.eq("user_id", str(current_user.id))` — the ownership check is consistent across all 11 protected routes. The gap is not missing route protection; it is missing tests that pin the protection in place. `test_ancestors_api.py:134–142` establishes the correct wrong-user pattern (`found=False` mock → assert 404). No equivalent exists for comparison GET or annotation routes.

The comparison upload path at `src/routers/comparisons.py:148–288` respects the privacy rule: `del content` at line 182 before the first DB write at line 195; `Segment` has no allele fields; error paths are DELETE-only. The latent risk is that `parsed` (a list of `SNPRecord` with `.allele1`/`.allele2`) remains in scope during all three insert calls with no type-level guard. Call-arg assertion tests are the enforcement mechanism.

### Key Discoveries

- Mock builder pattern: `_make_db_mock(**table_overrides)` from `tests/test_ancestors_api.py:28–37` is the template. The `db.from_.side_effect = from_` function routes table names to per-table mocks, keeping references accessible after the request for inspection.
- Comparison GET chain: `comparisons.select("*").eq("id", ...).eq("user_id", ...).execute()` — double eq, no order (distinct from list endpoint which uses `.eq().order()`).
- Annotations comparison lookup chain: `comparisons.select("profile_ids").eq("id", ...).eq("user_id", ...).execute()` — same double-eq, returns empty → 404.
- Profile ownership chain: `dna_profiles.select("id").eq("id", ...).eq("user_id", ...).execute()` — empty → 403 for annotation POST.
- `_VALID_CSV` must use positions at 50M+ bp on chr1 (real cM region) so DNAPhaser's `lenghThreshold=0.01 cM` filter passes and segments survive. Pattern from `test_comparisons_api.py:23–25`.
- Supabase RLS is explicitly out of scope for all tests in this phase (§7 of test-plan.md).

## Desired End State

`tests/test_api_security.py` exists with 7 tests, all green. Running `pytest tests/test_api_security.py -v` reports 7 passed. A refactor that removes `.eq("user_id", ...)` from any tested route will cause the corresponding test to fail. A change that adds any new column to a `dna_profiles` or `comparison_results` insert dict will cause the schema-guard tests to fail.

## What We're NOT Doing

- Not testing Supabase RLS policies (test-plan.md §7 exclusion)
- Not testing GET /comparisons (list) wrong-user — the list route filters globally and the pattern is covered by the single-item GET test
- Not testing ancestors routes — already covered by `test_ancestors_api.py:134–142`
- Not introducing a `FAKE_USER_B` — `found=False` mock is the established and sufficient pattern for simulating wrong-user scenarios
- Not refactoring `conftest.py` or promoting `FAKE_USER` to a shared fixture
- Not fixing the comparison-membership logic gap — Phase 2 documents it with a test, does not fix it
- Not testing the `dna_profiles` insert-failure or zero-segments error paths for Phase 2 (cost × signal: those paths have only DELETE cleanups and no recent churn)

## Implementation Approach

All 7 tests go in one new file `tests/test_api_security.py`. The file reuses the `_make_db_mock(**table_overrides)` pattern from ancestors. Phase 1 (IDOR tests) uses the `found=False` pattern for wrong-user/wrong-profile scenarios. Phase 2 (schema guard tests) retains direct references to per-table mock objects after constructing the supabase mock, then inspects `table_mock.insert.call_args` after the request.

## Phase 1: IDOR Ownership Guard Tests

### Overview

Four tests in `tests/test_api_security.py` that pin ownership guard behavior for the routes where existing tests have the gap.

### Changes Required

#### 1. New test file: `tests/test_api_security.py` — structure and helpers

**File**: `tests/test_api_security.py`

**Intent**: Create the file with module-level constants and two mock builder helpers that all Phase 1 and Phase 2 tests share.

**Contract**: 

Constants (same UUID pattern as existing test files):
```python
COMPARISON_ID = "cccccccc-0000-0000-0000-000000000003"
PROFILE_ID    = "aaaaaaaa-0000-0000-0000-000000000001"
ANNOTATION_ID = "dddddddd-0000-0000-0000-000000000004"
```

`FAKE_USER` matches the UUID used in all other test files (`00000000-0000-0000-0000-000000000001`).

`_make_db_mock(**table_overrides)` is copied verbatim from `tests/test_ancestors_api.py:28–37` — no variation needed.

`_comp_empty()` returns a `comparisons` table mock where `.select().eq().eq().execute().data` is `[]` — the chain for both `GET /comparisons/{id}` and `GET /comparisons/{id}/annotations` comparison lookups.

`_profiles_empty()` returns a `dna_profiles` table mock where `.select().eq().eq().execute().data` is `[]` — the chain for the `POST /annotations` profile ownership check.

#### 2. Test: wrong-user GET /comparisons/{id}

**File**: `tests/test_api_security.py`

**Intent**: Pin the `.eq("user_id", ...)` guard on `GET /comparisons/{id}`. Mock the comparisons table to return empty (simulating the filter excluding another user's row) and assert 404.

**Contract**: Uses `_make_db_mock(comparisons=_comp_empty())`. Request: `client.get(f"/api/comparisons/{COMPARISON_ID}")`. Expected: 404.

#### 3. Test: wrong-user GET /comparisons/{id}/annotations

**File**: `tests/test_api_security.py`

**Intent**: Pin the comparison ownership check at the top of `GET /comparisons/{id}/annotations` (`annotations.py:82`). When the comparison lookup returns empty, the route must raise 404 before fetching annotations.

**Contract**: Uses `_make_db_mock(comparisons=_comp_empty())`. Request: `client.get(f"/api/comparisons/{COMPARISON_ID}/annotations")`. Expected: 404. No `ancestor_annotations` table mock needed — the route exits before reaching it.

#### 4. Test: unowned profile POST /comparisons/{id}/annotations → 403

**File**: `tests/test_api_security.py`

**Intent**: Pin the profile ownership check at `annotations.py:117`. When the profile lookup returns empty (profile not owned by requesting user), the route must raise 403.

**Contract**: Uses `_make_db_mock(dna_profiles=_profiles_empty())`. Request: `client.post(f"/api/comparisons/{COMPARISON_ID}/annotations", json={...valid body with PROFILE_ID...})`. Expected: 403.

#### 5. Test: logic gap — comparison membership not checked on annotation POST

**File**: `tests/test_api_security.py`

**Intent**: Document that `POST /comparisons/{id}/annotations` verifies profile ownership but does NOT verify that `profile_id` belongs to the specified comparison. The test proves the current behavior — the route succeeds — establishing a regression baseline. The docstring must call this out explicitly.

**Contract**: Mock `dna_profiles` to return found=True, `ancestor_annotations` upsert to return a valid annotation row. Provide a `profile_id` in the request body that is NOT listed in any comparison's `profile_ids`. Assert 200. The test name: `test_post_annotation_does_not_check_comparison_membership`. Docstring: "Documents that the route accepts any user-owned profile regardless of whether it belongs to the comparison. This is a known logic gap. If this test fails (route returns 4xx), it means the membership check was added — update accordingly."

### Success Criteria

#### Automated Verification

- All 4 tests pass: `pytest tests/test_api_security.py::test_get_comparison_wrong_user_returns_404 tests/test_api_security.py::test_get_comparison_annotations_wrong_user_returns_404 tests/test_api_security.py::test_post_annotation_wrong_profile_returns_403 tests/test_api_security.py::test_post_annotation_does_not_check_comparison_membership -v`
- Full test suite still green: `pytest --tb=short`
- Type check passes: `mypy src/ tests/test_api_security.py --ignore-missing-imports`
- Lint passes: `ruff check tests/test_api_security.py`

#### Manual Verification

- Confirm each test name clearly conveys security intent when reading `pytest -v` output
- Confirm the logic-gap test docstring is visible in `pytest -v --no-header` output

**Implementation Note**: After completing Phase 1 and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: DNA Persistence Schema Guard Tests

### Overview

Three tests that capture Supabase `insert()` call arguments and assert on the exact column set — catching any future change that accidentally adds raw allele data to a write dict. Plus one test asserting no insert occurs on a parse-error path.

### Changes Required

#### 1. Upload mock builder

**File**: `tests/test_api_security.py`

**Intent**: Add a helper that builds the Supabase mock for a successful upload AND returns direct references to the `dna_profiles` and `comparison_results` table mocks for post-request inspection of `insert.call_args`.

**Contract**: `_make_upload_db_mock()` returns a 3-tuple: `(supabase_mock, profiles_mock, results_mock)`. Internally it creates named table mocks and passes them to `_make_db_mock(dna_profiles=profiles_mock, comparisons=comparisons_mock, comparison_results=results_mock)`. The profiles and comparisons mocks must have return values configured so the full upload handler can complete and return 200. The results mock only needs `insert.return_value.execute.return_value.data = []`. The CSV used must have positions ≥ 50M bp on chr1 so segments survive DNAPhaser's cM filters (replicate the `_VALID_CSV` pattern from `tests/test_comparisons_api.py:23–25`).

#### 2. Test: `dna_profiles` insert schema — no raw bytes or allele fields

**File**: `tests/test_api_security.py`

**Intent**: After a successful upload, capture what was passed to `dna_profiles.insert()` and assert the column set is exactly `{"user_id", "name", "original_filename"}`. No bytes values, no allele strings.

**Contract**: 
Call `_make_upload_db_mock()`, send the upload request, then:
```
inserted_rows = profiles_mock.insert.call_args[0][0]  # list of dicts
for row in inserted_rows:
    assert set(row.keys()) == {"user_id", "name", "original_filename"}
    assert not any(isinstance(v, bytes) for v in row.values())
```
Test name: `test_upload_profiles_insert_has_no_raw_bytes`.

#### 3. Test: `comparison_results` insert schema — segment fields only

**File**: `tests/test_api_security.py`

**Intent**: After a successful upload, capture what was passed to `comparison_results.insert()` and assert the column set is exactly the segment result schema — no allele fields, no raw genotype strings.

**Contract**:
Expected column set (from `_segment_to_row()` at `src/routers/comparisons.py:78–94`):
```
_EXPECTED_RESULT_COLUMNS = {
    "comparison_id", "chromosome",
    "start_position", "end_position",
    "snp_count", "classification",
    "start_cm", "end_cm",
    "length_bp", "length_cm",
    "density", "pair_profile_ids",
}
```
Assert: `set(row.keys()) == _EXPECTED_RESULT_COLUMNS` for every row in `results_mock.insert.call_args[0][0]`. Also assert no value is `bytes`.
Test name: `test_upload_results_insert_contains_only_segment_schema`.

#### 4. Test: parse error — no DB write

**File**: `tests/test_api_security.py`

**Intent**: When the CSV parse fails (all-invalid alleles), the route must return 400 and Supabase `insert()` must never be called — proving the `del content` / early-exit path does not accidentally trigger a write.

**Contract**: Use a raw `MagicMock()` as the supabase client. Send a CSV where all alleles are `--` (invalid). Assert 400. Then assert `db.from_.return_value.insert.assert_not_called()` where `db = supabase_mock.postgrest.auth.return_value`. The invalid CSV pattern: replicate `_INVALID_CSV` from `tests/test_comparisons_api.py:27` (positions at `i * 1000` bp, below the chr1 genetic map range → both parse-invalid and sub-threshold).
Test name: `test_upload_parse_error_does_not_write_to_database`.

### Success Criteria

#### Automated Verification

- All 3 new tests pass: `pytest tests/test_api_security.py -k "raw_bytes or segment_schema or parse_error" -v`
- Full test suite still green: `pytest --tb=short`
- Type check passes: `mypy src/ tests/test_api_security.py --ignore-missing-imports`
- Lint passes: `ruff check tests/test_api_security.py`

#### Manual Verification

- The column-set assertion in tests 2 and 3 will catch ANY new field added to those insert dicts — manually verify this by temporarily adding a dummy field to `_segment_to_row()` or `profile_rows`, confirming the test fails, then reverting

**Implementation Note**: After Phase 2 automated verification passes, pause here for the manual verification (dummy-field regression check) before proceeding to Phase 3.

---

## Phase 3: §6.2 Cookbook Update

### Overview

Fill in the `§6.2 Adding a route integration test` section of `context/foundation/test-plan.md`, which currently reads "TBD — see §3 Phase 2." This is the rollout convention — each phase's plan ends with the cookbook update.

### Changes Required

#### 1. Update §6.2 in `context/foundation/test-plan.md`

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the TBD placeholder in §6.2 with the concrete pattern established by Phase 2.

**Contract**: The filled-in §6.2 should contain:
- **Location**: `tests/test_api_security.py` for security-focused route tests; router-specific files (`test_comparisons_api.py`, `test_annotations_api.py`, etc.) for happy-path route tests
- **Mock builder**: `_make_db_mock(**table_overrides)` from `tests/test_ancestors_api.py:28–37` — copy into the target test file; each table is a named kwarg; the table mock returned by `_make_db_mock` is the same object passed in, so it can be inspected after the request
- **Wrong-user pattern**: mock the relevant table to return empty data; assert the expected 4xx status; reference `test_api_security.py::test_get_comparison_wrong_user_returns_404`
- **Schema-guard pattern**: call `table_mock.insert.call_args[0][0]` to get the list of row dicts passed to insert; assert `set(row.keys()) == _EXPECTED_COLUMNS` for each row; reference `test_api_security.py::test_upload_results_insert_contains_only_segment_schema`
- **Run command**: `pytest tests/test_api_security.py -v`
- **Two dependencies to always override**: `get_current_user` and `get_supabase_client`; `conftest.py` clears overrides automatically after each test

### Success Criteria

#### Automated Verification

- §6.2 in `context/foundation/test-plan.md` no longer contains the word "TBD": `grep -c "TBD" context/foundation/test-plan.md` returns a lower count than before

#### Manual Verification

- Read §6.2 and confirm a new contributor could use it to add a route security test without reading the full research doc

---

## Testing Strategy

### Unit Tests

All 7 tests are route integration tests (FastAPI TestClient + mocked Supabase). No pure unit tests are needed for this phase — the risk is at the route layer.

### Integration Tests

`pytest tests/test_api_security.py -v` — all 7 pass.
`pytest --tb=short` — no regressions in the existing 9-file test suite.

### Manual Testing Steps

1. For each Phase 1 test: temporarily remove `.eq("user_id", str(current_user.id))` from the relevant route handler, confirm the test fails with the expected assertion error, revert.
2. For Phase 2 tests: temporarily add a `"allele_debug": "AA"` field to `profile_rows` or `all_result_rows` in comparisons.py, confirm the schema-guard test fails, revert.
3. For the logic-gap test: read the docstring output and confirm it clearly states the gap and what a future failure means.

## References

- Research: `context/changes/testing-api-security/research.md`
- Test-plan: `context/foundation/test-plan.md` §2 Risks #3 and #4, §6.2
- Mock builder template: `tests/test_ancestors_api.py:28–37`
- Wrong-user pattern: `tests/test_ancestors_api.py:134–142`
- Valid CSV pattern: `tests/test_comparisons_api.py:23–25`
- Route handlers: `src/routers/comparisons.py:326–337` (GET/{id}), `src/routers/annotations.py:67–99` (GET annotations), `src/routers/annotations.py:101–141` (POST annotations), `src/routers/comparisons.py:148–288` (upload)
- Segment row builder: `src/routers/comparisons.py:78–94` (`_segment_to_row`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: IDOR Ownership Guard Tests

#### Automated

- [x] 1.1 All 4 IDOR tests pass: `pytest tests/test_api_security.py -k "wrong_user or wrong_profile or membership" -v` — ab24d27
- [x] 1.2 Full test suite green: `pytest --tb=short` — ab24d27
- [x] 1.3 Type check passes: `mypy src/ tests/test_api_security.py --ignore-missing-imports` — ab24d27
- [x] 1.4 Lint passes: `ruff check tests/test_api_security.py` — ab24d27

#### Manual

- [x] 1.5 Each test name clearly conveys security intent in `pytest -v` output — ab24d27
- [x] 1.6 Logic-gap test docstring is visible and self-explanatory — ab24d27

### Phase 2: DNA Persistence Schema Guard Tests

#### Automated

- [x] 2.1 All 3 schema-guard tests pass: `pytest tests/test_api_security.py -k "raw_bytes or segment_schema or parse_error" -v` — 18c935c
- [x] 2.2 Full test suite green: `pytest --tb=short` — 18c935c
- [x] 2.3 Type check passes: `mypy src/ tests/test_api_security.py --ignore-missing-imports` — 18c935c
- [x] 2.4 Lint passes: `ruff check tests/test_api_security.py` — 18c935c

#### Manual

- [x] 2.5 Dummy-field regression check: add `"allele_debug": "AA"` to a write dict, confirm test fails, revert — 18c935c

### Phase 3: §6.2 Cookbook Update

#### Automated

- [x] 3.1 §6.2 no longer contains "TBD": `grep -c "TBD" context/foundation/test-plan.md` is lower than before this plan

#### Manual

- [x] 3.2 §6.2 is self-contained: a new contributor can add a route security test using only §6.2 as a guide
