# Ancestor Management — Plan Brief

> Full plan: `context/changes/ancestor-management/plan.md`

## What & Why

Użytkownik definiuje nazwanych przodków z kolorami (globalnie per konto) i używa ich wielokrotnie przy fazowaniu — zamiast wpisywać wolny tekst przy każdej adnotacji. ChromosomeDiagram odzwierciedla kolory przodków wizualnie.

## Starting Point

`ancestor_annotations.ancestor_label` to wolny tekst — brak osobnej tabeli przodków. SegmentTable ma `<input type="text">`. ChromosomeDiagram rysuje indigo stripe dla wszystkich adnotacji bez rozróżnienia.

## Desired End State

Panel boczny na stronie wyników z listą nazwanych przodków (każdy z kolorową kropką). Formularz adnotacji używa dropdownu z przodkami. ChromosomeDiagram koloruje segmenty kolorem przypisanego przodka.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Zakres przodków | Globalnie per user_id | Raz zdefiniowani, używani we wszystkich porównaniach |
| Migracja starych danych | Zachowaj ancestor_label, dodaj nullable ancestor_id | Brak utraty danych; backward compat |
| On delete behavior | CASCADE | Adnotacje bez przodka nie mają sensu; czystsze dane |
| Kolory | Predefiniowana paleta 8 kolorów | Spójność wizualna; szybka implementacja |
| Lokalizacja UI | Panel boczny na ResultsPage | Zawsze widoczny podczas adnotowania |
| Diagram | Overlay w kolorze przodka | Wizualnie spójne z prototypem |
| Formularz | Dropdown + "Dodaj nowego…" | Szybki dostęp; jedno miejsce |

## Scope

**In scope:** Tabela ancestors + CRUD API, AncestorPanel, dropdown w SegmentTable, kolorowy overlay w ChromosomeDiagram, integracja w ResultsPage

**Out of scope:** Limit liczby przodków, przodkowie per comparison, niestandardowy color picker, migracja starych ancestor_label → ancestor_id

## Architecture / Approach

Nowa tabela `ancestors(id, user_id, name, color)` globalna per user. FK `ancestor_id` (nullable, CASCADE) w `ancestor_annotations`. Nowy backend router `src/routers/ancestors.py`. Frontend: nowy `AncestorPanel.tsx`, rozszerzenie SegmentTable i ChromosomeDiagram, stan zarządzany w ResultsPage.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. DB + Backend | Tabela, RLS, 4 endpointy CRUD, testy | RLS musi obejmować SELECT (pusta lista zamiast błędu gdy brak polityki) |
| 2. Frontend | Panel, dropdown, kolorowy overlay, integracja | ON DELETE CASCADE wymaga oczyszczenia lokalnego stanu annotations |

**Prerequisites:** S-04 zaimplementowane (ancestor_annotations istnieje)
**Estimated effort:** ~2 sesje, 2 fazy

## Open Risks & Assumptions

- ON DELETE CASCADE usuwa adnotacje globalnie (wszystkie porównania) — frontend musi odfiltrować annotations po ancestor_id
- Stare adnotacje (ancestor_id=NULL) zachowują indigo stripe — dwie ścieżki wyświetlania w ChromosomeDiagram

## Success Criteria (Summary)

- Użytkownik dodaje przodka z kolorem i używa go w dropdownie formularza adnotacji
- ChromosomeDiagram pokazuje kolorowy overlay (nie stripe) dla adnotacji z ancestor_id
- Usunięcie przodka usuwa powiązane adnotacje z UI i DB
