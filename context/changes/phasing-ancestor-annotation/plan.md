---
change_id: phasing-ancestor-annotation
title: Phasing — Adnotacja Przodka (S-04)
status: planned
created: 2026-06-02
updated: 2026-06-02
---

# Phasing — Adnotacja Przodka (S-04) — Plan Implementacji

## Overview

S-04 dostarcza ręczne fazowanie: użytkownik może na stronie wyników porównania kliknąć
segment w tabeli i przypisać go do przodka (imię przodka + linia dziedziczenia maternal/paternal).
Adnotacje są trwałe, powiązane z profilem osoby (nie z sesją porównania) — widoczne
we wszystkich porównaniach z tym samym profilem.

## Current State Analysis

**Baza danych:**
- Tabela `ancestor_annotations` istnieje w migracji 001: pola `user_id`, `profile_id`,
  `chromosome`, `start_position`, `end_position`, `strand NOT NULL CHECK (maternal/paternal)`,
  `ancestor_label`, `created_at`, `updated_at`. RLS wdrożone (4 polityki).
- Brakuje: UNIQUE constraint na `(profile_id, chromosome, start_position, end_position)` —
  niezbędny do UPSERT.

**Backend:**
- Brak routera dla adnotacji. Wzorzec znany z `src/routers/comparisons.py`:
  `APIRouter(tags=[...])`, Supabase przez `Depends(get_supabase_client)`, auth przez
  `Depends(get_current_user)`.
- `main.py`: `api_router.include_router(...)` przed StaticFiles.

**Frontend:**
- `ResultsPage.tsx` pobiera dane porównania przez `apiFetch`, renderuje
  `PairSection` → `ChromosomeDiagram` + `SegmentTable`. Interfejs `ComparisonData`
  nie zawiera `profiles` (choć backend zwraca je w `ComparisonResponse`).
- `SegmentTable.tsx` — prosta tabela, bez mechanizmu rozwijania wierszy.
- `ChromosomeDiagram.tsx` — renderuje SVG bez wiedzy o adnotacjach.

## Desired End State

Użytkownik otwiera `/results/:id`:
1. Klika wiersz w tabeli segmentów → rozija się formularz z dropdown osób,
   select maternal/paternal i pole tekstowe przodka.
2. Wypełnia i klika "Zapisz" → wiersz wyświetla badge z imieniem przodka i linią
   dziedziczenia; diagram chromosomów pokazuje wizualny overlay dla annotowanej pozycji.
3. Kliknięcie istniejącej adnotacji otwiera formularz z wartościami do edycji (UPSERT).
4. Kliknięcie "Usuń" usuwa adnotację; wiersz wraca do stanu bez adnotacji.
5. Odświeżenie strony — adnotacje trwałe.

### Key Discoveries

- `ancestor_annotations` schema: `strand NOT NULL` — wymaganie strony jest zgodne
  z istniejącym schematem, zero migracji dla tej kolumny.
- Supabase UPSERT: `db.from_("ancestor_annotations").upsert(row, on_conflict="profile_id,chromosome,start_position,end_position")` — wymaga istnienia UNIQUE constraint przed wywołaniem.
- `ComparisonResponse` backend: zawiera `profiles: list[ProfileMeta]` — frontend
  nie ma go w `ComparisonData` interface'ie; zmiana addytywna, bez breaking change.
- Segmenty identyfikowane przez `(chromosome, start_bp, end_bp)` — wystarczy do
  lookup adnotacji bez eksponowania UUIDów wierszy comparison_results.

## What We're NOT Doing

- Automatyczne fazowanie / wnioskowanie linii dziedziczenia
- Bulk import adnotacji
- Eksport adnotacji (v2)
- Osobna strona `/phasing/:id` — adnotacje wbudowane w ResultsPage
- Adnotacje scoped do comparison_id (scope: profil + pozycja chromosomowa)
- Współdzielenie adnotacji między kontami

## Implementation Approach

