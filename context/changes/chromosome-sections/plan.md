---
change_id: chromosome-sections
title: Zwijane sekcje chromosomów z canvas per chromosom i tabelą segmentów
status: planned
created: 2026-06-08
updated: 2026-06-08
---

# Zwijane sekcje chromosomów — Plan

## Overview

Refaktoryzacja `ChromosomCanvas` z jednego dużego canvas (wszystkie chromosomy naraz) na N zwijanych sekcji HTML (domyślnie zwinięte), po jednej na chromosom. Każda sekcja zawiera: canvas torów podobieństwa, wiersze fazowania per osoba (HTML etykieta + canvas), oraz tabelę segmentów tekstowych. Pasy powiększone 2×.

## Current State Analysis

- `ChromosomCanvas.tsx` — jeden canvas (~295 linii), jeden ResizeObserver, jedna pętla draw dla wszystkich chromosomów, hit-targets + popup w jednym kontenerze.
- SIM_TRACK_HEIGHT = 10, PHASING_TRACK_HEIGHT = 16 — małe pasy.
- Etykiety torów tylko w legendzie nad canvasem — brak etykiet per osoba przy torach.
- Brak informacji tekstowych per chromosom (segmenty tylko w SegmentTable osobno).

## Desired End State

Diagram chromosomów = N zwijanych sekcji. Każda sekcja:
- Nagłówek `▶ Chromosom 1` (klikalny, rozwijający) → `▼ Chromosom 1` gdy otwarty.
- Gdy rozwinięta: canvas torów podobieństwa → etykietowane wiersze fazowania → tabela segmentów.
- Pas podobieństwa 20px, pas fazowania 28px (maternal 14px / paternal 14px).
- Legenda kolorów nad całością (jak dotychczas).
- Popup AnnotationPopup — absolutny w kontenerze głównym ChromosomCanvas.

### Key Discoveries

- `ChromosomCanvas.tsx:64-84` — `pairwisePairs`, `chromsWithData`, `phasingPersons`, `ancestorColorMap` — te wartości memoizowane nadal na poziomie rodzica, przekazywane do sekcji przez props.
- `ChromosomCanvas.tsx:73-74` — `chromBoundsRef` — per-chromosom bounds do skalowania — dostępny w rodzicu, przekazywany per-sekcja.
- `ChromosomCanvas.tsx:282-319` — `handleClick` z approxBp — musi znać `chromBoundsRef[chrom]` i szerokość trackWidth per sekcja.
- `AnnotationPopup.tsx` — popup absolutny w `containerRef` div — po refaktorze popup absolutny w głównym wrapper ChromosomCanvas.
- Hit-test: każda sekcja buduje lokalne `hitTargets` i wywołuje callback `onHit(payload, px, py)` do rodzica, który zarządza `popup` state.

## What We're NOT Doing

- Nie dodajemy "expand all / collapse all" przycisku.
- 3-way segmenty NIE są w tabeli inline (tylko pairwise, spójne z canvasem).
- Nie przenosimy logiki SegmentTable (formularze adnotacji) do nowej tabeli — tabela jest read-only.
- Nie dodajemy sortowania/filtrowania do tabeli inline.
- Stary ChromosomeDiagram.tsx (SVG) — bez zmian.

## Implementation Approach

Jeden refaktor pliku `ChromosomCanvas.tsx` + nowy plik `ChromosomSection.tsx`. Rodzic `ChromosomCanvas` zarządza: legendą, wspólną szerokością kontenera (ResizeObserver), popup state, chromBoundsRef. Każda `ChromosomSection` jest niezależnym komponentem z własnym collapse state i własnymi canvasami (similarity + per-person phasing).

## Critical Implementation Details

**Hit-test routing**: Każdy canvas (similarity i phasing per osoba) w `ChromosomSection` buduje własną tablicę hitTargets i reaguje na `onMouseMove`/`onClick`. Zamiast ustawiać popup lokalnie, wywołuje `onPopupRequest(payload, px, py)` callback do rodzica, który zarządza jednym `popup` state. Px/py są współrzędnymi CSS relatywnymi do głównego kontenera ChromosomCanvas — kalkul: `e.clientX - mainContainerRef.current.getBoundingClientRect().left`.

**Shared containerWidth**: Rodzic obserwuje szerokość głównego kontenera (ResizeObserver) i przekazuje `containerWidth: number` jako prop do każdej `ChromosomSection`. Każda sekcja przelicza `trackWidth = containerWidth - LABEL_WIDTH - 8` bez własnego ResizeObserver.

