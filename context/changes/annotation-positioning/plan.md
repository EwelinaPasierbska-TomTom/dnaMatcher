---
change_id: annotation-positioning
title: Realne granice chromosomów + edycja zakresu adnotacji fazowania
status: planned
created: 2026-06-08
updated: 2026-06-08
---

# Realne granice chromosomów + edycja zakresu adnotacji fazowania — Plan

## Overview

Trzy powiązane zmiany wokół pozycjonowania adnotacji fazowania:
1. **Granice chromosomów z danych** — diagram canvas skaluje każdy chromosom według faktycznego zakresu SNP z porównania (nie stałych hg38), obliczonego przez backend.
2. **Edycja zakresu adnotacji fazowania** — popup edycji (kliknięcie kolorowego paska) pokazuje edytowalne pola start/end; zmiana pozycji = DELETE starej + POST nowej.
3. **Klik na szary tor fazowania** — tworzy nową adnotację z ręcznie wpisywalnym zakresem; pozycja kliknięcia jest wstępnie wypełnionym punktem startowym.

## Current State Analysis

- `src/routers/comparisons.py:29-53` — `PairResult` ma `profile_ids`, `person_names`, `segments: list[SegmentOut]`. Brak pola `chromosome_bounds`.
- `frontend/src/components/ChromosomCanvas.tsx:13-22` — `HG38_LENGTHS` hardcoded; skalowanie `x = LABEL_WIDTH + (seg.start_bp / chromLen) * trackWidth` używa całej długości chromosomu.
- `frontend/src/components/ChromosomCanvas.tsx:180-220` — szare tła torów fazowania NIEKLIKALNE (hit-targety dodawane tylko dla istniejących adnotacji, nie dla pustego tła).
- `frontend/src/components/AnnotationPopup.tsx:83-92` — tryb phasing używa `phasing.annotation.start_position/end_position` wprost (read-only, nie edytowalne).
- Composite key dla upsert adnotacji: `(profile_id, chromosome, start_position, end_position)` → zmiana pozycji = nowy klucz = nowa adnotacja; stara musi być usunięta ręcznie.

## Desired End State

Canvas: każdy chromosom wyświetlany w skali od rzeczywistej pierwszej do ostatniej pozycji SNP z porównania — segmenty o pozycjach np. 50M–150M bp zajmują pełną szerokość baru, nie 20% jak przy hg38. Popup fazowania (edycja i tworzenie) ma dwa pola numeryczne `start bp` i `end bp` powyżej dropdownu przodka. Klik na szary obszar toru fazowania otwiera popup tworzenia z pre-filled przybliżoną pozycją z kliknięcia. Klik na kolorową adnotację otwiera popup edycji z pre-filled wartościami.

### Key Discoveries

- `src/routers/comparisons.py:196-230` — segmenty są obliczane per para i zapisywane do DB; granice chromosomu można obliczyć jako `min(start_bp)` / `max(end_bp)` po segmentach tej pary.
- `frontend/src/components/ChromosomCanvas.tsx:169-172` — wzór skalowania zmienia się na `(seg.start_bp - rangeStart) / rangeWidth * trackWidth`.
- `frontend/src/components/AnnotationPopup.tsx:17-26` — `PhasingPayload` i `SimPayload` eksportowane z AnnotationPopup; nowy `PhasingTrackPayload` dołącza do unii.
- `frontend/src/pages/ResultsPage.tsx:161` — `handleDeleteAnnotation` istnieje i jest dostępny; niezbędny do DELETE+POST przy zmianie pozycji.

## What We're NOT Doing

- Backend nie liczy granic z surowych SNP (tylko z segmentów — to wystarczy i nie wymaga zmian algorytmu).
- Nie dodajemy zoom/pan do diagramu.
- SIM popup nie dostaje edytowalnych pozycji (segment jest jednostką z danych, nie musi być ręcznie definiowany).
- Brak osobnego endpointu PATCH /annotations/{id} — DELETE + POST wystarczy.
- Brak walidacji, że ręcznie wpisane pozycje pokrywają się z SNP w danych (zbyt restrykcyjne dla ręcznych adnotacji).

## Implementation Approach

Dwie fazy: faza 1 zmienia backend (nowe pole w PairResult) i aktualizuje TypeScript interfejsy. Faza 2 używa nowych danych do zmiany skalowania canvas i rozbudowuje popup o edytowalne pozycje oraz nowy tryb "phasing-track" dla szarego obszaru.

## Critical Implementation Details

**Kolejność hit-targetów**: W pętli draw dla toru fazowania, hit-targety istniejących adnotacji MUSZĄ być dodawane do `newHits` PRZED hit-targetami szarego tła. `Array.find()` zwraca pierwszy pasujący — adnotacje (mniejsze prostokąty) muszą wygrywać nad szarym tłem (cały tor).

