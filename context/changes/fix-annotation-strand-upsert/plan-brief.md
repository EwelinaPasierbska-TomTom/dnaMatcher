# Fix Annotation Upsert Strand Collision — Plan Brief

> Full plan: `context/changes/fix-annotation-strand-upsert/plan.md`

## What & Why

Saving a paternal annotation at the same genomic position as an existing maternal annotation silently overwrites it — the maternal segment disappears. The cause is a missing `strand` column in both the DB unique constraint and the `on_conflict` upsert key, so Postgres treats the two strands as the same row.

## Starting Point

Migration 004 defines `UNIQUE (profile_id, chromosome, start_position, end_position)`. The upsert in `annotations.py:135` uses the identical four-column string. Both need `strand` added.

## Desired End State

Maternal and paternal annotations at the same position coexist as separate rows. Editing the label of one strand does not affect the other. A new regression test pins the `on_conflict` key so a future revert fails immediately.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-----------------|--------|
| Upsert semantics | Keep upsert — allow label edits | Users need to correct ancestor labels without delete+recreate | Plan |
| Constraint change | Drop + recreate (not modify in place) | PostgreSQL does not support modifying UNIQUE constraints in place | Plan |
| Test location | `test_annotations_api.py` | Strand collision is annotation behavior, not security — belongs next to existing upsert tests | Plan |

## Scope

**In scope:** Migration 007, one-line `on_conflict` fix in `annotations.py`, one regression test.

**Out of scope:** PATCH endpoint for annotation editing, existing data remediation, comparison-membership logic gap fix.

## Architecture / Approach

Two files change in lockstep: the migration file corrects the DB constraint; `annotations.py` corrects the `on_conflict` string. They must land in the same commit — a mismatch would cause a Supabase runtime error. The regression test asserts both that `upsert` is called twice and that the `on_conflict` kwarg contains `"strand"`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. DB Constraint + on_conflict fix | Migration + router one-liner | Migration must be applied manually in Supabase; automated tests can't cover the real constraint |
| 2. Regression test | One test in test_annotations_api.py pinning on_conflict key | Mock-based: tests the call arg, not the real DB behavior |

**Prerequisites:** None — self-contained fix.  
**Estimated effort:** ~30 minutes, one session.

## Open Risks & Assumptions

- The migration is applied manually (Supabase SQL Editor), not via a CLI. If the migration is not applied in production, the router fix alone does nothing — the DB will reject the upsert with a unique-constraint violation on the old key.
- Existing rows in production have at most one annotation per `(profile_id, chromosome, start_position, end_position)` (the bug meant only the last-saved strand survived). No data remediation needed, but worth verifying before deployment.

## Success Criteria (Summary)

- Maternal + paternal at the same genomic position both appear in the annotation list
- Editing one strand's label leaves the other untouched
- `pytest tests/test_annotations_api.py -v` — all tests pass including the new regression test
