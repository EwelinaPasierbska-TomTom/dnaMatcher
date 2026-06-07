# Interaktywna wizualizacja chromosomów (Canvas) — Plan Brief

> Full plan: `context/changes/canvas-visualization/plan.md`

## What & Why

Obecny `ChromosomeDiagram.tsx` (SVG) pokazuje jeden tor per chromosom i jedną parę na raz — trzeba rozwijać osobne sekcje żeby porównać wyniki dla różnych par. S-05 zastępuje go canvasowym `ChromosomCanvas` pokazującym **wszystkie pary jednocześnie** (do 3 torów podobieństwa + do 3 torów fazowania per chromosom) w jednym unified widoku nad sekcjami z tabelami.

## Starting Point

Codebase ma SVG-based `ChromosomeDiagram.tsx` (174 linie, zero bibliotek, jeden prostokąt per segment). `ResultsPage` renderuje osobny diagram per `PairSection`. Adnotacje mają `profile_id` i `strand: 'maternal'|'paternal'` — gotowe dane do fazowania.

## Desired End State

Na stronie wyników: canvas na górze z chromosomami i wielotorowym układem — widać FULL/HALF/NONE segmenty dla każdej pary oraz colored maternal/paternal paski fazowania per osoba. Hover pokazuje tooltip. Diagram jest responsywny i ostry na Retina. Poniżej canvasa: collapsible tabele segmentów per para (bez własnego diagramu).

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Widok par | Jeden unified canvas (wszystkie pary) | "Jednocześnie" z roadmapy; pozwala porównywać pary na tym samym chromosomie | Plan |
| Tory per chromosom | 3 similarity + 3 phasing (6 total przy 3 profilach) | Realizuje outcome S-05: similarity + fazowanie jednocześnie | Plan |
| Phasing track split | Jeden tor na osobę, maternal=góra/paternal=dół | Kompaktowy; 2 nicie w jednym wierszu | Plan |
| 3-way segments | Pominąć w canvas (tylko pairwise) | 3-way semantycznie inna rzecz; ogranicza złożoność | Plan |
| Rendering tech | Czyste HTML5 Canvas 2D API | Brak bibliotek w projekcie; pełna kontrola | Plan |
| Interaktywność S-05 | Hover tooltip + hit-test infra; onClick = S-07 | S-07 dostaje gotową infrastrukturę, nie przepisuje canvasa | Plan |
| Komponent | Nowy `ChromosomCanvas.tsx`, stary zostaje | Bezpieczna migracja; fallback dostępny | Plan |
| ResultsPage layout | Canvas na górze + tabele w sekcjach poniżej | Zachowuje dostęp do SegmentTable per para | Plan |
| DPR | devicePixelRatio (Retina support) | MacBook 2× — tekst rozmyty bez DPR | Plan |
| Szerokość | Responsywna (ResizeObserver) | Spójne z Tailwind layout max-w-5xl | Plan |
| Legenda | HTML div nad canvasem (nie wewnątrz) | Łatwiejsze renderowanie tekstu HTML vs canvas fillText | Plan |

## Scope

**In scope:**
- Nowy `ChromosomCanvas.tsx` (Canvas 2D API, DPR, ResizeObserver, hit-test, tooltip)
- Tory podobieństwa per para pairwise (FULL=zielony, HALF=żółty, NONE=czerwony)
- Tory fazowania per osoba (maternal/paternal podzielone, kolor przodka)
- Legenda HTML nad canvasem
- `ResultsPage.tsx` integracja (canvas na górze, usuń ChromosomeDiagram z PairSection)

**Out of scope:**
- onClick / phasing-click (S-07)
- Zoom / pan
- Segmenty 3-way w canvas
- Usunięcie starego ChromosomeDiagram.tsx
- Animacje przejść
- Testy jednostkowe logiki layoutu (TypeScript jest gate)

## Architecture / Approach

`ChromosomCanvas` przyjmuje `pairs: PairResult[]`, `allProfiles: ProfileMeta[]`, `annotations: AnnotationOut[]`, `ancestors: AncestorOut[]`. Wewnętrznie filtruje pary do pairwise, deduplikuje osoby dla torów fazowania. Jeden `useEffect` przerysowuje cały canvas przy każdej zmianie danych lub szerokości. `ResizeObserver` triggeruje przerysowanie. Tooltip = `<div>` pozycjonowany absolutnie, widoczny po hover (stan React). Hit-targets zapisane w `useRef` (nie state) — budowane w draw(), odczytywane w `onMouseMove`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Canvas infra + similarity + ResultsPage | Unified canvas z torami podobieństwa, hover tooltip, integracja w ResultsPage | ResizeObserver + DPR combo tricky do debugowania |
| 2. Phasing tracks | Tory fazowania maternal/paternal per osoba z kolorami przodków | Mapping annotation.profile_id → person → track row wymaga uwagi |

**Prerequisites:** S-04 (adnotacje ze strand) ✓, S-06 (ancestor colors) ✓ — oba done.
**Estimated effort:** ~2 sesje agenta (faza 1 ciężka, faza 2 incremental)

## Open Risks & Assumptions

- Canvas wysokość = dynamiczna suma (24 chromosomy × N torów) — może być duże przewijanie; brak scrollowania wewnątrz canvasa (scrolluje cała strona).
- `AnnotationOut.profile_id` zakładamy że jest UUID profilu — zweryfikowane w modelu (`AnnotationOut.profile_id: string`).
- Hit-test linear scan przez N segmentów per chromosom — przy dużej liczbie segmentów (>1000) może być wolny; optymalizacja nie jest w scope.

## Success Criteria (Summary)

- Canvas z prawidłowymi torami widoczny na stronie wyników dla 2- i 3-profilowych porównań
- Hover tooltip działa na torach podobieństwa i fazowania
- Diagram responsywny i ostry na Retina
