-- Migration 007: add strand to ancestor_annotations unique constraint
-- Fixes upsert collision: maternal/paternal at same position overwrote each other.
-- The old constraint treated (profile_id, chromosome, start_position, end_position)
-- as the uniqueness key, ignoring strand — so saving a paternal annotation at a
-- position already occupied by a maternal one silently overwrote the maternal row.

ALTER TABLE ancestor_annotations
  DROP CONSTRAINT ancestor_annotations_unique_segment;

ALTER TABLE ancestor_annotations
  ADD CONSTRAINT ancestor_annotations_unique_segment
  UNIQUE (profile_id, chromosome, start_position, end_position, strand);