**Canvas lazy draw**: Gdy sekcja jest zwinięta, canvas nie istnieje w DOM (conditional render). Gdy jest rozwijana, canvas jest montowany i draw effect uruchamia się przy pierwszym renderze. Brak `ResizeObserver` per sekcja — szerokość znana z `containerWidth` prop.

**Popup pozycja**: `AnnotationPopup` jest `absolute` w głównym wrapper div (`ref={mainContainerRef}`), tak jak dotychczas. `px`/`py` muszą być relatywne do tego samego kontenera.

---

## Phase 1: ChromosomSection komponent + refaktor ChromosomCanvas

### Overview

Tworzy `ChromosomSection.tsx` (zwijalna sekcja per chromosom z canvasem podobieństwa, wierszami fazowania i tabelą) i refaktoryzuje `ChromosomCanvas.tsx` (dzieli draw loop na per-sekcja, shared containerWidth, popup na poziomie rodzica).

### Changes Required

#### 1. Nowe stałe wysokości pasków

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Podwoić wysokości pasków dla lepszej czytelności i wygody klikania.

**Contract**: `SIM_TRACK_HEIGHT = 20`, `PHASING_TRACK_HEIGHT = 28` (było 10 i 16). Reszta stałych bez zmian.

#### 2. Nowy komponent ChromosomSection

**File**: `frontend/src/components/ChromosomSection.tsx`

**Intent**: Jeden chromosom = jedna zwijana sekcja HTML. Canvas similarity + phasing rows + tabela — wszystko per-chromosom.

**Contract**:
```typescript
interface Props {
  chrom: string                    // "1", "22", "X"
  pairwisePairs: PairResult[]
  phasingPersons: ProfileMeta[]
  annotations: AnnotationOut[]
  ancestorColorMap: Record<string, string>
  chromBounds: ChromosomeBounds | undefined  // z chromBoundsRef.current[chrom]
  chromosomeLengths?: Record<string, number>
  containerWidth: number           // z rodzica ResizeObserver
  onPopupRequest: (payload: SimPayload | PhasingPayload | PhasingTrackPayload, px: number, py: number) => void
  // px, py relatywne do ChromosomCanvas głównego kontenera
  mainContainerOffsetLeft: number  // pozycja lewego brzegu ChromosomCanvas dla przeliczenia px
  mainContainerOffsetTop: number   // pozycja górnego brzegu
}
```

Struktura JSX sekcji:
```tsx
<div>
  {/* Nagłówek */}
  <button onClick={() => setOpen(v => !v)} className="...">
    <span>{open ? '▼' : '▶'}</span>
    <span>Chromosom {chrom}</span>
  </button>

  {open && (
    <div className="space-y-2 px-4 py-2">
      {/* Canvas podobieństwa */}
      <canvas ref={simCanvasRef} ... />

      {/* Wiersze fazowania per osoba */}
      {phasingPersons.map(person => (
        <div key={person.id} className="flex items-start gap-2">
          <span className="w-20 shrink-0 text-xs text-gray-600">{person.name}</span>
          <canvas ref={...} ... />
        </div>
      ))}

      {/* Tabela segmentów */}
      <ChromosomSegmentTable chrom={chrom} pairwisePairs={pairwisePairs} />
    </div>
  )}
</div>
```

Canvas similarity (per chromosom): rysuje N torów (po jednym per para pairwise), każdy 20px high. Skalowanie używa `chromBounds` lub fallback.

Canvas phasing per osoba: rysuje 1 tor (28px high): górna połowa = maternal (kolor przodka lub szary), dolna = paternal. Klikamy → `onPopupRequest`.

Hit-test: każdy canvas ma `onMouseMove` + `onClick`. `handleMouseMove` zmienia cursor. `handleClick` lokalizuje hit w lokalnym `hitTargets` i wywołuje `onPopupRequest` z px przeliczonym na główny kontener.

#### 3. Inline tabela segmentów

**File**: `frontend/src/components/ChromosomSection.tsx` (lub osobny `ChromosomSegmentTable.tsx`)

**Intent**: Lekka read-only tabela segmentów tego chromosomu pod torami.

**Contract**: Kolumny: Para (person_names.join(' vs ')), Typ (badge FULL/HALF/NONE), Start bp (toLocaleString), End bp, cM (length_cm?.toFixed(1) ?? '—'), SNPs (snp_count). Filtruje `pairwisePairs[*].segments` po `chromosome === chrom`. Sortuje po `start_bp`. Tailwind styling spójne z SegmentTable (bez edycji, bez formularzy).

#### 4. Refaktoryzacja ChromosomCanvas

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Zamienić obecny draw loop + jeden duży canvas na: zarządzanie shared state (containerWidth, popup, chromBounds) + renderowanie N komponentów ChromosomSection.

