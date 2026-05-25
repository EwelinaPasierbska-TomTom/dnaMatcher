# Auth Scaffold Implementation Plan

## Overview

Introduce server-side JWT verification for dnaMatcher. Supabase Auth issues JWTs on the frontend; FastAPI verifies them per-request by calling Supabase's `/auth/v1/user` endpoint via the supabase-py admin client. The result is a `get_current_user` FastAPI dependency that any protected route can declare. A `GET /me` endpoint makes the scaffold end-to-end verifiable without waiting for S-01.

This is F-01 from the roadmap — it unlocks every user-facing slice (S-01–S-04).

## Current State Analysis

FastAPI stub at `main.py` with two unprotected routes (`GET /`, `GET /health`). No auth libraries installed. No `src/` directory layout. Tests: one placeholder (`tests/test_smoke.py`).

## Desired End State

- `src/` package layout introduced with `src/auth/` and `src/routers/`
- `GET /me` returns `{"id": "<uuid>", "email": "<email>"}` for requests with a valid Bearer JWT, HTTP 401 when no Authorization header is present or the token is invalid/expired
- `get_current_user: Depends(...)` available as a reusable dependency for all downstream slices
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` documented in `.env.example` and declared in `render.yaml`
- `uv run pytest`, `uv run mypy .`, `uv run ruff check .` all exit clean

### Key Discoveries

- `pyproject.toml`: `strict = true` mypy — every function must have return type annotation; `ignore_missing_imports = true` covers supabase-py stubs
- `AGENTS.md`: "routers in `src/routers/`, domain logic in `src/services/`, DB models in `src/models/`" — F-01 inaugurates this structure
- Test pattern in `AGENTS.md`: use `httpx.AsyncClient` or `fastapi.testclient.TestClient`; FastAPI `dependency_overrides` for mocking without real Supabase credentials in CI
- `render.yaml` already has `DATABASE_URL` and `SECRET_KEY` as `sync: false` — same pattern for new Supabase env vars
- supabase-py `auth.get_user(jwt)` is synchronous in v2 — FastAPI runs sync dependencies in a thread pool automatically

## What We're NOT Doing

- User registration / login endpoints — those are S-01 (`user-authentication`)
- Password hashing — Supabase Auth handles it
- Token refresh endpoint — frontend handles refresh; backend only verifies; expired tokens get 401
- Custom error response schema — FastAPI default `{"detail": "..."}` is sufficient for MVP
- HttpOnly cookie session — Bearer header only
- Database schema — that is F-02 (`database-schema`)

## Implementation Approach

Install supabase-py. Create `src/` layout with an `auth` subpackage and a `routers` subpackage. Wire a `get_current_user` FastAPI dependency: extract the Bearer token from the `Authorization` header, call `supabase.auth.get_user(token)`, map the result to a typed `CurrentUser` Pydantic model, raise `HTTP 401` on any failure. Add a `GET /me` router that uses this dependency. Include the router in `main.py`. Tests use `app.dependency_overrides` to bypass the real Supabase call in CI.

## Phase 1: Package structure + auth implementation

### Overview

Install supabase-py, create the `src/` layout, implement auth models/client/dependency, add `GET /me` router, wire to `main.py`, update environment configuration.

### Changes Required

#### 1. Install supabase-py

**File**: `pyproject.toml` (via `uv add supabase`)

**Intent**: Add the supabase-py client as a runtime dependency so `auth.get_user()` is available.

**Contract**: Run `uv add supabase`. This updates `pyproject.toml` `[project] dependencies` and `uv.lock`. Commit both files together per `AGENTS.md`.

#### 2. Create `src/` package skeleton

**Files**: `src/__init__.py`, `src/auth/__init__.py`, `src/routers/__init__.py`

**Intent**: Establish the `src/` layout that `AGENTS.md` prescribes so all downstream slices know where to add code.

**Contract**: Three empty `__init__.py` files. No content — their presence makes Python treat the directories as packages.

#### 3. Create `src/auth/models.py`

**File**: `src/auth/models.py`

**Intent**: Define `CurrentUser` — the typed value injected into every protected route. Must satisfy strict mypy.

**Contract**:
```python
from uuid import UUID
from pydantic import BaseModel

class CurrentUser(BaseModel):
    id: UUID
    email: str
```

#### 4. Create `src/auth/client.py`

**File**: `src/auth/client.py`

**Intent**: Provide a lazily-initialised, singleton Supabase client that reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from env. Called only when a protected route is hit — so missing env vars don't break startup or CI tests (which override `get_current_user` entirely).

**Contract**:
```python
import os
from functools import lru_cache
from supabase import Client, create_client

@lru_cache(maxsize=None)
def get_supabase_client() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_ANON_KEY"],
    )
