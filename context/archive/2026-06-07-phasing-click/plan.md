---
change_id: phasing-click
title: Fazowanie przez kliknięcie na diagramie canvas
status: planned
created: 2026-06-07
updated: 2026-06-07
---

# Fazowanie przez kliknięcie na diagramie canvas — Plan

## Overview

Podłączenie infrastruktury hit-test z S-05 do API adnotacji z S-06. Użytkownik klika segment na torze podobieństwa → popup z wyborem osoby/strandu/przodka → POST do istniejącego `/api/annotations`. Kliknięcie istniejącej adnotacji na torze fazowania → popup edycji/usunięcia. Brak zmian backendu — API jest kompletne.

## Current State Analysis

- `ChromosomCanvas.tsx:35-41` — `HitTarget` ma `{ x, y, w, h, content: string }` (tylko tooltip). Brak danych segmentu.
- `ChromosomCanvas.tsx:60` — `hitTargets = useRef<HitTarget[]>([])` już budowany podczas draw; `handleMouseMove` odczytuje go — wzorzec gotowy do `onClick`.
- `ChromosomCanvas.tsx:277` — `<canvas ... className="block cursor-crosshair">` — cursor statyczny.
- `ResultsPage.tsx:136` — `handleUpsertAnnotation(body: UpsertAnnotationBody)` — istniejący handler; nie jest jeszcze przekazywany do ChromosomCanvas.
- `ResultsPage.tsx:161` — `handleDeleteAnnotation(id: string)` — istniejący handler.
- `SegmentTable.tsx:12` — `export interface UpsertAnnotationBody { profile_id, chromosome, start_position, end_position, strand, ancestor_label, ancestor_id }` — gotowy kontrakt.
- Backend: `POST /api/comparisons/{id}/annotations` — upsertuje po `(profile_id, chromosome, start_position, end_position)`; `DELETE /api/annotations/{id}`. Oba endpointy kompletne.

## Desired End State

Na canvasie: kursor `pointer` gdy użytkownik najedzie na kliknięty segment (similarity lub phasing). Klik otwiera floating popup przy kursorze. Dla similarity: wybór osoby z pary + strand toggle + ancestor dropdown + Zapisz/Anuluj. Dla phasing: ancestor dropdown pre-filled + przycisk Usuń + Zapisz/Anuluj. Po zapisie phasing track aktualizuje się kolorem przodka. Klik poza popup zamyka go.

### Key Discoveries

- `ChromosomCanvas.tsx:168-173` — HitTarget dla similarity toru budowany w draw loop; do rozszerzenia o `pair`, `chromosome`, `start_bp`, `end_bp`.
- `ChromosomCanvas.tsx:207-213` — HitTarget dla phasing toru; do rozszerzenia o `annotation`, `person`, `strand`.
- `UpsertAnnotationBody` eksportowane z `SegmentTable.tsx:12` — importować bezpośrednio.
- `ResultsPage.tsx:260-270` — `<ChromosomCanvas>` w JSX — do uzupełnienia o `onAnnotate` i `onDeleteAnnotation`.
- `AnnotationOut` importowane do ResultsPage z `'../components/ChromosomeDiagram'` — ten sam typ co w adnotacjach.

## What We're NOT Doing

- Brak zmian backendu (API kompletne).
- Kliknięcie szarego tła toru fazowania nie otwiera popup (klikalne tylko kolorowe segmenty).
- Brak walidacji duplikatów po stronie frontendu — API upsertuje po composite key.
- Brak drag-to-annotate (przeciąganie po canvasie).
- Brak undo/redo.
- ChromosomeDiagram.tsx (stary SVG) bez zmian.

## Implementation Approach

Jedna faza frontendowa. Rozszerzyć `HitTarget` o typed `payload` (union type `SimPayload | PhasingPayload`). Nowy komponent `AnnotationPopup.tsx` — floating div absolute w kontenerze ChromosomCanvas. ChromosomCanvas dostaje dwa nowe opcjonalne props (`onAnnotate`, `onDeleteAnnotation`) i własny stan popup. ResultsPage przekazuje istniejące handlery. Dynamiczny kursor via `canvasRef.current.style.cursor` w `handleMouseMove`.

## Critical Implementation Details

**HitTarget payload union**: `HitTarget.payload` musi być typed union — `SimPayload` i `PhasingPayload` mają różne pola. TypeScript sprawdza `payload.type === 'sim'` jako type narrowing, co poprowadzi implementatora w popupie.

**Popup pozycjonowanie**: Popup `absolute` w `containerRef` div. Pozycja `px`/`py` to koordynaty canvas CSS (po DPR-adjustmencie). Gdy popup wychodzi poza prawą/dolną krawędź kontenera, otwierać go po lewej stronie kursora (`right: containerWidth - px`). Minimalne zabezpieczenie overflow.