**Contract**:
- Usunąć: `canvasRef`, `hitTargets`, draw `useEffect`, `handleMouseMove`, `handleClick`, cały draw loop.
- Zachować: `pairwisePairs`, `chromsWithData`, `phasingPersons`, `ancestorColorMap`, `chromBoundsRef`, `popup` state, `AnnotationPopup` w JSX.
- Dodać:
  - `mainContainerRef = useRef<HTMLDivElement>(null)` — główny wrapper div
  - `containerWidth` state zarządzany przez ResizeObserver na `mainContainerRef`
  - `handlePopupRequest(payload, px, py)` → `setPopup({ ...payload, px, py })`
- JSX: `<div ref={mainContainerRef} className="relative space-y-1">` zawiera N `<ChromosomSection>` + `<AnnotationPopup>`.

Utrzymać `AnnotationPopup`:
```tsx
{popup && onAnnotate && (
  <AnnotationPopup
    popup={popup}
    ancestors={ancestors}
    onSave={onAnnotate}
    onDelete={onDeleteAnnotation ? async id => { ... } : undefined}
    onClose={() => setPopup(null)}
  />
)}
```

Przekazanie `mainContainerOffsetLeft/Top` do sekcji:
```typescript
function handlePopupRequest(payload, rawPx, rawPy) {
  const rect = mainContainerRef.current?.getBoundingClientRect()
  const px = rawPx - (rect?.left ?? 0)
  const py = rawPy - (rect?.top ?? 0)
  setPopup({ ...payload, px, py })
}
```

Każda sekcja przekazuje `px = e.clientX`, `py = e.clientY` do `onPopupRequest` — rodzic przelicza na lokalne współrzędne.

### Success Criteria

#### Automated Verification

- `cd frontend && npx tsc --noEmit` exits 0
- `uv run pytest` exits 0

#### Manual Verification

- Strona wyników pokazuje N zwijanych sekcji (domyślnie wszystkie zwinięte)
- Klik nagłówka "▶ Chromosom 1" → sekcja się rozwija pokazując canvas + fazowanie + tabelę
- Canvas podobieństwa: segmenty FULL/HALF/NONE narysowane z pasami 20px
- Tor fazowania per osoba: etykieta imienia po lewej (HTML), canvas 28px po prawej
- Tabela segmentów: zawiera wiersze z poprawnymi danymi (para, typ, bp, cM, SNPs)
- Hover nad segmentem → tooltip (cursor pointer)
- Klik segmentu → AnnotationPopup otwiera się
- Klik szarego toru fazowania → popup tworzenia adnotacji
- Stara legenda (FULL/HALF/NONE + pary + fazowanie) nadal widoczna

---

## Testing Strategy

### Manual Testing Steps

1. Otwórz stronę wyników porównania
2. Sprawdź N sekcji "Chromosom X" (wszystkie zwinięte)
3. Kliknij nagłówek chromosomu — powinien się rozwinąć
4. Sprawdź widoczność: canvas podobieństwa na górze, etykietowane tory fazowania poniżej, tabela na dole
5. Sprawdź rozmiary pasków (muszą być wyraźnie większe niż dotychczas)
6. Hover/klik na segmenty — tooltip i popup jak dotychczas
7. Tworzenie nowej adnotacji przez szary tor — popup z pozycją
8. Zamknij sekcję (klik nagłówka) — sekcja zwija się
9. Otwórz inny chromosom — działa niezależnie

## References

- Aktualny `ChromosomCanvas.tsx` — do zastąpienia: `frontend/src/components/ChromosomCanvas.tsx`
- `AnnotationPopup.tsx` — bez zmian, wpiąć do nowego ChromosomCanvas
- `SegmentTable.tsx:11-40` — wzorzec tabeli i stylów do zaczerpnięcia
- `AncestorPanel.tsx` — wzorzec collapsible-like state

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: ChromosomSection komponent + refaktor ChromosomCanvas

#### Automated

- [x] 1.1 `cd frontend && npx tsc --noEmit` exits 0
- [x] 1.2 `uv run pytest` exits 0

#### Manual

- [x] 1.3 N zwijanych sekcji domyślnie zamkniętych
- [x] 1.4 Klik nagłówka → sekcja otwiera/zamyka
- [x] 1.5 Canvas podobieństwa z pasami 20px i poprawnymi segmentami
- [x] 1.6 Etykiety osób (HTML) + canvas fazowania 28px per osoba
- [x] 1.7 Tabela segmentów z danymi (para, typ, bp, cM, SNPs)
- [x] 1.8 Hover tooltip + klik popup działają po refaktorze
- [x] 1.9 Popup tworzenia adnotacji (szary tor) działa
