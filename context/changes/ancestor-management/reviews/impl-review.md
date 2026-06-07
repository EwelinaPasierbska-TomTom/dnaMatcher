<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Named ancestor management

- **Plan**: context/changes/ancestor-management/plan.md
- **Scope**: Phase 1 + Phase 2 (full plan)
- **Date**: 2026-06-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical | 5 warnings | 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — ancestor_id not verified as owned by current user

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality (Security)
- **Location**: src/routers/annotations.py:131
- **Detail**: ancestor_id z AnnotationIn jest zapisywane bezpośrednio do DB bez sprawdzenia, czy ten ancestor należy do current_user. Klient może podać UUID ancestor'a innego użytkownika. RLS na ancestors blokuje READ, ale FK reference nie jest chroniony przez RLS — zapis przejdzie. Efekt: adnotacja user A z foreign key do ancestor'a user B; gdy user B usuwa przodka, CASCADE kasuje adnotację user A.
- **Fix A ⭐ Recommended**: Ownership check przed zapisem — SELECT id FROM ancestors WHERE id = body.ancestor_id AND user_id = current_user.id przed upsert.
  - Strength: Zamknięcie luki w jednym miejscu; wzorzec identyczny z profile-ownership check w comparisons.py:113-121.
  - Tradeoff: Dodatkowy round-trip do DB na każdy upsert z ancestor_id.
  - Confidence: HIGH — luka jest realna; fix jest minimalny i lokalny.
  - Blind spot: Nie sprawdzono, czy Supabase FK constraint + RLS kombo blokuje to na poziomie DB.
- **Fix B**: FK constraint + DB-level check (nowa migracja z CHECK constraint lub trigger wymuszającym ownership).
  - Strength: Enforce na poziomie DB — nie można obejść przez żaden endpoint.
  - Tradeoff: Wymaga nowej migracji; trudniejsze do testowania.
  - Confidence: MED — specyfika Supabase RLS + FK interactions wymaga weryfikacji.
  - Blind spot: Supabase może już to blokować przez RLS; nie potwierdzono.
- **Decision**: SKIPPED

### F2 — POST /ancestors łapie wszystkie wyjątki jako 409

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/routers/ancestors.py:85
- **Detail**: except Exception → raise HTTPException(409) łapie WSZYSTKIE błędy. Frontend interpretuje 409 jako "ta nazwa już istnieje" i wyświetli złą wiadomość dla prawdziwego błędu serwera. Porównaj: comparisons.py:186 używa except Exception → 500.
- **Fix**: Sprawdź typ/treść wyjątku przed zwróceniem 409 (np. `if 'unique' in str(exc).lower(): raise 409` else `raise 500`).
  - Strength: Wzorzec możliwy do zastosowania w jednym bloku catch.
  - Tradeoff: String-matching na wyjątkach PostgREST jest kruche.
  - Confidence: HIGH — problem jest realny, fix lokalny.
  - Blind spot: Dokładna klasa wyjątku unique-violation w supabase-py wymaga weryfikacji.
- **Decision**: FIXED — except Exception as exc; if 'unique' in str(exc).lower() → 409 else → 500

### F3 — React Fragment bez key w SegmentTable

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency (React correctness)
- **Location**: frontend/src/components/SegmentTable.tsx:219
- **Detail**: sorted.map() renderuje <> (Fragment) bez key prop. Powoduje warning React w runtime i może tworzyć subtelne reconciliation bugs gdy isExpanded się przełącza.
- **Fix**: Zamień `<>` na `<React.Fragment key={i}>` (lub key na composite string).
- **Decision**: FIXED — <Fragment key={`${seg.chromosome}-${seg.start_bp}-${seg.end_bp}`}>

### F4 — Ciche niepowodzenie ładowania ancestors/adnotacji na stronie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: frontend/src/pages/ResultsPage.tsx:106
- **Detail**: Promise.all ładuje comparison + annotations + ancestors. Gdy annRes lub ancRes zwraca non-ok, kod cicho default'uje do [] bez komunikatu. Użytkownik widzi stronę z pustymi danymi, nie wiedząc że ładowanie się nie powiodło.
- **Fix**: Sprawdź !annRes.ok i !ancRes.ok po Promise.all, ustaw stan błędu/baneru.
- **Decision**: FIXED — !annRes.ok || !ancRes.ok → setError i return

