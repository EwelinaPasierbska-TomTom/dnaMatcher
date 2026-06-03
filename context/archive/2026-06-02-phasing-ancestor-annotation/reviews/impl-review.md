<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Phasing — Adnotacja Przodka (S-04)

- **Plan**: `context/changes/phasing-ancestor-annotation/plan.md`
- **Scope**: All 3 phases (full plan review)
- **Date**: 2026-06-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical · 5 warnings · 1 observation

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — DELETE endpoint bez user_id w samym zapytaniu usunięcia

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/routers/annotations.py:147–157
- **Detail**: SELECT verifies ownership but DELETE call only filters by `id`, not `user_id`. Two separate calls are non-atomic — race window exists. Authorization not enforced in the destructive operation itself.
- **Fix**: Replace select-then-delete with single `.delete().eq("id",...).eq("user_id",...)`. If `result.data` is empty → 404.
  - Strength: Atomic, eliminates race window, removes extra round-trip.
  - Tradeoff: 2–3 line change, minimal.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Decision**: FIXED — atomic `.delete().eq("id",...).eq("user_id",...)` + updated test mock + wrong-user 404 test added

### F2 — Fetch adnotacji bez limitu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/routers/annotations.py:88–93
- **Detail**: GET returns all annotations for profile_ids with no `.limit()`. Annotations can accumulate unboundedly.
- **Fix**: Add `.limit(5000)` or accept consciously and document.
- **Decision**: SKIPPED — MVP, annotations won't reach thousands of rows

### F3 — POST nie weryfikuje że profile_id należy do comparison_id

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/routers/annotations.py:109–115
- **Detail**: Checks profile belongs to user but not that it's a member of the comparison. Stray annotations are invisible via GET but accumulate in DB.
- **Fix A ⭐ Recommended**: Fetch comparison and validate `str(body.profile_id) in comp.data[0]["profile_ids"]` → 400 if not.
  - Strength: Correct integrity; clear error to user; same pattern as GET.
  - Tradeoff: One extra DB round-trip.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Fix B**: Accept as MVP risk — orphan annotations are invisible via GET.
  - Strength: No code changes.
  - Tradeoff: Dirty data accumulates; hard to clean later.
  - Confidence: MED
  - Blind spot: May complicate future "show all annotations for a profile" feature.
- **Decision**: ACCEPTED (Fix B) — orphan annotations invisible via GET, accepted as MVP risk

### F4 — SVG id="annotated-stripe" koliduje przy wielu diagramach

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/ChromosomeDiagram.tsx:79
- **Detail**: Global DOM id duplicated when 2+ PairSections render. Invalid HTML; unpredictable if stripe params ever differ per-diagram.
- **Fix**: Use `useId()` from React 18 for a unique id per instance.
- **Decision**: SKIPPED — stripe parameters are constant, no visible bug in MVP

### F5 — React Fragment bez key w .map()

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/SegmentTable.tsx:184
- **Detail**: `<>` shorthand cannot accept `key` prop. Must use `<React.Fragment key={i}>` so React can track items with conditional child counts.
- **Fix**: Replace `<>` with `<React.Fragment key={i}>` and `</>` with `</React.Fragment>`.
- **Decision**: SKIPPED — segments don't reorder, latent bug acceptable in MVP

### F6 — expandedRowIdx jako niestabilny index tablicy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/SegmentTable.tsx:85
- **Detail**: Array index used as row identity. After annotation state update, sorted array recompute could point expandedRowIdx at wrong segment (latent bug).
- **Fix**: Use string key `${seg.chromosome}-${seg.start_bp}-${seg.end_bp}` as `expandedRowIdx` identity.
- **Decision**: SKIPPED — segments don't reorder, latent bug acceptable in MVP

### F7 — Brak negative testów (wrong user DELETE, cross-comparison POST)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/test_annotations_api.py
- **Detail**: No test for DELETE with annotation belonging to another user (expect 404), no test for POST with valid profile_id not in comparison_id.
- **Fix**: Add 2 negative tests after fixing F1 and F3.
- **Decision**: FIXED — wrong-user DELETE test added (6th test in test_annotations_api.py)
