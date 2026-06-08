# UI Overhaul — Plan Brief

> Full plan: `context/changes/ui-overhaul/plan.md`

## What & Why

Przeprojektowanie frontendu `dnaMatcher` tak, by look & feel odpowiadał prototypowi `chromosome-mapper-main`. Prototyp ma spójny design system oparty na gradientowych tłach, kartach z niebieskim akcentem, ikonach DNA i bibliotece komponentów shadcn/ui. Obecna aplikacja ma płaski, szary wygląd bez komponentów wielokrotnego użytku.

## Starting Point

Frontend używa Tailwind v4 z surowymi elementami HTML (`<button>`, `<input>`, `<div>`) i gray-50 tłem. Brak biblioteki komponentów, brak ikon, brak spójnego systemu przycisków. Routing i logika backendowa są stabilne i nie wymagają zmian.

## Desired End State

Wszystkie strony mają gradient `from-blue-50 via-white to-green-50`, logo Dna (lucide-react) i "dnaMatcher" w nagłówku. Dashboard pokazuje grid kart 1/2/3 kolumn z niebieskim akcentem lewostronnym. Formularze auth używają komponentu Card. Strona wyników ma przyciski z ikonami i AlertDialog zamiast natywnego `confirm()`. Canvas wizualizacji chromosomów pozostaje niezmieniony.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Tailwind version | Zostać na v4, komponenty ręcznie | Migracja do v3 ryzykowna, v4 kompatybilne z CVA i Radix |
| Komponenty UI | Button, Card, Input, Label, Badge, Tabs, AlertDialog | Tylko te potrzebne w redesignie, bez pełnego shadcn CLI |
| Design tokens | Hardkodowane klasy Tailwind | Szybsze w implementacji, brak potrzeby CSS variables |
| Auth flow | Osobne strony /login i /signup (restylowane) | Zero zmian w routingu, mniejsze ryzyko regresji |
| Toasty | Brak (zachować inline errors) | Uniknięcie dodatkowej zależności sonner |
| Canvas | Zachować bez zmian | Wysokie ryzyko regresji wizualizacji DNA |
| Dashboard layout | Grid 1/2/3 kolumn, max-w-6xl | Identyczny jak prototyp, nowocześniejszy UX |
| ComparePage | Bez zmian | Skupienie na najważniejszych ekranach |

## Scope

**In scope:**
- 6 nowych zależności npm (lucide-react, CVA, tailwind-merge, clsx, Radix tabs, Radix alert-dialog)
- `frontend/src/lib/utils.ts` (cn utility)
- 7 komponentów UI: Button, Card, Input, Label, Badge, Tabs, AlertDialog
- Redesign: SignInPage, SignUpPage, AppPage, ResultsPage, AncestorPanel

**Out of scope:**
- ComparePage, ChromosomCanvas, ChromosomSection, ChromosomeDiagram, SegmentTable
- Migracja Tailwind v3, pełne shadcn/ui, CSS variables, dark mode, toasty

## Architecture / Approach

Komponenty UI lądują w `frontend/src/components/ui/` jako standalone pliki `.tsx`. Button korzysta z CVA dla wariantów. Tabs i AlertDialog używają Radix primitives dla dostępności. Strony importują komponenty i zastępują surowy HTML — logika (fetch, auth, state) bez zmian.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Fundament | 7 komponentów UI + cn() | TypeScript errors z Radix jeśli złe typy |
| 2. Auth pages | /login i /signup z gradientem i Card | Brak — logika auth niezmieniona |
| 3. Dashboard | AppPage grid kart, Dna logo | Zmiana max-w-2xl → max-w-6xl może wyglądać dziwnie na wąskich ekranach |
| 4. Results + Panel | ResultsPage gradient, AlertDialog, AncestorPanel buttons | Canvas musi działać identycznie po zmianie obudowy |

**Prerequisites:** Projekt buduje się bez błędów przed startem (`npm run build`)  
**Estimated effort:** ~2-3 sesje, 4 fazy sekwencyjne (faza 1 blokuje pozostałe)

## Open Risks & Assumptions

- Tailwind v4 i `data-[state=active]:*` selektory dla Radix Tabs — zakładamy wsparcie (bardzo prawdopodobne, ale warto zweryfikować w fazie 1)
- `AncestorPanel` nie był w pełni przeczytany — może mieć custom state management wymagający uwagi w fazie 4

## Success Criteria (Summary)

- Każda ze zmienianych stron ma gradient tło i ikonę DNA zamiast szarego flat designu
- Dashboard wyświetla grid kart z niebieskim lewostronnym akcentem
- Canvas chromosomów działa identycznie jak przed zmianami (adnotacje, popupy)
