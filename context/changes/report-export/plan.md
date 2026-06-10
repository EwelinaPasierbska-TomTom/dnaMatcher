# Report Export — Implementation Plan

## Overview

Users can export a per-chromosome PDF report directly from the comparison view. Clicking an "Eksportuj" dropdown in ResultsPage picks a chromosome; the app composites all canvas elements for that chromosome, embeds the image in a standalone HTML file, and opens it in a new tab where the browser's print-to-PDF dialog fires automatically.

Entirely client-side — no backend changes.

## Current State Analysis

- `ChromosomSection.tsx` renders 2–4 `<canvas>` elements per section (similarity, similarity ruler, N phasing, phasing ruler). Component is currently a plain function with no `forwardRef`.
- `ChromosomCanvas.tsx` renders one `ChromosomSection` per chromosome. Also a plain function with no `forwardRef`.
- `ResultsPage.tsx` holds `data`, `annotations`, `ancestors` — all data needed for report metadata.
- No export utilities exist (`toDataURL`, `html2canvas`, `Blob` — zero hits in frontend).
- Canvases are drawn only when section `open === true` (collapsible, default: closed).

### Key Discoveries

- `ChromosomSection.tsx:99` — already has `sectionRef = useRef<HTMLDivElement>` but not exposed.
- `ChromosomSection.tsx:102–111` — four canvas refs: `simCanvasRef`, `simRulerRef`, `phasingCanvasRefs` (array), `phasingRulerRef`.
- JSX canvas render order (lines 441–472): sim canvas → sim ruler → phasing canvases (0..N) → phasing ruler. This is the compositing order.
- `ChromosomCanvas.tsx:191` — renders `chromsWithData` (derived from segments) → one section per chromosome.
- `ChromosomCanvas.tsx:52` — `mainContainerRef` on the outer div; no current forwardRef.
- `ChromosomSection.tsx:98` — `open` state is local; canvases only drawn when `open === true`. Export flow must open the section first and wait for draw effects.

## Desired End State

- "Eksportuj" button (DownloadIcon) in the ResultsPage header opens a dropdown listing available chromosomes.
- Selecting a chromosome: opens the section if collapsed → waits for canvas draw effects → composites all canvases to JPEG → generates standalone HTML → opens in new tab → print dialog fires.
- The HTML report contains: comparison name, chromosome number, generation date, embedded canvas image, annotations table filtered to that chromosome.
- No new npm dependencies needed.

## What We're NOT Doing

- No backend endpoint — purely client-side.
- No segment-table data in the report (annotations only, per user decision).
- No "export all chromosomes at once".
- No PDF library (jsPDF) — browser print-to-PDF is sufficient.
- No changes to canvas drawing logic — compositing reuses what's already rendered in the DOM.

## Implementation Approach

Ref-forwarding chain: `ResultsPage` → `ChromosomCanvas` → `ChromosomSection`. Each layer exposes an imperative handle. `ResultsPage` calls `canvasRef.getChromosomeReport(chromosome)` which opens the section, waits a double-`requestAnimationFrame` for draw effects to flush, then composites canvases via `toDataURL`. The data URL is passed to a pure HTML template function that returns a standalone HTML string opened via `window.open`.

## Critical Implementation Details

**Async draw timing**: `ChromosomSection` draws canvases in `useEffect` hooks triggered by `open` state. After calling `setOpen(true)` (via `openSection()`), callers must `await` a double `requestAnimationFrame` before reading canvas pixels — one RAF for React state to flush, one for the draw effects to run. Shorter waits (e.g. `setTimeout(0)`) are unreliable on slow devices.

**DPR-aware compositing**: All canvases store `canvas.width` and `canvas.height` in physical pixels (DPR-scaled). The offscreen canvas must match these physical dimensions and use `ctx.drawImage(canvas, 0, y)` at physical coordinates (not CSS coordinates) to preserve sharpness.

**Canvas existence guard**: `phasingCanvasRefs.current` may contain `null` slots if a person unmounted. Filter them before compositing. If `phasingPersons.length === 0`, the phasing canvases and phasing ruler are never mounted — compositing skips them.

---

## Phase 1: ChromosomSection — `forwardRef` + canvas compositing

### Overview

Wrap `ChromosomSection` with `forwardRef`, expose `ChromosomSectionHandle` via `useImperativeHandle`. The handle provides `openSection()` to expand the collapsible, and `getCanvasDataUrl()` to composite all rendered canvases into a JPEG data URL.

### Changes Required

#### 1. Add `ChromosomSectionHandle` and `forwardRef` wrapping

**File**: `frontend/src/components/ChromosomSection.tsx`

