<!-- PLAN-REVIEW-REPORT -->
# Plan Review: User Authentication (S-01)

- **Plan**: `context/changes/user-authentication/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-29
- **Verdict**: REVISE → SOUND (po triażu wszystkie findings naprawione lub zaakceptowane)
- **Findings**: 1 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| End-State Alignment | WARNING → FIXED (F2) |
| Lean Execution | WARNING → FIXED (F3) |
| Architectural Fitness | PASS |
| Blind Spots | FAIL → FIXED (F1, F4, F5) |
| Plan Completeness | WARNING → FIXED (F6) |

## Grounding

8/8 paths ✓ (all new paths correctly flagged as new), 3/3 symbols ✓ (get_current_user, me_router.router, /me in tests:test_auth.py:23,30), brief↔plan ✓

## Findings

### F1 — Render Python runtime nie ma Node.js/npm — Phase 5 buildCommand się nie uruchomi

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; każda opcja ma inną cenę
- **Dimension**: Blind Spots
- **Location**: Phase 5, render.yaml
- **Detail**: render.yaml:4 `runtime: python`. Nixpacks nie wykrywa Node.js bez package.json w rootu projektu. buildCommand `npm ci && npm run build` zakończyłby się `npm: command not found`.
- **Fix A ⭐ Applied**: Dodano `NODE_VERSION: "20"` do render.yaml envVars + note weryfikacyjny w planie.
- **Decision**: FIXED via Fix A

---

### F2 — GET / zwraca JSON zamiast React — Phase 5 kryterium sukcesu błędne

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; fix oczywisty i wąski
- **Dimension**: End-State Alignment
- **Location**: Phase 5 — main.py + Manual Verification
- **Detail**: main.py:9 `@app.get("/")` ma priorytet przed app.mount(StaticFiles). `GET /` zwracał JSON zamiast React index.html. Phase 5 Manual Verification 5.5 mówiło "localhost:8000/ → React app loads" — to nie działało. Konsekwencja: `test_root_unprotected` w test_auth.py by się posypał.
- **Fix Applied**: Phase 5 usuwa `GET /` route, dodaje `healthCheckPath: /health` do render.yaml, aktualizuje test_auth.py (test_root_unprotected → test_health_unprotected), poprawia kryterium 5.5 na "localhost:8000/login".
- **Decision**: FIXED

---

### F3 — Phase 2 i Phase 3 oba implementują AppPage sign-out — nakładające się kontrakty

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; fix oczywisty i wąski
- **Dimension**: Lean Execution
- **Location**: Phase 2 §10 kontrakt, Phase 3 §3
- **Detail**: Phase 2 kontrakt AppPage: "Sign-out button calls signOut() from useAuth()" — pełna implementacja. Phase 3 §3 "Add sign-out functionality" — duplikuje. Implementer zdezorientowany.
- **Fix Applied**: Usunięto §3 (AppPage update) z Phase 3. Phase 3 overview zaktualizowane: "AppPage z sign-out jest w pełni zaimplementowana w Phase 2".
- **Decision**: FIXED

---

### F4 — package-lock.json nie wymieniony — npm ci w Render build fail

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; fix oczywisty i wąski
- **Dimension**: Blind Spots
- **Location**: Phase 2 Success Criteria, Phase 5 buildCommand
- **Detail**: `npm ci` wymaga `package-lock.json`. Po `npm install` w Phase 2 developer musi commitować lock file — plan tego nie mówił.
- **Fix Applied**: Phase 2 SC: zmieniono `npm ci` → `npm install` (generuje lock file); dodano Manual Verification: "commituj package-lock.json". Progress 2.1 zaktualizowane.
- **Decision**: FIXED

---

### F5 — .gitignore nie obejmuje frontend/node_modules ani frontend/dist

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; fix oczywisty i wąski
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — pominięty krok
- **Detail**: .gitignore jest Python-only (potwierdzone). frontend/node_modules/ (~300MB) byłby untracked po npm install.
- **Fix Applied**: Dodano §0 w Phase 2 Changes Required: "Aktualizuj .gitignore — dodaj frontend/node_modules/ i frontend/dist/".
- **Decision**: FIXED

---

### F6 — Progress item 1.13 nie ma odpowiednika w Phase 1 Success Criteria

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; fix oczywisty i wąski
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Success Criteria vs. ## Progress §Phase 1
- **Detail**: Phase 1 Manual Verification miało 5 bulletów. Progress §Phase 1 §Manual miało 6 itemów (1.13: update database-schema/change.md). Naruszenie Progress↔Phase kontraktu.
- **Fix Applied**: Dodano bullet do Phase 1 Manual Verification: "Update context/changes/database-schema/change.md — status: done".
- **Decision**: FIXED
