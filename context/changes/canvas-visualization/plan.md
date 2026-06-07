---
change_id: canvas-visualization
title: Interaktywna wizualizacja chromosomów (Canvas)
status: planned
created: 2026-06-07
updated: 2026-06-07
---

# Interaktywna wizualizacja chromosomów (Canvas) — Plan

## Overview

Zastąpienie istniejącego SVG `ChromosomeDiagram` nowym komponentem `ChromosomCanvas` opartym na HTML5 Canvas 2D API. Nowy komponent pokazuje **wszystkie pary jednocześnie** w jednym unified widoku: do 3 torów podobieństwa (FULL/HALF/NONE per para) + do 3 torów fazowania (maternal/paternal per osoba). `ResultsPage` zyskuje canvas-overview na górze; collapsible `PairSection` zachowują tabele segmentów.

## Current State Analysis

- `frontend/src/components/ChromosomeDiagram.tsx` — SVG, 174 linie. Jeden tor per chromosom, jeden `<rect>` per segment. Props: `{ segments, chromosomeLengths?, annotations?, ancestors? }`. Bez bibliotek, bez canvas.
- `frontend/src/pages/ResultsPage.tsx` — komponent `PairSection` renderuje `ChromosomeDiagram` per para (collapsible). Każda para widzi tylko swoje segmenty.
- Brak jakiegokolwiek `<canvas>` lub D3 w projekcie.
- `frontend/package.json` — React 19, React Router 7, Supabase JS, Tailwind 4. Zero bibliotek wizualizacyjnych.
- Dane: `ComparisonData.pairs: PairResult[]` zawiera do 4 wyników (`profile_ids.length === 2` dla pairwise, `=== 3` dla 3-way). Każdy `PairResult` ma `segments: SegmentOut[]` i `person_names: string[]`.
- Adnotacje: `AnnotationOut.profile_id` + `strand: 'maternal' | 'paternal'` — gotowa baza fazowania.

## Desired End State

Strona wyników ma na górze unified `ChromosomCanvas` prezentujący wszystkie chromosomy z segmentami. Dla każdego chromosomu: N torów podobieństwa (jeden per para pairwise) z kolorowymi segmentami FULL/HALF/NONE, następnie N torów fazowania (jeden per unikalną osobę) z kolorowymi paskami maternal (top) i paternal (bottom) według koloru przodka. Hover nad segmentem pokazuje tooltip z danymi. Diagram jest responsywny (szerokość = kontener), ostry na Retina (devicePixelRatio). Nad canvasem legenda HTML z etykietami torów. Collapsible PairSection nadal istnieją z tabelami, ale bez własnego diagramu.

### Key Discoveries

- `ResultsPage.tsx:34-91` — `PairSection` renderuje `<ChromosomeDiagram segments={pair.segments} ...>`. Do usunięcia w fazie 1.
- `ResultsPage.tsx:9-13` — `PairResult.profile_ids` może mieć length 2 (pairwise) lub 3 (3-way). Canvas renderuje tylko pairwise (`profile_ids.length === 2`).
- `ChromosomeDiagram.tsx:14-22` — `HG38_LENGTHS` — reużyjemy te same stałe w ChromosomCanvas.
- `ChromosomeDiagram.tsx:24-28` — `COLORS: { FULL, HALF, NONE }` — te same kolory w nowym komponencie.
- `AnnotationOut.profile_id` — klucz do grupowania adnotacji per osoba dla torów fazowania (faza 2).
- `ResultsPage.tsx:93` — `data.profiles: ProfileMeta[]` dostępne na poziomie strony — przekazać do ChromosomCanvas dla etykiet torów.

## What We're NOT Doing

- Nie dodajemy D3.js ani żadnej biblioteki wizualizacyjnej.
- Nie usuwamy `ChromosomeDiagram.tsx` — zostaje jako fallback.
- Nie pokazujemy segmentów 3-way (A-B-C) w canvas — tylko pairwise.
- Nie implementujemy onClick (kliknięcie segmentu dla fazowania) — to S-07.
- Nie dodajemy zoom/pan/scroll poziomego na diagramie.
- Nie migrujemy danych — adnotacje bez `ancestor_id` pokazują szary tor w phasing.
- Nie dodajemy animacji przejść przy zmianie danych.

## Implementation Approach