**Intent**: Export a handle interface so parent components can programmatically open the section and read a composited canvas image.

**Contract**: Add to the module's exports:
```ts
export interface ChromosomSectionHandle {
  openSection: () => void
  getCanvasDataUrl: () => string | null
}
```
Change the component declaration from `export default function ChromosomSection(...)` to `const ChromosomSection = forwardRef<ChromosomSectionHandle, Props>(function ChromosomSection(..., ref) { ... })` with `export default ChromosomSection`.

Import `forwardRef` and `useImperativeHandle` from React.

#### 2. Implement `useImperativeHandle` — `openSection` + `getCanvasDataUrl`

**File**: `frontend/src/components/ChromosomSection.tsx`

**Intent**: Wire the handle methods: `openSection` flips the collapsible state; `getCanvasDataUrl` composites all currently-drawn canvases into one JPEG and returns the data URL.

**Contract**: Place the hook after all canvas ref declarations. Dependencies array: `[phasingPersons.length]`.

`openSection`: calls `setOpen(true)`.

`getCanvasDataUrl`: builds the canvas list in visual DOM order:
1. `simCanvasRef.current`
2. `simRulerRef.current`
3. `...phasingCanvasRefs.current` (filter out null)
4. `phasingRulerRef.current` (only if `phasingPersons.length > 0`)

Filter the full list to non-null canvases with `canvas.width > 0`. If the filtered list is empty (section not yet drawn), return `null`.

Create an offscreen `HTMLCanvasElement`:
- `offscreen.width` = first canvas's `.width` (physical pixels)
- `offscreen.height` = sum of each canvas's `.height`
- Draw each canvas at `(0, y)` with `ctx.drawImage(canvas, 0, y); y += canvas.height`

Return `offscreen.toDataURL('image/jpeg', 0.92)`.

### Success Criteria

#### Automated Verification

- TypeScript compiles with no new errors: `cd frontend && npx tsc --noEmit`
- Lint passes: `cd frontend && npx eslint src/components/ChromosomSection.tsx`

#### Manual Verification

- Open a comparison, expand a chromosome section, open browser console, run: `document.querySelector('canvas').toDataURL()` — should return a valid `data:image/jpeg` string (confirms canvases are drawable).
- No visual or interaction regressions in the ChromosomSection component.

---

## Phase 2: ChromosomCanvas — `forwardRef` + `getChromosomeReport`

### Overview

Wrap `ChromosomCanvas` with `forwardRef`. It manages a `Map` from chromosome → `ChromosomSectionHandle` and exposes `getChromosomeReport(chromosome)`: an async method that opens the section, waits for draw effects via double-RAF, then returns the JPEG data URL.

### Changes Required

#### 1. Add `ChromosomCanvasHandle` and `forwardRef` wrapping

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Export a handle that `ResultsPage` can call to trigger a per-chromosome capture.

**Contract**: Add to module exports:
```ts
export interface ChromosomCanvasHandle {
  chromsWithData: string[]
  getChromosomeReport: (chromosome: string) => Promise<string | null>
}
```
Change component declaration to `const ChromosomCanvas = forwardRef<ChromosomCanvasHandle, Props>(...)`.

Import `forwardRef`, `useImperativeHandle` from React and `ChromosomSectionHandle` from `ChromosomSection`.

#### 2. Section ref map + passing refs to ChromosomSection

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Track per-chromosome section handles so `getChromosomeReport` can target the correct section.

**Contract**: Add `const sectionRefs = useRef<Map<string, ChromosomSectionHandle>>(new Map())` after other refs.

In the JSX `chromsWithData.map(...)` block, pass a callback ref to each `ChromosomSection`:
```ts
ref={(handle) => {
  if (handle) sectionRefs.current.set(chrom, handle)
  else sectionRefs.current.delete(chrom)
}}
```

#### 3. Implement `useImperativeHandle` — `chromsWithData` + `getChromosomeReport`

**File**: `frontend/src/components/ChromosomCanvas.tsx`

**Intent**: Expose `getChromosomeReport` to the parent. The method opens the target section, waits for canvas draw effects, and returns the data URL.

**Contract**: Dependencies array: `[chromsWithData]`.

`getChromosomeReport(chromosome)`:
1. Get `handle = sectionRefs.current.get(chromosome)` — return `null` if absent.
2. `handle.openSection()`.
3. `await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`.
4. Return `handle.getCanvasDataUrl()`.

### Success Criteria

#### Automated Verification

- TypeScript compiles with no new errors: `cd frontend && npx tsc --noEmit`
- Lint passes: `cd frontend && npx eslint src/components/ChromosomCanvas.tsx`

#### Manual Verification

