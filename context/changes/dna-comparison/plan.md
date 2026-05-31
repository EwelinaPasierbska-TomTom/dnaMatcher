---
change_id: dna-comparison
title: DNA Comparison (S-02 + S-03) — upload CSV + algorytm segmentacji + wyniki
status: planned
created: 2026-05-30
updated: 2026-05-30
---

# DNA Comparison Implementation Plan (S-02 + S-03)

## Overview

Dostarcza kompletny przepływ porównania DNA: użytkownik wgrywa pliki CSV MyHeritage dla 2 lub 3 osób,
backend parsuje dane in-memory, uruchamia algorytm segmentacji alleli i zapisuje wyniki segmentów do bazy.
Wyniki są widoczne w tabeli i na diagramie chromosomów (SVG). Historia porównań dostępna z poziomu `/app`.

Łączy S-02 i S-03 w jeden plan — zamiast osobnego zarządzania profilami, upload CSV jest częścią
formularza porównania. Surowe dane CSV nigdy nie są zapisywane (NFR: prywatność danych genetycznych).

## Current State Analysis

- `dna_profiles` i `comparisons` + `comparison_results` — tabele istnieją w schema 001
- `comparison_results` ma: chromosome, start_position, end_position, snp_count, classification
  — brakuje: start_cm, end_cm, length_bp, length_cm, pair_profile_ids
- Brak endpointów porównań — tylko `GET /api/me` istnieje
- Frontend: `/app` pokazuje email + wyloguj; brak formularza porównania i wyników
- Parser CSV: brak — format MyHeritage znany (`;`-separated, bez nagłówka, 7 kolumn)

## Desired End State

- Użytkownik wchodzi na `/app`, widzi listę swoich porównań (lub pusty stan)
- Klika "Nowe porównanie" → formularz na `/compare`: nazwa sesji, imię + CSV dla każdej osoby (2 lub 3),
  opcjonalne pole min_snp_count (domyślnie 10)
- Po kliknięciu "Porównaj": backend parsuje, uruchamia algorytm, zwraca wyniki
- Wyniki na `/results/:id`: accordion z pairwise parami + (dla 3 osób) zakładka 3-way;
  w każdej zakładce tabela segmentów + diagram chromosomów z kolorami FULL=zielony/HALF=żółty/NONE=czerwony
- Sesja zapisana — użytkownik może wrócić do wyników

### Key Discoveries

- `src/auth/client.py:7` — singleton Supabase `Client` via `@cache`; wstrzykiwany przez `Depends(get_supabase_client)`
- `src/auth/dependencies.py:16` — wzorzec auth: `Depends(security)` + `Depends(get_supabase_client)` → `CurrentUser`
- `src/routers/me.py:6` — wzorzec routera: `APIRouter(tags=[...])`, endpointy jako plain functions z Depends
- `comparisons` schema: `profile_ids uuid[]` — array FK do `dna_profiles`; kaskadowy trigger DELETE
- `comparison_results` schema: brakujące kolumny wymagają migracji 002 przed implementacją
- Frontend pattern: `useState` + inline error + loading disabled button; Custom SVG bez zewnętrznych lib
- Vite proxy: `/api/*` → `localhost:8000` — frontend dev może wywoływać backend bez CORS

## What We're NOT Doing

- Osobna strona zarządzania profilami (lista profili, usuwanie profili) — S-02 z roadmapy skonsumowany przez unified flow
- Fazowanie / adnotacja przodka — S-04
- Eksport CSV/PDF wyników — S-04/v2
- Obsługa innych formatów niż MyHeritage — Non-goal PRD
- Automatyczne fazowanie — Non-goal PRD
- Sliding window w algorytmie — zdecydowano na run-length z min_snp_count
- Streaming/SSE postępu — spinner wystarczy dla MVP
- UI do zmiany max_gap_bp/max_gap_cm — parametr backendowy, nie eksponowany w MVP

## Implementation Approach

Cztery fazy w zależności zależności: migracja DB → backend core (parser + algorytm) → API endpoints
→ frontend (formularz + wyniki + historia). Backend core (faza 2) jest w pełni testowalny jednostkowo
bez bazy danych — celowa izolacja logiki od warstwy persystencji.

