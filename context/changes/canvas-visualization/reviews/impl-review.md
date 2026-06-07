<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Interaktywna wizualizacja chromosomów (Canvas)

- **Plan**: context/changes/canvas-visualization/plan.md
- **Scope**: Phase 1 + Phase 2 (full plan)
- **Date**: 2026-06-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical | 3 warnings | 4 observations

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

### F1 — O(n×m) annotations.filter() wewnątrz podwójnej pętli draw

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Performance)
- **Location**: frontend/src/components/ChromosomCanvas.tsx:187
- **Detail**: W pętli draw: for(chromosomes) → for(phasingPersons) → annotations.filter(...) = O(chromosomes × persons × annotations) per redraw. Przy 24 chr, 5 osobach, 500 adnotacjach = 60 000 porównań per draw.
- **Fix**: Przed draw effect zbuduj `Map<profileId, Map<chromosome, AnnotationOut[]>>` przez `useMemo`. Lookup O(1) zamiast O(n).
  - Strength: Eliminuje klasę wydajnościową; standardowy wzorzec pre-bucketing.
  - Tradeoff: Dodatkowa struktura danych (mała).
  - Confidence: HIGH — widoczne przy wzroście liczby adnotacji (S-07 doda więcej).
  - Blind spot: W obecnym MVP z małą liczbą adnotacji efekt niezauważalny.
- **Decision**: SKIPPED

### F2 — Przestarzały tooltip po zmianie danych (stale tooltip)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: frontend/src/components/ChromosomCanvas.tsx:218
- **Detail**: Gdy annotations/pairs zmienią się, hitTargets przebudowany, ale tooltip state nie czyszczony. Tooltip widoczny po dodaniu/usunięciu adnotacji dopóki user nie ruszy myszą.
- **Fix**: Dodaj `setTooltip(null)` wewnątrz draw useEffect po `hitTargets.current = newHits`.
- **Decision**: FIXED — setTooltip(null) dodane po hitTargets.current = newHits

### F3 — Redundantne deps w draw useEffect

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: frontend/src/components/ChromosomCanvas.tsx:219
- **Detail**: `chromGroupHeight`, `totalHeight`, `nPairs`, `nPhasingPersons` w deps są pochodne od `pairwisePairs`, `chromsWithData`, `phasingPersons` — już w deps. Redundancja może powodować extra redraws.
- **Fix**: Usuń `chromGroupHeight`, `totalHeight`, `nPairs`, `nPhasingPersons` z tablicy deps.
- **Decision**: FIXED — redundantne deps usunięte z tablicy useEffect

### F4 — HG38_LENGTHS zduplikowane w ChromosomCanvas i ChromosomeDiagram

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: ChromosomCanvas.tsx:13–20 vs ChromosomeDiagram.tsx:15–22
- **Detail**: Identyczne stałe w dwóch plikach — błąd aktualizacji długości musi być poprawiony w obu miejscach.
- **Fix**: Wyekstrahuj do `frontend/src/lib/genomeConstants.ts`, importuj w obu.
- **Decision**: SKIPPED

### F5 — key={i} w legendzie i PairSection

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: ChromosomCanvas.tsx:240, ResultsPage.tsx:259
- **Detail**: Indeks jako key zamiast stable identity. Przy potencjalnym reorderingu par = błędy reconciliation.
- **Fix**: Zamień na `key={pair.profile_ids.join('-')}` w obu miejscach.
- **Decision**: SKIPPED

### F6 — setData wywołane przed sprawdzeniem annRes/ancRes

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: frontend/src/pages/ResultsPage.tsx:102–105
- **Detail**: setData() (linia 102) wywoływany przed !annRes.ok || !ancRes.ok (linia 105). Efekt: nagłówek porównania + banner błędu jednocześnie.
- **Fix**: Przesuń setData() po bloku sprawdzającym annRes/ancRes.
- **Decision**: SKIPPED

### F7 — Brak komentarza przy ResizeObserver cleanup

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: frontend/src/components/ChromosomCanvas.tsx:113
- **Detail**: ro.disconnect() poprawnie zamknięte, ale brak komentarza wyjaśniającego cel.
- **Fix**: Dodaj krótki komentarz przy `return () => ro.disconnect()`.
- **Decision**: SKIPPED
