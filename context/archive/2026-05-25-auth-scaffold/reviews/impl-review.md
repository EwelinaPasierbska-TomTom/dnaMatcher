<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth Scaffold Implementation Plan

- **Plan**: `context/changes/auth-scaffold/plan.md`
- **Scope**: All phases (1–2 of 2)
- **Date**: 2026-05-25
- **Verdict**: APPROVED (after fixes)
- **Findings**: 0 critical | 3 warnings | 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Exception handler swallows Supabase outage silently

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/auth/dependencies.py:19
- **Detail**: `except Exception:` catches invalid tokens and Supabase outages identically; no log means operators can't distinguish infrastructure failures from bad tokens.
- **Fix**: Add `logger.warning("Supabase auth error", exc_info=True)` inside except block before raising HTTPException.
- **Decision**: FIXED

### F2 — Optional email silently coerced to empty string

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/auth/dependencies.py:35
- **Detail**: `user.email or ""` mapped None email to `""`, passing Pydantic validation silently. OAuth/magic-link users with no email would get `CurrentUser(email="")`.
- **Fix A ⭐ Recommended**: Change `CurrentUser.email` to `Optional[str]`
  - Strength: Honest contract; mypy forces callers to handle None.
  - Tradeoff: Downstream S-01+ code must handle Optional email.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Fix B**: Raise HTTP 401 when `user.email is None`
  - Strength: Keeps `email: str` contract; blocks emailless users.
  - Tradeoff: OAuth/magic-link users can't log in.
  - Confidence: MEDIUM — product decision.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix B — raise 401 when `user.email is None`

### F3 — Invalid/expired bearer token path has no test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: tests/test_auth.py
- **Detail**: `except Exception:` branch in `get_current_user` (dependencies.py:19) is untested. `test_me_without_token` tests HTTPBearer rejection before `get_current_user` runs. A regression in the exception handler would silently stop returning 401 for bad tokens.
- **Fix**: Add `test_me_with_invalid_token` — override `get_supabase_client` to raise `AuthApiError`, send a bearer token, assert 401.
- **Decision**: SKIPPED
