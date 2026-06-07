<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Fazowanie przez kliknięcie na diagramie

- **Plan**: context/changes/phasing-click/plan.md
- **Scope**: Phase 1 of 1 (full plan)
- **Date**: 2026-06-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical | 2 warnings | 5 observations

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

### F1 — Przestarzały ancestorId gdy przodek usunięty podczas otwartego popup

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: frontend/src/components/AnnotationPopup.tsx:58-59
- **Detail**: ancestorId inicjalizowany raz w useState. Gdy przodek usunięty podczas otwartego popup, handleSave cicho przerywa bez komunikatu.
- **Fix A ⭐ Recommended**: useEffect resetujący ancestorId gdy nie ma go w ancestors.
  - Strength: Eliminuje silent abort.
  - Tradeoff: Nieoczekiwana zmiana wyboru.
  - Confidence: HIGH | Blind spot: Edge-case w MVP solo-user.
- **Fix B**: Dodaj `setError('Wybrany przodek nie istnieje.')` zamiast silent return.
  - Strength: Daje feedback bez zmiany stanu.
  - Tradeoff: Użytkownik musi ręcznie wybrać.
  - Confidence: MED | Blind spot: Brak.
- **Decision**: FIXED via Fix B — setError('Wybrany przodek nie istnieje.') zamiast silent return

### F2 — Popup może wychodzić poza granice kontenera (brak clamp)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: frontend/src/components/AnnotationPopup.tsx:117
- **Detail**: style={{ left: popup.px + 8 }} bez clampu — popup ucina się przy prawej krawędzi.
- **Fix**: W handleClick: gdy `mx + 200 > containerWidth`, ustaw `px = mx - 216`.
- **Decision**: FIXED — clamp px/py w handleClick przed setPopup

### F3 — Strand nieedytowalny w trybie phasing

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency (UX completeness)
- **Location**: frontend/src/components/AnnotationPopup.tsx:173-178
- **Detail**: Strand read-only w trybie phasing. Zmiana strandu wymaga użycia SegmentTable.
- **Fix A ⭐ Recommended**: Zaakceptuj jako świadomą decyzję — pozycja kliknięcia (góra/dół) = strand.
  - Strength: Spójne z modelem interakcji canvas.
  - Tradeoff: Brak ścieżki korekcji strandu bez tabeli.
  - Confidence: HIGH | Blind spot: Brak.
- **Fix B**: Dodaj strand toggle w trybie phasing.
  - Confidence: LOW — może dezorientować.
- **Decision**: ACCEPTED — strand read-only jest intencjonalny; pozycja kliknięcia (góra/dół) definiuje strand

### F4 — allProfiles prop przekazywana ale nieużywana

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Scope Discipline (EXTRA)
- **Location**: AnnotationPopup.tsx:43, ChromosomCanvas.tsx:327
- **Detail**: SIM picker używa pair.person_names z payloadu; allProfiles nigdy nie odczytywane.
- **Fix**: Usuń allProfiles z AnnotationPopup Props i z ChromosomCanvas renderowania.
- **Decision**: FIXED — usunięto allProfiles z Props i JSX

### F5 — handleDelete nie czyści error przed usunięciem

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: AnnotationPopup.tsx:104
- **Detail**: handleSave czyści setError(null); handleDelete nie.
- **Fix**: Dodaj `setError(null)` na początku handleDelete.
- **Decision**: FIXED — setError(null) dodane w handleDelete

### F6 — Podwójne setPopup(null) przy onSave

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: ChromosomCanvas.tsx:326
- **Detail**: onSave wrapper + onClose() oba wywołują setPopup(null). React batches — nie jest błąd.
- **Fix**: Usuń setPopup(null) z wrapera onSave w ChromosomCanvas.
- **Decision**: FIXED — onSave przekazuje bezpośrednio onAnnotate; onClose jest jedyną ścieżką zamknięcia

### F7 — Komunikat błędu powyżej przycisków

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: AnnotationPopup.tsx:203
- **Detail**: AncestorPanel pokazuje błąd po przyciskach; AnnotationPopup przed nimi.
- **Fix**: Przesuń `{error && ...}` poniżej div z przyciskami.
- **Decision**: FIXED — error przeniesiony poniżej przycisków
