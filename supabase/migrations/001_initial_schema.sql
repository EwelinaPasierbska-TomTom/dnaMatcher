-- dnaMatcher: initial schema
-- Apply via Supabase Dashboard → SQL Editor
-- Tables: dna_profiles, comparisons, comparison_results, ancestor_annotations
-- All tables have RLS enabled; access enforced via auth.uid()

-- ============================================================
-- Trigger functions
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cascade delete: when a dna_profile is deleted, remove all comparisons
-- that reference it (PostgreSQL FK constraints cannot reference array elements).
CREATE OR REPLACE FUNCTION delete_comparisons_for_profile()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM comparisons
    WHERE OLD.id = ANY(profile_ids)
      AND user_id = OLD.user_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE dna_profiles (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name             text        NOT NULL,
    original_filename text       NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comparisons (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_ids uuid[]      NOT NULL CHECK (array_length(profile_ids, 1) >= 2),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, profile_ids)
);

CREATE TABLE comparison_results (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    comparison_id  uuid        NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
    chromosome     text        NOT NULL,
    start_position bigint      NOT NULL,
    end_position   bigint      NOT NULL,
    snp_count      integer     NOT NULL,
    classification text        NOT NULL CHECK (classification IN ('no_match', 'half_match', 'full_match')),
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ancestor_annotations (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id     uuid        NOT NULL REFERENCES dna_profiles(id) ON DELETE CASCADE,
    chromosome     text        NOT NULL,
    start_position bigint      NOT NULL,
    end_position   bigint      NOT NULL,
    strand         text        NOT NULL CHECK (strand IN ('maternal', 'paternal')),
    ancestor_label text        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_dna_profiles_user_id        ON dna_profiles (user_id);
CREATE INDEX idx_comparisons_user_id         ON comparisons (user_id);
CREATE INDEX idx_comparison_results_comp_id  ON comparison_results (comparison_id);
CREATE INDEX idx_ancestor_annotations_user   ON ancestor_annotations (user_id);
CREATE INDEX idx_ancestor_annotations_profile ON ancestor_annotations (profile_id);

-- ============================================================
-- updated_at triggers
-- ============================================================

CREATE TRIGGER trg_dna_profiles_updated_at
    BEFORE UPDATE ON dna_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_comparisons_updated_at
    BEFORE UPDATE ON comparisons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ancestor_annotations_updated_at
    BEFORE UPDATE ON ancestor_annotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Cascade delete trigger: fires BEFORE DELETE on dna_profiles so that
-- the FK cascade from comparisons → comparison_results still works.
CREATE TRIGGER trg_delete_comparisons_for_profile
    BEFORE DELETE ON dna_profiles
    FOR EACH ROW EXECUTE FUNCTION delete_comparisons_for_profile();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE dna_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ancestor_annotations ENABLE ROW LEVEL SECURITY;

-- ---- dna_profiles (4 policies) ----

CREATE POLICY "dna_profiles_select" ON dna_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "dna_profiles_insert" ON dna_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "dna_profiles_update" ON dna_profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "dna_profiles_delete" ON dna_profiles
    FOR DELETE USING (auth.uid() = user_id);

-- ---- comparisons (4 policies) ----

CREATE POLICY "comparisons_select" ON comparisons
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "comparisons_insert" ON comparisons
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comparisons_update" ON comparisons
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "comparisons_delete" ON comparisons
    FOR DELETE USING (auth.uid() = user_id);

-- ---- comparison_results (3 policies — no UPDATE; segments are write-once) ----

CREATE POLICY "comparison_results_select" ON comparison_results
    FOR SELECT USING (
        comparison_id IN (
            SELECT id FROM comparisons WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "comparison_results_insert" ON comparison_results
    FOR INSERT WITH CHECK (
        comparison_id IN (
            SELECT id FROM comparisons WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "comparison_results_delete" ON comparison_results
    FOR DELETE USING (
        comparison_id IN (
            SELECT id FROM comparisons WHERE user_id = auth.uid()
        )
    );

-- ---- ancestor_annotations (4 policies) ----

CREATE POLICY "ancestor_annotations_select" ON ancestor_annotations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ancestor_annotations_insert" ON ancestor_annotations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ancestor_annotations_update" ON ancestor_annotations
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "ancestor_annotations_delete" ON ancestor_annotations
    FOR DELETE USING (auth.uid() = user_id);