### F5 — Inline "Dodaj nowego" w SegmentTable bez pickera koloru

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: frontend/src/components/SegmentTable.tsx:323-332
- **Detail**: Plan: "mini-formularz inline (name input + 8 kolorowych kółek)". Implementacja: tylko pole name. Stan newAncestorColor zainicjowany na '#f97316' ale nigdy nie można go zmienić z UI — nowy przodek zawsze dostaje kolor pomarańczowy.
- **Fix A ⭐ Recommended**: Dodaj 8 color circles (wzorzec z AncestorPanel.tsx:58-90).
  - Strength: Realizuje plan; wzorzec gotowy w AncestorPanel — copy-paste.
  - Tradeoff: Rozszerza inline form w tabeli.
  - Confidence: HIGH — ANCESTOR_COLORS jest już importowane w SegmentTable.
  - Blind spot: Przestrzeń wizualna na 8 kółek w tabeli nie weryfikowana.
- **Fix B**: Dokumentuj jako świadome uproszczenie UX — kolor wybierasz tylko w AncestorPanel.
  - Strength: Mniej kodu; spójna filozofia — panel zarządza przodkami.
  - Tradeoff: Odbiega od planu; wymaga dokumentacji odchylenia.
  - Confidence: MED — zależy od preferencji UX.
  - Blind spot: Brak.
- **Decision**: FIXED via Fix A — dodano 8 color circles + import ANCESTOR_COLORS w SegmentTable

### F6 — update_ancestor brak obsługi uniqueness violation

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/routers/ancestors.py:94-111
- **Detail**: Zmiana nazwy przodka na istniejącą → unhandled exception → 500. POST ma catch, PUT nie.
- **Fix**: try/except w update_ancestor analogiczny do create_ancestor (po naprawieniu F2).
- **Decision**: FIXED — try/except z unique check dodany do update_ancestor

### F7 — ChromosomeDiagram: fallback dla orphaned ancestor_id

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: frontend/src/components/ChromosomeDiagram.tsx:159
- **Detail**: Plan: gdy ancestor_id nie ma w mapie → '#6366f1'. Impl: fallback do 'url(#annotated-stripe)' dla obu przypadków. Edge-case: przodek usunięty ale adnotacja ocalała w wyniku błędu synchronizacji.
- **Fix**: `ancestor_id && !ancestorColorMap[ancestor_id]` → '#6366f1'.
- **Decision**: SKIPPED

### F8 — AncestorPanel: brak komunikatu błędu przy onAdd/onUpdate

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: frontend/src/components/AncestorPanel.tsx:37, 56
- **Detail**: try/finally bez catch — błąd z serwera cicho znika, formularz zamyka się bez feedbacku.
- **Fix**: Dodaj catch z lokalnym stanem błędu, wzorzec z SegmentTable:358.
- **Decision**: FIXED — formError state + catch w handleAdd/handleUpdate

### F9 — id parameter shadowing useParams id

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/pages/ResultsPage.tsx:182, 193
- **Detail**: handleUpdateAncestor(id, ...) i handleDeleteAncestor(id) shadowują zewnętrzne id z useParams. Runtime poprawny, ale readability hazard.
- **Fix**: Zmień parametry na ancestorId.
- **Decision**: SKIPPED

### F10 — Brak potwierdzenia przed usunięciem przodka

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: frontend/src/components/AncestorPanel.tsx:131
- **Detail**: Usunięcie przodka kaskadowo usuwa WSZYSTKIE jego adnotacje dla wszystkich porównań. Brak confirm() dialog — a np. usunięcie porównania ma potwierdzenie (ResultsPage.tsx:202).
- **Fix**: Dodaj confirm() w onClick przed wywołaniem onDelete.
- **Decision**: FIXED — window.confirm() z komunikatem o kaskadowym usunięciu adnotacji
