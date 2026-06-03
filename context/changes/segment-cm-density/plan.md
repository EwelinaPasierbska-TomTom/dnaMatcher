---
change_id: segment-cm-density
title: Segment cM and SNP density — display length in cM and SNP/cM density
status: planned
created: 2026-06-03
updated: 2026-06-03
---

# Segment cM + SNP density — Plan

## Overview

Dodajemy pole `density` (SNP/cM) przez cały stos oraz poprawiamy wyświetlanie danych cM w tabeli segmentów. Infrastruktura cM (`length_cm`, `start_cm`, `end_cm`) już istnieje end-to-end. Zakres: dodać `density` do modelu → algorytmu → API → DB → frontend, wzmocnić testy.

## Current State Analysis

- `length_cm` już płynie: CSV parser → `Segment` dataclass → `SegmentOut` Pydantic → DB (kolumny `start_cm`, `end_cm`, `length_cm`) → frontend TypeScript
- `SegmentTable.tsx` warunkuje kolumnę `Dł. (cM)` gdy `hasCm = sorted.some(s => s.length_cm !== null)` — już działa
- **Brakuje:** pola `density` w modelu, algorytmie, API, DB i frontend
- Testy algorytmu tworzą SNP z `position_cm=None` — brak pokrycia ścieżki z cM

## Desired End State

- Tabela segmentów na stronie wyników pokazuje dwie nowe kolumny (obie warunkowe, ukryte gdy null): `Dł. (cM)` (już jest) i `Gęstość (SNP/cM)` (nowa)
- `density` obliczana w `_emit_segment()`: `snp_count / length_cm` jeśli `length_cm > 0`, else `None`
- `density` przechowywana w DB w kolumnie `density numeric`
- Testy algorytmu weryfikują `length_cm` i `density` dla SNP z danymi cM

### Key Discoveries

- `src/dna/models.py:4-23` — `Segment` dataclass, dodać jedno pole `density: float | None`
- `src/dna/algorithm.py:37-55` — `_emit_segment()`, tu liczyć density po obliczeniu `length_cm`
- `src/routers/comparisons.py:29-38` — `SegmentOut` Pydantic, dodać `density: float | None`
- `src/routers/comparisons.py:89-111` — `_segments_to_pair_result()` i `_segment_to_row()`, passthrough
- `frontend/src/components/ChromosomeDiagram.tsx:27-37` — `SegmentOut` TS interface (exported, importowana przez SegmentTable)
- `frontend/src/components/SegmentTable.tsx:82-168` — kolumny tabeli, wzorzec `hasCm` do powielenia dla `hasDensity`
- Migracja DB: kolejna po `004_ancestor_annotations_unique.sql` → `005_segment_density_column.sql`

## What We're NOT Doing

- Sortowanie tabeli po cM / density — poza zakresem S-08
- Wyświetlanie `start_cm` / `end_cm` — tylko `length_cm` i `density`
- Walidacja monotoniczności pozycji cM w parserze

## Implementation Approach

Prosta, liniowa zmiana przez stos: backend (model + algorytm + API + migracja + testy) w fazie 1, frontend w fazie 2. Faza 2 nie blokuje się na manualnym zastosowaniu migracji — frontend widzi `density: null` dopóki DB nie ma kolumny, co jest safe.

---

## Phase 1: Backend — model, algorytm, API, DB, testy

### Overview

Dodanie `density: float | None` przez cały backend pipeline oraz migration SQL. Testy weryfikują obliczenia dla SNP z danymi cM.

### Changes Required

#### 1. Segment dataclass — dodanie pola density

**File**: `src/dna/models.py`

**Intent**: Dodać pole `density: float | None` do dataclassy `Segment` jako ostatnie pole.

**Contract**: Nowe pole po `snp_count`: `density: float | None`

#### 2. Algorytm — obliczenie density

**File**: `src/dna/algorithm.py`

**Intent**: W `_emit_segment()` obliczyć `density` po obliczeniu `length_cm` i przekazać do konstruktora `Segment`.

**Contract**: `density = snp_count / length_cm if length_cm and length_cm > 0 else None`. Przypisanie po linii obliczającej `length_cm`, przed `return Segment(...)`.

#### 3. SegmentOut Pydantic model — dodanie density

**File**: `src/routers/comparisons.py`

**Intent**: Dodać `density: float | None` do `SegmentOut` (linie 29-38) — passthrough z modelu wewnętrznego.

**Contract**: Pole `density: float | None` po `snp_count`.

#### 4. Passthrough density w helperach

**File**: `src/routers/comparisons.py`

**Intent**: W `_segments_to_pair_result()` (linia ~103) dodać `density=s.density` przy tworzeniu `SegmentOut`. W `_segment_to_row()` (linia ~81) dodać `"density": seg.density` do słownika bazy.

**Contract**: Oba miejsca to proste dodanie jednego klucza — wzorzec identyczny jak `start_cm`, `end_cm`, `length_cm` w tych samych funkcjach.

#### 5. DB migration

**File**: `supabase/migrations/005_segment_density_column.sql`

**Intent**: Dodać kolumnę `density` do tabeli `comparison_results`.

**Contract**:
```sql
ALTER TABLE comparison_results ADD COLUMN density numeric;
```

#### 6. Testy algorytmu — pokrycie ścieżki cM

**File**: `tests/test_dna_algorithm.py`