Trzy fazy zależności: migracja DB → backend CRUD → frontend. Backend jest
testowalny niezależnie od frontendu. Frontend modyfikuje 3 istniejące komponenty
i `ResultsPage` — żadna nowa trasa, żadna nowa strona.

## Critical Implementation Details

- **UPSERT on_conflict**: Supabase Python SDK wymaga `on_conflict` jako string z nazwami
  kolumn po przecinku. Constraint musi istnieć w bazie PRZED wywołaniem UPSERT —
  bez migracji 003 UPSERT zachowuje się jak INSERT i wygeneruje błąd przy duplikacji.
- **profiles w ComparisonData**: Backend już zwraca `profiles` w `GET /api/comparisons/:id`,
  ale frontend nie ma go w interfejsie `ComparisonData`. Dodanie `profiles: ProfileMeta[]`
  to zmiana addytywna bez usuwania czegokolwiek.
- **Annotation lookup w SegmentTable**: Inline formularz musi re-sprawdzać adnotacje
  po zmianie wybranej osoby w dropdown (różne osoby mogą mieć różne adnotacje dla tej
  samej pozycji). Dependency: `selectedPersonId` → lookup w `annotations` prop →
  pre-fill lub czyste pola.

---

## Phase 1: Migration 003 — UNIQUE constraint

### Overview

Dodaje UNIQUE constraint na `ancestor_annotations(profile_id, chromosome, start_position,
end_position)`. Bez tego UPSERT w fazie 2 nie będzie działał.

### Changes Required

#### 1. Create `supabase/migrations/003_ancestor_annotations_unique.sql`

**File**: `supabase/migrations/003_ancestor_annotations_unique.sql`

**Intent**: Dodaj UNIQUE constraint potrzebny do UPSERT-u adnotacji bez duplikatów.

**Contract**: Plik zawiera jedną instrukcję:

```sql
ALTER TABLE ancestor_annotations
  ADD CONSTRAINT ancestor_annotations_unique_segment
  UNIQUE (profile_id, chromosome, start_position, end_position);
```

### Success Criteria

#### Automated Verification

- `test -f supabase/migrations/003_ancestor_annotations_unique.sql` exits 0
- `uv run pytest` exits 0 (brak regresji)
- `uv run mypy .` exits 0
- `uv run ruff check .` exits 0

#### Manual Verification

- Supabase Dashboard → SQL Editor → paste 003 → brak błędów
- Table Editor → ancestor_annotations → Indexes: `ancestor_annotations_unique_segment` widoczny

**Implementation Note**: Po weryfikacji manualnej (constraint w Supabase) zatrzymaj się i
potwierdź sukces przed przejściem do Fazy 2.

---

## Phase 2: Backend — Router adnotacji

### Overview

Nowy router FastAPI z 3 endpointami CRUD. Wzoruje się na `src/routers/comparisons.py`.
GET i POST scoped do comparison_id (przez profile_ids), DELETE po annotation_id.

### Changes Required

#### 1. Create `src/routers/annotations.py`

**File**: `src/routers/annotations.py`

**Intent**: Router z 3 endpointami dla adnotacji przodków.

**Contract**: `router = APIRouter(tags=["annotations"])`.

Pydantic modele:
- `AnnotationIn`: `profile_id: UUID`, `chromosome: str`, `start_position: int`,
  `end_position: int`, `strand: Literal["maternal", "paternal"]`, `ancestor_label: str`
- `AnnotationOut`: `id: UUID`, `profile_id: UUID`, `chromosome: str`,
  `start_position: int`, `end_position: int`, `strand: str`, `ancestor_label: str`,
  `created_at: str`

Endpointy:

`GET /comparisons/{comparison_id}/annotations`:
- Weryfikuje że comparison należy do current_user (404 jeśli nie)
- Wyciąga `profile_ids` z rekordu comparisons
- Zwraca adnotacje WHERE `profile_id = ANY(profile_ids)` — RLS gwarantuje user_id
- Response: `list[AnnotationOut]`