Dwie fazy: faza 1 buduje infrastrukturę canvas (DPR, resize, draw loop, hit-testing, tooltip) i tory podobieństwa, wdraża to do ResultsPage. Faza 2 dodaje tory fazowania do tego samego komponentu.

`ChromosomCanvas` trzyma `useRef` na `<canvas>` i na kontenerze div. `useEffect` (zależny od wszystkich propsów + szerokości) przerysowuje cały canvas. `ResizeObserver` na kontenerze wyzwala przerysowanie przy zmianie szerokości. Tooltip to zwykły `<div>` pozycjonowany absolutnie (state: `{ x, y, content } | null`), aktualizowany w handlerze `onMouseMove`. Hit-test to prosta pętla przez tablicę `HitTarget[]` budowaną przy każdym rysowaniu.

## Critical Implementation Details

**DPR setup**: canvas.width i canvas.height muszą być `cssWidth * dpr` / `cssHeight * dpr`, a `style.width`/`style.height` odpowiednio ustawione na CSS px. `ctx.scale(dpr, dpr)` na początku każdego draw. Bez tego rysowanie będzie rozmyte na Retina.

**Hit-test tablica**: budowana w draw() jako `Array<{ x: number; y: number; w: number; h: number; payload: TooltipPayload }>`. Tablicę zapisać w `useRef` (nie state) żeby `onMouseMove` miał do niej dostęp bez re-renderu.

**Phasing track split**: tor fazowania osoby A ma wysokość `PHASING_TRACK_HEIGHT`. Górna połowa (`0` do `PHASING_TRACK_HEIGHT/2`) = maternal, dolna (`PHASING_TRACK_HEIGHT/2` do `PHASING_TRACK_HEIGHT`) = paternal. Zarówno lookup po `profile_id` jak i po `strand` potrzebny do rysowania.

**Filtrowanie par**: `pairs.filter(p => p.profile_ids.length === 2)` w ChromosomCanvas żeby wykluczyć 3-way. Unikalnych osób: `allProfiles.filter(p => pairwisePairs.some(pair => pair.profile_ids.includes(p.id)))`.

---

## Phase 1: Infrastruktura Canvas + tory podobieństwa + integracja ResultsPage

### Overview

Tworzy nowy `ChromosomCanvas.tsx` z pełną infrastrukturą canvas (DPR, ResizeObserver, draw loop, hit-test, tooltip HTML), rysuje tory podobieństwa (FULL/HALF/NONE) dla każdej pary. Integruje go do `ResultsPage` jako unified overview nad sekcjami par. Usuwa `ChromosomeDiagram` z `PairSection`.

### Changes Required

#### 1. Nowy komponent ChromosomCanvas

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Nowy komponent canvas zastępujący role ChromosomeDiagram. Przyjmuje wszystkie pary i profile, rysuje chromosomy z torami per para, obsługuje hover tooltip i hit-test.

**Contract**:
```typescript
// Props
interface Props {
  pairs: PairResult[]          // tylko pairwise (filtrujemy w środku)
  allProfiles: ProfileMeta[]   // dla etykiet osób w legendzie
  annotations: AnnotationOut[] // do fazy 2 (przekazać, nie używać w fazie 1)
  ancestors: AncestorOut[]     // do fazy 2
  chromosomeLengths?: Record<string, number>  // default: HG38_LENGTHS
}
```

Komponent eksportuje interfejsy `PairResult` i `ProfileMeta` (albo importuje z istniejących plików) żeby ResultsPage nie duplikowało typów.

Stałe layoutu:
- `LABEL_WIDTH = 36` (etykieta chromosomu)
- `SIM_TRACK_HEIGHT = 10` (tor podobieństwa)
- `TRACK_GAP = 2` (odstęp między torami)
- `CHROM_GAP = 8` (odstęp między chromosomami)

Draw sequence per chromosom:
1. `fillText` — etykieta chromosomu (np. "1", "22", "X")
2. Per pair track: szary `fillRect` tło, kolorowe `fillRect` per segment (kolor = `COLORS[seg.match_type]`)
3. Każdy rysowany segment dodany do `hitTargets.current` z payloadem

Tooltip: `<div>` z `position: absolute`, `pointerEvents: none`, widoczny gdy `tooltip !== null`. Zawiera: `Chr${chrom}: ${start.toLocaleString()}–${end.toLocaleString()} bp | ${match_type} | ${snp_count} SNPs${length_cm ? ' | ' + length_cm.toFixed(1) + ' cM' : ''}`.