## Critical Implementation Details

- **Kolejność routerów (Phase 3 + Phase 4)**: `app.include_router(comparisons_router)` musi pojawić się
  w `main.py` PRZED `app.mount("/", StaticFiles(...))`. Istniejący komentarz w main.py:32 to dokumentuje.
- **pair_profile_ids w comparison_results**: każdy rekord wynikowy identyfikuje parę porównywaną
  (np. `[a_id, b_id]` dla pairwise A-B, `[a_id, b_id, c_id]` dla 3-way). Frontend grupuje wyniki
  po tym polu.
- **Normalizacja alleli**: genotyp to zawsze posortowany zestaw 2 alleli — `AG` i `GA` to ten sam
  genotyp. Normalizuj przez `frozenset(genotype)` lub sortując znaki.

---

## Phase 1: Database migration 002

### Overview

Rozszerza `comparison_results` o kolumny potrzebne algorytmowi segmentacji. Dodaje indeks na
`comparison_results.comparison_id` (jeśli brakuje). Nie zmienia istniejących tabel `dna_profiles`
ani `comparisons`.

### Changes Required

#### 1. Create `supabase/migrations/002_comparison_results_columns.sql`

**File**: `supabase/migrations/002_comparison_results_columns.sql`

**Intent**: Dodaje do `comparison_results` kolumny wymagane przez algorytm segmentacji i identyfikację par.

**Contract**: Plik musi zawierać:
- `ALTER TABLE comparison_results ADD COLUMN start_cm numeric` (nullable — position_cm opcjonalne)
- `ALTER TABLE comparison_results ADD COLUMN end_cm numeric` (nullable)
- `ALTER TABLE comparison_results ADD COLUMN length_bp bigint NOT NULL DEFAULT 0`
- `ALTER TABLE comparison_results ADD COLUMN length_cm numeric` (nullable)
- `ALTER TABLE comparison_results ADD COLUMN pair_profile_ids uuid[] NOT NULL DEFAULT '{}'`
- `CREATE INDEX IF NOT EXISTS idx_comparison_results_comparison_id ON comparison_results(comparison_id)`
- `CREATE INDEX IF NOT EXISTS idx_comparison_results_pair ON comparison_results USING GIN(pair_profile_ids)`

Kolumna `classification` (istniejąca) przechowuje wartości FULL/HALF/NONE — brak zmian.
Kolumna `start_position` = start_bp, `end_position` = end_bp — nazwy nie zmieniane (backwards compat).

### Success Criteria

#### Automated Verification

- `test -f supabase/migrations/002_comparison_results_columns.sql` exits 0
- `grep -c "ADD COLUMN" supabase/migrations/002_comparison_results_columns.sql` → 5
- `uv run pytest` exits 0 (brak regresji)
- `uv run mypy .` exits 0
- `uv run ruff check .` exits 0

#### Manual Verification

- Supabase Dashboard → SQL Editor → paste + run `002_comparison_results_columns.sql` → brak błędów
- Table Editor → comparison_results: 5 nowych kolumn widocznych
- Istniejące dane (o ile są) nie uszkodzone

---

## Phase 2: Backend core — parser i algorytm

### Overview

Dwa izolowane moduły Python bez zależności od FastAPI ani Supabase. Parser wczytuje CSV MyHeritage
i zwraca listę rekordów SNP. Algorytm przyjmuje dwie lub trzy listy rekordów i zwraca listę segmentów.
Oba testowalne jednostkowo z danymi syntetycznymi.

### Changes Required

#### 1. Create `src/dna/__init__.py`

**File**: `src/dna/__init__.py`

**Intent**: Pusty plik — tworzy pakiet Python dla modułów DNA.

**Contract**: Pusty plik.

#### 2. Create `src/dna/models.py`

**File**: `src/dna/models.py`

**Intent**: Dataklasy wspólne dla parsera i algorytmu.

**Contract**: Eksportuje:
- `SNPRecord` — dataclass z polami: `rsid: str`, `chromosome: str`, `position_bp: int`,
  `position_cm: float | None`, `allele1: str`, `allele2: str` (allele znormalizowane: posortowane)
