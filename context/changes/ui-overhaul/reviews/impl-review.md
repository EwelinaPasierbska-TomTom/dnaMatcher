<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: UI Overhaul — Adaptacja do wyglądu prototypu

- **Plan**: context/changes/ui-overhaul/plan.md
- **Scope**: All phases (1–4 of 4)
- **Date**: 2026-06-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS ✅ |
| Scope Discipline | PASS ✅ |
| Safety & Quality | WARNING ⚠️ |
| Architecture | PASS ✅ |
| Pattern Consistency | WARNING ⚠️ |
| Success Criteria | PASS ✅ |

## Findings

### F1 — executeDelete navigates on HTTP failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/ResultsPage.tsx:139–148
- **Note**: Pre-existing bug (present in original `handleDelete`); refactor created clean fix opportunity.
- **Detail**: `apiFetch` returns a Response and never throws on non-2xx HTTP. If DELETE returns 403/500, `executeDelete` catches nothing and calls `navigate('/app')` as if deletion succeeded. User lands on dashboard, comparison still present — silent failure with no error message.
- **Fix**: Add `res.ok` check before navigating:
  ```ts
  const res = await apiFetch(`/api/comparisons/${id}`, { method: 'DELETE' })
  if (!res.ok) { setDeleting(false); setError('Nie udało się usunąć porównania.'); return }
  navigate('/app')
  ```
- **Decision**: PENDING

### F2 — AncestorPanel icon buttons missing aria-label

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Accessibility)
- **Location**: frontend/src/components/AncestorPanel.tsx:137–156
- **Note**: New gap introduced by this change — we replaced text symbols (✎ ×) with icon-only Buttons (Pencil, Trash2).
- **Detail**: The edit and delete buttons render only a lucide icon with no text and no `aria-label`. `title` attribute is not reliably announced by screen readers. Before the change, ✎ and × were at least Unicode characters; now they're invisible to assistive tech.
- **Fix**: Add `aria-label` to both buttons:
  ```tsx
  <Button ... aria-label={`Edytuj ${a.name}`}><Pencil ... /></Button>
  <Button ... aria-label={`Usuń ${a.name}`}><Trash2 ... /></Button>
  ```
- **Decision**: PENDING

### F3 — AncestorPanel raw inputs bypass new Input component

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/AncestorPanel.tsx:90–95, 165–170
- **Note**: New inconsistency — we introduced the `Input` component in Phase 1 and used it in all auth pages, but skipped it in AncestorPanel where two raw `<input>` remain.
- **Detail**: The two name-input fields (add form and edit form) use raw `<input className="w-full text-sm border border-gray-300 rounded px-2 py-1">` instead of `<Input>` from `../ui/input`. Focus ring, disabled styling, and sizing differ from the rest of the UI.
- **Fix**: Replace both raw inputs with `<Input>` component — drop `className` override or use `className="text-sm h-8"` if smaller size is wanted.
- **Decision**: PENDING

### F4 — SignUpPage navigates to /app without verifying session

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/SignUpPage.tsx:64
- **Note**: Pre-existing in original SignUpPage; not introduced by this change. Worth addressing since the file was rewritten.
- **Detail**: After `supabase.auth.signUp()` succeeds, `navigate('/app')` is called unconditionally. When email confirmation is **enabled** in Supabase, the returned user has no live session — `apiFetch` will immediately throw `'Brak aktywnej sesji.'` on any API call, breaking the dashboard. The Supabase client's `onAuthStateChange` in `AuthContext` will NOT fire until the user confirms their email.

  Fix A ⭐ Recommended — Check session before navigating:
  ```ts
  if (data?.session) {
    navigate('/app')
  } else {
    // Email confirmation required — show message
    setError('Sprawdź skrzynkę email i potwierdź rejestrację.')
  }
  ```
  - Strength: Handles both modes (confirmation on/off) correctly; user gets clear feedback.
  - Tradeoff: Needs a visible info state (not just an error).
  - Confidence: HIGH — Supabase docs are explicit that signUp can return user without session.
  - Blind spot: Unknown whether email confirmation is currently enabled in this deployment.

  Fix B — Add comment and defer:
  - Document the assumption that email confirmation is disabled, log it as known tech debt.
  - Strength: Zero code change; safe if confirmation is confirmed off.
  - Tradeoff: Silently broken if confirmation is toggled on in Supabase dashboard.
  - Confidence: LOW — deployment config can change without code change.
  - Blind spot: No visibility into Supabase dashboard settings.
- **Decision**: PENDING

### F5 — Unchecked `as` casts on API responses

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/AppPage.tsx:28, ResultsPage.tsx:58–65
- **Note**: Pre-existing pattern throughout codebase (ComparePage.tsx, etc.) — not introduced by this change.
- **Detail**: `(await res.json()) as ComparisonSummary[]` — runtime cast without validation. If server returns a non-array (error envelope, paginated wrapper) the app silently malfunctions. Not actionable as a regression — same pattern existed in all prior pages. Consider zod validation in a future cleanup pass.
- **Fix**: Add `Array.isArray` guard or introduce zod schema for API responses in a follow-up.
- **Decision**: PENDING
