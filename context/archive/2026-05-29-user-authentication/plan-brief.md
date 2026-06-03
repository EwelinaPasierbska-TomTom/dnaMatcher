# User Authentication (S-01) — Plan Brief

> Full plan: `context/changes/user-authentication/plan.md`

## What & Why

S-01 delivers the complete authentication flow: database schema (F-02), React Router v7 frontend
from scratch, sign-up / sign-in / sign-out UI, and production wiring on Render. The database is
currently empty and the frontend does not exist — this slice builds both. F-02 is included as Phase
1 because S-02 (DNA profile upload) depends on the schema and can start immediately after.

## Starting Point

FastAPI has `GET /me` (JWT-protected via F-01 auth middleware) and two unprotected routes.
No frontend exists (`frontend/` absent). Supabase project is live but has no app tables yet.

## Desired End State

A user can open the app URL, register with email + password + display name, sign in, land on a
placeholder `/app` dashboard, refresh and remain logged in, and sign out. All routes are guarded:
unauthenticated access to `/app` redirects to `/login`; authenticated access to `/login` or `/signup`
redirects to `/app`. In production, Render builds the React bundle and FastAPI serves it.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Auth flow | Frontend calls Supabase directly | Avoids unnecessary FastAPI proxy; F-01's `get_current_user` already handles JWT verification | Plan |
| Frontend scope | S-01 builds scaffold + auth forms | Delivers a verifiable e2e flow — user can log in — rather than splitting scaffold into a separate slice | Plan |
| Token storage | Supabase SDK default (localStorage) | Zero implementation cost; SDK handles refresh automatically | Plan |
| DB migration scope | F-02 SQL included as Phase 1 | Database is empty; S-02 blocks on it; no reason to defer | Plan |
| Email confirmation | OFF (Supabase Dashboard) | MVP with small trusted user group; simpler flow | Plan |
| Sign-up fields | Email + password + confirm + display name | Name in `user_metadata` (no schema change); better UX | Plan |
| Styling | Tailwind CSS v4 | Industry standard for Vite + React; fastest prototyping | Plan |
| Dev setup | Vite proxy `/api` → FastAPI + CORS middleware | Standard React + API pattern; no browser CORS errors | Plan |
| API prefix | `/api` prefix on all FastAPI app routes | Separates API paths from React Router paths for static file serving | Plan |
| Testing | Pytest (backend) + manual (frontend) | No Vitest/Playwright setup cost in this slice; coverage added in later slices | Plan |

## Scope

**In scope:**
- `supabase/migrations/001_initial_schema.sql` — 4 tables + RLS (closes F-02)
- `frontend/` — Vite + React Router v7 + TypeScript + Tailwind CSS scaffold
- `AuthContext` + `ProtectedRoute` + `SignUpPage` + `SignInPage` + `AppPage` (placeholder)
- FastAPI: CORS middleware + `/api` prefix for existing routes
- Production: FastAPI serves React build; `render.yaml` build command update

**Out of scope:**
- New FastAPI auth endpoints (sign-up / sign-in handled by Supabase SDK in browser)
- Email confirmation UI, password reset, forgot-password
- Frontend unit tests (Vitest / Playwright) — planned for later
- Role-based access control, account sharing

## Architecture / Approach

```
Browser
  ├── supabase.auth.signUp / signInWithPassword()  → Supabase Auth (direct)
  └── fetch('/api/me') → Vite proxy → FastAPI:8000
           └── get_current_user() verifies JWT via supabase.auth.get_user()

Production (Render):
  Render build: uv sync + cd frontend && npm ci && npm run build
  Runtime: FastAPI serves /api/* routes + React bundle at /
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Database schema | `001_initial_schema.sql` created + applied; F-02 closed | SQL error on apply blocks all downstream |
| 2. React scaffold | `frontend/` with routing, AuthContext, ProtectedRoute | RR7 library-mode setup; ProtectedRoute flash |
| 3. Auth forms | Sign-up, sign-in, sign-out + Polish errors | Supabase error message strings may change |
| 4. FastAPI integration | CORS + `/api` prefix + tests | Existing test paths break on prefix change |
| 5. Production wiring | Render build + FastAPI static serving | StaticFiles mount order intercepting API routes |

**Prerequisites:** F-01 (auth-scaffold) done ✓; Supabase project URL + anon key available; `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set in `frontend/.env.local` for local dev.

**Estimated effort:** ~3-4 evening sessions across 5 phases.

## Open Risks & Assumptions

- Supabase error message strings (e.g. `"Invalid login credentials"`) are matched by substring —
  if Supabase changes the wording, error mapping silently falls through to the generic message.
- `StaticFiles` with `html=True` must be mounted after all API routes; wrong order causes 200
  responses for API paths (serves index.html instead of JSON).
- Render free tier cold starts: first request after idle period may be slow (not a blocker for MVP).

## Success Criteria (Summary)

- User can register, log in, and log out in the browser (end-to-end through Supabase Auth)
- Refreshing `/app` keeps the session alive; navigating to `/app` unauthenticated redirects to `/login`
- `uv run pytest` passes; Render deployment succeeds with React app served from FastAPI
