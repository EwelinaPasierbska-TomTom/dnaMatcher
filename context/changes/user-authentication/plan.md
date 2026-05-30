---
change_id: user-authentication
title: User Authentication (S-01) — React scaffold + auth forms + DB schema (F-02)
status: planned
created: 2026-05-29
updated: 2026-05-29
---

# User Authentication Implementation Plan (S-01)

## Overview

Delivers the complete authentication flow for dnaMatcher: database schema (F-02), React Router v7
frontend scaffold, sign-up / sign-in / sign-out forms, FastAPI CORS integration, and production
wiring on Render.

This plan incorporates **F-02 (database-schema) as Phase 1** because the database is currently empty
and S-02 (DNA profile upload) depends on the schema. Completing Phase 1 closes the F-02 change.

Auth architecture: the React frontend calls Supabase Auth directly (`@supabase/supabase-js`); the
existing `get_current_user()` FastAPI dependency (F-01) continues to verify JWTs on protected routes.
No new FastAPI auth endpoints are introduced.

## Current State Analysis

- FastAPI at `main.py`: `GET /`, `GET /health`, `GET /me` (JWT-protected via F-01)
- Auth dependency fully implemented: `src/auth/dependencies.py`, `src/auth/client.py`, `src/auth/models.py`
- Frontend: **absent** — no `frontend/` directory, no JS/TS, no React
- Database: **empty** — Supabase project exists, `auth.users` managed by Supabase Auth, but no app tables

## Desired End State

- Supabase schema with 4 tables (`dna_profiles`, `comparisons`, `comparison_results`,
  `ancestor_annotations`) deployed with RLS policies enforced
- React Router v7 frontend at `frontend/` with working sign-up / sign-in / sign-out pages
- Signed-in user lands on `/app` (placeholder); session persists across page refreshes
- Protected `/app` redirects unauthenticated users to `/login`; `/login` and `/signup` redirect
  authenticated users to `/app`
- FastAPI serves the React build in production (Render); dev runs Vite (5173) + FastAPI (8000) with
  CORS + Vite proxy

### Key Discoveries

- `src/auth/client.py:7` — Supabase singleton client; frontend uses the same Supabase project via
  `@supabase/supabase-js` — shared credentials
- `main.py:6` — `GET /me` currently at `/me` root; Phase 4 moves it to `GET /api/me` for the
  Vite proxy (`/api → localhost:8000`) to work cleanly
- `render.yaml` — build command only installs Python; Phase 5 appends frontend `npm ci && npm run build`
- F-02 schema plan: `context/changes/database-schema/plan.md` §Schema — full SQL already designed;
  Phase 1 implements it

## What We're NOT Doing

- New FastAPI endpoints for sign-up / sign-in / sign-out — Supabase SDK handles auth in the browser
- Token refresh logic — Supabase SDK manages automatically (localStorage)
- Email confirmation UI — disabled in Supabase Dashboard (`Authentication → Settings → Email confirmations: OFF`)
- Frontend tests (Vitest / Playwright) — manual verification; Pytest covers backend changes only
- Password reset / forgot-password flow — v2
- Role-based access control — flat model per PRD §Access Control

## Implementation Approach

Five phases in dependency order. Each phase has automated and manual success criteria; proceed to
the next phase only after all criteria for the current phase are met.

1. **Database schema** — create `001_initial_schema.sql` and apply via Supabase Dashboard; closes F-02
2. **React scaffold** — Vite + RR7 + TS + Tailwind + Supabase client + AuthContext + ProtectedRoute + page skeleton
3. **Auth forms** — SignUpPage (4 fields), SignInPage (2 fields), sign-out; validation + Polish error messages
4. **FastAPI integration** — CORS middleware + `/api` prefix + Vite proxy + updated/new Pytest tests
5. **Production wiring** — FastAPI serves React build; `render.yaml` build command + env vars

## Critical Implementation Details