**PhasingTrackPayload zawiera rangeStart/rangeWidth**: Nie `approxBp` — bo ta wartość zależy od pozycji kliknięcia mx, która jest znana dopiero w `handleClick`. Zamiast tego hit-target przechowuje `rangeStart` i `rangeWidth` (znane w draw-time), a `handleClick` oblicza `approxBp = Math.round(rangeStart + (mx - LABEL_WIDTH) / trackWidth * rangeWidth)`.

**DELETE + POST tylko gdy pozycja się zmieniła**: W `handleSave` trybu phasing-edit porównaj new start/end z `phasing.annotation.start_position/end_position`. Jeśli takie same → zwykły POST (upsert). Jeśli różne → DELETE(old.id) + POST(new). Kolejność: DELETE pierwszy, bo POST z nową pozycją nie koliduje.

---

## Phase 1: Backend — chromosome_bounds w PairResult

### Overview

Dodaje `ChromosomeBoundsOut` model i pole `chromosome_bounds` do `PairResult`. Obliczone z segmentów zwróconych przez algorytm. Aktualizacja TypeScript `PairResult` interface w ChromosomCanvas.

### Changes Required

#### 1. Nowy model ChromosomeBoundsOut

**File**: `src/routers/comparisons.py`

**Intent**: Typ opisujący rzeczywisty zakres pozycji SNP dla jednego chromosomu w tej parze porównania.

**Contract**:
```python
class ChromosomeBoundsOut(BaseModel):
    start_bp: int
    end_bp: int
```

#### 2. Rozszerzenie PairResult o chromosome_bounds

**File**: `src/routers/comparisons.py`

**Intent**: Każda para wynikowa niesie mapę chromosome → (start_bp, end_bp) obliczoną z jej segmentów.

**Contract**: `chromosome_bounds: dict[str, ChromosomeBoundsOut]` jako nowe pole w `PairResult`. Obliczane per para: iteruj `segments`, zbierz `min(start_bp)` i `max(end_bp)` per `chromosome`. Wynik to dict z chromosomami które mają segmenty.

Miejsce obliczenia: w endpoincie `POST /comparisons`, gdzie `pairwise_results` i `three_way_result` są już obliczone — iteruj segmenty każdej pary i zbuduj `chromosome_bounds` przed zwróceniem `ComparisonResponse`.

#### 3. Aktualizacja TypeScript PairResult i ChromosomeBounds

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Zaktualizować TypeScript interface `PairResult` o nowe pole backend, dodać interface `ChromosomeBounds`.

**Contract**:
```typescript
export interface ChromosomeBounds {
  start_bp: number
  end_bp: number
}

export interface PairResult {
  profile_ids: string[]
  person_names: string[]
  segments: SegmentOut[]
  chromosome_bounds: Record<string, ChromosomeBounds>
}
```

### Success Criteria

#### Automated Verification

- `uv run pytest` exits 0
- `uv run mypy .` exits 0
- `uv run ruff check .` exits 0
- `cd frontend && npx tsc --noEmit` exits 0

#### Manual Verification

- `GET /api/comparisons/{id}` zwraca `pairs[].chromosome_bounds` z kluczami = nazwy chromosomów i wartościami `{start_bp, end_bp}`
- Granice są poprawne: `start_bp` = najmniejszy `start_bp` segmentu tej pary dla tego chromosomu

---

## Phase 2: Frontend — nowe skalowanie + popup z pozycjami

### Overview

Używa `chromosome_bounds` z Phase 1 do skalowania canvas. Rozbudowuje `AnnotationPopup` o edytowalne pola pozycji dla trybów fazowania. Dodaje kliwalność szarego toru fazowania (nowy `PhasingTrackPayload`).

### Changes Required

#### 1. Nowy payload type PhasingTrackPayload

**File**: `frontend/src/components/AnnotationPopup.tsx`

**Intent**: Nowy typ payloadu dla kliknięcia na szary obszar toru fazowania (bez istniejącej adnotacji). Zawiera dane potrzebne do obliczenia przybliżonej pozycji.

**Contract**:
```typescript
export interface PhasingTrackPayload {
  type: 'phasing-track'
  person: ProfileMeta
  chromosome: string
  strand: 'maternal' | 'paternal'
  rangeStart: number
  rangeWidth: number
}

export type PopupPayload =
  | (SimPayload & { px: number; py: number })
  | (PhasingPayload & { px: number; py: number })
  | (PhasingTrackPayload & { px: number; py: number })
```

#### 2. Edytowalne start/end w AnnotationPopup (tryby phasing-edit i phasing-create)

**File**: `frontend/src/components/AnnotationPopup.tsx`