```

`lru_cache` ensures one client instance per process. `os.environ["KEY"]` raises `KeyError` at first request if unset — fail-fast, not silent.

#### 5. Create `src/auth/dependencies.py`

**File**: `src/auth/dependencies.py`

**Intent**: Implement `get_current_user` — the FastAPI dependency that all protected routes declare. Extracts the Bearer token, calls Supabase Auth, returns a typed `CurrentUser`, raises `HTTP 401` on any failure.

**Contract**:
```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from src.auth.client import get_supabase_client
from src.auth.models import CurrentUser

security = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    client: Client = Depends(get_supabase_client),
) -> CurrentUser:
    try:
        response = client.auth.get_user(credentials.credentials)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    user = response.user
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    from uuid import UUID
    return CurrentUser(id=UUID(str(user.id)), email=user.email or "")
```

`HTTPBearer()` returns 403 (not 401) when the header is absent — this is FastAPI's default and acceptable for MVP. `user.id` from supabase-py is a string; wrap in `UUID()` to satisfy the model type.

#### 6. Create `src/routers/me.py`

**File**: `src/routers/me.py`

**Intent**: Expose `GET /me` — the only endpoint in F-01, used to end-to-end verify the auth pipeline without needing S-01's register/login.

**Contract**:
```python
from fastapi import APIRouter, Depends
from src.auth.dependencies import get_current_user
from src.auth.models import CurrentUser

router = APIRouter(tags=["auth"])