- `Segment` — dataclass z polami: `chromosome: str`, `match_type: str` (FULL/HALF/NONE),
  `start_bp: int`, `end_bp: int`, `start_cm: float | None`, `end_cm: float | None`,
  `length_bp: int`, `length_cm: float | None`, `snp_count: int`

#### 3. Create `src/dna/parser.py`

**File**: `src/dna/parser.py`

**Intent**: Parser pliku CSV w formacie MyHeritage. Wczytuje bytes (UploadFile.read()),
parsuje i zwraca listę `SNPRecord`. Pomija nieprawidłowe wiersze.

**Contract**: Eksportuje `parse_myheritage_csv(data: bytes) -> list[SNPRecord]`.

Format wejściowy: `;`-separated, bez nagłówka, 7 kolumn:
`rsID;chromosome;position_bp;genotype;(puste);(puste);(puste)`

Walidacja i normalizacja:
- Pomiń wiersz jeśli genotyp jest jednym z: `--`, `00`, `NN`, pusty string, lub nie ma dokładnie
  2 znaków alfabetycznych
- Allele normalizuj: posortuj 2 znaki rosnąco (np. `GA` → `AG`), zapisz jako `allele1` i `allele2`
- Chromosome: zachowaj jako string (1–22, X, Y, MT)
- Position_cm: kolumna 5 (indeks 4) jeśli obecna i parsowalna jako float; else `None`
- Wynik posortowany po (chromosome, position_bp)
- Rzuć `ValueError` z polskim komunikatem jeśli plik jest całkowicie pusty lub nie ma ani jednego
  prawidłowego wiersza

#### 4. Create `src/dna/algorithm.py`

**File**: `src/dna/algorithm.py`

**Intent**: Algorytm segmentacji. Przyjmuje 2 lub 3 listy `SNPRecord` (po jednej na osobę),
zwraca listę `Segment` posortowaną rosnąco (chromosome, start_bp).

**Contract**: Eksportuje:
- `compare_pairwise(a: list[SNPRecord], b: list[SNPRecord], min_snp_count: int = 10, max_gap_bp: int | None = None, max_gap_cm: float | None = None) -> list[Segment]`
- `compare_three_way(a: list[SNPRecord], b: list[SNPRecord], c: list[SNPRecord], min_snp_count: int = 10, max_gap_bp: int | None = None, max_gap_cm: float | None = None) -> list[Segment]`

Klasyfikacja SNP (pairwise):
- Wejście: `SNPRecord` dla osoby A i B na tej samej pozycji (rsid + chromosome + position_bp muszą
  się zgadzać)
- `match_type`:
  - `FULL` gdy `{a.allele1, a.allele2} == {b.allele1, b.allele2}`
  - `HALF` gdy `{a.allele1, a.allele2} & {b.allele1, b.allele2}` niepusty i nie FULL
  - `NONE` gdy przecięcie puste

Klasyfikacja SNP (3-way):
- `FULL` gdy wszystkie 3 zestawy alleli identyczne
- `HALF` gdy `{a} & {b} & {c}` niepuste (istnieje allel wspólny dla wszystkich 3), ale nie FULL
- `NONE` gdy brak allelu wspólnego dla wszystkich 3

Budowanie segmentów (run-length):
- Przetwarzaj chromosom po chromosomie
- Na wspólnych pozycjach (SNP obecny u WSZYSTKICH porównywanych osób): przypisz match_type
- Grupuj kolejne SNP-y z tym samym match_type w segment
- Zakończ segment gdy: zmienia się match_type, zmienia się chromosom, lub luka między kolejnymi
  pozycjami > max_gap_bp (jeśli podane) / max_gap_cm (jeśli podane i dostępne)
- Po zbudowaniu segmentów: odfiltruj te z `snp_count < min_snp_count`
- Pola segmentu: chromosome, match_type, start_bp, end_bp, start_cm (lub None), end_cm (lub None),
  length_bp = end_bp - start_bp, length_cm = end_cm - start_cm (lub None), snp_count

#### 5. Create `tests/test_dna_parser.py`