**Intent**: Popup edycji i tworzenia adnotacji fazowania zyskuje pola numeryczne `start bp` i `end bp` — widoczne powyżej dropdownu przodka. Tryb SIM nie ma tych pól (pozycja z segmentu).

**Contract**:

State:
```typescript
const [startBp, setStartBp] = useState<number>(() => {
  if (popup.type === 'phasing') return popup.annotation.start_position
  if (popup.type === 'phasing-track') {
    const approxBp = Math.round(popup.rangeStart + 0)  // pre-filled via px in handleClick
    return approxBp
  }
  return 0
})
const [endBp, setEndBp] = useState<number>(...)  // analogicznie
```

Uwaga: `approxBp` jest obliczane w `handleClick` i przekazywane przez `PopupPayload` jako `approxBp: number` — dodać to pole do `PhasingTrackPayload`.

Zaktualizowana `PhasingTrackPayload`:
```typescript
export interface PhasingTrackPayload {
  type: 'phasing-track'
  person: ProfileMeta
  chromosome: string
  strand: 'maternal' | 'paternal'
  approxBp: number  // obliczone w handleClick
}
```

Pola formularza (dla trybów phasing i phasing-track, NIE sim):
- `<input type="number">` dla start bp, pre-filled z annotation.start_position lub approxBp
- `<input type="number">` dla end bp, pre-filled z annotation.end_position lub approxBp + 1
- Walidacja: startBp < endBp przed wywołaniem onSave

`handleSave` dla trybu `phasing-edit` (istniejąca adnotacja):
- Jeśli `startBp !== annotation.start_position || endBp !== annotation.end_position`:
  → await `onDelete(annotation.id)`, potem await `onSave(nowa adnotacja z nowymi pozycjami)`
- Jeśli pozycje niezmienione: zwykły `onSave` (upsert zaktualizuje ancestor)

`handleSave` dla trybu `phasing-track` (nowa adnotacja):
- Zwykły `onSave` z `startBp`, `endBp`, `person.id`, `chromosome`, `strand`, `ancestor`

#### 3. Nowe skalowanie canvas i kliwalność szarego toru

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Zastąpić HG38_LENGTHS granicami z `chromosome_bounds` dla skalowania segmentów i adnotacji. Dodać hit-targety szarego toru fazowania (PhasingTrackPayload), dodawane PO hit-targetach istniejących adnotacji.

**Contract**:

Obliczenie granic per chromosom (w draw effect, przed pętlą po chromosomach):
```typescript
// Merge bounds across all pairwise pairs
const chromBounds: Record<string, { start: number; end: number }> = {}
for (const pair of pairwisePairs) {
  for (const [chrom, b] of Object.entries(pair.chromosome_bounds)) {
    const cur = chromBounds[chrom]
    if (!cur) chromBounds[chrom] = { start: b.start_bp, end: b.end_bp }
    else {
      cur.start = Math.min(cur.start, b.start_bp)
      cur.end = Math.max(cur.end, b.end_bp)
    }
  }
}
```

Nowy wzór skalowania (zamiast `/ chromLen`):
```typescript
const bounds = chromBounds[chrom] ?? { start: 0, end: lengths[chrom] ?? 1 }
const rangeWidth = bounds.end - bounds.start || 1
// Segment:
const x = LABEL_WIDTH + ((seg.start_bp - bounds.start) / rangeWidth) * trackWidth
const w = Math.max(1, ((seg.end_bp - seg.start_bp) / rangeWidth) * trackWidth)
// Annotation:
const x = LABEL_WIDTH + ((ann.start_position - bounds.start) / rangeWidth) * trackWidth
const w = Math.max(1, ((ann.end_position - ann.start_position) / rangeWidth) * trackWidth)
```

Hit-targety toru fazowania — kolejność w pętli draw per-person:
1. Rysuj szare tło (bez hit-target)
2. Rysuj kolorowe adnotacje + push `PhasingPayload` hit-targetów (PIERWSZE)
3. Po pętli adnotacji: push `PhasingTrackPayload` hit-targetów dla górnej i dolnej połowy (OSTATNIE)

Dla PhasingTrackPayload hit-target:
- `{ x: LABEL_WIDTH, y: trackY, w: trackWidth, h: halfH, tooltipContent: '...kliknij aby dodać adnotację', payload: { type: 'phasing-track', person, chromosome: chrom, strand: 'maternal', approxBp: 0 } }` — approxBp jest placeholder (obliczane w handleClick)

`handleClick` rozszerzony o obliczenie approxBp:
```typescript
if (hit.payload.type === 'phasing-track') {
  const bounds = chromBounds[hit.payload.chromosome]
  const rangeWidth = bounds ? (bounds.end - bounds.start || 1) : 1
  const rangeStart = bounds ? bounds.start : 0
  const approxBp = Math.round(rangeStart + ((mx - LABEL_WIDTH) / trackWidth) * rangeWidth)
  setPopup({ ...hit.payload, approxBp, px, py })
} else {
  setPopup({ ...hit.payload, px, py })
}
```