Legenda (HTML, nad canvasem): wiersz `<div>` ze skrótami etykiet par (np. "Jan vs Maria") i ikonkami koloru FULL/HALF/NONE.

#### 2. Aktualizacja ResultsPage — integracja ChromosomCanvas

**File**: `frontend/src/pages/ResultsPage.tsx`

**Intent**: Dodać ChromosomCanvas na górze strony wyników (przed sekcjami par). Usunąć `<ChromosomeDiagram>` z PairSection. Przekazać `data.pairs` i `data.profiles` do ChromosomCanvas.

**Contract**:
- Import `ChromosomCanvas` z `'../components/ChromosomCanvas'`
- W głównym JSX `ResultsPage` (przed `data.pairs.map`): `<ChromosomCanvas pairs={data.pairs} allProfiles={data.profiles} annotations={annotations} ancestors={ancestors} />`
- W `PairSection`: usunąć sekcję `<h3>Diagram chromosomów</h3>` + `<ChromosomeDiagram ...>` (linie 63–72 bieżącego pliku). Zachować sekcję `<SegmentTable ...>`.
- Import `ChromosomeDiagram` usunąć z ResultsPage.

### Success Criteria

#### Automated Verification

- `cd frontend && npx tsc --noEmit` exits 0
- `uv run pytest` exits 0
- `uv run ruff check .` exits 0

#### Manual Verification

- Canvas widoczny na stronie wyników nad sekcjami par
- Dla porównania 2 osób: 1 tor per chromosom z kolorowymi segmentami FULL/HALF/NONE
- Dla porównania 3 osób: 3 tory per chromosom (A-B, A-C, B-C)
- Hover nad segmentem pokazuje tooltip z danymi (chromosome, bp range, match_type, SNPs)
- Diagram responsywny — zmiana szerokości okna przerysowuje canvas
- Diagram ostry na Retina (nie rozmyty)
- Legenda HTML nad canvasem pokazuje etykiety par
- PairSection nie zawiera już osobnego diagramu chromosomów (tylko tabela)

---

## Phase 2: Tory fazowania (maternal/paternal per osoba)

### Overview

Rozszerza `ChromosomCanvas` o tory fazowania: jeden tor per unikalną osobę ze wszystkich pairwise par, każdy podzielony na górną połowę (maternal) i dolną (paternal). Segmenty fazowania kolorowane kolorem przodka z `ancestorColorMap`, brak adnotacji = szary.

### Changes Required

#### 1. Tory fazowania w ChromosomCanvas

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Po torach podobieństwa, dla każdego chromosomu dorysować tory fazowania per osoba. Każdy tor pokazuje adnotacje tej osoby pokolorowane strand-em.

**Contract**:
- `PHASING_TRACK_HEIGHT = 16` (wyższy niż SIM — dzielony na pół)
- Unikalne osoby: `pairwisePairs.flatMap(p => p.profile_ids)` → deduplicate → map to ProfileMeta
- Na każdy tor fazowania osoby X:
  - Szary `fillRect` tło (pełna wysokość)
  - `annotations.filter(a => a.profile_id === profile.id && a.chromosome === chrom)` → per adnotacja:
    - `a.strand === 'maternal'`: kolorowy `fillRect` w górnej połowie (`y` do `y + PHASING_TRACK_HEIGHT/2`)
    - `a.strand === 'paternal'`: kolorowy `fillRect` w dolnej połowie
    - Kolor: `ancestorColorMap[a.ancestor_id] ?? '#9ca3af'` (szary fallback)
  - Każdy rysowany segment dodany do `hitTargets.current` z payloadem: `{ type: 'phasing', strand, personName, ancestorLabel }`
- Tooltip dla phasing: `Chr${chrom}: ${start}–${end} bp | ${strand} | ${personName}${ancestorLabel ? ' → ' + ancestorLabel : ''}`
- Legenda HTML rozszerzona: labels fazowania per osoba (np. "Fazowanie: Jan, Maria, Piotr")

#### 2. Aktualizacja wysokości canvas

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Całkowita wysokość canvas musi uwzględniać dodane tory fazowania.

**Contract**: `chromHeight = nSimilarityTracks * (SIM_TRACK_HEIGHT + TRACK_GAP) + nPhasingTracks * (PHASING_TRACK_HEIGHT + TRACK_GAP)`. Total canvas height = `sum(chromHeight for chrom in chromsWithData) + CHROM_GAP * (n - 1) + padding`.

