<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Auth Scaffold Implementation Plan

- **Plan**: `context/changes/auth-scaffold/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-25
- **Verdict**: SOUND (after fixes applied)
- **Findings**: 0 critical | 2 warnings (fixed) | 1 observation (fixed)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

7/7 paths ✓ (5 existing + 2 correctly absent), 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — AGENTS.md becomes stale after src/ is created

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — AGENTS.md:15
- **Detail**: AGENTS.md line 15 says "No `src/` layout exists yet" and lists only src/routers/, src/services/, src/models/ — no mention of src/auth/. The plan has no step to update AGENTS.md. After Phase 1 lands, any future agent reading AGENTS.md will see stale information.
- **Fix**: Add Phase 1 step 10 to update AGENTS.md — remove the "no src/ yet" sentence and add src/auth/ to the directory list.
- **Decision**: FIXED — Step 10 and Progress item 1.10 added to plan.

### F2 — Test teardown leaks on assertion failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — tests/test_auth.py contract
- **Detail**: The plan's contract called `app.dependency_overrides.clear()` inline after assertions. No conftest.py existed. If any assertion raised, `.clear()` would never run — the override would leak into subsequent tests.
- **Fix**: Added Phase 2 step 1 to create `tests/conftest.py` with an `autouse` fixture that clears overrides via `yield`. Removed inline `.clear()` from test body.
- **Decision**: FIXED — conftest.py step added to Phase 2; test contract updated.

### F3 — Desired End State says "HTTP 401 otherwise" but missing token → 403

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Desired End State
- **Detail**: Desired End State said "401 otherwise" but HTTPBearer returns 403 for missing header (FastAPI default). Correctly documented in Phase 2 but inconsistent at top level.
- **Fix**: Updated Desired End State to distinguish 403 (no header) from 401 (invalid/expired token).
- **Decision**: FIXED
