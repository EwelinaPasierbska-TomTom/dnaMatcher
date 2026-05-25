---
id: auth-scaffold
roadmap_id: F-01
status: archived
created: 2026-05-25
updated: 2026-05-25
archived_at: 2026-05-25T11:49:02Z
reviewed: 2026-05-25
prd_refs:
  - FR-001
  - FR-002
  - §Access Control
---

## Summary

Auth infrastructure for dnaMatcher: Supabase Auth JWT verification via supabase-py admin client, FastAPI `get_current_user` dependency injected via `Depends()`, `CurrentUser(id, email)` Pydantic model, `GET /me` endpoint, and `src/` package structure.

Unlocks: S-01 (user-authentication), S-02 (dna-profile-upload), S-03, S-04.
