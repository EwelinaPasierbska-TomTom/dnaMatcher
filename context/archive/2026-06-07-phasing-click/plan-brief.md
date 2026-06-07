# Fazowanie przez kliknięcie na diagramie canvas — Plan Brief

> Full plan: `context/changes/phasing-click/plan.md`

## What & Why

S-05 zbudował infrastrukturę hit-test na canvasie (segmenty są "klikalne" w sensie pozycji), ale klik nic nie robił. S-07 podłącza ten mechanizm do API adnotacji z S-04/S-06 — użytkownik klika segment bezpośrednio na diagramie i przypisuje go do przodka bez otwierania tabeli.

## Starting Point

`ChromosomCanvas.tsx` ma `hitTargets.current` (useRef) budowany podczas draw i odczytywany w `onMouseMove`. Typ `HitTarget` ma tylko `content: string` (dla tooltip). `handleUpsertAnnotation` i `handleDeleteAnnotation` istnieją w `ResultsPage` i nie są jeszcze przekazywane do canvas. Backend nie wymaga zmian.

## Desired End State

Kliknięcie segmentu FULL/HALF/NONE na torze podobieństwa otwiera floating popup: wybierz osobę z pary, strand (mat/pat), przodka → klik Zapisz → pasek pojawia się na torze fazowania. Kliknięcie istniejącego paska na torze fazowania otwiera popup edycji (pre-filled przodek, opcja usunięcia). Kursor automatycznie zmienia się na `pointer` nad klikalnymi segmentami.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Co jest klikalne | Tory podobieństwa + tory fazowania | Pełna interaktywność bez tabeli; oba pokryte przez hitTargets |
| Popup design | Floating div przy kursorze | Spójny z istniejącym tooltip; "bez formularza" |
| Picker osoby w SIM | Dropdown z obu profili pary | Adnotacja jest per profile_id — wybór jest wymagany |
| Wybór strandu | Dwa przyciski w popup | Eksplicytny; strand jest required w modelu danych |
| Edycja phasing | Popup z edit + Usuń | Realizuje "edytowalne w miejscu" z roadmapy |
| Empty phasing click | Nic | Pozycja kursora nie mapuje na konkretny segment BP |
| Popup location | Absolute div w ChromosomCanvas | Popup zna pozycję canvas; zero portal overhead |

## Scope

**In scope:**
- Rozszerzenie `HitTarget` o typed union payload (SimPayload | PhasingPayload)
- Nowy komponent `AnnotationPopup.tsx`
- `onClick` na canvasie + stan popup w ChromosomCanvas
- Dynamiczny kursor (pointer/crosshair)
- Nowe props `onAnnotate` + `onDeleteAnnotation` w ChromosomCanvas
- Uzupełnienie `<ChromosomCanvas>` w ResultsPage o nowe props

**Out of scope:**
- Backend (API kompletne)
- Drag-to-annotate
- Undo/redo
- Klik na szary obszar toru fazowania

## Architecture / Approach

`ChromosomCanvas` rozszerza `HitTarget` o typed `payload`. `handleClick` → `setPopup({ ...payload, px, py })`. `AnnotationPopup` to oddzielny komponent absolute-positioned w kontenerze canvas. Callbacks (`onAnnotate`, `onDeleteAnnotation`) przekazywane jako opcjonalne props z ResultsPage — ChromosomCanvas nie wykonuje fetch-ów samodzielnie.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Canvas onClick + AnnotationPopup | Pełna interaktywność canvas: popup tworzenia/edycji/usunięcia | Popup pozycjonowanie przy krawędziach kontenera |

**Prerequisites:** S-05 ✓ (hit-test infra), S-06 ✓ (ancestor colors), API adnotacji ✓
**Estimated effort:** ~1 sesja agenta

## Open Risks & Assumptions

- Popup overflow na wąskim oknie — minimalne zabezpieczenie (flip left/right) powinno wystarczyć dla solo-developer tool.
- `UpsertAnnotationBody.ancestor_label` wypełniany z `ancestor.name` — spójne z istniejącym zachowaniem SegmentTable.

## Success Criteria (Summary)

- Kliknięcie segmentu na canvasie otwiera popup z wyborem osoby/strandu/przodka i zapisuje adnotację
- Kliknięcie istniejącej adnotacji na torze fazowania otwiera popup edycji/usunięcia
- SegmentTable i stare formularze działają bez regresji