- **Route registration order (Phase 5)**: all `app.include_router(...)` calls must appear **before**
  `app.mount("/", StaticFiles(..., html=True), ...)`. If StaticFiles mounts first, it intercepts
  `/api/*` requests before FastAPI handlers run.
- **Supabase display name**: sign-up passes `options: { data: { name: displayName } }` to
  `supabase.auth.signUp()`. The name is stored in `auth.users.raw_user_meta_data` — no DB schema
  change is needed.

---

## Phase 1: Database schema (closes F-02)

### Overview

Create `supabase/migrations/001_initial_schema.sql` with the full schema from F-02 design, then
apply it to the Supabase project via the SQL Editor. The SQL content is fully specified in
`context/changes/database-schema/plan.md` §Schema — read that file before writing the SQL.

After Phase 1 manual verification passes, update `context/changes/database-schema/change.md`:
`status: done`.

### Changes Required

#### 1. Create `supabase/migrations/` directory and `001_initial_schema.sql`

**File**: `supabase/migrations/001_initial_schema.sql`

**Intent**: The complete initial schema for dnaMatcher: trigger functions, 4 tables, indexes, RLS
enable, and all 15 RLS policies. Full design at `context/changes/database-schema/plan.md` §Schema.

**Contract**: The file must contain exactly:
- 4 `CREATE TABLE` statements: `dna_profiles`, `comparisons`, `comparison_results`, `ancestor_annotations`
- `update_updated_at()` trigger function + triggers on `dna_profiles`, `comparisons`, `ancestor_annotations`
- `delete_comparisons_for_profile()` BEFORE DELETE trigger on `dna_profiles` (cascade for array FK)
- 4 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- 15 `CREATE POLICY` statements:
  - `dna_profiles` × 4 (SELECT, INSERT, UPDATE, DELETE): `auth.uid() = user_id`
  - `comparisons` × 4: `auth.uid() = user_id`
  - `comparison_results` × 3 (SELECT, INSERT, DELETE): subquery via `comparisons`
  - `ancestor_annotations` × 4: `auth.uid() = user_id`

### Success Criteria

#### Automated Verification

- `test -f supabase/migrations/001_initial_schema.sql` exits 0
- `grep -c "CREATE TABLE" supabase/migrations/001_initial_schema.sql` → 4
- `grep -c "ENABLE ROW LEVEL SECURITY" supabase/migrations/001_initial_schema.sql` → 4
- `grep -c "CREATE POLICY" supabase/migrations/001_initial_schema.sql` → 15
- `uv run pytest` exits 0 (no regressions)
- `uv run mypy .` exits 0
- `uv run ruff check .` exits 0

#### Manual Verification

- Supabase Dashboard → SQL Editor → paste + run `001_initial_schema.sql` → no errors
- Table Editor: 4 tables visible
- Authentication → Policies: RLS enabled on all 4 tables, 15 policies listed
- `SELECT * FROM dna_profiles;` → 0 rows (not an error)
- `INSERT INTO dna_profiles (user_id, name, original_filename) VALUES (gen_random_uuid(), 'test', 'test.csv');` → RLS violation error
- Update `context/changes/database-schema/change.md`: set `status: done`

---

## Phase 2: React Router v7 frontend scaffold

### Overview

Create the complete `frontend/` directory: Vite + React Router v7 (library mode) + TypeScript +
Tailwind CSS v4 + `@supabase/supabase-js`. Establishes `AuthContext`, `ProtectedRoute`, and the
page skeleton with correct routing. No auth form logic yet — just the wiring.

### Changes Required

#### 0. Update root `.gitignore`

**File**: `.gitignore`

**Intent**: Prevent `frontend/node_modules/` (~300MB) and `frontend/dist/` from being tracked by git.

**Contract**: Append to `.gitignore`:
```
# Frontend
frontend/node_modules/
frontend/dist/
```

#### 1. Create `frontend/package.json`

**File**: `frontend/package.json`

**Intent**: Define all frontend dependencies. React 19, React Router v7, Supabase JS v2, Tailwind v4.

