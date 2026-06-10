# Report Export — Plan Brief

> Full plan: `context/changes/report-export/plan.md`

## What & Why

Users need to share or archive chromosome visualization results. S-10 delivers a per-chromosome export: select a chromosome from a dropdown, get a standalone HTML file that opens in the browser and automatically triggers the print-to-PDF dialog — no backend required, no new npm dependencies.

## Starting Point

The canvas visualization exists in `ChromosomSection.tsx` with 2–4 `<canvas>` elements per chromosome (similarity, ruler, phasing tracks). Neither `ChromosomSection` nor `ChromosomCanvas` expose refs to the outside; there are no export utilities in the frontend today.

## Desired End State

A "Eksportuj" button in the ResultsPage header opens a chromosome list. Selecting one opens the section if collapsed, waits for canvases to draw, composites them to JPEG via `toDataURL`, injects the image into a standalone HTML template with the comparison name, date, and annotations table, then opens it in a new tab where the print dialog fires automatically.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Export format | HTML-to-PDF via `window.print` | Zero dependencies; browser print quality is best for canvas content | Plan |
| Export granularity | Per-chromosome, user-picks | Matches S-10 roadmap spec and avoids generating huge multi-chromosome files | Roadmap + user |
| Canvas capture | Native `toDataURL` via `useImperativeHandle` | No external library; avoids html2canvas CSS-rendering bugs | Plan |
| JPG in report | Embedded as `data:image/jpeg;base64` in HTML | Standalone file works offline with no external assets | User |
| Report content | Name + chromosome + image + annotation table | Full context for a genetics audience sharing results | User |
| Export trigger UX | Dropdown in ResultsPage header | Single UI control, clean over 24+ per-section buttons | User |

## Scope

**In scope:** forwardRef + useImperativeHandle chain (Section → Canvas → ResultsPage), HTML template utility (`reportHtml.ts`), dropdown UI, DPR-aware canvas compositing.

**Out of scope:** Backend endpoint, PDF library (jsPDF), "export all chromosomes", segment table in report, any canvas drawing changes.

## Architecture / Approach

Ref-forwarding chain: `ResultsPage` → `ChromosomCanvas` → `ChromosomSection`. Each layer wraps with `forwardRef` and exposes an imperative handle. `ResultsPage.canvasRef.getChromosomeReport(chromosome)` triggers `openSection()` + double-RAF wait + `getCanvasDataUrl()` compositing. The data URL passes to a pure HTML template function; result opens via `window.open` + auto-print script embedded in the HTML.

```
ResultsPage
  └─ ChromosomCanvas (ref: ChromosomCanvasHandle)
       └─ ChromosomSection × N (ref: ChromosomSectionHandle)
            └─ simCanvas + simRuler + phasingCanvas[] + phasingRuler
                  └─ composited → toDataURL('image/jpeg')
                        └─ generateReportHtml() → Blob → window.open
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. ChromosomSection forwardRef | `openSection()` + `getCanvasDataUrl()` exposed on section | Double-RAF timing: canvases may not be drawn yet if wait is too short |
| 2. ChromosomCanvas forwardRef | `getChromosomeReport(chromosome)` async orchestration | Ref map must correctly track all section instances |
| 3. HTML template utility | Pure `generateReportHtml()` function | Base64-embedded JPEG can be large (~200–500 kB per chromosome) |
| 4. Export UI in ResultsPage | Dropdown + handler in production UI | Click-outside dismissal, no regression on annotation/ancestor flows |

**Prerequisites:** S-05 (canvas visualization) — already done.
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- **Double-RAF timing**: empirically reliable on modern browsers; may be flaky on very slow devices. If issues arise, the plan's approach (two nested `requestAnimationFrame`) is the standard fix.
- **Base64 size**: for a comparison with many phasing tracks, the embedded JPEG can be 300–600 kB — acceptable for a report file.
- **Print dialog auto-fire**: some browsers block `window.print()` if triggered from a blob URL in certain security contexts; in that case the user can manually print the opened tab.

## Success Criteria (Summary)

- Selecting any chromosome from the dropdown produces a new-tab print dialog with the canvas image and annotation data visible.
- Collapsed sections auto-open before capture; no user interaction required beyond picking the chromosome.
- Full TypeScript build passes and all existing features remain intact.