**File**: `tests/test_dna_parser.py`

**Intent**: Testy jednostkowe parsera — poprawny CSV, brakujące allele, normalizacja GA→AG.

**Contract**: Minimum 4 testy:
- Parsuje poprawne wiersze i zwraca posortowane SNPRecord
- Pomija wiersze z `--`, `00`, `NN`, puste genotypy
- Normalizuje `GA` do `AG` (allele posortowane)
- Rzuca `ValueError` przy całkowicie pustym pliku

#### 6. Create `tests/test_dna_algorithm.py`

**File**: `tests/test_dna_algorithm.py`

**Intent**: Testy jednostkowe algorytmu klasyfikacji i segmentacji.

**Contract**: Minimum 6 testów:
- FULL: AA vs AA → FULL
- HALF: AG vs AA → HALF (wspólne A)
- NONE: AA vs GG → NONE
- Segmentacja: 3 kolejne FULL → 1 segment
- Filtrowanie: segment z 2 SNP-ami odfiltrowany przy min_snp_count=3
- 3-way FULL: AA, AA, AA → FULL
- 3-way HALF: AG, AC, AT → HALF (wspólne A we wszystkich 3)
- 3-way NONE: AA, GG, CC → NONE

### Success Criteria

#### Automated Verification

- `uv run pytest tests/test_dna_parser.py tests/test_dna_algorithm.py -v` exits 0
- `uv run pytest` exits 0 (brak regresji)
- `uv run mypy .` exits 0
- `uv run ruff check .` exits 0

#### Manual Verification

- Ręczne uruchomienie parsera na `ewaSample.csv` daje niepusty wynik i nie rzuca wyjątku

---

## Phase 3: Backend API — endpointy porównań

### Overview

Router FastAPI z 4 endpointami. `POST /api/comparisons` przyjmuje multipart form z N plikami CSV
i metadanymi, uruchamia parser + algorytm, zapisuje do Supabase. Pozostałe endpointy
obsługują listę, odczyt i usuwanie sesji porównania.

### Changes Required

#### 1. Create `src/routers/comparisons.py`

**File**: `src/routers/comparisons.py`

**Intent**: Router z 4 endpointami do zarządzania sesjami porównań.

**Contract**: `router = APIRouter(tags=["comparisons"])`. Endpointy:

`POST /comparisons` — multipart form:
- Pola: `name: str`, `min_snp_count: int = 10` (Form), `person_names: list[str]` (Form, 2–3 elementy),
  `files: list[UploadFile]` (2–3 pliki)
- Walidacja: 2 ≤ len(files) ≤ 3, len(files) == len(person_names)
- Logika:
  1. Wczytaj każdy plik (await file.read()), uruchom `parse_myheritage_csv`
  2. Utwórz rekord `dna_profiles` w Supabase dla każdej osoby (name, original_filename)
  3. Utwórz rekord `comparisons` (user_id, name, profile_ids)
  4. Uruchom `compare_pairwise` dla każdej pary (A-B, A-C, B-C jeśli 3 osoby)
  5. Uruchom `compare_three_way` jeśli 3 osoby
  6. Zapisz wszystkie `Segment` do `comparison_results` (z pair_profile_ids)
  7. Zwróć `ComparisonResponse`
- Błąd 400 z polskim komunikatem gdy: zły format CSV, brak wspólnych pozycji SNP we wszystkich parach

`GET /comparisons` — zwraca listę sesji zalogowanego użytkownika (id, name, created_at, profile names)

`GET /comparisons/{comparison_id}` — pełne wyniki sesji: profile names + wszystkie segmenty
pogrupowane po pair_profile_ids

`DELETE /comparisons/{comparison_id}` — usuwa sesję (kaskada usuwa dna_profiles i comparison_results
przez trigger i FK)

Response modele — Pydantic:
- `ProfileMeta`: id, name, original_filename
- `SegmentOut`: chromosome, match_type, start_bp, end_bp, start_cm, end_cm, length_bp, length_cm, snp_count
- `PairResult`: profile_ids (2 lub 3 UUID), person_names, segments (list[SegmentOut])
- `ComparisonResponse`: id, name, created_at, profiles (list[ProfileMeta]), pairs (list[PairResult])
- `ComparisonSummary`: id, name, created_at, person_names (list[str])