- No regressions in the ChromosomCanvas component (sections still collapse/expand, annotations still work, popup still appears on click).

---

## Phase 3: HTML report template utility

### Overview

A pure function `generateReportHtml` that accepts comparison metadata, the canvas JPEG data URL, and filtered annotations, and returns a standalone HTML string. The HTML auto-triggers the browser print dialog on load.

### Changes Required

#### 1. New file: `reportHtml.ts`

**File**: `frontend/src/lib/reportHtml.ts`

**Intent**: Encapsulate all HTML-generation logic in one place so it can be tested independently and evolved without touching UI components.

**Contract**: Export one function and its options type:
```ts
interface ReportOptions {
  comparisonName: string
  chromosome: string
  date: string               // pre-formatted, e.g. "10 czerwca 2026"
  imageDataUrl: string       // data:image/jpeg;base64,...
  annotations: AnnotationOut[]
  ancestors: AncestorOut[]
}

export function generateReportHtml(opts: ReportOptions): string
```

The returned HTML must be:
- Valid standalone HTML5 (`<!DOCTYPE html>`, `<meta charset="utf-8">`)
- Include `@media print { body { max-width: 100%; margin: 0; } }` styles
- Header: `<h1>{comparisonName} – Chromosom {chromosome}</h1>` + date paragraph
- Image: `<img src="{imageDataUrl}" alt="Chromosom {chromosome}" style="max-width:100%">`
- Annotations section: filter `annotations` where `a.chromosome === chromosome`. If empty, show "Brak adnotacji". If non-empty, render a table with columns: Nitka | Start bp | Koniec bp | Przodek | Kolor (colored square from ancestor).
- Auto-print script at end of `<body>`: `<script>window.onload = function() { window.focus(); window.print(); }</script>`

Import `AnnotationOut` from `../components/ChromosomeDiagram` and `AncestorOut` from `../components/AncestorPanel`.

### Success Criteria

#### Automated Verification

- TypeScript compiles: `cd frontend && npx tsc --noEmit`
- Lint passes: `cd frontend && npx eslint src/lib/reportHtml.ts`

#### Manual Verification

- (Verified together with Phase 4 — the template is only observable end-to-end.)

---

## Phase 4: Export UI in ResultsPage

### Overview

Add an "Eksportuj" button to the ResultsPage header. Clicking it shows a dropdown of available chromosomes. Selecting a chromosome triggers the full export flow: capture → generate HTML → open + print.

### Changes Required

#### 1. Import additions and `canvasRef`

**File**: `frontend/src/pages/ResultsPage.tsx`

**Intent**: Wire the ref chain to ChromosomCanvas and bring in the report template.

**Contract**: Add to imports: `useRef` (if not already present), `ChromosomCanvas`, `ChromosomCanvasHandle` from `../components/ChromosomCanvas`, `generateReportHtml` from `../lib/reportHtml`, `Download` from `lucide-react`.

Add: `const canvasRef = useRef<ChromosomCanvasHandle>(null)`.

Pass `ref={canvasRef}` to the existing `<ChromosomCanvas ...>` JSX element.

#### 2. Export state and available chromosomes

**File**: `frontend/src/pages/ResultsPage.tsx`

**Intent**: Track dropdown open/close state and derive the chromosome list from loaded data.

**Contract**: Add state: `const [exportOpen, setExportOpen] = useState(false)`.

Derive chromosomes (after `data` is loaded):
```ts
const exportChroms = useMemo(
  () =>
    data
      ? [
          ...new Set(
            data.pairs.flatMap(p => p.segments.map(s => s.chromosome)),
          ),
        ].sort((a, b) => {
          const na = parseInt(a, 10), nb = parseInt(b, 10)
          if (!isNaN(na) && !isNaN(nb)) return na - nb
          if (!isNaN(na)) return -1
          if (!isNaN(nb)) return 1
          return a.localeCompare(b)
        })
      : [],
  [data],
)
```

Add `useMemo` to the import from React if not already present.

#### 3. Export handler

**File**: `frontend/src/pages/ResultsPage.tsx`

**Intent**: Orchestrate capture → HTML generation → window open for a given chromosome.

**Contract**:
```ts
async function handleExport(chromosome: string): Promise<void> {
  setExportOpen(false)
  const canvas = canvasRef.current
  if (!canvas) return
  const imageDataUrl = await canvas.getChromosomeReport(chromosome)
  if (!imageDataUrl) return
  const date = new Date().toLocaleDateString('pl-PL', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const html = generateReportHtml({
    comparisonName: data!.name,
    chromosome,
    date,
    imageDataUrl,
    annotations,
    ancestors,
  })
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
```

#### 4. Export button + dropdown in JSX

