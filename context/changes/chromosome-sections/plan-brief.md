# Zwijane sekcje chromosomów — Plan Brief

> Full plan: `context/changes/chromosome-sections/plan.md`

## What & Why

Obecny `ChromosomCanvas` renderuje wszystkie chromosomy w jednym ciągłym canvas — trudno odczytać dane dla konkretnego chromosomu, pasy małe (10/16px), brak etykiet przy torach fazowania, brak tekstu segmentów. Nowa wersja dzieli widok na zwijane sekcje per chromosom z powiększonymi pasami, etykietami i tabelą danych.

## Starting Point

Jeden canvas (~295 linii) z jedną pętlą draw, jednym ResizeObserver, wszystkie chromosomy w jednym widoku. Pasy: SIM=10px, PHASING=16px. Legenda zawiera nazwy par ale bez etykiet przy torach.

## Desired End State

N zwijanych sekcji (▶/▼ Chromosom X, domyślnie zamkniętych). Rozwinięta sekcja pokazuje: canvas torów podobieństwa (20px) → wiersze fazowania z HTML etykietą osoby po lewej i canvas 28px po prawej → tabela tekstowa segmentów (para, typ, start, end, cM, SNPs). Popup AnnotationPopup działa przez callback do rodzica.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Rendering per sekcja | Osobny canvas per chromosom | Zachowuje hit-test i DPR; izolowane draw per chromosome |
| Text info | Lista segmentów jako tabela | Kompletne dane bez potrzeby SegmentTable |
| Phasing labels | HTML div po lewej, canvas po prawej | Czytelne, nie wymaga fillText w canvas |
| Default state | Wszystkie zwinięte | Strona ładuje się zwarcie |
| Bar heights | SIM=20px, PHASING=28px (2×) | Lepiej widoczne i klikalne |
| Popup lokacja | Rodzic ChromosomCanvas | Jeden popup state; poprawna pozycja absolutna |
| Tabela pary | Tylko pairwise | Spójne z canvasem |

## Scope

**In scope:**
- Nowy `ChromosomSection.tsx` (collapsible, canvas similarity, phasing rows, tabela)
- Refaktor `ChromosomCanvas.tsx` (shared containerWidth, popup state, brak draw loop)
- SIM_TRACK_HEIGHT=20, PHASING_TRACK_HEIGHT=28
- Tabela read-only segmentów per chromosom

**Out of scope:**
- Expand/collapse all button
- Sortowanie/filtrowanie tabeli
- 3-way segmenty w tabeli inline
- Zmiany w SegmentTable lub AnnotationPopup

## Architecture / Approach

`ChromosomCanvas` = kontener: zarządza containerWidth (1 ResizeObserver), popup state, chromBoundsRef. Renderuje N `ChromosomSection`. Każda `ChromosomSection` = własny collapse state + własne canvasy (similarity + N×phasing). Hity raportowane do rodzica przez `onPopupRequest(payload, clientX, clientY)`. Rodzic przelicza px/py na lokalne współrzędne i aktualizuje popup.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. ChromosomSection + refaktor | Pełna nowa architektura | Przeliczenie px/py popup między sekcją a głównym kontenerem |

**Prerequisites:** annotation-positioning archived ✓ (chromosome_bounds dostępny w PairResult)
**Estimated effort:** ~1-2 sesje agenta

## Open Risks & Assumptions

- `mainContainerOffsetLeft/Top` — popup musi znać pozycję głównego kontenera; sekcje mogą scrollować, więc `e.clientX/Y` jest właściwą strategią (nie `getBoundingClientRect` sekcji).
- Lazy canvas mounting (tylko gdy sekcja otwarta) — draw effect musi być triggered poprawnie przy pierwszym mount canvas.

## Success Criteria (Summary)

- N zwijanych sekcji per chromosom, domyślnie zamkniętych
- Canvas z 2× większymi pasami i poprawnymi segmentami
- HTML etykiety per osoba przy torach fazowania
- Tabela tekstowa segmentów w każdej sekcji
- Tooltip, popup i adnotacje działają bez regresji
