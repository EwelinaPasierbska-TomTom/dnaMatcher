<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: User Authentication (S-01)

- **Plan**: context/changes/user-authentication/plan.md
- **Scope**: Phases 2–5 of 5
- **Date**: 2026-05-30
- **Verdict**: REJECTED → APPROVED after triage fixes
- **Findings**: 1 critical · 3 warnings · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Duplicate-email sign-up silently swallowed

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/SignUpPage.tsx:42-53
- **Detail**: When email confirmation is disabled, supabase.auth.signUp() for a duplicate email returns no authError — instead `data.user.identities` is `[]`. The code only checked `if (authError)` and navigated to /app, bouncing the user to /login with zero feedback. Error message "Ten email jest już zarejestrowany." was dead code.
- **Fix**: Added phantom-user check: `if ((data?.user?.identities?.length ?? 1) === 0)` → show error and return.
  - Strength: Documented Supabase workaround; identities:[] is canonical indicator.
  - Tradeoff: If Supabase later returns an error in this case, the check becomes a safe no-op.
  - Confidence: HIGH.
  - Blind spot: Not tested against live Supabase project.
- **Decision**: FIXED

### F2 — CORS origin hardcoded to localhost — production API calls will fail

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: main.py:13
- **Detail**: `allow_origins=["http://localhost:5173"]` was hardcoded. Production Render deployment had no way to configure the production frontend URL — every browser API call from production would be blocked.
- **Fix A ⭐ Applied**: Read origins from `CORS_ORIGIN` env var with localhost fallback. Added `CORS_ORIGIN: sync: false` to render.yaml.
  - Strength: Zero local dev change; production URL set once in Render Dashboard.
  - Tradeoff: One more env var to set.
  - Confidence: HIGH.
  - Blind spot: Must be set before second request hits prod API.
- **Decision**: FIXED via Fix A

### F3 — frontend/.env.local not covered by .gitignore

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .gitignore:153
- **Detail**: .gitignore covered `.env` and `.envrc` only. `frontend/.env.local` (real dev credentials) was not excluded — a `git add frontend/` would commit them.
- **Fix**: Added `*.env.local` and `frontend/.env` to .gitignore under the `# Frontend` block.
- **Decision**: FIXED

### F4 — CORS test uses simple GET, not OPTIONS preflight

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/test_cors.py:6-10
- **Detail**: Test sent GET /api/me and asserted ACAO header. Starlette sets ACAO on error responses for simple requests, so it passed — but this behavior is version-fragile. The canonical CORS test uses an OPTIONS preflight.
- **Fix A ⭐ Applied**: Changed to OPTIONS preflight — `client.options("/api/me", headers={"Origin": ..., "Access-Control-Request-Method": "GET"})`, assert 200 + ACAO header.
  - Strength: Version-stable; tests what browsers actually send.
  - Confidence: HIGH.
- **Decision**: FIXED via Fix A

### F5 — AuthContext not exported (plan contract not met)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: frontend/src/context/AuthContext.tsx
- **Detail**: Plan specified exporting `AuthContext`. Variable exists but is module-private. No consumer needs it — `useAuth()` covers all usage.
- **Fix**: Add `export` to the AuthContext declaration.
- **Decision**: SKIPPED — no consumer needs the raw context; useAuth() is sufficient

### F6 — test_cors.py missing `-> None` return type annotation

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/test_cors.py:6
- **Detail**: test_auth.py and test_smoke.py use `-> None` on all test functions; test_cors.py omitted it.
- **Fix**: Add `-> None` to the function signature.
- **Decision**: SKIPPED