`POST /comparisons/{comparison_id}/annotations` (UPSERT, status 200):
- Body: `AnnotationIn`
- Weryfikuje że `profile_id` należy do current_user (select z dna_profiles → 403 jeśli nie)
- UPSERT do `ancestor_annotations` z `on_conflict="profile_id,chromosome,start_position,end_position"`
- Ustawia `user_id = str(current_user.id)` w row dict
- Response: `AnnotationOut`

`DELETE /annotations/{annotation_id}`:
- Select annotation WHERE `id = annotation_id` AND `user_id = current_user.id` → 404 jeśli nie znaleziono
- DELETE rekordu
- Response: 204

#### 2. Update `main.py`

**File**: `main.py`

**Intent**: Zarejestruj router adnotacji pod prefiksem `/api`.

**Contract**: Dodaj `from src.routers import annotations as annotations_router` i
`api_router.include_router(annotations_router.router)` — po rejestracji `comparisons_router`.

#### 3. Create `tests/test_annotations_api.py`

**File**: `tests/test_annotations_api.py`

**Intent**: Testy integracyjne 3 endpointów przez TestClient z mocked `get_current_user`
i mocked Supabase client — wzorzec z `tests/test_comparisons_api.py`.

**Contract**: Minimum 5 testów:
- `GET /api/comparisons/{id}/annotations` → 200 + lista (pusta lub z danymi)
- `POST /api/comparisons/{id}/annotations` z prawidłowymi danymi → 200 + `AnnotationOut`
- `POST` drugi raz z tym samym `(profile_id, chromosome, start, end)` ale innym
  `ancestor_label` → 200 + zaktualizowana wartość (UPSERT)
- `DELETE /api/annotations/{annotation_id}` → 204
- `GET` po DELETE → lista bez usuniętej adnotacji

### Success Criteria

#### Automated Verification

- `uv run pytest tests/test_annotations_api.py -v` exits 0
- `uv run pytest` exits 0 (wszystkie testy)
- `uv run mypy .` exits 0
- `uv run ruff check .` exits 0
- `uv run ruff format --check .` exits 0

#### Manual Verification

- `curl -X POST /api/comparisons/{id}/annotations` z prawidłowym JSON body → 200 + id
- `curl GET /api/comparisons/{id}/annotations` → lista zawierająca nową adnotację
- `curl -X DELETE /api/annotations/{annotation_id}` → 204

**Implementation Note**: Po weryfikacji manualnej curl zatrzymaj się i potwierdź sukces
przed przejściem do Fazy 3.

---

## Phase 3: Frontend — ResultsPage + SegmentTable + ChromosomeDiagram

### Overview

Trzy istniejące komponenty otrzymują zmiany: `ResultsPage` zarządza stanem adnotacji
i mutacjami, `SegmentTable` zyskuje rozwijane wiersze z formularzem, `ChromosomeDiagram`
renderuje overlay dla annotowanych segmentów.

### Changes Required

#### 1. Update `frontend/src/pages/ResultsPage.tsx` — typy i interfejsy

**File**: `frontend/src/pages/ResultsPage.tsx`

**Intent**: Dodaj TypeScript interfejsy dla adnotacji i zaktualizuj `ComparisonData`.

**Contract**: Nowe lokalne interfejsy:
- `AnnotationOut`: `{ id: string; profile_id: string; chromosome: string; start_position: number; end_position: number; strand: 'maternal' | 'paternal'; ancestor_label: string }`
- `ProfileMeta`: `{ id: string; name: string; original_filename: string }`
- `UpsertAnnotationBody`: `{ profile_id: string; chromosome: string; start_position: number; end_position: number; strand: 'maternal' | 'paternal'; ancestor_label: string }`
- `ComparisonData` zyskuje pole `profiles: ProfileMeta[]`

#### 2. Update `frontend/src/pages/ResultsPage.tsx` — state, fetch, handlers

**File**: `frontend/src/pages/ResultsPage.tsx`

**Intent**: Pobieraj adnotacje równolegle z danymi porównania i przekazuj mutacje do komponentów.

