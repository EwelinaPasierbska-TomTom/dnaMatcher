# Phasing — Adnotacja Przodka (S-04) — Plan Brief

> Full plan: `context/changes/phasing-ancestor-annotation/plan.md`

## What & Why

S-04 dostarcza ręczne fazowanie — użytkownik może przypisać segment chromosomu do
konkretnego przodka (imię + linia dziedziczenia maternal/paternal). To ostatni
must-have z PRD (FR-008) i domknięcie north star: od CSV przez porównanie do pełnej
adnotacji genealogicznej.

## Starting Point

Tabela `ancestor_annotations` istnieje w bazie (migracja 001) z kompletnym schematem
i RLS. Brakuje jednego UNIQUE constraint, routera backendowego i całego UI. Frontend
`ResultsPage` + `SegmentTable` + `ChromosomeDiagram` są gotowe do rozszerzenia.

## Desired End State

Na stronie wyników `/results/:id` użytkownik klika wiersz w tabeli segmentów →
pojawia się inline formularz z wyborem osoby, linii dziedziczenia i imienia przodka.
Po zapisaniu wiersz pokazuje badge przodka, a diagram chromosomów — ukośny overlay
na annotowanej pozycji. Adnotacje są trwałe i widoczne po odświeżeniu.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| UX trigger | Inline form w SegmentTable | Zero nowych tras, kontekst porównania zachowany | Plan |
| Profil docelowy | Dropdown z osobami porównania | Explicit choice → clean profile_id FK | Plan |
| Strand | Wymagany (maternal/paternal) | Zgodne z istniejącym schema NOT NULL | Plan |
| Wizualizacja | Badge w tabeli + stripe overlay na diagramie | Adnotacja widoczna w obu widokach jednocześnie | Plan |
| CRUD | Pełny (dodaj + edytuj + usuń) | UPSERT upraszcza backend — create i edit to jeden endpoint | Plan |
| Data linking | Pozycja (chromosome + start + end) | Zero migracji; semantycznie poprawne (fact o profilu, nie o sesji) | Plan |
| Duplikaty | UPSERT z UNIQUE constraint (migration 003) | Jeden formularz obsługuje create i edit — prostsze UX | Plan |

## Scope

**In scope:**
- Migration 003: UNIQUE constraint na ancestor_annotations
- Backend: GET/POST(upsert)/DELETE endpointy dla adnotacji
- Frontend: inline formularz w SegmentTable, badge w tabeli, stripe overlay na diagramie

**Out of scope:**
- Automatyczne fazowanie
- Osobna strona `/phasing/:id`
- Bulk import / eksport adnotacji
- Scoping adnotacji do comparison_id (adnotacje globalne dla profilu)

## Architecture / Approach

Trzy warstwy w kolejności zależności. (1) Migracja SQL: jeden UNIQUE constraint.
(2) Backend: nowy `src/routers/annotations.py` z 3 endpointami; wzorzec identyczny
z `comparisons.py`; UPSERT przez Supabase `on_conflict`. (3) Frontend: `ResultsPage`
zarządza stanem `annotations[]` i mutacjami; `SegmentTable` dostaje expandable rows
z formularzem; `ChromosomeDiagram` renderuje SVG `<pattern>` overlay.
Brak nowych tras ani stron.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
|---|---|---|
| 1. Migration 003 | UNIQUE constraint w ancestor_annotations | Błąd SQL jeśli już istnieją duplikaty w bazie |
| 2. Backend router | GET/POST/DELETE /api/.../annotations + testy | Poprawność UPSERT z Supabase on_conflict |
| 3. Frontend | Inline form, badge, diagram overlay | TypeScript typy + state lifting do ResultsPage |

**Prerequisites:** S-02+S-03 zaimplementowane i zweryfikowane (comparison_results, profile_ids dostępne)  
**Szacowane nakłady:** ~2-3 sesje wieczorne; 3 fazy sekwencyjnie

## Open Risks & Assumptions

- Jeśli baza zawiera już zduplikowane rekordy w `ancestor_annotations` (przed constraint),
  migracja 003 zwróci błąd — należy ją poprzedzić deduplikacją.
- Supabase Python SDK: `on_conflict` string musi dokładnie odpowiadać nazwom kolumn
  w constraint — literówka nie da błędu kompilacji, tylko runtime 500.

## Success Criteria (Summary)

- Użytkownik może przypisać przodka do segmentu i zobaczyć adnotację w tabeli i na diagramie
- Adnotacje przeżywają odświeżenie strony (trwałe w bazie)
- Pełny CRUD: dodaj → edytuj (UPSERT) → usuń działa dla każdej osoby z porównania