Uwaga: `chromBounds` jest obliczany w draw effect (useRef lub useMemo) i musi być dostępny w `handleClick`. Użyj `useRef<Record<string, {start: number, end: number}>>({})` aktualizowanego w draw effect.

#### 4. ResultsPage — onDelete dostępny dla popup przy zmianie pozycji

**File**: `frontend/src/pages/ResultsPage.tsx`

**Intent**: Popup przy edycji pozycji woła `onDeleteAnnotation(old.id)` przed `onAnnotate(new)`. Callback `onDeleteAnnotation` jest już przekazywany do ChromosomCanvas — brak zmian tutaj; weryfikacja że chain działa.

**Contract**: Brak zmian kodu. Weryfikacja że `handleDeleteAnnotation` jest już przekazany do ChromosomCanvas (tak jest od phasing-click).

### Success Criteria

#### Automated Verification

- `uv run pytest` exits 0
- `cd frontend && npx tsc --noEmit` exits 0

#### Manual Verification

- Diagram chromosomów: segment na chr1 w pozycjach 50M–150M zajmuje pełną szerokość baru (nie 20%)
- Klik na szary tor fazowania otwiera popup z pre-filled start bp ≈ pozycja kliknięcia
- Popup tworzenia ma pola start bp i end bp (edytowalne), ancestor dropdown, strand label
- Zapisanie nowej adnotacji fazowania → pasek pojawia się na tonie fazowania we właściwej pozycji
- Klik na istniejący pasek → popup edycji z pre-filled start/end z adnotacji
- Zmiana start/end → stara adnotacja usunięta, nowa w nowej pozycji
- Zmiana tylko przodka (start/end bez zmian) → prosty upsert (jeden request)

---

## Testing Strategy

### Unit Tests

- `tests/test_comparisons_api.py` — dodać test sprawdzający, że `pairs[].chromosome_bounds` ma właściwe `start_bp`/`end_bp` dla porównania z mockowanymi danymi.

### Manual Testing Steps

1. Zrób porównanie dwóch profili
2. Sprawdź że bar chromosomu 1 zaczyna się od pierwszej pozycji segmentu (nie od 0)
3. Sprawdź `GET /api/comparisons/{id}` → `pairs[0].chromosome_bounds.1.start_bp` == min start_bp segmentów
4. Kliknij szary tor fazowania (np. górna połowa = maternal)
5. Popup otwiera się z przybliżoną pozycją w polu start bp, pusta end bp
6. Wpisz start i end, wybierz przodka, Zapisz
7. Pasek pojawia się na torze fazowania
8. Kliknij pasek → popup z pre-filled danymi
9. Zmień start bp → stary pasek znika, nowy pojawia się w nowej pozycji

## References

- `src/routers/comparisons.py:29-53` — PairResult, SegmentOut
- `frontend/src/components/ChromosomCanvas.tsx:13-22, 169-172` — HG38_LENGTHS, skalowanie
- `frontend/src/components/AnnotationPopup.tsx:17-26, 83-92` — payload types, handleSave phasing

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — chromosome_bounds w PairResult

#### Automated

- [x] 1.1 `uv run pytest` exits 0 — 4fb5c73
- [x] 1.2 `uv run mypy .` exits 0 — 4fb5c73
- [x] 1.3 `uv run ruff check .` exits 0 — 4fb5c73
- [x] 1.4 `cd frontend && npx tsc --noEmit` exits 0 — 4fb5c73

#### Manual

- [x] 1.5 GET /api/comparisons/{id} zwraca pairs[].chromosome_bounds z poprawnymi wartościami — 4fb5c73

### Phase 2: Frontend — nowe skalowanie + popup z pozycjami

#### Automated

- [x] 2.1 `uv run pytest` exits 0 — ff26327
- [x] 2.2 `cd frontend && npx tsc --noEmit` exits 0 — ff26327

#### Manual

- [x] 2.3 Canvas: chromosom skalowany od pierwszej do ostatniej pozycji SNP (nie od 0 do hg38 end) — ff26327
- [x] 2.4 Klik szary tor fazowania → popup tworzenia z pre-filled approxBp i edytowalnymi start/end — ff26327
- [x] 2.5 Zapisanie nowej adnotacji fazowania z canvas działa, pasek widoczny na torze — ff26327
- [x] 2.6 Klik istniejący pasek → popup edycji z pre-filled start/end — ff26327
- [x] 2.7 Zmiana pozycji (start/end) → stara adnotacja usunięta, nowa w nowej pozycji — ff26327
- [x] 2.8 Zmiana tylko przodka (bez zmiany pozycji) → jeden request, brak duplikatu — ff26327