**Intent**: Dodać testy weryfikujące `length_cm` i `density` dla segmentu zbudowanego z SNP posiadających `position_cm`. Jeden test happy-path (SNP z cM → oczekiwana density), jeden edge-case (SNP bez cM → density None).

**Contract**: Nowe SNPRecord z `position_cm` ustawionymi (np. 10.0 i 20.0 dla pary SNP). Po wywołaniu `compare_pairwise()` lub `_emit_segment()` bezpośrednio, sprawdzić `segment.length_cm == pytest.approx(10.0)` i `segment.density == pytest.approx(snp_count / 10.0)`.

### Success Criteria

#### Automated Verification

- `uv run pytest` exits 0
- `uv run mypy .` exits 0
- `uv run ruff check .` exits 0
- `uv run ruff format --check .` exits 0
- `test_dna_algorithm.py` zawiera min. 2 nowe testy density (widoczne w pytest output)

#### Manual Verification

- `supabase/migrations/005_segment_density_column.sql` wygląda poprawnie przed zastosowaniem
- Migration zastosowana w Supabase Dashboard SQL Editor bez błędów
- Kolumna `density` widoczna w Table Editor dla `comparison_results`

---

## Phase 2: Frontend — kolumna Gęstość (SNP/cM)

### Overview

Dodanie `density` do interfejsu TypeScript i renderowanie nowej kolumny w `SegmentTable` — warunkowej (ukrytej gdy wszystkie density są null), wzorowanej na istniejącej logice `hasCm`.

### Changes Required

#### 1. SegmentOut interface — dodanie density

**File**: `frontend/src/components/ChromosomeDiagram.tsx`

**Intent**: Dodać `density: number | null` do eksportowanego interfejsu `SegmentOut` (linia ~37).

**Contract**: `density: number | null` po `length_cm: number | null`.

#### 2. SegmentTable — kolumna density

**File**: `frontend/src/components/SegmentTable.tsx`

**Intent**: Analogicznie do `hasCm` (linia 82) dodać `hasDensity`. Dodać nagłówek `Gęstość (SNP/cM)` i komórkę warunkowe.

**Contract**:
- `const hasDensity = sorted.some((s) => s.density !== null)` — obok `hasCm`
- Nagłówek: `{hasDensity && <th className="py-2 pr-4">Gęstość (SNP/cM)</th>}` — po kolumnie `Dł. (cM)`
- Komórka: `{hasDensity && <td ...>{seg.density !== null ? seg.density.toFixed(1) : '—'}</td>}` — format `toFixed(1)` (jedna cyfra dziesiętna, np. "129.9")

### Success Criteria

#### Automated Verification

- `cd frontend && npx tsc --noEmit` exits 0
- `uv run pytest` exits 0 (testy backendowe nadal przechodzą)

#### Manual Verification

- Uruchomić aplikację: `cd frontend && npm run dev`
- Porównanie z CSV zawierającym dane cM: kolumna `Gęstość (SNP/cM)` widoczna w tabeli segmentów
- Porównanie z CSV bez danych cM: kolumna `Gęstość (SNP/cM)` ukryta
- Wartości density wyświetlone z 1 miejscem dziesiętnym (np. "129.9")
- Brakujące wartości wyświetlane jako `—`
- Brak regresji w istniejących kolumnach tabeli

---

## Testing Strategy

### Unit Tests

- `tests/test_dna_algorithm.py`: happy-path density z SNP mającymi position_cm, edge-case density=None gdy brak cM

### Integration Tests

- Istniejące testy `test_comparisons_api.py` przechodzą (używają CSV bez cM, density będzie None — safe)

### Manual Testing Steps

1. Zalogować się, stworzyć nowe porównanie z plikami CSV MyHeritage zawierającymi kolumnę position_cm
2. Przejść do wyników — sprawdzić kolumny `Dł. (cM)` i `Gęstość (SNP/cM)` w tabeli
3. Sprawdzić że wartości są liczbowe z 1 miejscem dziesiętnym
4. Przetestować z CSV bez position_cm — obie kolumny ukryte

## References

- Istniejący wzorzec cM: `src/dna/algorithm.py:37-55`
- Wzorzec `hasCm`: `frontend/src/components/SegmentTable.tsx:82`
- Poprzednia migracja: `supabase/migrations/004_ancestor_annotations_unique.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — model, algorytm, API, DB, testy

#### Automated

- [x] 1.1 `uv run pytest` exits 0
- [x] 1.2 `uv run mypy .` exits 0
- [x] 1.3 `uv run ruff check .` exits 0
- [x] 1.4 `uv run ruff format --check .` exits 0
- [x] 1.5 `test_dna_algorithm.py` zawiera min. 2 nowe testy density

#### Manual

- [x] 1.6 Migration SQL wygląda poprawnie
- [x] 1.7 Migration zastosowana w Supabase Dashboard bez błędów
- [x] 1.8 Kolumna `density` widoczna w Table Editor

### Phase 2: Frontend — kolumna Gęstość (SNP/cM)

#### Automated

- [ ] 2.1 `cd frontend && npx tsc --noEmit` exits 0
- [ ] 2.2 `uv run pytest` exits 0

#### Manual

- [ ] 2.3 Kolumna `Gęstość (SNP/cM)` widoczna dla CSV z danymi cM
- [ ] 2.4 Kolumna ukryta dla CSV bez danych cM
- [ ] 2.5 Wartości z 1 miejscem dziesiętnym, brakujące jako `—`
- [ ] 2.6 Brak regresji w istniejących kolumnach