**Contract**:
- Nowy stan: `annotations: AnnotationOut[]`, inicjalnie `[]`
- `useEffect`: równolegle do fetch comparison → `apiFetch('/api/comparisons/${id}/annotations')`
  → `setAnnotations`. Błąd pobierania adnotacji: loguj do konsoli, nie blokuj renderowania
  wyników porównania.
- `handleUpsertAnnotation(body: UpsertAnnotationBody): Promise<void>`:
  POST do `/api/comparisons/${id}/annotations` → po sukcesie zastępuje lub dodaje
  do lokalnego `annotations` state (nie re-fetches całej listy)
- `handleDeleteAnnotation(annotationId: string): Promise<void>`:
  DELETE do `/api/annotations/${annotationId}` → po sukcesie filtruje z `annotations` state
- `PairSection` dostaje nowe propsy: `profiles` (z `data.profiles`), `annotations`,
  `onAnnotate`, `onDeleteAnnotation`

#### 3. Update `frontend/src/components/SegmentTable.tsx`

**File**: `frontend/src/components/SegmentTable.tsx`

**Intent**: Dodaj rozwijane wiersze z formularzem adnotacji.

**Contract**: Nowe propsy:
- `profiles: ProfileMeta[]` — dla dropdown wyboru osoby
- `annotations: AnnotationOut[]` — do lookup istniejącej adnotacji
- `onAnnotate: (body: UpsertAnnotationBody) => Promise<void>`
- `onDeleteAnnotation: (id: string) => Promise<void>`

Logika rozwijania:
- Stan `expandedRowIdx: number | null` — który wiersz jest otwarty; klik na wiersz toggleuje
- W roziniętym wierszu pod danymi segmentu: formularz adnotacji

Formularz inline:
- `<select>` z opcjami dla każdego z `profiles` (value = `profile.id`, label = `profile.name`)
- Zmiana osoby w dropdown → sprawdź `annotations` pod `(selectedPersonId, segment.chromosome, segment.start_bp, segment.end_bp)` → jeśli znaleziona: pre-fill `strand` i `ancestor_label` + pokaż przycisk "Usuń"; jeśli nie: puste pola
- `<select>` maternal / paternal (wymagany; brak wartości defaultowej — `required` atrybut)
- `<input type="text">` ancestor_label (wymagany)
- Przycisk "Zapisz": wywołuje `onAnnotate` z body → po `await` zamknij formularz (`expandedRowIdx = null`)
- Przycisk "Usuń" (widoczny tylko gdy annotation istnieje): wywołuje `onDeleteAnnotation(annotation.id)`
- Loading state: przyciski disabled podczas `await`

Istniejące wiersze z adnotacją: nowa kolumna "Adnotacja" pokazuje badge z `ancestor_label`
i `strand` (dla pierwszej znalezionej adnotacji dla dowolnej osoby w tym segmencie).

#### 4. Update `frontend/src/components/ChromosomeDiagram.tsx`

**File**: `frontend/src/components/ChromosomeDiagram.tsx`

**Intent**: Pokaż wizualny overlay na annotowanych segmentach.

**Contract**: Nowy opcjonalny prop: `annotations?: AnnotationOut[]` (default `[]`).

Renderowanie:
- W `<svg>`: dodaj `<defs>` z `<pattern id="annotated-stripe" patternUnits="userSpaceOnUse" width="6" height="6">` zawierającym ukośną linię `<line x1="0" y1="6" x2="6" y2="0" stroke="#6366f1" strokeWidth="1.5" />`
- Dla każdego segmentu: sprawdź czy istnieje annotation z `annotations` WHERE
  `chromosome === seg.chromosome && start_position === seg.start_bp && end_position === seg.end_bp`
- Jeśli tak: za głównym `<rect>` segmentu dodaj drugi `<rect>` z tymi samymi wymiarami,
  `fill="url(#annotated-stripe)"` i `opacity={0.5}`
- Tooltip segmentu (w `<title>`): jeśli annotation istnieje, dołącz `| ${annotation.ancestor_label} (${annotation.strand})`

### Success Criteria

#### Automated Verification

- `cd frontend && npx tsc --noEmit` exits 0
- `uv run pytest` exits 0 (brak regresji backendowych)

