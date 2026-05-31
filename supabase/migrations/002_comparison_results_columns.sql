-- Migration 002: extend comparison_results with segment algorithm columns
-- Adds: start_cm, end_cm, length_bp, length_cm (centimorgan support),
--       pair_profile_ids (identifies which profiles are compared per result row)

ALTER TABLE comparison_results ADD COLUMN start_cm numeric;
ALTER TABLE comparison_results ADD COLUMN end_cm numeric;
ALTER TABLE comparison_results ADD COLUMN length_bp bigint NOT NULL DEFAULT 0;
ALTER TABLE comparison_results ADD COLUMN length_cm numeric;
ALTER TABLE comparison_results ADD COLUMN pair_profile_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_comparison_results_comparison_id
    ON comparison_results (comparison_id);

CREATE INDEX IF NOT EXISTS idx_comparison_results_pair
    ON comparison_results USING GIN (pair_profile_ids);