**Contract**: `"type": "module"`. Runtime: `react`, `react-dom`, `react-router-dom@^7`,
`@supabase/supabase-js`. Dev: `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `tailwindcss`,
`typescript`, `@types/react`, `@types/react-dom`. Scripts: `dev`, `build`, `preview`.

#### 2. Create `frontend/vite.config.ts`

**File**: `frontend/vite.config.ts`

**Intent**: Configure Vite with React plugin, Tailwind v4 plugin, and dev proxy for `/api`.

**Contract**: Plugins: `react()` and `tailwindcss()` (from `@tailwindcss/vite`).
Server proxy: `{ '/api': 'http://localhost:8000' }` — this makes `fetch('/api/me')` in the
browser transparently forward to `http://localhost:8000/api/me` during development.

#### 3. Create `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json`

**Files**: Standard Vite + React TypeScript project references setup.

**Intent**: TypeScript configuration with `strict: true`, `noUnusedLocals: true`,
`noUnusedParameters: true` — mirrors backend mypy strict mode.

**Contract**: Use the three-file project references pattern that `npm create vite -- --template react-ts`
generates. `tsconfig.app.json` targets ES2020, `jsx: "react-jsx"`, `moduleResolution: "bundler"`.

#### 4. Create `frontend/index.html`

**File**: `frontend/index.html`

**Intent**: Vite entry point. Standard HTML with `<div id="root">` and `<script src="/src/main.tsx">`.

**Contract**: Title: "dnaMatcher". No other customisation required at this stage.

#### 5. Create `frontend/src/main.tsx`

**File**: `frontend/src/main.tsx`

**Intent**: React 19 entry point. Mounts `<App />` wrapped in `<AuthProvider>`.

**Contract**:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
```

#### 6. Create `frontend/src/index.css`

**File**: `frontend/src/index.css`

**Intent**: Tailwind v4 entrypoint — single import activates all utilities.

**Contract**: `@import "tailwindcss";`

#### 7. Create `frontend/src/lib/supabase.ts`

**File**: `frontend/src/lib/supabase.ts`

**Intent**: Singleton Supabase JS client reading env vars that Vite exposes at build time.

**Contract**:
```ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
)
```
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in `frontend/.env.local` for dev and in
the Render environment for production (see Phase 5).

#### 8. Create `frontend/src/context/AuthContext.tsx`

**File**: `frontend/src/context/AuthContext.tsx`

**Intent**: React context that subscribes to `supabase.auth.onAuthStateChange`, making the current
user and loading state available to all components. Also provides a `signOut()` helper.

**Contract**: Export:
- `AuthContext` — `React.createContext<AuthContextValue | null>(null)`
- `AuthProvider` — component that calls `supabase.auth.getSession()` on mount, subscribes to
  `onAuthStateChange`, and unsubscribes on unmount. Provides `{ user, loading, signOut }`
- `useAuth()` — hook that asserts `context !== null` (throws if used outside `AuthProvider`)

Context value type:
```ts
interface AuthContextValue {
  user: User | null    // @supabase/supabase-js User type
  loading: boolean
  signOut: () => Promise<void>
}
```
`loading` is `true` until the initial session check resolves, preventing a flash of unauthenticated
content on page load.

#### 9. Create `frontend/src/components/ProtectedRoute.tsx`

**File**: `frontend/src/components/ProtectedRoute.tsx`

**Intent**: Route guard for authenticated pages. Renders nothing while `loading` is true; redirects
to `/login` when user is null and loading is false; renders `<Outlet />` when user is present.

**Contract**:
```tsx
const { user, loading } = useAuth()
if (loading) return null
if (!user) return <Navigate to="/login" replace />
return <Outlet />
```

#### 10. Create `frontend/src/pages/AppPage.tsx`

**File**: `frontend/src/pages/AppPage.tsx`

**Intent**: Placeholder authenticated dashboard. Shows the logged-in user's email and a sign-out
button. Will be filled in with DNA upload UI in S-02.

**Contract**: Displays `user.email` from `useAuth()`. Sign-out button calls `signOut()` — no manual
redirect needed because `ProtectedRoute` reacts to `user` becoming `null`.

#### 11. Create `frontend/src/App.tsx`

**File**: `frontend/src/App.tsx`

**Intent**: React Router v7 router configuration with route guards and redirect logic.

**Contract** (routing):
```
/           → if auth: redirect /app  |  if unauth: redirect /login
/login      → SignInPage  (if already auth: redirect /app)
/signup     → SignUpPage  (if already auth: redirect /app)
/app        → ProtectedRoute → AppPage
```
Use `<BrowserRouter>`, `<Routes>`, `<Route>`. For `/`, `/login`, `/signup` redirect-if-auth logic:
read `useAuth().user` and `useAuth().loading`; render `null` while loading, then `<Navigate>` or
the page component.

#### 12. Create `frontend/.env.example`

**File**: `frontend/.env.example`

**Intent**: Document env vars for local development.

**Contract**:
```
# Copy to frontend/.env.local and fill in values from Supabase Dashboard → Settings → API
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

