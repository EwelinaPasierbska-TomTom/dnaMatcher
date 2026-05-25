# Auth Scaffold — Plan Brief

> Full plan: `context/changes/auth-scaffold/plan.md`

## What & Why

Introduce server-side JWT verification so every downstream slice can protect its routes. Supabase Auth issues JWTs on the frontend; FastAPI verifies them by calling `supabase.auth.get_user(token)` per-request. This is F-01 — the prerequisite that unlocks S-01 (login/register), S-02 (DNA upload), S-03 (comparison engine), and S-04 (phasing).

## Starting Point

A FastAPI stub with two unprotected routes (`GET /`, `GET /health`). No auth libraries, no `src/` layout, one placeholder test. The app has no concept of users.

## Desired End State

`GET /me` returns `{"id": "<uuid>", "email": "<email>"}` for valid Bearer JWTs, `401/403` otherwise. A `get_current_user` dependency is available for all future protected routes. The `src/` package layout (auth, routers) is established. CI passes with zero real Supabase credentials.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| JWT verification method | supabase-py `auth.get_user(token)` — network call | Immediately detects revoked sessions; Supabase is already the auth provider | Plan |
| Token transport | `Authorization: Bearer` header | REST standard, CSRF-safe, easy to test with curl | Plan |
| User context shape | `CurrentUser(id: UUID, email: str)` | id is needed for data isolation in S-02+; email needed for UI; typed and mypy-safe | Plan |
| Test strategy | `app.dependency_overrides` | Official FastAPI pattern; no Supabase credentials needed in CI | Plan |
| Project layout | Introduce `src/` now | AGENTS.md prescribes this layout; better to start clean than migrate later | Plan |
| Scope of F-01 | Include `GET /me` | Provides end-to-end verifiability without waiting for S-01 | Plan |
| Error response | FastAPI default `{"detail": "Not authenticated"}` | No added code; consistent with Pydantic validation errors | Plan |

## Scope

**In scope:**
- supabase-py dependency install
- `src/auth/models.py` — `CurrentUser` Pydantic model
- `src/auth/client.py` — lazy singleton Supabase client (`lru_cache`)
- `src/auth/dependencies.py` — `get_current_user` FastAPI dependency
- `src/routers/me.py` — `GET /me` endpoint
- `main.py` update to include router
- `render.yaml` update with `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `.env.example` creation
- `tests/test_auth.py` — three test cases via `dependency_overrides`

**Out of scope:**
- User registration / login endpoints (S-01)
- Database schema (F-02)
- Token refresh
- Custom error response format
- Cookie-based sessions

## Architecture / Approach

Request → FastAPI `HTTPBearer()` → extract JWT → `get_current_user(Depends)` → `supabase.auth.get_user(jwt)` → map to `CurrentUser` → inject into route handler. The Supabase client is a singleton initialised lazily from `SUPABASE_URL` + `SUPABASE_ANON_KEY` env vars. Tests bypass the Supabase call entirely via `dependency_overrides`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Package structure + auth | `src/` layout, auth dependency, GET /me, env config | mypy strict compliance with supabase-py (mitigated by `ignore_missing_imports = true`) |
| 2. Tests + quality gates | test_auth.py, CI clean (pytest + mypy + ruff) | TestClient + dependency_overrides interaction in strict mypy |

**Prerequisites:** Render service exists (done), repo pushed to GitHub (done), uv installed locally.
**Estimated effort:** ~1 session (2 phases, ~15 files touched or created).

## Open Risks & Assumptions

- `supabase.auth.get_user(token)` adds a network round-trip per authenticated request. Acceptable at MVP scale; revisit if latency becomes noticeable.
- supabase-py type stubs may be incomplete — `ignore_missing_imports = true` covers this but means mypy can't check Supabase types internally.
- If Supabase is down, all protected routes return 401. No circuit-breaker in MVP scope.

## Success Criteria (Summary)

- `GET /me` with a valid Supabase JWT returns `200` with the user's `id` and `email`
- `GET /me` without a token returns `403`; with an invalid token returns `401`
- `uv run pytest && uv run mypy . && uv run ruff check .` all exit `0` in CI
