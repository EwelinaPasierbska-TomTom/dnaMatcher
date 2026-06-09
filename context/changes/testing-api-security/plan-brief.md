# API Security and Data Integrity — Plan Brief

> Full plan: `context/changes/testing-api-security/plan.md`
> Research: `context/changes/testing-api-security/research.md`

## What & Why

Write `tests/test_api_security.py` to pin two security properties that the codebase has but no test enforces: (1) comparison and annotation routes return 404/403 when the ownership filter excludes the row, so a future refactor removing `.eq("user_id", ...)` fails tests immediately; (2) Supabase insert calls in the upload path contain only the expected column keys, so a future change accidentally adding raw allele data to a write dict fails tests at the call-arg level.

## Starting Point

All routes already perform explicit `user_id` ownership checks and the upload path already deletes raw bytes before the first DB write. The gap is purely in the test suite: `test_ancestors_api.py` has one wrong-user DELETE test, but comparisons and annotations lack equivalents. No test asserts what Supabase was called with after an upload.

## Desired End State

`tests/test_api_security.py` exists with 7 green tests. A refactor removing `.eq("user_id", ...)` from any tested route fails tests. A change adding any new column to a `dna_profiles` or `comparison_results` insert dict — even a well-intentioned debug field — fails the schema-guard tests.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-----------------|--------|
| File layout | Dedicated `tests/test_api_security.py` | Security intent is unmistakable; provides one canonical §6.2 reference | Plan |
| Wrong-user simulation | `found=False` mock (established pattern) | Matches `test_ancestors_api.py:134–142` exactly; no new infrastructure | Research |
| Logic gap for annotation POST | Document with test (assert 200) | Establishes regression baseline without over-engineering a fix | Plan |
| Risk #4 depth | Happy-path schema guard + parse-error no-write | Covers the latent refactor risk; other error paths are DELETE-only with low churn | Plan |
| Cookbook | §6.2 filled in as Phase 3 | Rollout convention; makes pattern discoverable for future contributors | Research |

## Scope

**In scope:** `test_get_comparison_wrong_user_returns_404`, `test_get_comparison_annotations_wrong_user_returns_404`, `test_post_annotation_wrong_profile_returns_403`, `test_post_annotation_does_not_check_comparison_membership`, `test_upload_profiles_insert_has_no_raw_bytes`, `test_upload_results_insert_contains_only_segment_schema`, `test_upload_parse_error_does_not_write_to_database`, §6.2 cookbook entry.

**Out of scope:** Supabase RLS policies (§7 exclusion), GET /comparisons list wrong-user, ancestors routes (already covered), `FAKE_USER_B` second-user setup, conftest.py refactoring, fixing the comparison-membership logic gap.

## Architecture / Approach

All 7 tests share one file. Phase 1 reuses the `_make_db_mock(**table_overrides)` pattern from ancestors — per-table mock objects are passed in and the same objects are accessible after the request. Phase 2 adds `_make_upload_db_mock()` which returns `(supabase_mock, profiles_mock, results_mock)` as a tuple so tests can call `table_mock.insert.call_args[0][0]` after the upload request to inspect what was written.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. IDOR guard tests | 4 tests pinning wrong-user/wrong-profile 404/403 behavior | Mock chain for double-eq selection differs from list endpoint (no `.order()`) |
| 2. Schema guard tests | 3 tests asserting insert call-arg column sets | Upload route calls `dna_profiles` twice (insert + select); `_make_upload_db_mock` must handle both |
| 3. §6.2 cookbook update | Filled-in cookbook entry for route integration tests | Must be self-contained enough for a new contributor to follow without reading research |

**Prerequisites:** Phase 1 of test-plan rollout complete (algorithm tests green — done)
**Estimated effort:** ~1 session across 3 phases

## Open Risks & Assumptions

- The double-eq mock chain for GET /comparisons/{id} differs from the list endpoint's mock chain. If the mock isn't wired correctly, the test may pass vacuously (route returns 200 because the MagicMock returns a truthy default). Verify by asserting the mock was called, or by temporarily hardcoding the handler to always return 404 and confirming the test fails.
- `_make_upload_db_mock()` must configure `dna_profiles.select.return_value.in_.return_value.execute.return_value.data` (for the profile-details fetch that builds the response) in addition to the insert return value. Missing this causes the upload to return 500 rather than 200.

## Success Criteria (Summary)

- `pytest tests/test_api_security.py -v` → 7 passed, 0 failed
- A one-line removal of `.eq("user_id", ...)` from any covered route breaks the corresponding test
- §6.2 in test-plan.md reads as a usable guide, not a placeholder
