---
change_id: database-schema
title: Database schema — dna_profiles, comparisons, comparison_results, ancestor_annotations
status: planned
created: 2026-05-25
updated: 2026-05-25
---

# Plan: Database schema

## Overview

Deploy the initial Supabase PostgreSQL schema for dnaMatcher. Four tables covering the full data lifecycle:
`dna_profiles` (metadata only — no raw CSV), `comparisons` (group comparison header — 2 or more profiles),
`comparison_results` (computed chromosome segments), `ancestor_annotations` (phasing strand assignments per profile).

All tables have Row-Level Security (RLS) enabled and enforced via `auth.uid()` — no user can read or write
another user's data. Migration is delivered as a single versioned SQL file applied manually through the
Supabase Dashboard SQL Editor.

**Prerequisites satisfied:** F-01 (auth-scaffold) is archived — `auth.users` is populated by Supabase Auth
and available as the FK target for `user_id` columns.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Migration delivery | SQL file in `supabase/migrations/`, applied manually via Supabase Dashboard | Zero toolchain overhead; one-time foundation schema; no automated CI migration needed at MVP stage |
| Comparison group | `profile_ids uuid[]` — stores 2 or more profile IDs as a sorted array | Flexible for any group size; application sorts UUIDs before insert; UNIQUE on (user_id, profile_ids) prevents duplicates |
| Result replacement | UNIQUE(user_id, profile_ids); re-run = DELETE old `comparison_results` WHERE comparison_id = X + INSERT new | Enforces "one comparison per profile set" per user |
| Cascade via trigger | Deleting a `dna_profile` removes `comparisons` referencing it via a BEFORE DELETE trigger (arrays can't have FK) | PostgreSQL FK constraints don't work on array elements; trigger handles the cascade cleanly |
| Phasing model | `ancestor_annotations` linked to `dna_profile` (not `comparison_results`) | Phasing = annotating a single person's chromosome strands (maternal/paternal); orthogonal to pairwise comparisons |
| Python models | Deferred to S-02/S-03 | No dead code in F-02 — each Pydantic model is created by the slice that first uses it |
| RLS enforcement | Direct `user_id = auth.uid()` on tables with `user_id`; subquery via `comparisons` for `comparison_results` | Consistent, anon-key-safe; avoids denormalization on `comparison_results` |

## Schema

### dna_profiles

Metadata identifying a DNA profile. Never stores raw allele data or CSV bytes.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | NOT NULL, FK → auth.users(id) ON DELETE CASCADE |
| name | text | NOT NULL (user-given label, e.g. "Tata", "Ciocia Maria") |
| original_filename | text | NOT NULL (CSV filename for display in S-02 list) |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

### comparisons

One record per comparison **group** (2 or more profiles). Profile IDs stored as a **sorted UUID array**
— application must sort `profile_ids` in ascending order before every INSERT/lookup so that the same
set of profiles always produces the same array (deduplication via UNIQUE).

Re-running a comparison = DELETE old `comparison_results` WHERE comparison_id = X, then INSERT new rows.
The `comparisons` record itself is kept (only its `updated_at` is bumped).

**Note on FK enforcement:** PostgreSQL foreign keys cannot reference individual array elements.
Referential integrity (all IDs in `profile_ids` must exist in `dna_profiles`) is enforced by the
application layer. Cascade deletion is handled by a BEFORE DELETE trigger on `dna_profiles`
(see Cascade Delete Chain below).

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | NOT NULL, FK → auth.users(id) ON DELETE CASCADE |
| profile_ids | uuid[] | NOT NULL, CHECK (array_length(profile_ids, 1) >= 2) |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |
| — | UNIQUE | (user_id, profile_ids) — application must sort before insert |

### comparison_results

Computed chromosome segments for a pairwise comparison.
Rows are immutable — re-run replaces the full set (DELETE + INSERT), never UPDATE individual rows.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| comparison_id | uuid | NOT NULL, FK → comparisons(id) ON DELETE CASCADE |
| chromosome | text | NOT NULL ('1'–'22', 'X', 'Y') |
| start_position | bigint | NOT NULL |
| end_position | bigint | NOT NULL |
| snp_count | integer | NOT NULL |
| classification | text | NOT NULL, CHECK IN ('no_match', 'half_match', 'full_match') |
| created_at | timestamptz | NOT NULL, default now() |

### ancestor_annotations

Phasing view: chromosomal segments manually annotated with ancestor names for a **single profile**.
Represents the two-strand (maternal/paternal) chromosome model for one person.
Independent of `comparison_results` — phasing and comparison are separate views.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | NOT NULL, FK → auth.users(id) ON DELETE CASCADE |
| profile_id | uuid | NOT NULL, FK → dna_profiles(id) ON DELETE CASCADE |
| chromosome | text | NOT NULL |
| start_position | bigint | NOT NULL |
| end_position | bigint | NOT NULL |
| strand | text | NOT NULL, CHECK IN ('maternal', 'paternal') |
| ancestor_label | text | NOT NULL (e.g. "Babcia Zofia", "Dziadek Jan") |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

## RLS Policies

| Table | Operation | Policy |
|-------|-----------|--------|
| dna_profiles | SELECT | `auth.uid() = user_id` |
| dna_profiles | INSERT | `auth.uid() = user_id` |
| dna_profiles | UPDATE | `auth.uid() = user_id` |
| dna_profiles | DELETE | `auth.uid() = user_id` |
| comparisons | SELECT | `auth.uid() = user_id` |
| comparisons | INSERT | `auth.uid() = user_id` |
| comparisons | UPDATE | `auth.uid() = user_id` |
| comparisons | DELETE | `auth.uid() = user_id` |
| comparison_results | SELECT | `comparison_id IN (SELECT id FROM comparisons WHERE user_id = auth.uid())` |
| comparison_results | INSERT | same subquery |
| comparison_results | DELETE | same subquery |
| ancestor_annotations | SELECT | `auth.uid() = user_id` |
| ancestor_annotations | INSERT | `auth.uid() = user_id` |
| ancestor_annotations | UPDATE | `auth.uid() = user_id` |
| ancestor_annotations | DELETE | `auth.uid() = user_id` |

## Cascade Delete Chain

```
auth.users
└── dna_profiles              (ON DELETE CASCADE from auth.users)
    ├── comparisons            (via BEFORE DELETE trigger — array FK not possible)
    │   └── comparison_results (ON DELETE CASCADE from comparisons)
    └── ancestor_annotations   (ON DELETE CASCADE from dna_profiles)
```

Deleting a `dna_profile` removes all comparisons that reference it (any position in `profile_ids`),
all their segments, and all phasing annotations for that profile.

The trigger `delete_comparisons_for_profile` fires BEFORE DELETE on `dna_profiles` and runs:
```sql
DELETE FROM comparisons WHERE OLD.id = ANY(profile_ids) AND user_id = OLD.user_id;
```
This fires before the `comparisons` row is gone, so the FK cascade to `comparison_results` still works.

## What We're NOT Doing

- No Supabase CLI / `supabase init` — no local dev stack, no `supabase/config.toml`
- No `release_command` in `render.yaml` — migration is a manual one-time step, not automated on deploy
- No Python models in `src/models/` — deferred to S-02 (DNAProfile, Comparison) and S-04 (AncestorAnnotation)
- No Alembic or any ORM migration framework — pure SQL
- No seed / test data
- No `comparison_results.UPDATE` policy — segments are write-once (delete + re-insert on rerun), never updated in place
- No soft delete — `deleted_at` column pattern not used; hard deletes with CASCADE

---

## Phase 1: SQL migration file

### Overview

Create `supabase/migrations/001_initial_schema.sql` with the complete schema:
4 tables, indexes, `updated_at` trigger function, RLS enable + policies.
No Python code changes. `uv run pytest` must still pass (no regressions).

### Changes Required

- Create directory `supabase/migrations/`
- Create `supabase/migrations/001_initial_schema.sql` with:
  - `update_updated_at()` trigger function
  - `delete_comparisons_for_profile()` trigger function (cascade on array FK)
  - CREATE TABLE for `dna_profiles`, `comparisons`, `comparison_results`, `ancestor_annotations`
  - CREATE INDEX statements
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for each table
  - `CREATE POLICY` for each table × operation per the RLS table above
  - `CREATE TRIGGER` for `updated_at` on `dna_profiles`, `comparisons`, `ancestor_annotations`
  - `CREATE TRIGGER` for `delete_comparisons_for_profile` BEFORE DELETE ON `dna_profiles`

### Success Criteria

#### Automated
- `test -f supabase/migrations/001_initial_schema.sql` exits 0
- `grep -c "CREATE TABLE" supabase/migrations/001_initial_schema.sql` outputs `4`
- `grep -c "ENABLE ROW LEVEL SECURITY" supabase/migrations/001_initial_schema.sql` outputs `4`
- `grep -c "CREATE POLICY" supabase/migrations/001_initial_schema.sql` outputs `15` (dna_profiles×4 + comparisons×4 + comparison_results×3 + ancestor_annotations×4)
- `uv run pytest` exits 0 (no regressions)
- `uv run mypy .` exits 0
- `uv run ruff check .` exits 0

#### Manual
- (none for this phase — SQL is applied in Phase 2)

---

## Phase 2: Apply schema and verify

### Overview

Apply `001_initial_schema.sql` to the Supabase project via the SQL Editor, then verify all 4 tables,
indexes, and RLS policies exist and behave correctly.

### Changes Required

- (no file changes — manual application only)

### Success Criteria

#### Automated
- (none — cannot connect to Supabase from CI without credentials)

#### Manual
- Open Supabase Dashboard → SQL Editor → paste and run `supabase/migrations/001_initial_schema.sql`
- No errors in the SQL Editor output
- Table Editor shows all 4 tables: `dna_profiles`, `comparisons`, `comparison_results`, `ancestor_annotations`
- Authentication → Policies shows RLS enabled on all 4 tables with correct policies listed
- Run test query in SQL Editor: `SELECT * FROM dna_profiles;` returns "0 rows" (not an error) — confirms RLS allows the anon role to query but returns nothing without a valid JWT
- Run test insert without auth: `INSERT INTO dna_profiles (user_id, name, original_filename) VALUES (gen_random_uuid(), 'test', 'test.csv');` returns an RLS violation error (row blocked by policy)

---

## Progress

### Phase 1: SQL migration file

#### Automated
- [x] 1.1 Create supabase/migrations/001_initial_schema.sql — d753d1f
- [x] 1.2 Verify grep checks pass (4 tables, 4 RLS enables, 15 policies) — d753d1f
- [x] 1.3 uv run pytest passes — d753d1f
- [x] 1.4 uv run mypy . passes — d753d1f
- [x] 1.5 uv run ruff check . passes — d753d1f

#### Manual
- (none)

### Phase 2: Apply schema and verify

#### Automated
- (none)

#### Manual
- [x] 2.1 Apply SQL via Supabase Dashboard SQL Editor — no errors — d753d1f
- [x] 2.2 Table Editor: all 4 tables visible — d753d1f
- [x] 2.3 Policies: RLS enabled on all 4 tables with correct policies — d753d1f
- [x] 2.4 Anonymous SELECT returns 0 rows (not error) — d753d1f
- [x] 2.5 Anonymous INSERT blocked by RLS policy error — d753d1f