### Success Criteria

#### Automated Verification

- `cd frontend && npm install` exits 0 and generates `package-lock.json`
- `cd frontend && npm run build` exits 0 (env vars empty — build succeeds, app will not connect without real values)
- `cd frontend && npx tsc --noEmit` exits 0

#### Manual Verification

- Commit `frontend/package-lock.json` to the repo alongside `frontend/` — required for `npm ci`
  in Render buildCommand (Phase 5)
- `cd frontend && npm run dev` starts on port 5173 without error
- `http://localhost:5173/` redirects to `/login`
- `http://localhost:5173/app` redirects to `/login` (ProtectedRoute working)
- No errors in browser console on page load

---

## Phase 3: Auth forms

### Overview

Implement sign-up page (4 fields + validation + error messages) and sign-in page (2 fields + error
messages). AppPage with sign-out is fully implemented in Phase 2 and requires no changes here.
All user-facing strings in Polish.

### Changes Required

#### 1. Create `frontend/src/pages/SignUpPage.tsx`

**File**: `frontend/src/pages/SignUpPage.tsx`

**Intent**: Registration form. On submit: validate client-side, call `supabase.auth.signUp()` with
`user_metadata.name`, on success `navigate('/app')`. On error: display specific Polish message.

**Contract**:
- Fields: Imię (`name`), Email, Hasło (`password`, min 8 chars), Powtórz hasło (`confirmPassword`)
- Client-side validation order: name not empty → email non-empty → password ≥ 8 chars →
  passwords match → call Supabase
- Supabase call:
  ```ts
  supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  })
  ```
- Error message mapping:
  - Supabase error containing `"User already registered"` → `"Ten email jest już zarejestrowany."`
  - Any other error → `"Rejestracja nie powiodła się. Spróbuj ponownie."`
- Client validation messages:
  - Passwords don't match → `"Potwierdzenie hasła nie pasuje."`
  - Password < 8 chars → `"Hasło musi mieć co najmniej 8 znaków."`
- Submit button disabled while request in flight (use `useState` loading flag)
- Link to `/login`: "Masz już konto? Zaloguj się"

#### 2. Create `frontend/src/pages/SignInPage.tsx`

**File**: `frontend/src/pages/SignInPage.tsx`

**Intent**: Login form. On submit: call `supabase.auth.signInWithPassword()`. On success:
`onAuthStateChange` fires in AuthContext, App redirects to `/app` automatically. On error: display
specific Polish message.

**Contract**:
- Fields: Email, Hasło
- Supabase call: `supabase.auth.signInWithPassword({ email, password })`
- Error message mapping:
  - Error containing `"Invalid login credentials"` → `"Nieprawidłowy email lub hasło."`
  - Error containing `"Email not confirmed"` → `"Potwierdź adres email przed logowaniem."`
  - Any other → `"Logowanie nie powiodło się. Spróbuj ponownie."`
