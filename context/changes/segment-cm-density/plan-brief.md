# Segment cM + SNP density — Plan Brief

> Full plan: `context/changes/segment-cm-density/plan.md`

## What & Why

Dodajemy pole `density` (SNP/cM) przez cały stos i wyświetlamy dwie nowe kolumny w tabeli segmentów: `Dł. (cM)` (już istnieje) i `Gęstość (SNP/cM)` (nowa). Użytkownik potrzebuje tych wartości, żeby ocenić genetyczną istotność dopasowania.

## Starting Point

Infrastruktura cM (`length_cm`, `start_cm`, `end_cm`) już płynie end-to-end: parser CSV → Segment dataclass → SegmentOut API → DB → TypeScript. Frontend warunkowo pokazuje `Dł. (cM)`. Brakuje tylko pola `density` i jego wyświetlania.

## Desired End State

Tabela segmentów na stronie wyników pokazuje dwie warunkowe kolumny (ukryte gdy brak danych cM w CSV): długość w cM i gęstość SNP/cM. Backend oblicza `density = snp_count / length_cm` w algorytmie i przechowuje w DB.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Gdzie liczyć density | Algorytm (`_emit_segment()`) | Jedno miejsce, spójne z resztą cM logiki, przechowywane w DB |
| Co pokazać w tabeli | `Dł. (cM)` + `Gęstość (SNP/cM)` | Minimalna zmiana UI, zgodna z prototypem |
| Sortowanie | Poza zakresem | Osobna historyjka; nie blokuje S-08 |
| Edge case density | `null` gdy `length_cm` null lub 0 | Brak dzielenia przez zero; spójne z null-handling projektu |

## Scope

**In scope:** Pole `density` w Segment, SegmentOut, DB, TypeScript; kolumna Gęstość w SegmentTable; testy algorytmu z cM

**Out of scope:** Sortowanie po cM/density, wyświetlanie start_cm/end_cm, walidacja monotoniczności cM

## Architecture / Approach

Liniowa zmiana przez stos: `Segment` dataclass → `_emit_segment()` → `SegmentOut` Pydantic → `_segment_to_row()` → DB migration → TypeScript interface → SegmentTable render. Wzorzec identyczny z istniejącym `length_cm` w każdym miejscu.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend + DB + testy | `density` w modelu, algorytmie, API, DB migration; testy cM | Żaden — proste passthrough |
| 2. Frontend | Kolumna `Gęstość (SNP/cM)` w SegmentTable | TypeScript nullability |

**Prerequisites:** Brak — S-03 zaimplementowane  
**Estimated effort:** ~1 sesja, 2 fazy

## Open Risks & Assumptions

- CSV MyHeritage musi zawierać kolumnę `position_cm` (kolumna 5) — bez niej density będzie null i kolumna ukryta
- Migracja DB wymaga ręcznego zastosowania przez Supabase Dashboard

## Success Criteria (Summary)

- Tabela segmentów pokazuje `Gęstość (SNP/cM)` dla porównań z plikami CSV zawierającymi dane cM
- Kolumna ukryta gdy brak danych cM (brak regresji)
- Testy algorytmu pokrywają ścieżkę z danymi cM
