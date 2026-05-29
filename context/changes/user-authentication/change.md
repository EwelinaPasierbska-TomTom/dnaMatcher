---
change_id: user-authentication
title: User Authentication (S-01) — includes F-02 database schema
status: implementing
created: 2026-05-29
updated: 2026-05-30
archived_at: null
---

## Notes

Incorporates F-02 (database-schema) as Phase 1 — the database is empty and S-02 depends on the schema.
When Phase 1 is complete, update `context/changes/database-schema/change.md` to `status: done`.

Auth architecture: React frontend calls Supabase Auth directly; FastAPI verifies JWTs via existing
`get_current_user()` dependency (F-01). No new FastAPI auth endpoints.