- Submit button disabled while request in flight
- Link to `/signup`: "Nie masz konta? Zarejestruj się"

### Success Criteria

#### Automated Verification

- `cd frontend && npx tsc --noEmit` exits 0
- `uv run pytest` exits 0 (no backend regressions)

#### Manual Verification

- Open `http://localhost:5173/signup` with `.env.local` configured → fill all fields → submit →
  redirected to `/app`, user email visible
- Refresh `/app` → still logged in (session in localStorage)
- Open `/login` while already logged in → redirected to `/app`
- Click "Wyloguj się" → redirected to `/login`
- Navigate to `/app` after logout → redirected to `/login`
- Sign-up with existing email → `"Ten email jest już zarejestrowany."`
- Sign-in with wrong password → `"Nieprawidłowy email lub hasło."`
- Passwords don't match in sign-up → inline error before Supabase call

---

## Phase 4: FastAPI integration

### Overview

Add `CORSMiddleware` so the Vite dev server on port 5173 can call the FastAPI API, move all API
routes under `/api` prefix, and update/add Pytest tests.

### Changes Required

#### 1. Update `main.py`

**File**: `main.py`

**Intent**: Add CORS middleware for the Vite dev server, and move the `me` router inside an
`APIRouter(prefix="/api")` so the endpoint becomes `GET /api/me` (required for the Vite proxy
`/api → localhost:8000` to work).

**Contract**:
```python
from fastapi import APIRouter
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")
api_router.include_router(me_router.router)
app.include_router(api_router)
```
`GET /` and `GET /health` stay at root level (not under `/api`).
`GET /me` becomes `GET /api/me`.

#### 2. Update `tests/test_auth.py`

**File**: `tests/test_auth.py`

**Intent**: Update path references to the new `/api/me` endpoint.

**Contract**: Replace `"/me"` with `"/api/me"` in both `test_me_without_token` and
`test_me_with_mocked_user`.

#### 3. Create `tests/test_cors.py`

**File**: `tests/test_cors.py`

**Intent**: Verify that the CORS middleware allows requests from the Vite dev server origin.

**Contract**: One test: send `GET /api/me` with `headers={"Origin": "http://localhost:5173"}` via
`TestClient`; assert response headers contain
`"access-control-allow-origin": "http://localhost:5173"`.

### Success Criteria

#### Automated Verification

- `uv run pytest` exits 0 (all existing + new CORS test pass)
- `uv run mypy .` exits 0
- `uv run ruff check .` exits 0
- `uv run ruff format --check .` exits 0

#### Manual Verification

- `curl http://localhost:8000/api/me` → 401 (endpoint moved, not 404)
- `curl http://localhost:8000/me` → 404 (old path gone)
- `curl -H "Origin: http://localhost:5173" http://localhost:8000/api/me` → response includes
  `Access-Control-Allow-Origin: http://localhost:5173`
- With both dev servers running: auth forms submit without CORS errors in browser console

---

## Phase 5: Production wiring

### Overview

Configure FastAPI to serve the React build as static files, update `render.yaml` to build the
frontend, and document new env vars.

### Changes Required

#### 1. Update `main.py` — static file serving + remove root route

**File**: `main.py`

**Intent**: In production, FastAPI serves the React build so the app runs from a single Render
service. The existing `GET /` route that returns JSON must be **removed** — it would intercept
root URL requests before `StaticFiles` gets a chance to serve `index.html`. `GET /health`
is kept intact for Render health checks (see render.yaml change below). Mount `frontend/dist`
only when the build directory exists; this keeps local dev working without a prior `npm run build`.

**Contract**:
- Remove the `GET /` route handler entirely from `main.py`
- Add:
  ```python
  import os
  from fastapi.staticfiles import StaticFiles

  # MUST appear after all app.include_router() calls — see Critical Implementation Details
  if os.path.exists("frontend/dist"):
      app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")
  ```
