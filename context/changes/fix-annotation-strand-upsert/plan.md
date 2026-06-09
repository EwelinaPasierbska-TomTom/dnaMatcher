# Fix Annotation Upsert Strand Collision — Implementation Plan

## Overview

Adding a sibling-strand annotation at the same genomic position as an existing annotation silently overwrites the first one. The bug is in the database unique constraint and the matching `on_conflict` key: both omit `strand`, so maternal and paternal at `(profile_id, chromosome, start_position, end_position)` are treated as the same row.

## Current State Analysis

`supabase/migrations/004_ancestor_annotations_unique.sql` defines:
```sql
UNIQUE (profile_id, chromosome, start_position, end_position)
```

`src/routers/annotations.py:135` uses the exact same set:
```python
.upsert(row, on_conflict="profile_id,chromosome,start_position,end_position")
```

When a user saves a paternal annotation at a position already occupied by a maternal annotation, the upsert matches the existing row and overwrites its `strand`, `ancestor_label`, and `ancestor_id` fields. The maternal annotation disappears.

### Key Discoveries

- The fix is purely additive: add `strand` to both the DB constraint and the `on_conflict` string. No other logic changes.
- Upsert semantics are preserved: saving the same `(profile_id, chromosome, start_position, end_position, strand)` a second time still updates `ancestor_label` / `ancestor_id` — allowing label corrections without a separate PATCH endpoint.
- Existing production rows are unaffected: the bug means at most one row per `(profile_id, chromosome, start_position, end_position)` exists today. After the fix both strands can coexist; no data remediation is needed.
- PostgreSQL does not support modifying a UNIQUE constraint in place; the old constraint must be dropped and a new one added.
- `test_annotations_api.py` already tests upsert with `strand: "maternal"` but never exercises two annotations at the same position on different strands.

## Desired End State

- Saving a paternal annotation at the same genomic position as an existing maternal annotation creates a new row; the maternal annotation is unaffected.
- Saving the same annotation twice (same strand) still updates `ancestor_label`/`ancestor_id` (upsert on edit).
- `pytest tests/test_annotations_api.py -v` — all tests pass including the new regression test.
- Migration `007_ancestor_annotations_strand_in_unique.sql` is present and applies cleanly.

## What We're NOT Doing

- Not adding a PATCH endpoint for annotation editing (upsert handles it as before)
- Not migrating existing production data (no remediation needed)
- Not changing any other route, model, or frontend code
- Not fixing the comparison-membership logic gap (separate, documented issue)

## Implementation Approach

Two files change. The migration file creates the corrected DB constraint; the router change aligns `on_conflict` with the new constraint. Both must land together — a mismatch between the two would cause a Supabase error at runtime.

## Phase 1: DB Constraint + on_conflict Fix

### Overview

Create migration 007 that drops the old four-column constraint and adds a five-column one including `strand`. Update the `on_conflict` argument in the upsert call to match.

### Changes Required

#### 1. New migration: add strand to unique constraint

**File**: `supabase/migrations/007_ancestor_annotations_strand_in_unique.sql`

**Intent**: Drop the existing constraint that omits `strand` and recreate it with `strand` included, so maternal and paternal annotations at the same genomic position are distinct rows.

**Contract**:
```sql
-- Migration 007: add strand to ancestor_annotations unique constraint
-- Fixes upsert collision: maternal/paternal at same position overwrote each other.

ALTER TABLE ancestor_annotations
  DROP CONSTRAINT ancestor_annotations_unique_segment;

ALTER TABLE ancestor_annotations
  ADD CONSTRAINT ancestor_annotations_unique_segment
  UNIQUE (profile_id, chromosome, start_position, end_position, strand);
```

#### 2. Update on_conflict in upsert route

**File**: `src/routers/annotations.py`

**Intent**: Align the `on_conflict` key with the new DB constraint so Postgres knows which column set to match on for the upsert.

**Contract**: Line 135 — change the `on_conflict` string from `"profile_id,chromosome,start_position,end_position"` to `"profile_id,chromosome,start_position,end_position,strand"`. No other changes in this file.

### Success Criteria

#### Automated Verification

- Migration file exists and is valid SQL: `cat supabase/migrations/007_ancestor_annotations_strand_in_unique.sql`
- Full test suite green: `.venv/bin/pytest --tb=short`
- Type check passes: `.venv/bin/mypy src/ --ignore-missing-imports`
- Lint passes: `.venv/bin/ruff check src/routers/annotations.py`
- Format passes: `.venv/bin/ruff format --check src/routers/annotations.py`

#### Manual Verification

