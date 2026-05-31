# DNA Comparison — Plan Brief

> Full plan: `context/changes/dna-comparison/plan.md`

## What & Why

Dostarcza główną wartość produktu: porównanie profili DNA. Użytkownik wgrywa 2–3 pliki CSV
MyHeritage, backend parsuje je in-memory, uruchamia algorytm segmentacji alleli i zwraca listę
segmentów chromosomowych z klasyfikacją FULL/HALF/NONE. Wyniki trwałe, dostępne przez historię.

## Starting Point

Backend ma auth i schemat DB (tabele `comparisons` + `comparison_results`), ale brak parsera,
algorytmu i endpointów porównań. Frontend pokazuje tylko email + wyloguj. `comparison_results`
wymaga rozszerzenia o 5 kolumn (start_cm, end_cm, length_bp, length_cm, pair_profile_ids).

## Desired End State

Użytkownik klika "Nowe porównanie" → wypełnia formularz (nazwa, imiona osób, pliki CSV) →
dostaje tabelę segmentów + diagram chromosomów (FULL=zielony, HALF=żółty, NONE=czerwony).
Historia porównań na `/app`. Dla 3 osób: 3 pairwise + 1 porównanie 3-way w accordion.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Upload + compare jako jeden flow | Unified (brak osobnych profili) | CSV nie jest trwały (NFR prywatność); prostszy UX | Plan |
| Liczba osób | 2 lub 3 | Pairwise + opcjonalne 3-way; >3 poza MVP | Plan |
| Normalizacja alleli | Zbiór (frozenset), unphased | MyHeritage nie gwarantuje kolejności; AG==GA | Plan |
| Segmentacja | Run-length z min_snp_count | Biologicznie naturalne; pasuje do schematu DB | Plan |
| Min SNP count | 10 (default), pole w UI | Standard genealogiczny; elastyczność dla użytkownika | Plan |
| 3-way klasyfikacja | Bezpośrednie porównanie 3 genotypów | Dokładniejsze niż intersection pairwise | Plan |
| Diagram chromosomów | Custom SVG w React | Zero nowych deps; pełna kontrola | Plan |
| Wyniki UI | Accordion (pary + 3-way) | Czytelne grupowanie; wszystko na jednej stronie | Plan |
| Kolory | FULL=zielony, HALF=żółty, NONE=czerwony | Wybór użytkownika | Plan |

## Scope

**In scope:**
- Parser CSV MyHeritage (rsID;chromosome;position_bp;genotype;;;)
- Algorytm segmentacji pairwise (2 osoby) i 3-way (3 osoby)
- Endpointy: POST/GET/DELETE /api/comparisons
- Frontend: formularz, wyniki (tabela + SVG diagram), historia na /app
- Migracja DB 002 (5 nowych kolumn w comparison_results)

**Out of scope:**
- Fazowanie / adnotacja przodka (S-04)
- Eksport wyników (v2)
- Więcej niż 3 osoby na porównanie
- Filtrowanie po min_cm / min_bp (tylko min_snp_count)
- Streaming postępu (spinner wystarczy)

## Architecture / Approach

```
CSV upload (multipart) → parser (bytes → list[SNPRecord])
                       → algorithm (pairwise + 3-way → list[Segment])
                       → Supabase (dna_profiles + comparisons + comparison_results)
                       → JSON response

Frontend: /compare (form) → POST /api/comparisons → /results/:id
          /app (history)  → GET  /api/comparisons
          /results/:id    → GET  /api/comparisons/:id → accordion + SVG + table
```

Parser i algorytm to czyste moduły Python (`src/dna/`) bez zależności od FastAPI.
Testowalność jednostkowa bez bazy danych.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. DB migration | 5 nowych kolumn w comparison_results | Migracja wymaga ręcznego SQL Editor |
| 2. Parser + algorytm | Czyste moduły, w pełni przetestowane jednostkowo | Poprawność 3-way classification |
| 3. Backend API | 4 endpointy, integracja parser+algo+Supabase | Mockowanie Supabase w testach |
| 4. Frontend | Formularz + wyniki + SVG diagram + historia | Skalowanie pozycji bp na piksele SVG |

**Prerequisites:** S-01 done (auth), schema 001 applied (tabele istnieją)
**Estimated effort:** ~3–4 sesje, 4 fazy

## Open Risks & Assumptions

- `ewaSample.csv` nie ma kolumny position_cm (pola start_cm/end_cm będą null) — OK per design
- Mockowanie Supabase w testach integracyjnych wymaga ostrożności (nie możemy trafić w real DB)
- SVG diagram: pozycjonowanie segmentów wymaga wiedzy o długości chromosomów (referencja hg38 hardkodowana)

## Success Criteria (Summary)

- Użytkownik może wgrać 2 pliki CSV i zobaczyć kolorowy diagram chromosomów z tabelą segmentów
- Wyniki są trwałe — odświeżenie strony nie kasuje wyników
- Błędny plik CSV daje czytelny polski komunikat zamiast awarii