`html=True` makes `StaticFiles` serve `index.html` for any path not matching a static file,
enabling React Router's client-side routing.

#### 2. Update `render.yaml`

**File**: `render.yaml`

**Intent**: Extend the Render build pipeline to include the frontend build, and declare env vars
that Vite needs at build time.

**Contract**:
- Change `buildCommand` to:
  ```yaml
  buildCommand: pip install uv && uv sync --frozen --no-dev && cd frontend && npm ci && npm run build
  ```
- Add `healthCheckPath: /health` to the service config (Render needs this now that `GET /`
  is removed in Phase 5 §1):
  ```yaml
  healthCheckPath: /health
  ```
- Add three new env vars (the first tells Render Nix to include Node.js in the build environment;
  the other two are Vite build-time credentials — set manually in Render Dashboard):
  ```yaml
  - key: NODE_VERSION
    value: "20"
  - key: VITE_SUPABASE_URL
    sync: false
  - key: VITE_SUPABASE_ANON_KEY
    sync: false
  ```
  > **Note**: `NODE_VERSION` enables Node.js in Render's Nix build environment for `runtime: python`
  > services. Verify that the first Render deployment succeeds (`npm ci` runs without error) — if it
  > fails with `npm: command not found`, fall back to pre-building the frontend locally and
  > committing `frontend/dist/` to the repo.

#### 3. Update `tests/test_auth.py` — remove test_root_unprotected

**File**: `tests/test_auth.py`

**Intent**: Remove (or replace) `test_root_unprotected` which asserts `GET /` → 200. That route
is removed in Phase 5 §1; the test would fail with 404 in CI where `frontend/dist` doesn't exist.

**Contract**: Delete `test_root_unprotected`. Replace with a test verifying `GET /health` → 200
(the health route is the canonical "API is up" check going forward):
```python
def test_health_unprotected() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
```

#### 4. Update root `.env.example`

**File**: `.env.example`

**Intent**: Document the new `VITE_` env vars so future contributors know to set them in Render.

**Contract**: Add below the existing SUPABASE vars:
```
# Frontend build (Vite) — same values as SUPABASE_URL / SUPABASE_ANON_KEY above
# Set in frontend/.env.local for local dev; add to Render Dashboard for production build
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

### Success Criteria

#### Automated Verification

- `uv run pytest` exits 0
- `uv run mypy .` exits 0
- `uv run ruff check .` exits 0

#### Manual Verification

- `cd frontend && npm run build` produces `frontend/dist/` with `index.html` + `assets/`
- `uv run uvicorn main:app` (no Vite) + open `http://localhost:8000/login` → React app loads in browser
- `http://localhost:8000/app` → redirects to `/login` (ProtectedRoute via StaticFiles index.html)
- `http://localhost:8000/api/me` → 401 (API route not intercepted by static files)
- Push to `main` → Render build completes; production URL shows sign-in page

---

## Testing Strategy

### Backend (Pytest)

- `tests/test_auth.py` — updated paths (`/api/me`); existing coverage unchanged
- `tests/test_cors.py` — new: CORS header present for localhost:5173 origin
- `uv run pytest` must pass after Phases 1, 4, and 5

### Frontend (manual)

See per-phase Manual Verification checklists. Complete golden path:
1. Register new account → redirected to `/app`
2. Refresh → still logged in
3. Open `/login` while authenticated → redirected to `/app`
4. Sign out → redirected to `/login`
5. Navigate to `/app` after logout → redirected to `/login`

### Error paths

- Sign-up with existing email → specific error displayed
- Sign-in with wrong password → specific error displayed
- Passwords mismatch → client-side error, no Supabase call

## References

- F-02 schema design (full SQL): `context/changes/database-schema/plan.md`
- Auth middleware: `src/auth/dependencies.py:16`
- Roadmap: `context/foundation/roadmap.md` — S-01, F-02
- PRD: `context/foundation/prd.md` — FR-001, FR-002, §Access Control

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Database schema (closes F-02)