#### 2. Update `main.py`

**File**: `main.py`

**Intent**: Zarejestruj nowy router porównań pod prefiksem `/api`.

**Contract**: Dodaj `from src.routers import comparisons as comparisons_router` i
`api_router.include_router(comparisons_router.router)` — przed istniejącym StaticFiles mount.

#### 3. Create `tests/test_comparisons_api.py`

**File**: `tests/test_comparisons_api.py`

**Intent**: Testy integracyjne endpointów przez TestClient z mockiem `get_current_user`
i mockiem klienta Supabase.

**Contract**: Minimum 3 testy:
- `POST /api/comparisons` z 2 prawidłowymi plikami CSV → 200 + niepusta lista segmentów
- `POST /api/comparisons` z nieprawidłowym CSV → 400 z komunikatem po polsku
- `GET /api/comparisons` z mockiem → 200 + lista

### Success Criteria

#### Automated Verification

- `uv run pytest` exits 0 (wszystkie testy)
- `uv run mypy .` exits 0
- `uv run ruff check .` exits 0
- `uv run ruff format --check .` exits 0

#### Manual Verification

- `curl -X POST http://localhost:8000/api/comparisons -F "name=Test" -F "person_names=Ewa" -F "person_names=Jan" -F "files=@ewaSample.csv" -F "files=@ewaSample.csv" -H "Authorization: Bearer <token>"` → 200 z wynikami
- `curl http://localhost:8000/api/comparisons -H "Authorization: Bearer <token>"` → 200 z listą

---

## Phase 4: Frontend — formularz, wyniki, historia

### Overview

Trzy nowe widoki React: `/compare` (formularz), `/results/:id` (wyniki z diagramem), aktualizacja
`/app` (historia). Używa istniejących wzorców: `useState`, Tailwind, React Router, Supabase client
tylko do auth (API calls przez fetch do `/api/*`).

### Changes Required

#### 1. Create `frontend/src/lib/api.ts`

**File**: `frontend/src/lib/api.ts`

**Intent**: Helper do wywołań backendu z automatycznym dołączeniem tokenu JWT z sesji Supabase.

**Contract**: Eksportuje `apiFetch(path: string, init?: RequestInit): Promise<Response>` —
pobiera session token z `supabase.auth.getSession()` i dołącza `Authorization: Bearer <token>`
do nagłówków. Rzuca Error jeśli brak sesji.

#### 2. Create `frontend/src/pages/ComparePage.tsx`

**File**: `frontend/src/pages/ComparePage.tsx`

**Intent**: Formularz nowego porównania: nazwa sesji, 2–3 osoby (każda: imię + file input),
opcjonalny min SNP count, przycisk "Porównaj".

**Contract**:
- Formularz zarządzany przez `useState` (nie zewnętrzna biblioteka)
- Domyślnie 2 osoby, przycisk "Dodaj osobę" dodaje 3. osobę (max 3)
- Pola per osoba: `text` dla imienia, `type="file" accept=".csv"` dla pliku
- Pole `min_snp_count`: `type="number"` default 10, min 1, max 100
- Submit: `multipart/form-data` przez `apiFetch('/api/comparisons', {method: 'POST', body: formData})`
- Loading state: przycisk disabled + tekst "Przetwarzanie…" podczas żądania
- Po sukcesie: `navigate('/results/' + data.id)`
- Błąd: wyświetl komunikat z backendu inline pod formularzem
- Styling: zgodny z istniejącymi stronami (Tailwind, white card, blue button)

#### 3. Create `frontend/src/components/ChromosomeDiagram.tsx`

**File**: `frontend/src/components/ChromosomeDiagram.tsx`

**Intent**: Diagram chromosomów jako SVG. Dla każdego chromosomu (1–22, X, Y, MT) rysuje pasek
proporcjonalny do długości; segmenty kolorowane według match_type.

**Contract**: Props: `segments: SegmentOut[]`, `chromosomeLengths: Record<string, number>`
(opcjonalne — hardkodowane długości referencyjne hg38 jeśli nie podane).

