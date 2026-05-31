-- Migration 003: add name column to comparisons table
-- Required by the comparison router (POST stores user-provided session name,
-- GET /comparisons and GET /comparisons/:id return it in the response).

ALTER TABLE comparisons ADD COLUMN name text NOT NULL DEFAULT '';
