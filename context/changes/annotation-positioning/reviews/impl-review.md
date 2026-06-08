<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Realne granice chromosomów + edycja zakresu

- **Plan**: context/changes/annotation-positioning/plan.md
- **Scope**: Phase 1 + Phase 2 (full plan)
- **Date**: 2026-06-08
- **Verdict**: REJECTED
- **Findings**: 2 critical | 2 warnings | 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — GET /comparisons/{id} — Pydantic ValidationError (brak chromosome_bounds)

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/routers/comparisons.py:374-381
- **Detail**: PairResult konstruowany bez chromosome_bounds w GET endpoint. Pole required. Pydantic ValidationError przy każdym GET /api/comparisons/{id}.
- **Fix**: Oblicz chromosome_bounds z segs w GET loop lub wyekstrahuj _compute_bounds(segs) helper.
- **Decision**: FIXED — wyodrębniono _compute_chromosome_bounds(segs) helper; wywołany w _segments_to_pair_result i GET endpoint

### F2 — DELETE-then-POST bez rollback — utrata danych gdy POST rzuci

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Data Safety)
- **Location**: frontend/src/components/AnnotationPopup.tsx:109-112
- **Detail**: DELETE succeeds, POST rzuca → adnotacja usunięta bez zastępstwa.
- **Fix A ⭐ Recommended**: POST-first — wstaw nową, usuń starą tylko po sukcesie POST.
  - Strength: Upsert key (profile_id, chr, start, end) gwarantuje że nowe start/end nie kolidują ze starym rekordem.
  - Tradeoff: Krótka chwila gdy oba wiersze istnieją.
  - Confidence: HIGH | Blind spot: Brak.
- **Fix B**: Atomowy endpoint PATCH /annotations/{id}.
  - Tradeoff: Nowy backend endpoint — poza zakresem.
  - Confidence: MED.
- **Decision**: FIXED via Fix A — POST first, DELETE after success

### F3 — tWidth może być 0/ujemny; approxBp może być ujemny

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: frontend/src/components/ChromosomCanvas.tsx:302-303
- **Detail**: Przy bardzo wąskim kontenerze lub kliknięciu lewo od LABEL_WIDTH → approxBp ujemny lub NaN.
- **Fix**: `Math.max(1, tWidth)` i `Math.max(0, approxBp)`.
- **Decision**: SKIPPED

### F4 — Cichy duplikat gdy onDelete undefined + zmiana pozycji

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: frontend/src/components/AnnotationPopup.tsx:109
- **Detail**: `if (posChanged && onDelete)` — gdy onDelete undefined, DELETE pomijany ale POST tworzy duplikat. Dead code w aktualnej integracji ale pułapka.
- **Fix**: Usuń guard `&& onDelete` (w integracji onDelete jest zawsze przekazywany).
- **Decision**: SKIPPED

### F5 — chromBoundsRef stale przed pierwszym drawem

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: ChromosomCanvas.tsx:74,299
- **Detail**: Fallback b?.start ?? 0, rWidth ?? 1 obsługuje poprawnie. Brak działania wymagane.
- **Decision**: SKIPPED

### F6 — Priorytet hit-testów zależy od kolejności push (implicit)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: ChromosomCanvas.tsx:239-260
- **Detail**: Działa poprawnie — komentarz w kodzie wyjaśnia kolejność. Opcja: komentarz przy gray-track push.
- **Decision**: SKIPPED

### F7 — endBp = approxBp + 1 (1-bp placeholder range)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: AnnotationPopup.tsx:75
- **Detail**: Walidacja przechodzi dla 1-bp range. Użytkownik musi manualnie poszerzyć.
- **Decision**: SKIPPED