**Kursor**: `canvasRef.current.style.cursor` ustawiać w `handleMouseMove` (`pointer` vs `crosshair`) zamiast przez className — unika re-renderu przy każdym ruchu myszy.

---

## Phase 1: Canvas onClick + AnnotationPopup

### Overview

Rozszerza `HitTarget` o payload kliknięcia, dodaje `onClick` na canvasie, tworzy `AnnotationPopup` komponent, podłącza do istniejących handlerów w ResultsPage.

### Changes Required

#### 1. Rozszerzenie HitTarget w ChromosomCanvas

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Zastąpić `content: string` w HitTarget structurą typowaną, która niesie dane potrzebne zarówno do tooltip jak i do popup po kliknięciu.

**Contract**:
```typescript
interface SimPayload {
  type: 'sim'
  pair: PairResult
  chromosome: string
  start_bp: number
  end_bp: number
}

interface PhasingPayload {
  type: 'phasing'
  annotation: AnnotationOut
  person: ProfileMeta
  strand: 'maternal' | 'paternal'
}

interface HitTarget {
  x: number
  y: number
  w: number
  h: number
  tooltipContent: string            // renamed from content
  payload: SimPayload | PhasingPayload
}
```

W draw loop: similarity segment push do newHits z `payload: { type: 'sim', pair, chromosome: chrom, start_bp: seg.start_bp, end_bp: seg.end_bp }`. Phasing annotation push z `payload: { type: 'phasing', annotation: ann, person, strand: ann.strand }`.

#### 2. Nowe props ChromosomCanvas

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Przyjąć callbacks dla akcji annotation z ResultsPage, nie implementować ich wewnętrznie.

**Contract**:
```typescript
interface Props {
  pairs: PairResult[]
  allProfiles: ProfileMeta[]
  annotations: AnnotationOut[]
  ancestors: AncestorOut[]
  chromosomeLengths?: Record<string, number>
  onAnnotate?: (body: UpsertAnnotationBody) => Promise<void>
  onDeleteAnnotation?: (id: string) => Promise<void>
}
```

Import `UpsertAnnotationBody` z `'./SegmentTable'`.

#### 3. Stan popup i handlery kliknięcia w ChromosomCanvas

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Zarządzać stanem otwartego popup i obsługiwać click/hover na canvasie.

**Contract**:
```typescript
type PopupState =
  | null
  | (SimPayload & { px: number; py: number })
  | (PhasingPayload & { px: number; py: number })

const [popup, setPopup] = useState<PopupState>(null)
```

`handleClick(e: React.MouseEvent<HTMLCanvasElement>)`: find hit w `hitTargets.current`, `setPopup({ ...hit.payload, px: mx, py: my })`. Jeśli brak hitu: `setPopup(null)`.

`handleMouseMove` zmienia `canvasRef.current.style.cursor` na `'pointer'` gdy hit, `'crosshair'` gdy brak.

Canvas w JSX dostaje `onClick={handleClick}`. Przy kliknięciu poza canvasem (np. `onClick` na containerRef div): `setPopup(null)`.

#### 4. Nowy komponent AnnotationPopup

**File**: `frontend/src/components/AnnotationPopup.tsx`

**Intent**: Floating popup renderowany absolute w kontenerze ChromosomCanvas, obsługuje dwa tryby (sim i phasing), zarządza własnym stanem formularza.

**Contract**:
```typescript
interface Props {
  popup: (SimPayload | PhasingPayload) & { px: number; py: number }
  allProfiles: ProfileMeta[]
  ancestors: AncestorOut[]
  onSave: (body: UpsertAnnotationBody) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onClose: () => void
}
```

Pozycja: `style={{ left: px, top: py }}` plus zabezpieczenie overflow (jeśli `px > containerWidth - 200`, użyj `right` zamiast `left`).

Tryb SIM:
- Dropdown osoba: `<select>` z `popup.pair.profile_ids.map(id => allProfiles.find...)`
- Toggle strand: `<button>Maternal</button> <button>Paternal</button>`
- Dropdown przodek: `<select>` z `ancestors.map(a => <option value={a.id}>{a.name})`
- `ancestor_label` wypełniany automatycznie z wybranego ancestors.name
- Zapisz: POST `{ profile_id, chromosome: popup.chromosome, start_position: popup.start_bp, end_position: popup.end_bp, strand, ancestor_id, ancestor_label }`

Tryb PHASING:
- Etykieta: `{popup.person.name} — {popup.strand}`
- Dropdown przodek: pre-filled z `popup.annotation.ancestor_id`
- Zapisz (edycja): POST z `ancestor_id` = wybrany, `strand = popup.strand`, reszta z `popup.annotation`
- Usuń: wywołuje `onDelete(popup.annotation.id)` z `confirm()`