Rendering:
- Jeden `<svg>` zawierający N wierszy (jeden per chromosom z danymi)
- Każdy wiersz: etykieta chromosomu (tekst), szary pasek tła (pełna długość), kolorowe `<rect>`
  per segment skalowane do pozycji bp
- Kolory: FULL `#22c55e` (green-500), HALF `#eab308` (yellow-500), NONE `#ef4444` (red-500)
- Tooltip (title na SVG rect): `${chromosome}: ${start_bp}–${end_bp} | ${match_type} | ${snp_count} SNPs`
- Brak zewnętrznych bibliotek

#### 4. Create `frontend/src/components/SegmentTable.tsx`

**File**: `frontend/src/components/SegmentTable.tsx`

**Intent**: Tabela segmentów z sortowaniem i kolorowaniem wierszy.

**Contract**: Props: `segments: SegmentOut[]`. Kolumny: Chromosom, Start (bp), Koniec (bp),
Długość (bp), Długość (cM) jeśli dostępna, SNP count, Typ (badge kolorowy FULL/HALF/NONE).
Domyślne sortowanie: chromosom rosnąco, start_bp rosnąco.

#### 5. Create `frontend/src/pages/ResultsPage.tsx`

**File**: `frontend/src/pages/ResultsPage.tsx`

**Intent**: Wyniki sesji porównania. Pobiera dane z `GET /api/comparisons/:id`, wyświetla
accordion z jedną sekcją per para (pairwise) + (dla 3 osób) sekcja 3-way.

**Contract**:
- `useEffect` pobiera `apiFetch('/api/comparisons/' + id)` przy montowaniu
- Loading state: spinner podczas pobierania
- Błąd 404: komunikat "Porównanie nie znalezione"
- Layout: nagłówek z nazwą sesji i datą, accordion (każda sekcja domyślnie zwinięta oprócz pierwszej),
  w każdej sekcji: `<SegmentTable />` + `<ChromosomeDiagram />`
- Przycisk "Usuń porównanie" (DELETE /api/comparisons/:id) → po sukcesie navigate('/app')

#### 6. Update `frontend/src/pages/AppPage.tsx`

**File**: `frontend/src/pages/AppPage.tsx`

**Intent**: Zastąp placeholder dashboard listą sesji porównań i przyciskiem "Nowe porównanie".

**Contract**:
- `useEffect` pobiera `GET /api/comparisons` przy montowaniu
- Lista: każda sesja jako karta z nazwą, datą, imionami osób; klik → `navigate('/results/' + id)`
- Pusty stan: "Brak porównań. Kliknij 'Nowe porównanie' aby zacząć."
- Przycisk "Nowe porównanie" → `navigate('/compare')`
- Email + "Wyloguj się" pozostają na górze strony

#### 7. Update `frontend/src/App.tsx`

**File**: `frontend/src/App.tsx`

**Intent**: Dodaj trasy dla nowych stron.

**Contract**: Wewnątrz `<Route element={<ProtectedRoute />}>` dodaj:
- `<Route path="/compare" element={<ComparePage />} />`
- `<Route path="/results/:id" element={<ResultsPage />} />`

Importy: `ComparePage` z `./pages/ComparePage`, `ResultsPage` z `./pages/ResultsPage`.

### Success Criteria

#### Automated Verification

- `cd frontend && npx tsc --noEmit` exits 0
- `uv run pytest` exits 0 (brak regresji backendowych)

#### Manual Verification

- `/app` pokazuje listę porównań (lub pusty stan) z przyciskiem "Nowe porównanie"
- `/compare` formularz: dodaj 2 osoby, wgraj pliki CSV (ewaSample.csv × 2), kliknij "Porównaj"
  → spinner → redirect do `/results/:id`
- `/results/:id`: accordion z parą, tabela segmentów niepusta, diagram chromosomów renderuje się
- Kolory: FULL=zielony, HALF=żółty, NONE=czerwony na diagramie i w tabeli
- Dla 3 osób: 3 sekcje pairwise + 1 sekcja 3-way w accordion
- Usunięcie porównania → redirect do `/app`, porównanie znika z listy
- Odśwież `/results/:id` → wyniki nadal dostępne (trwałe)
- Błędny plik CSV → komunikat błędu po polsku pod formularzem
- `GET /app/compare` jako niezalogowany → redirect do `/login`