**File**: `frontend/src/pages/ResultsPage.tsx`

**Intent**: Place an accessible export control in the existing header area alongside the back and delete buttons.

**Contract**: In the `<div className="flex gap-2">` block that already holds "Powrót" and "Usuń porównanie" buttons, add a new element before "Usuń":
- A `<div className="relative">` wrapper
- A `<Button>` with `variant="outline"` and `size="sm"` that toggles `exportOpen` — label: `<Download className="w-4 h-4 mr-1" /> Eksportuj`
- When `exportOpen` and `exportChroms.length > 0`: an absolute dropdown `<div>` below the button listing chromosomes:
  - `onBlur` / click-outside to close (a simple `onMouseLeave` on the outer wrapper or a click-outside handler using `useEffect` with `document.addEventListener`)
  - Each chromosome rendered as a `<button>` row: `onClick={() => void handleExport(chrom)}`, label `Chromosom {chrom}`

### Success Criteria

#### Automated Verification

- TypeScript compiles: `cd frontend && npx tsc --noEmit`
- Lint passes: `cd frontend && npx eslint src/pages/ResultsPage.tsx`
- Frontend build succeeds: `cd frontend && npm run build`

#### Manual Verification

- Open a comparison with at least one chromosome that has segments.
- Click "Eksportuj" — dropdown lists the available chromosomes.
- Select a chromosome — the section expands (if it was collapsed), a new tab opens, and the browser print dialog appears.
- The print preview shows: comparison name + chromosome, the canvas image, and the annotations table (or "Brak adnotacji" if none).
- Selecting a chromosome that was already expanded also works without visual glitch.
- No regressions: annotation saving, ancestor management, delete comparison — all still work after the ref changes.

---

## Testing Strategy

### Unit Tests

None planned — the `generateReportHtml` function is pure and verifiable manually; the canvas compositing depends on browser APIs and is better verified end-to-end.

### Manual Testing Steps

1. Open a comparison with data on at least two chromosomes.
2. Select a chromosome with annotations → verify annotation table appears in report.
3. Select a chromosome without annotations → verify "Brak adnotacji" message.
4. Collapse all chromosome sections manually → select a chromosome for export → verify the section auto-expands and capture still works.
5. Open report HTML in browser → use print preview → verify image is sharp (no pixelation).
6. Check that the existing click-to-annotate flow still works (popup still appears on canvas click).

## References

- Roadmap: `context/foundation/roadmap.md` §S-10
- PRD: `context/foundation/prd.md` FR-009
- `ChromosomSection.tsx:102–111` — canvas ref declarations
- `ChromosomSection.tsx:421–535` — JSX, canvas render order (sim → ruler → phasing → phasing ruler)
- `ChromosomCanvas.tsx:191` — `chromsWithData.map` rendering sections

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: ChromosomSection — forwardRef + canvas compositing

#### Automated

- [x] 1.1 TypeScript compiles with no new errors: `cd frontend && npx tsc --noEmit` — 2db8f45
- [x] 1.2 Lint passes: `cd frontend && npx eslint src/components/ChromosomSection.tsx` — 2db8f45

#### Manual

- [x] 1.3 Canvas `toDataURL` returns valid data in browser console; no visual regressions — 2db8f45

### Phase 2: ChromosomCanvas — forwardRef + getChromosomeReport

#### Automated

- [x] 2.1 TypeScript compiles with no new errors: `cd frontend && npx tsc --noEmit` — 598f210
- [x] 2.2 Lint passes: `cd frontend && npx eslint src/components/ChromosomCanvas.tsx` — 598f210

#### Manual

- [x] 2.3 No regressions in ChromosomCanvas (sections, annotations, popup) — 598f210

### Phase 3: HTML report template utility

#### Automated

- [x] 3.1 TypeScript compiles: `cd frontend && npx tsc --noEmit`
- [x] 3.2 Lint passes: `cd frontend && npx eslint src/lib/reportHtml.ts`

#### Manual

- [x] 3.3 Template verified end-to-end in Phase 4

### Phase 4: Export UI in ResultsPage

#### Automated

- [ ] 4.1 TypeScript compiles: `cd frontend && npx tsc --noEmit`
- [ ] 4.2 Lint passes: `cd frontend && npx eslint src/pages/ResultsPage.tsx`
- [ ] 4.3 Frontend build succeeds: `cd frontend && npm run build`

#### Manual

- [ ] 4.4 Dropdown lists available chromosomes
- [ ] 4.5 Collapsed section auto-expands and capture succeeds
- [ ] 4.6 Report shows canvas image + metadata + annotations (or "Brak adnotacji")
- [ ] 4.7 No regressions: annotation save, ancestor management, delete comparison