- Apply migration in Supabase dashboard (SQL Editor) and verify it runs without error
- In the app: add a maternal annotation on chromosome 1, then add a paternal annotation at the exact same start/end position — verify both appear in the list (no disappearance)
- Edit the maternal annotation's label — verify the paternal annotation is unaffected

---

## Phase 2: Regression Test

### Overview

Add one test to `tests/test_annotations_api.py` that pins the corrected behavior: two upsert requests at the same genomic position on different strands both succeed, and the `on_conflict` key used in each upsert call includes `strand`.

### Changes Required

#### 1. New test: same-position different-strand upserts both succeed

**File**: `tests/test_annotations_api.py`

**Intent**: Verify that the route calls `upsert()` with an `on_conflict` key that includes `strand`, and that two calls with opposite strands both return 200. This pins the constraint alignment so a future revert of `on_conflict` fails the test immediately.

**Contract**: Test name: `test_post_annotation_same_position_different_strand_both_survive`.

Structure:
1. Create an `ancestor_annotations` mock whose `upsert` always returns a valid row (reuse the existing `_ann_table_for_upsert` helper).
2. Send `POST /api/comparisons/{COMPARISON_ID}/annotations` twice — first with `strand: "maternal"`, then with `strand: "paternal"`. Both use identical `chromosome`, `start_position`, `end_position`.
3. Assert both responses return 200.
4. Assert `upsert.call_count == 2` (both calls reached the DB layer).
5. Assert that each upsert call's keyword argument `on_conflict` contains `"strand"`:
   ```python
   for call in ann_mock.upsert.call_args_list:
       assert "strand" in call.kwargs.get("on_conflict", "")
   ```

The `dna_profiles` mock must return `found=True` for `PROFILE_ID` (reuse `_profiles_found()` from the file or mock inline). The `comparisons` mock must return a row with `profile_ids` containing `PROFILE_ID`.

### Success Criteria

#### Automated Verification

- New test passes: `.venv/bin/pytest tests/test_annotations_api.py::test_post_annotation_same_position_different_strand_both_survive -v`
- Full test suite green: `.venv/bin/pytest --tb=short`
- Lint passes: `.venv/bin/ruff check tests/test_annotations_api.py`
- Format passes: `.venv/bin/ruff format --check tests/test_annotations_api.py`

#### Manual Verification

- Read the test name and assert messages — confirm a future revert of `on_conflict` would produce a clear failure message pointing to `strand`

---

## Testing Strategy

### Unit/Integration Tests

All tests are route integration tests with mocked Supabase (FastAPI TestClient + `dependency_overrides`). No real DB is touched by the test suite; the migration is applied manually in Supabase.

### Manual Testing Steps

1. Apply migration 007 in Supabase SQL Editor; confirm no error.
2. Open the app, pick a comparison, add a maternal annotation on chr1 at positions 1 000 000 – 5 000 000.
3. Add a paternal annotation at the same positions. Confirm both appear in the visualization.
4. Edit the maternal label. Confirm the paternal annotation is unchanged.
5. Add a second maternal annotation at the same positions. Confirm it updates (upsert) the existing maternal row rather than creating a duplicate.

## References

- Broken constraint: `supabase/migrations/004_ancestor_annotations_unique.sql`
- Bug site: `src/routers/annotations.py:135`
- Initial schema (strand CHECK constraint): `supabase/migrations/001_initial_schema.sql:70`
- Existing upsert tests: `tests/test_annotations_api.py:115–167`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: DB Constraint + on_conflict Fix

#### Automated

- [x] 1.1 Migration file exists and is valid SQL
- [x] 1.2 Full test suite green: `.venv/bin/pytest --tb=short`
- [x] 1.3 Type check passes: `.venv/bin/mypy src/ --ignore-missing-imports`
- [x] 1.4 Lint and format pass: `.venv/bin/ruff check src/routers/annotations.py && .venv/bin/ruff format --check src/routers/annotations.py`

#### Manual

- [x] 1.5 Migration applies in Supabase without error
- [x] 1.6 Maternal + paternal at same position both survive in the app
- [x] 1.7 Editing maternal label does not affect paternal annotation

### Phase 2: Regression Test

#### Automated

- [ ] 2.1 New test passes: `pytest tests/test_annotations_api.py::test_post_annotation_same_position_different_strand_both_survive -v`
- [ ] 2.2 Full test suite green: `.venv/bin/pytest --tb=short`
- [ ] 2.3 Lint and format pass: `.venv/bin/ruff check tests/test_annotations_api.py && .venv/bin/ruff format --check tests/test_annotations_api.py`

#### Manual

- [ ] 2.4 Test name and assert messages clearly point to `strand` as the missing key on failure