#### Manual Verification

- Klik na segment → formularz rozwinięty z dropdown osób, select strand, pole przodka
- Wypełnij formularz → "Zapisz" → badge z przodkiem widoczny w wierszu + overlay na diagramie
- Zmiana osoby w dropdown → formularz pre-fill dla istniejącej adnotacji lub czyste pola
- "Usuń" → badge i overlay znikają
- Ponowne wejście na stronę (odświeżenie) → adnotacje trwałe
- Błąd sieci przy "Zapisz" → komunikat w formularzu, formularz nie zamknięty
- 3-person comparison: różne osoby mogą mieć różne adnotacje dla tej samej pozycji

---

## Testing Strategy

### Backend integration tests
- `tests/test_annotations_api.py` — 5 testów: GET, POST (create), POST (upsert update),
  DELETE, GET po DELETE. Wzorzec mockowania z `tests/test_comparisons_api.py`.

### Frontend
- TypeScript: `npx tsc --noEmit` (statyczna weryfikacja typów)

### Manual testing
- Złoty ścieżek: 2-person comparison → annotuj 2 segmenty różnych chromosomów →
  odśwież → adnotacje trwałe
- 3-person comparison: annotuj ten sam segment dla różnych osób → dropdown switch
  pokazuje różne adnotacje
- UPSERT: zmień ancestor_label dla istniejącej adnotacji → badge zaktualizowany

## References

- PRD: `context/foundation/prd.md` — FR-008, §Business Logic (fazowanie przez sieć krewnych)
- Roadmap: `context/foundation/roadmap.md` — S-04
- Schemat: `supabase/migrations/001_initial_schema.sql` — ancestor_annotations table
- Backend wzorzec: `src/routers/comparisons.py`
- Frontend wzorzec: `frontend/src/pages/ResultsPage.tsx`
- UI reference: `/Users/ewelina.pasierbska/Downloads/ChromosomeEditor.tsx`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Migration 003 — UNIQUE constraint

#### Automated

- [x] 1.1 `test -f supabase/migrations/003_ancestor_annotations_unique.sql` exits 0 — 441c1ee
- [x] 1.2 `uv run pytest` exits 0 — 441c1ee
- [x] 1.3 `uv run mypy .` exits 0 — 441c1ee
- [x] 1.4 `uv run ruff check .` exits 0 — 441c1ee

#### Manual

- [x] 1.5 Migration applied in Supabase Dashboard without errors — 441c1ee
- [x] 1.6 Table Editor: `ancestor_annotations_unique_segment` index visible — 441c1ee

### Phase 2: Backend — Router adnotacji

#### Automated

- [x] 2.1 `uv run pytest tests/test_annotations_api.py -v` exits 0
- [x] 2.2 `uv run pytest` exits 0
- [x] 2.3 `uv run mypy .` exits 0
- [x] 2.4 `uv run ruff check .` exits 0
- [x] 2.5 `uv run ruff format --check .` exits 0

#### Manual

- [x] 2.6 curl POST /api/comparisons/{id}/annotations → 200 + JSON z id
- [x] 2.7 curl GET /api/comparisons/{id}/annotations → lista zawierająca adnotację
- [x] 2.8 curl DELETE /api/annotations/{id} → 204

### Phase 3: Frontend — ResultsPage + SegmentTable + ChromosomeDiagram

#### Automated

- [ ] 3.1 `cd frontend && npx tsc --noEmit` exits 0
- [ ] 3.2 `uv run pytest` exits 0

#### Manual

- [ ] 3.3 Klik segment → formularz z dropdown + strand + pole przodka
- [ ] 3.4 Zapisz adnotację → badge w tabeli + overlay na diagramie
- [ ] 3.5 Zmiana osoby w dropdown → pre-fill istniejącej adnotacji lub czyste pola
- [ ] 3.6 Usuń adnotację → badge i overlay znikają
- [ ] 3.7 Odświeżenie strony → adnotacje trwałe
- [ ] 3.8 Błąd sieci przy zapisie → komunikat błędu, formularz nie zamknięty
