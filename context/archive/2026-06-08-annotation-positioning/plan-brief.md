# Realne granice chromosomów + edycja zakresu adnotacji fazowania — Plan Brief

> Full plan: `context/changes/annotation-positioning/plan.md`

## What & Why

Trzy powiązane ulepszenia wizualizacji i edycji fazowania: (1) diagram pokazuje każdy chromosom w skali od rzeczywistej pierwszej do ostatniej pozycji SNP z porównania — nie stałych hg38, które sprawiają że segmenty wyglądają jako mała część paska; (2) popup edycji fazowania zyskuje pola start/end do ręcznej korekty zakresu adnotacji; (3) kliknięcie szarego toru fazowania tworzy nową adnotację z ręcznie wpisaną pozycją.

## Starting Point

`ChromosomCanvas` skaluje pozycje względem `HG38_LENGTHS` (całe chromosomy), co sprawia że por. na chr1 obejmujące tylko 50M–150M bp widać jako ~40% paska. `AnnotationPopup` w trybie phasing-edit ma read-only pozycje. Szare tło toru fazowania jest nieklikalne.

## Desired End State

Canvas: każdy bar chromosomu wyświetla tylko zakres SNP z porównania — pełna szerokość = od pierwszego do ostatniego wspólnego SNP. Popup fazowania (dla istniejącej adnotacji i nowej) pokazuje edytowalne pola start bp / end bp powyżej dropdownu przodka. Klik na szary obszar toru fazowania otwiera popup tworzenia z przybliżoną pozycją z miejsca kliknięcia.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Źródło granic chromosomu | Backend w PairResult.chromosome_bounds | Dokładniejsze niż frontend (obliczone z wszystkich SNP pary) |
| Zmiana pozycji adnotacji | DELETE stara + POST nowa | Zero zmian backendu; composite key wymaga dwóch requestów |
| Pre-fill popup na szarym kliknięciu | approxBp z pozycji kliknięcia (edytowalny) | Wygodny punkt startowy bez mylenia; user może poprawić |
| Dwa tryby phasing popup | Kolorowy pasek = edycja; szary obszar = tworzenie | Czytelne rozdzielenie przepływów |
| Pola pozycji | Dwa input[type=number] (start, end) powyżej przodka | Prosta implementacja; oba tryby używają tych samych pól |
| Fazy | 2 (backend, frontend) | Backend-first odblokuje TS types na frontend |

## Scope

**In scope:**
- `ChromosomeBoundsOut` w PairResult (backend)
- Nowe skalowanie canvas z chromosome_bounds
- PhasingTrackPayload (klik szarego toru)
- Edytowalne start/end w popupie fazowania (oba tryby)
- DELETE+POST przy zmianie pozycji w edycji
- Test API dla chromosome_bounds

**Out of scope:**
- SIM popup — pozycje read-only (segment jest jednostką z danych)
- Endpoint PATCH /annotations/{id}
- Walidacja że pozycja ∈ zakres SNP danych
- Zoom/pan canvas

## Architecture / Approach

Faza 1 dodaje `ChromosomeBoundsOut` do `PairResult` obliczając per-para min/max z segmentów w `comparisons.py`. TypeScript `PairResult` interface aktualizowany w `ChromosomCanvas.tsx`.

Faza 2: Draw loop używa chromBounds (useRef) zamiast HG38_LENGTHS. Wzór: `(pos - rangeStart) / rangeWidth * trackWidth`. Hit-targety toru fazowania: adnotacje PIERWSZE (wygrywają click), `PhasingTrackPayload` DRUGIE (catch-all dla szarego obszaru). `handleClick` oblicza `approxBp` dla phasing-track payloadu z `mx` i `chromBoundsRef`. Popup dostaje nowe state `startBp`/`endBp`, które `handleSave` używa z logiką DELETE+POST.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend chromosome_bounds | PairResult.chromosome_bounds w API + TS types | Upewnić się że bounds są obliczane dla 3-way pary też |
| 2. Frontend scaling + popup | Nowe skalowanie canvas; phasing popup z pozycjami | Kolejność hit-targetów (adnotacja przed track); DELETE+POST race |

**Prerequisites:** phasing-click archived ✓ (hit-test infra dostępna)
**Estimated effort:** ~2 sesje agenta

## Open Risks & Assumptions

- `chromosome_bounds` dla pary 3-way (A+B+C) też musi być obliczone — implementacja musi obejmować nie tylko pary pairwise.
- `approxBp` z szarego kliknięcia może być poza zakresem faktycznych SNP — user sam wpisuje końcową wartość.
- `chromBoundsRef` w ChromosomCanvas musi być aktualizowany synchronicznie z draw effect (useRef, nie useState — bez re-renderu).

## Success Criteria (Summary)

- Canvas chromosomów skalowany od realnego zakresu SNP (widoczna zmiana dla por. pokrywających <50% chromosomu)
- Popup fazowania pozwala edytować start/end; zmiana pozycji działa bez duplikatów
- Klik szarego toru fazowania tworzy adnotację z manualnie wpisaną pozycją