#### Automated

- [x] 1.1 `test -f supabase/migrations/001_initial_schema.sql` exits 0 — d753d1f
- [x] 1.2 `grep -c "CREATE TABLE" ...` → 4 — d753d1f
- [x] 1.3 `grep -c "ENABLE ROW LEVEL SECURITY" ...` → 4 — d753d1f
- [x] 1.4 `grep -c "CREATE POLICY" ...` → 15 — d753d1f
- [x] 1.5 `uv run pytest` exits 0 — d753d1f
- [x] 1.6 `uv run mypy .` exits 0 — d753d1f
- [x] 1.7 `uv run ruff check .` exits 0 — d753d1f

#### Manual

- [x] 1.8 SQL applies in Supabase Dashboard without errors — d753d1f
- [x] 1.9 Table Editor: 4 tables visible — d753d1f
- [x] 1.10 Policies: RLS on all 4 tables, 15 policies — d753d1f
- [x] 1.11 Anonymous SELECT → 0 rows — d753d1f
- [x] 1.12 Anonymous INSERT → RLS violation error — d753d1f
- [x] 1.13 `context/changes/database-schema/change.md` updated to `status: done` — d753d1f

### Phase 2: React scaffold

#### Automated

- [x] 2.1 `cd frontend && npm install` exits 0; `package-lock.json` generated and committed
- [x] 2.2 `cd frontend && npm run build` exits 0
- [x] 2.3 `cd frontend && npx tsc --noEmit` exits 0

#### Manual

- [x] 2.4 `npm run dev` starts on port 5173 without error
- [x] 2.5 `/` redirects to `/login`
- [x] 2.6 `/app` redirects to `/login` (ProtectedRoute)
- [x] 2.7 No console errors on page load

### Phase 3: Auth forms

#### Automated

- [x] 3.1 `cd frontend && npx tsc --noEmit` exits 0
- [x] 3.2 `uv run pytest` exits 0

#### Manual

- [x] 3.3 Sign-up with valid data → redirect to `/app`, email visible
- [x] 3.4 Refresh `/app` → still logged in
- [x] 3.5 Open `/login` while authenticated → redirect to `/app`
- [x] 3.6 Sign-out → redirect to `/login`
- [x] 3.7 Navigate to `/app` after logout → redirect to `/login`
- [x] 3.8 Sign-up with existing email → "Ten email jest już zarejestrowany."
- [x] 3.9 Sign-in with wrong password → "Nieprawidłowy email lub hasło."
- [x] 3.10 Passwords mismatch → client error, no Supabase call

### Phase 4: FastAPI integration

#### Automated

- [x] 4.1 `uv run pytest` exits 0 (including new test_cors.py)
- [x] 4.2 `uv run mypy .` exits 0
- [x] 4.3 `uv run ruff check .` exits 0
- [x] 4.4 `uv run ruff format --check .` exits 0

#### Manual

- [ ] 4.5 `curl http://localhost:8000/api/me` → 401
- [ ] 4.6 `curl http://localhost:8000/me` → 404
- [ ] 4.7 CORS header present in response with `Origin: http://localhost:5173`
- [ ] 4.8 Auth forms submit without CORS errors in browser console

### Phase 5: Production wiring

#### Automated

- [x] 5.1 `uv run pytest` exits 0 (incl. new test_health_unprotected; test_root_unprotected removed)
- [x] 5.2 `uv run mypy .` exits 0
- [x] 5.3 `uv run ruff check .` exits 0

#### Manual

- [ ] 5.4 `cd frontend && npm run build` produces `frontend/dist/`
- [ ] 5.5 `uv run uvicorn main:app` + open `http://localhost:8000/login` → React app loads
- [ ] 5.6 `http://localhost:8000/app` → redirects to `/login` (React Router via StaticFiles)
- [ ] 5.7 `/api/me` → 401 (not intercepted by static files)
- [ ] 5.8 Render deploy succeeds; production URL shows sign-in page at `/login`
