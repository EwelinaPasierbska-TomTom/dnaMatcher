<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: DNA Comparison (S-02 + S-03)

- **Plan**: context/changes/dna-comparison/plan.md
- **Scope**: Phases 1–4 of 4
- **Date**: 2026-05-31
- **Verdict**: REJECTED → APPROVED after triage fixes
- **Findings**: 1 critical · 4 warnings · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Brak limitu rozmiaru pliku CSV — możliwe wyczerpanie pamięci

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/routers/comparisons.py:134
- **Detail**: `await f.read()` bez limitu. Złośliwy użytkownik może wyczerpać pamięć serwera gigabajtowym plikiem.
- **Fix**: Dodaj cap 50 MB z read(MAX+1) i HTTPException(413).
- **Decision**: FIXED

### F2 — Brak cleanup dna_profiles przy błędzie insertu comparisons

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/routers/comparisons.py:147-163
- **Detail**: Jeśli insert do comparisons rzuci wyjątek, profile zostają jako osierocone rekordy.
- **Fix**: Owrappuj insert comparisons w try/except z cleanup profile IDs.
  - Strength: Zapobiega akumulacji osieroconych profili.
  - Tradeoff: Cleanup sam może się nie udać — nie jest atomowe.
  - Confidence: MEDIUM — wystarczające na MVP.
- **Decision**: FIXED

### F3 — Usunięcie porównania nie pokazuje błędu przy niepowodzeniu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/ResultsPage.tsx:85-93
- **Detail**: handleDelete swallows błąd — przycisk odblokowuje się bez feedbacku.
- **Fix**: Dodaj setError('Nie udało się usunąć porównania.') w catch.
- **Decision**: FIXED

### F4 — AppPage nie wyświetla błędu przy nieudanym ładowaniu historii

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality + Pattern Consistency
- **Location**: frontend/src/pages/AppPage.tsx:19-28
- **Detail**: Błąd ładowania historii jest cicho połykany — użytkownik widzi 'Brak porównań' zamiast komunikatu.
- **Fix**: Dodaj const [error, setError] i wyświetl komunikat gdy !res.ok.
- **Decision**: FIXED

### F5 — api.ts: getSession bez try/catch

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/api.ts:6
- **Detail**: supabase.auth.getSession() może rzucić przy błędzie sieci bez try/catch.
- **Fix**: Owrappuj getSession w try/catch rzucający Error('Sesja niedostępna.').
- **Decision**: SKIPPED

### F6 — me.py nie używa response_model= (drobna niespójność)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/routers/me.py:9
- **Detail**: comparisons.py używa response_model= na wszystkich endpointach, me.py używa tylko type annotation.
- **Fix**: Dodaj response_model=CurrentUser do dekoratora.
- **Decision**: SKIPPED