@router.get("/me")
def me(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return current_user
```

#### 7. Update `main.py`

**File**: `main.py`

**Intent**: Register the `me` router so `GET /me` is served by the FastAPI app.

**Contract**: Add `from src.routers import me as me_router` and `app.include_router(me_router.router)` after the `app` definition. Existing `GET /` and `GET /health` routes stay unchanged.

#### 8. Update `render.yaml`

**File**: `render.yaml`

**Intent**: Declare `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Render environment variables so they can be set in the Render Dashboard without committing secrets.

**Contract**: Add two entries under `envVars`, matching the existing `sync: false` pattern:
```yaml
- key: SUPABASE_URL
  sync: false
- key: SUPABASE_ANON_KEY
  sync: false
```

#### 9. Create `.env.example`

**File**: `.env.example`

**Intent**: Document which env vars the app needs locally so the next developer (or future-you) knows what to set up.

**Contract**:
```
# Supabase project credentials (Settings → API in Supabase Dashboard)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-public-key>

# Set when auth and DB features are implemented
# DATABASE_URL=...
# SECRET_KEY=...
```

#### 10. Update `AGENTS.md`

**File**: `AGENTS.md`

**Intent**: Keep AGENTS.md accurate once `src/` exists so future agents don't read stale layout guidance.

**Contract**: In the Project Structure section, replace:
```
No `src/` layout exists yet. When the app grows: routers in `src/routers/`, domain logic in `src/services/`, DB models in `src/models/`.
```
with:
```
`src/` layout is now active. Subdirectories: `src/auth/` (JWT dependency, client, models), `src/routers/` (route handlers), `src/services/` (domain logic, added as needed), `src/models/` (DB models, added as needed).
```

### Success Criteria

#### Automated Verification

- Dependencies install cleanly: `uv sync --frozen`
- Lint passes: `uv run ruff check .`
- Format check passes: `uv run ruff format --check .`
- Type check passes: `uv run mypy .`
- Existing smoke test still passes: `uv run pytest tests/test_smoke.py`

#### Manual Verification

- `src/auth/` and `src/routers/` directories exist with correct files
- `main.py` imports and registers the me router
- `render.yaml` contains `SUPABASE_URL` and `SUPABASE_ANON_KEY` entries
- `.env.example` is present and readable

**Implementation Note**: After this phase passes automated checks, proceed directly to Phase 2 — manual end-to-end verification of `GET /me` with a real JWT is deferred to after tests are in place.

---

## Phase 2: Tests + quality gates

### Overview

Write `tests/test_auth.py` covering the three behaviours the auth scaffold must guarantee: unauthenticated request is rejected, authenticated request returns the correct user, existing unprotected routes are not broken. Use `app.dependency_overrides` so tests run without Supabase credentials.

### Changes Required

#### 1. Create `tests/conftest.py`

**File**: `tests/conftest.py`

**Intent**: Guarantee `app.dependency_overrides` is cleared after every test, even if an assertion raises. Without this, a test failure leaks the override into subsequent tests.

**Contract**:
```python
from collections.abc import Generator
import pytest
from main import app

@pytest.fixture(autouse=True)
def clear_dependency_overrides() -> Generator[None, None, None]:
    yield
    app.dependency_overrides.clear()
```

#### 2. Create `tests/test_auth.py`

**File**: `tests/test_auth.py`

**Intent**: Verify auth scaffold behaviour at the FastAPI route level using `TestClient` and `dependency_overrides`. No real Supabase credentials required.

**Contract**: Three test functions:

- `test_root_unprotected` — `GET /` returns `200` (regression: adding auth must not break existing routes)
- `test_me_without_token` — `GET /me` without `Authorization` header returns `403` (HTTPBearer returns 403 when header is absent — FastAPI default; documenting expected behaviour)
- `test_me_with_mocked_user` — override `get_current_user` to return `CurrentUser(id=<fixed-uuid>, email="test@example.com")`, then `GET /me` returns `200` with matching JSON

The override pattern:
```python
from fastapi.testclient import TestClient
from main import app
from src.auth.dependencies import get_current_user
from src.auth.models import CurrentUser
from uuid import UUID

FAKE_USER = CurrentUser(id=UUID("00000000-0000-0000-0000-000000000001"), email="test@example.com")

def test_me_with_mocked_user() -> None:
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    client = TestClient(app)
    response = client.get("/me")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    # no explicit clear — conftest.py autouse fixture handles teardown
```

#### 3. Delete placeholder test (optional)

**File**: `tests/test_smoke.py`

**Intent**: The placeholder `test_placeholder` served its purpose (verifying pytest runs). Replace it with a real smoke test or delete the `assert True` body — it remains valid either way.

**Contract**: Either delete the file or replace `assert True` with a meaningful check such as importing `main` and asserting the FastAPI app object is not None. Whichever keeps the test suite clean.

### Success Criteria

#### Automated Verification

- All tests pass: `uv run pytest`
- Type check passes: `uv run mypy .`
- Lint passes: `uv run ruff check .`
- Format check passes: `uv run ruff format --check .`

#### Manual Verification

- `uv run uvicorn main:app --reload` starts without error (even without SUPABASE_URL set — env vars are only read on first protected request)
- `curl http://localhost:8000/me` returns `401` (no Authorization header)
- `curl http://localhost:8000/` returns `{"status":"ok",...}` (unprotected route unaffected)

**Human gate**: After all automated checks pass and manual checks confirm, this scaffold is done. The next step is `/10x-plan user-authentication` (S-01) or `/10x-plan database-schema` (F-02) — they can be planned in parallel.

---

## Testing Strategy

### Unit Tests

- Auth dependency with mocked user — `dependency_overrides` pattern
- Unprotected routes unaffected by auth addition

### Integration Tests

- Not applicable at this stage — real Supabase integration is an S-01 concern (when register/login endpoints exist to issue real JWTs)

### Manual Testing Steps

1. Start dev server: `uv run uvicorn main:app --reload`
2. `curl http://localhost:8000/` — expect `{"status":"ok",...}`
3. `curl http://localhost:8000/me` — expect `403` (no header)
4. `curl -H "Authorization: Bearer invalid_token" http://localhost:8000/me` — expect `403` or `401`
5. (Optional, requires real Supabase) — get a JWT from Supabase Dashboard → Authentication → Users → sign in manually; use that JWT in the header → expect `200` with `{"id":"...","email":"..."}`

## References

- Roadmap item: `context/foundation/roadmap.md` → F-01
- PRD: `context/foundation/prd.md` → FR-001, FR-002, §Access Control
- Tech stack: `context/foundation/tech-stack.md`
- AGENTS.md: project conventions, layout

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Package structure + auth implementation

#### Automated

- [x] 1.1 `uv sync --frozen` exits clean after `uv add supabase` — 3f10e35
- [x] 1.2 `uv run ruff check .` passes — 3f10e35
- [x] 1.3 `uv run ruff format --check .` passes — 3f10e35
- [x] 1.4 `uv run mypy .` passes — 3f10e35
- [x] 1.5 `uv run pytest tests/test_smoke.py` passes — 3f10e35

#### Manual

- [x] 1.6 `src/auth/` and `src/routers/` directories exist with correct files — 3f10e35
- [x] 1.7 `main.py` imports and registers the me router — 3f10e35
- [x] 1.8 `render.yaml` contains `SUPABASE_URL` and `SUPABASE_ANON_KEY` entries — 3f10e35
- [x] 1.9 `.env.example` present and readable — 3f10e35
- [x] 1.10 `AGENTS.md` updated — "no src/ yet" replaced with active layout description — 3f10e35

### Phase 2: Tests + quality gates

#### Automated

- [x] 2.1 `uv run pytest` — all tests pass (including new test_auth.py) — 4298220
- [x] 2.2 `uv run mypy .` passes — 4298220
- [x] 2.3 `uv run ruff check .` passes — 4298220
- [x] 2.4 `uv run ruff format --check .` passes — 4298220

#### Manual

- [x] 2.5 Dev server starts without error (no SUPABASE_URL required at startup) — 4298220
- [x] 2.6 `curl http://localhost:8000/me` returns 401 — 4298220
- [x] 2.7 `curl http://localhost:8000/` returns 200 — 4298220
