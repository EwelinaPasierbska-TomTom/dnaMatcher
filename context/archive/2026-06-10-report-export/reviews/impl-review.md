<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Report Export

- **Plan**: context/changes/report-export/plan.md
- **Scope**: All phases (Phase 1–4)
- **Date**: 2026-06-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  4 warnings  5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Automated Verification

- `cd frontend && npx tsc --noEmit` → ✅ exit 0
- `cd frontend && npm run build` → ✅ exit 0, 560 kB bundle (pre-existing chunk-size advisory, not new)
- ESLint: no config present in project (pre-existing — not regressions from this change)

## Findings

### F1 — imageDataUrl unescaped in HTML attribute

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/reportHtml.ts:79
- **Detail**: `imageDataUrl` is interpolated directly into `<img src="${imageDataUrl}">` without `escapeHtml`. Today the value always comes from `canvas.toDataURL()` so it is safe. If any future call path passes a user-supplied or API-derived URL, this becomes an HTML-attribute injection point. `escapeHtml` is defined in the same file.
- **Fix**: Replace `<img src="${imageDataUrl}">` with `<img src="${escapeHtml(imageDataUrl)}">`.
  - Strength: One-line, consistent with all other interpolated values in the template. Closes the class of future misuse.
  - Tradeoff: None — data URL characters that would be escaped (`<>&"`) cannot appear in a valid base64 data URL anyway, so this is cost-free defence-in-depth.
  - Confidence: HIGH — same escapeHtml already applied to every other user-controlled value in the file.
  - Blind spot: None significant.
- **Decision**: SKIPPED

### F2 — window.open null return not handled

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/ResultsPage.tsx:196
- **Detail**: `window.open(url, '_blank')` returns `null` when the browser blocks the popup. The return value is discarded silently — the user sees no feedback, the export blob is created and never cleaned up, and the revokeObjectURL timer still fires for a URL no window will ever use.
- **Fix**: `const win = window.open(url, '_blank'); if (!win) { setError('Przeglądarka zablokowała okno eksportu. Zezwól na wyskakujące okna i spróbuj ponownie.'); URL.revokeObjectURL(url); return; }`.
- **Decision**: SKIPPED

### F3 — createObjectURL timer not cleared on unmount

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/ResultsPage.tsx:195–197
- **Detail**: Each `handleExport` call creates a `setTimeout(() => URL.revokeObjectURL(url), 60_000)` but never stores the timer ID. If the user navigates away (component unmounts) before 60 s, the timer fires on a potentially-collected component. Multiple rapid exports accumulate dangling timers. The pattern in the rest of this file cleans up via `useEffect` returns.
- **Fix**: Store the timer in a `useRef<ReturnType<typeof setTimeout> | null>` and clear it in a `useEffect` cleanup: `useEffect(() => () => { if (revokeTimer.current) clearTimeout(revokeTimer.current) }, [])`. Clear the previous timer before scheduling the new one.
- **Decision**: SKIPPED

### F4 — data! non-null assertion in handleExport

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/ResultsPage.tsx:177
- **Detail**: `data!.name` uses a non-null assertion. At runtime `data` will be set whenever the export dropdown is reachable, but the explicit guard is missing. Every other async handler in this file returns early if the precondition fails rather than asserting.
- **Fix**: Add `if (!data) return` before `data!.name` — matches the existing pattern at lines 57–60.
- **Decision**: FIXED — added `if (!data) return` guard; removed `data!.name` assertion

### F5 — handleExport missing try/catch

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/pages/ResultsPage.tsx:177
- **Detail**: `handleExport` is called as `void handleExport(chrom)` — its promise is discarded. Any error thrown inside (`canvas.getChromosomeReport`, Blob constructor, `window.open`) propagates silently. All other async handlers in the file either propagate to callers or surface errors via `setError`.
- **Fix**: Wrap the body in `try { ... } catch { setError('Nie udało się wyeksportować raportu.') }`.
- **Decision**: SKIPPED

### F6 — a.strand not escaped in annotation table

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/reportHtml.ts:38
- **Detail**: `a.strand` (values: `"maternal"`, `"paternal"`) is interpolated into a table cell without `escapeHtml`. The known values are safe, but the function signature accepts any `AnnotationOut`, so future data with unexpected strand values would go unescaped.
- **Fix**: Replace `${a.strand}` with `${escapeHtml(a.strand)}`.
- **Decision**: SKIPPED

### F7 — chromBoundsMap memo reads pairs but lists pairwisePairs as dependency

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/ChromosomCanvas.tsx:128
- **Detail**: The `chromBoundsMap` useMemo at line 112 iterates over `pairs` (line 114) but declares `[pairwisePairs]` as its dependency (line 128). If `pairs` changes while `pairwisePairs` stays the same (e.g., a 3-way pair updates its bounds), the memo will not recompute, serving stale bounds. All other memos in this file correctly list what they read.
- **Fix**: Change the dependency array from `[pairwisePairs]` to `[pairs]`.
- **Decision**: SKIPPED

### F8 — ReportOptions interface not exported

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: frontend/src/lib/reportHtml.ts:4
- **Detail**: Plan specified `export interface ReportOptions`; the actual declaration is `interface ReportOptions` (unexported). This makes the type unusable by callers that need to construct the options object outside the function.
- **Fix**: Change `interface ReportOptions` to `export interface ReportOptions`.
- **Decision**: FIXED — added `export` keyword

### F9 — double-rAF race on concurrent re-renders

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/ChromosomCanvas.tsx:96
- **Detail**: `getChromosomeReport` calls `handle.openSection()` then awaits two rAFs before reading the canvas. If a concurrent state update (e.g., an annotation save completing) triggers a re-render between the two rAFs, the canvas draw effects may not have finished, causing a partial or blank capture. This matches the documented contract but is an inherent fragility of the double-rAF timing approach.
- **Fix**: No immediate change required. If blank exports are reported, a third rAF or a `useEffect`-based readiness signal would be more robust. Track as a known limitation.
- **Decision**: SKIPPED — known limitation, track if reported