---

## Testing Strategy

### Unit Tests (backend)

- `tests/test_dna_parser.py` — parser: poprawny CSV, skipping invalid, normalizacja alleli
- `tests/test_dna_algorithm.py` — algorytm: klasyfikacja FULL/HALF/NONE, segmentacja, filtrowanie,
  3-way classification
- Oba zestawy używają danych syntetycznych (strings), bez zależności od Supabase

### Integration Tests (backend)

- `tests/test_comparisons_api.py` — TestClient z mocked `get_current_user` i mocked Supabase client;
  testuje endpoint `POST /api/comparisons` end-to-end (parser + algorytm + response shape)

### Manual Testing

- Złoty ścieżek: 2 osoby + 3 osoby z ewaSample.csv
- Edge case: 2 identyczne pliki CSV → wyniki zdominowane przez FULL
- Edge case: plik z samymi `--` (invalid) → błąd 400

## References

- PRD: `context/foundation/prd.md` — FR-003, FR-004, FR-005, FR-006, FR-007, §NFR
- Schema: `supabase/migrations/001_initial_schema.sql`
- Sample CSV: `/Users/ewelina.pasierbska/Desktop/Python/Python/ewaSample.csv`
- Auth pattern: `src/auth/dependencies.py:16`, `src/routers/me.py:6`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Database migration 002

#### Automated

- [x] 1.1 `test -f supabase/migrations/002_comparison_results_columns.sql` exits 0
- [x] 1.2 `grep -c "ADD COLUMN" ...` → 5
- [x] 1.3 `uv run pytest` exits 0
- [x] 1.4 `uv run mypy .` exits 0
- [x] 1.5 `uv run ruff check .` exits 0

#### Manual

- [x] 1.6 Migration applied in Supabase Dashboard without errors
- [x] 1.7 Table Editor: 5 new columns visible in comparison_results

### Phase 2: Backend core — parser i algorytm

#### Automated

- [ ] 2.1 `uv run pytest tests/test_dna_parser.py -v` exits 0
- [ ] 2.2 `uv run pytest tests/test_dna_algorithm.py -v` exits 0
- [ ] 2.3 `uv run pytest` exits 0
- [ ] 2.4 `uv run mypy .` exits 0
- [ ] 2.5 `uv run ruff check .` exits 0

#### Manual

- [ ] 2.6 Parser uruchomiony ręcznie na ewaSample.csv daje niepusty wynik

### Phase 3: Backend API — endpointy porównań

#### Automated

- [ ] 3.1 `uv run pytest` exits 0 (w tym test_comparisons_api.py)
- [ ] 3.2 `uv run mypy .` exits 0
- [ ] 3.3 `uv run ruff check .` exits 0
- [ ] 3.4 `uv run ruff format --check .` exits 0

#### Manual

- [ ] 3.5 `curl POST /api/comparisons` z 2 plikami CSV → 200 + segmenty
- [ ] 3.6 `curl GET /api/comparisons` → lista sesji

### Phase 4: Frontend — formularz, wyniki, historia

#### Automated

- [ ] 4.1 `cd frontend && npx tsc --noEmit` exits 0
- [ ] 4.2 `uv run pytest` exits 0 (brak regresji backendowych)

#### Manual

- [ ] 4.3 `/app` pokazuje listę porównań lub pusty stan
- [ ] 4.4 Formularz `/compare` z 2 CSV → spinner → redirect `/results/:id`
- [ ] 4.5 Wyniki: tabela segmentów + diagram chromosomów z kolorami
- [ ] 4.6 3 osoby → 3 pairwise + 1 sekcja 3-way w accordion
- [ ] 4.7 Usunięcie porównania → redirect `/app`
- [ ] 4.8 Odświeżenie `/results/:id` → wyniki trwałe
- [ ] 4.9 Błędny CSV → polski komunikat błędu