### Success Criteria

#### Automated Verification

- `cd frontend && npx tsc --noEmit` exits 0
- `uv run pytest` exits 0

#### Manual Verification

- Tory fazowania widoczne pod torami podobieństwa dla każdego chromosomu
- Adnotowane segmenty pokolorowane kolorem przodka w górnej (maternal) lub dolnej (paternal) połowie toru
- Segmenty bez adnotacji wyświetlają szare tło (brak kolorowego paska)
- Hover nad torem fazowania pokazuje tooltip ze strand i imieniem osoby
- Stare adnotacje bez `ancestor_id` wyświetlają się w szarym kolorze fallback (nie crashuje)
- Legenda nad canvasem pokazuje zarówno pary jak i osoby fazowane

---

## Testing Strategy

### Unit Tests

Brak nowych testów backendowych (faza 1 i 2 są czysto frontendowe). TypeScript jako gate — tsc wykrywa błędy typów. Logika layout-u (obliczenia offsetów Y, skalowanie bp→px) weryfikowana manualnie.

### Manual Testing Steps

1. Otwórz porównanie z 2 profilami — sprawdź 1 tor podobieństwa per chromosom
2. Otwórz porównanie z 3 profilami — sprawdź 3 tory per chromosom (A-B, A-C, B-C)
3. Hover nad różnymi segmentami — tooltip z danymi
4. Zmień szerokość okna — canvas przerysowuje się responsywnie
5. Na MacBooku Retina — tekst i segmenty ostre (nie rozmyte)
6. Dodaj adnotację maternal do segmentu — pojawia się w górnej połowie toru fazowania
7. Dodaj adnotację paternal — dolna połowa
8. Usuń przodka — tor fazowania wraca do szarego
9. PairSection: brak własnego diagramu (tylko tabela)
10. Legenda poprawnie opisuje tory i kolory

## References

- Istniejący SVG (do zastąpienia): `frontend/src/components/ChromosomeDiagram.tsx`
- Koordynacja danych: `frontend/src/pages/ResultsPage.tsx`
- Interfejsy danych: `PairResult` w `ResultsPage.tsx:9-13`, `AnnotationOut` w `ChromosomeDiagram.tsx:3-12`
- Kolory segmentów: `ChromosomeDiagram.tsx:24-28` (FULL/HALF/NONE)
- Długości chromosomów hg38: `ChromosomeDiagram.tsx:14-22`
- Wzorzec ancestorColorMap: `ChromosomeDiagram.tsx:57-59`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Infrastruktura Canvas + tory podobieństwa + integracja ResultsPage

#### Automated

- [x] 1.1 `cd frontend && npx tsc --noEmit` exits 0
- [x] 1.2 `uv run pytest` exits 0
- [x] 1.3 `uv run ruff check .` exits 0

#### Manual

- [ ] 1.4 Canvas widoczny na stronie wyników nad sekcjami par
- [ ] 1.5 Dla 2 osób: 1 tor per chromosom z kolorowymi segmentami FULL/HALF/NONE
- [ ] 1.6 Dla 3 osób: 3 tory per chromosom (A-B, A-C, B-C)
- [ ] 1.7 Hover nad segmentem pokazuje tooltip z danymi
- [ ] 1.8 Diagram responsywny (resize okna przerysowuje canvas)
- [ ] 1.9 Diagram ostry na Retina
- [ ] 1.10 Legenda HTML pokazuje etykiety par
- [ ] 1.11 PairSection nie zawiera już diagramu (tylko tabela)

### Phase 2: Tory fazowania (maternal/paternal per osoba)

#### Automated

- [ ] 2.1 `cd frontend && npx tsc --noEmit` exits 0
- [ ] 2.2 `uv run pytest` exits 0

#### Manual

- [ ] 2.3 Tory fazowania widoczne pod torami podobieństwa
- [ ] 2.4 Segmenty kolorowane kolorem przodka (maternal góra / paternal dół)
- [ ] 2.5 Hover na torze fazowania — tooltip ze strand i osobą
- [ ] 2.6 Stare adnotacje bez ancestor_id — szary fallback, nie crashuje
- [ ] 2.7 Legenda pokazuje zarówno pary jak i osoby fazowane
