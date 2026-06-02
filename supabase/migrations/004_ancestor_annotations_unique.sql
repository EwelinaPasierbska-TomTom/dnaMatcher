-- Migration 004: add UNIQUE constraint to ancestor_annotations
-- Required for UPSERT (ON CONFLICT) in the annotations router.
-- Prevents duplicate annotations for the same profile + chromosomal position.

ALTER TABLE ancestor_annotations
  ADD CONSTRAINT ancestor_annotations_unique_segment
  UNIQUE (profile_id, chromosome, start_position, end_position);