Po Zapisz/Usuń: `onClose()`.

#### 5. Renderowanie AnnotationPopup w ChromosomCanvas

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Wstrzyknąć AnnotationPopup do div kontenera canvas gdy popup !== null.

**Contract**: W JSX `<div ref={containerRef} className="relative w-full">`:
```tsx
{popup && onAnnotate && (
  <AnnotationPopup
    popup={popup}
    allProfiles={allProfiles}
    ancestors={ancestors}
    onSave={async (body) => { await onAnnotate(body); setPopup(null) }}
    onDelete={onDeleteAnnotation ? async (id) => { await onDeleteAnnotation(id); setPopup(null) } : undefined}
    onClose={() => setPopup(null)}
  />
)}
```

#### 6. ResultsPage — przekazanie handlerów do ChromosomCanvas

**File**: `frontend/src/pages/ResultsPage.tsx`

**Intent**: Uzupełnić istniejący `<ChromosomCanvas>` o dwa nowe props.

**Contract**: Do istniejącej linii `<ChromosomCanvas pairs={...} ...>` dodać:
```tsx
onAnnotate={handleUpsertAnnotation}
onDeleteAnnotation={handleDeleteAnnotation}
```

`handleUpsertAnnotation` ma sygnaturę `(body: UpsertAnnotationBody) => Promise<void>` — pasuje. `handleDeleteAnnotation` ma `(id: string) => Promise<void>` — pasuje.

### Success Criteria

#### Automated Verification

- `cd frontend && npx tsc --noEmit` exits 0
- `uv run pytest` exits 0

#### Manual Verification

- Najeżdżając na segment FULL/HALF/NONE na canvasie kursor zmienia się na `pointer`
- Kliknięcie segmentu na torze podobieństwa otwiera popup przy kursorze
- Popup zawiera: dropdown osoby (z pary), toggle Maternal/Paternal, dropdown przodków, Zapisz, Anuluj
- Po wybraniu i zapisaniu: kolorowy pasek pojawia się na torze fazowania danej osoby
- Kliknięcie kolorowego paska na torze fazowania otwiera popup edycji z pre-filled przodkiem
- Edycja przodka → kolor na torze fazowania zmienia się
- Usunięcie → pasek znika z toru fazowania (z potwierdzeniem)
- Klik poza popup (na canvasie poza segmentem) zamyka popup
- Tooltip nadal działa (hover bez klikania)
- Stare adnotacje z tabeli SegmentTable nadal działają (brak regresji)

---

## Testing Strategy

### Unit Tests

Brak nowych testów backendowych. TypeScript (`tsc --noEmit`) weryfikuje typy komponentów.

### Manual Testing Steps

1. Otwórz porównanie z wynikami
2. Najedź na segment FULL/HALF na torze podobieństwa — kursor pointer
3. Kliknij — popup otwiera się przy kursorze
4. Wybierz osobę, Maternal, przodka → Zapisz
5. Sprawdź że pasek pojawił się na torze fazowania tej osoby (góra = maternal)
6. Kliknij pasek → popup edycji z pre-filled przodkiem
7. Zmień przodka → Zapisz → kolor paska zmieniony
8. Kliknij pasek → Usuń → pasek znika
9. Kliknij poza popup → zamknięty
10. Sprawdź SegmentTable — adnotacje z canvas widoczne, stare formularze działają

## References

- Hit-test pattern: `frontend/src/components/ChromosomCanvas.tsx:60,218-230`
- UpsertAnnotationBody: `frontend/src/components/SegmentTable.tsx:12-20`
- handleUpsertAnnotation: `frontend/src/pages/ResultsPage.tsx:136`
- handleDeleteAnnotation: `frontend/src/pages/ResultsPage.tsx:161`
- Annotation API: `src/routers/annotations.py`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Canvas onClick + AnnotationPopup

#### Automated

- [x] 1.1 `cd frontend && npx tsc --noEmit` exits 0 — 4d59f99
- [x] 1.2 `uv run pytest` exits 0 — 4d59f99

#### Manual

- [x] 1.3 Kursor pointer nad segmentami na canvasie — 4d59f99
- [x] 1.4 Klik otwiera popup z polami osoby/strand/przodek (tor podobieństwa) — 4d59f99
- [x] 1.5 Zapis adnotacji z canvas aktualizuje tor fazowania — 4d59f99
- [x] 1.6 Klik na istniejący pasek fazowania otwiera popup edycji — 4d59f99
- [x] 1.7 Edycja/usunięcie przodka z canvas działa — 4d59f99
- [x] 1.8 Klik poza segmentem zamyka popup — 4d59f99
- [x] 1.9 Stare formularze SegmentTable działają bez regresji — 4d59f99
