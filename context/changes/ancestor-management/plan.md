---
change_id: ancestor-management
title: Named ancestor management — global per-user ancestors with colors
status: planned
created: 2026-06-03
updated: 2026-06-03
---

# Ancestor Management — Plan

## Overview

Użytkownik definiuje nazwanych przodków z predefiniowanymi kolorami (globalnie per konto), a następnie używa ich wielokrotnie przy fazowaniu. Zastępuje obecne wolne pole tekstowe "Imię przodka" dropdownem z listą przodków. ChromosomeDiagram koloruje adnotowane segmenty kolorem przodka zamiast obecnego indigo stripe.

## Current State Analysis

- `ancestor_annotations.ancestor_label` przechowuje imię przodka jako wolny tekst
- `AnnotationIn/AnnotationOut` mają `ancestor_label: str` bez FK
- Frontend: `SegmentTable` ma `<input type="text">` dla imienia przodka
- `ChromosomeDiagram` rysuje indigo diagonal stripe na adnotowanych segmentach
- Brak: tabeli `ancestors`, endpointów CRUD, panelu UI

## Desired End State

- Tabela `ancestors` (global per user_id) przechowuje imię + kolor
- `ancestor_annotations.ancestor_id` (nullable FK, ON DELETE CASCADE) wskazuje na wiersz z `ancestors`
- `ancestor_label` pozostaje — backward compat ze starymi adnotacjami
- Panel boczny na ResultsPage: lista przodków z kropką koloru, przyciski dodaj/usuń/edytuj
- Dropdown w SegmentTable: lista przodków + opcja "Dodaj nowego…"
- ChromosomeDiagram: overlay w kolorze przodka (zamiast indigo stripe) gdy `ancestor_id` ustawione

### Key Discoveries

- `src/routers/annotations.py:20-37` — `AnnotationIn`/`AnnotationOut` — rozszerzyć o `ancestor_id: UUID | None`
- `src/routers/comparisons.py:1-15` — wzorzec routera do naśladowania w nowym `ancestors.py`
- `frontend/src/pages/ResultsPage.tsx` — tu fetchować ancestors, zarządzać stanem, przekazywać do dzieci
- `frontend/src/components/SegmentTable.tsx:254-272` — obecne pole tekstowe do zamiany na dropdown
- `frontend/src/components/ChromosomeDiagram.tsx:116-149` — tu zamieniać stripe na kolorowy overlay
- Kolejna migracja: `006_ancestors_table.sql` (po `005_segment_density_column.sql`)
- `main.py` — rejestruje routery; wzorzec: `app.include_router(router, prefix="/api")`

## What We're NOT Doing

- Przodkowie per comparison (globalnie per user zamiast)
- Niestandardowy color picker (tylko predefiniowana paleta 8 kolorów)
- Migracja istniejących ancestor_label → ancestor_id (stare adnotacje zostają z ancestor_id=NULL)
- Limit liczby przodków per user w tej iteracji

## Implementation Approach

Dwie fazy: backend-first (tabela + API + testy), potem frontend (panel + integracja). Ancestor przechowywany globalnie per user_id. FK `ancestor_id` nullable z ON DELETE CASCADE — usunięcie przodka usuwa powiązane adnotacje. Backward compat: `ancestor_label` zachowany, `ancestor_id` opcjonalne.

## Critical Implementation Details

**ON DELETE CASCADE scope**: Usunięcie przodka usuwa wszystkie `ancestor_annotations` z tym `ancestor_id` — nie tylko dla jednego porównania, ale dla wszystkich porównań tego użytkownika. Frontend musi po usunięciu przodka odświeżyć lokalny stan annotations (filtrując po znikniętym ancestor_id).

**RLS na ancestors**: Tabela ancestors wymaga polityki ALL USING (auth.uid() = user_id) — wzorzec identyczny z ancestor_annotations. Bez tego GET /api/ancestors zwróci 0 wierszy zamiast błędu.

---

## Phase 1: DB migration + Backend CRUD

### Overview

Tworzy tabelę `ancestors` z RLS, rozszerza `ancestor_annotations` o `ancestor_id`, dodaje nowy router z 4 endpointami CRUD, aktualizuje model adnotacji i rejestruje router w aplikacji.

### Changes Required

#### 1. DB migration

**File**: `supabase/migrations/006_ancestors_table.sql`

**Intent**: Stworzyć tabelę `ancestors` z RLS i dodać nullable FK `ancestor_id` do `ancestor_annotations`.

**Contract**:
```sql
CREATE TABLE ancestors (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        text NOT NULL,
    color       text NOT NULL,
    created_at  timestamptz DEFAULT now(),
    UNIQUE(user_id, name)
);
ALTER TABLE ancestors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ancestors_user_policy" ON ancestors
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE ancestor_annotations
    ADD COLUMN ancestor_id uuid REFERENCES ancestors(id) ON DELETE CASCADE;
```

#### 2. Ancestors router

**File**: `src/routers/ancestors.py`

**Intent**: Nowy router z 4 endpointami CRUD dla globalnej listy przodków użytkownika.

**Contract**:
- `AncestorIn(BaseModel)`: `name: str`, `color: str`
- `AncestorOut(BaseModel)`: `id: UUID`, `name: str`, `color: str`, `created_at: str`
- `GET /ancestors` → `list[AncestorOut]` — wszystkie przodkowie bieżącego użytkownika, posortowane po `created_at`
- `POST /ancestors` → `AncestorOut` (status 201) — tworzy nowego przodka; 409 jeśli name już istnieje
- `PUT /ancestors/{ancestor_id}` → `AncestorOut` — aktualizuje name i/lub color; 404 jeśli nie znaleziono lub nie należy do użytkownika
- `DELETE /ancestors/{ancestor_id}` → 204 — usuwa przodka (CASCADE usuwa powiązane adnotacje); 404 jeśli nie znaleziono

#### 3. Rejestracja routera

**File**: `main.py`

**Intent**: Zarejestrować nowy router ancestors w aplikacji FastAPI.

**Contract**: `app.include_router(ancestors_router, prefix="/api")` — obok istniejących routerów comparisons i annotations.

#### 4. Rozszerzenie modeli adnotacji

**File**: `src/routers/annotations.py`

**Intent**: Dodać `ancestor_id: UUID | None` do `AnnotationIn` i `AnnotationOut`, przekazywać to pole przy zapisie i odczycie z bazy.

**Contract**: Pole `ancestor_id: UUID | None = None` w obu modelach (po `ancestor_label`). W `POST` endpoint — zapisywać `str(body.ancestor_id) if body.ancestor_id else None` do DB. W `GET` endpoint — `row.get("ancestor_id")` do `AnnotationOut`.

#### 5. Testy

**File**: `tests/test_ancestors_api.py`

**Intent**: Pokryć 4 endpointy (list, create, update, delete) oraz negative case (404 dla obcego przodka). Wzorzec z `tests/test_annotations_api.py`.

**Contract**: 5 testów: `test_list_ancestors_empty`, `test_create_ancestor`, `test_update_ancestor`, `test_delete_ancestor`, `test_delete_wrong_user_returns_404`. Mock Supabase identyczny jak w test_annotations_api.py.

### Success Criteria

#### Automated Verification

- `uv run pytest` exits 0
- `uv run mypy .` exits 0
- `uv run ruff check .` exits 0
- `uv run ruff format --check .` exits 0

#### Manual Verification

- `supabase/migrations/006_ancestors_table.sql` poprawny przed zastosowaniem
- Migration zastosowana w Supabase Dashboard bez błędów
- Tabela `ancestors` widoczna w Table Editor z kolumnami: id, user_id, name, color, created_at
- Kolumna `ancestor_id` widoczna w `ancestor_annotations`
- `curl -H "Authorization: Bearer TOKEN" /api/ancestors` → `[]`

---

## Phase 2: Frontend

### Overview

Nowy `AncestorPanel` komponent w panelu bocznym ResultsPage, zamiana pola tekstowego w SegmentTable na dropdown z przodkami, kolorowy overlay w ChromosomeDiagram, integracja stanu w ResultsPage.

### Changes Required

#### 1. AncestorOut interface i AncestorPanel

**File**: `frontend/src/components/AncestorPanel.tsx` (nowy plik)

**Intent**: Panel boczny wyświetlający listę przodków użytkownika z możliwością dodawania, edytowania nazwy/koloru i usuwania. Eksportuje interfejs `AncestorOut` używany przez inne komponenty.

**Contract**:
- Eksportuje: `interface AncestorOut { id: string; name: string; color: string; created_at: string }`
- Eksportuje: `const ANCESTOR_COLORS: string[]` — 8 kolorów z palety (`#f97316`, `#a855f7`, `#06b6d4`, `#22c55e`, `#f59e0b`, `#ef4444`, `#6366f1`, `#14b8a6`)
- Props: `ancestors: AncestorOut[]`, `onAdd: (name, color) => Promise<void>`, `onUpdate: (id, name, color) => Promise<void>`, `onDelete: (id) => Promise<void>`
- UI: każdy przodek jako wiersz z kolorową kropką + nazwa + przyciski edytuj/usuń; formularz dodawania na dole (input name + picker kolorów)

#### 2. ChromosomeDiagram — kolorowy overlay

**File**: `frontend/src/components/ChromosomeDiagram.tsx`

**Intent**: Zamiast indigo stripe, rysować kolorowy overlay używając koloru przodka gdy segment ma powiązaną adnotację z ancestor_id.

**Contract**:
- Dodać do `AnnotationOut` interfejsu pole `ancestor_id: string | null`
- Dodać do `Props`: `ancestors?: AncestorOut[]` (importowane z AncestorPanel)
- Zbudować mapę `ancestorColorMap: Record<string, string>` z `ancestors` (id → color)
- Gdy annotation ma `ancestor_id`: użyć `ancestorColorMap[annotation.ancestor_id] ?? '#6366f1'` jako fill koloru overlay zamiast `url(#annotated-stripe)`
- Gdy annotation ma tylko `ancestor_label` (stare dane): zachować indigo stripe

#### 3. SegmentTable — dropdown przodków

**File**: `frontend/src/components/SegmentTable.tsx`

**Intent**: Zastąpić `<input type="text">` dla ancestor_label przez `<select>` z listą przodków użytkownika oraz opcją "Dodaj nowego…". Po wybraniu "Dodaj nowego…" pokazać mini-formularz inline (name + palette picker). Stan formularza: `formAncestorId: string` zamiast `formLabel: string`. `UpsertAnnotationBody` zyskuje `ancestor_id: string | null`.

**Contract**:
- Dodać do `Props`: `ancestors?: AncestorOut[]`, `onCreateAncestor?: (name: string, color: string) => Promise<AncestorOut>`
- Dodać do `UpsertAnnotationBody`: `ancestor_id: string | null`
- Formularz: select z opcjami `{ancestors.map(a => <option key={a.id} value={a.id}>...)}` + `<option value="new">Dodaj nowego…</option>`
- Gdy `formAncestorId === 'new'`: pokaż mini-formularz (name input + 8 kolorowych kółek do kliknięcia)
- Zapisz: `ancestor_id: formAncestorId !== 'new' ? formAncestorId : null`
- Badge adnotacji: pokaż kolorową kropkę z `ancestorColorMap[badge.ancestor_id]` jeśli dostępna

#### 4. ResultsPage — stan i integracja

**File**: `frontend/src/pages/ResultsPage.tsx`

**Intent**: Fetchować listę przodków przy ładowaniu strony, zarządzać stanem CRUD przodków i przekazywać dane do AncestorPanel, SegmentTable i ChromosomeDiagram.

**Contract**:
- Dodać stan: `const [ancestors, setAncestors] = useState<AncestorOut[]>([])`
- Przy mount: `GET /api/ancestors` → `setAncestors(data)`
- `handleCreateAncestor(name, color)`: `POST /api/ancestors`, dodaj do stanu
- `handleUpdateAncestor(id, name, color)`: `PUT /api/ancestors/{id}`, aktualizuj w stanie
- `handleDeleteAncestor(id)`: `DELETE /api/ancestors/{id}`, usuń z stanu + odfiltruj annotations gdzie `ancestor_id === id`
- Layout: dodać `<AncestorPanel>` w sidebarze po prawej stronie wyników
- Przekazać `ancestors` prop do `ChromosomeDiagram` i `SegmentTable`

### Success Criteria

#### Automated Verification

- `cd frontend && npx tsc --noEmit` exits 0
- `uv run pytest` exits 0

#### Manual Verification

- Panel boczny z przodkami widoczny na stronie wyników
- Dodanie przodka: formularz z name + paleta 8 kolorów → pojawia się w liście
- Edycja przodka: zmiana nazwy/koloru → natychmiast widoczna
- Usunięcie przodka: adnotacje znikają z tabeli i diagramu
- Dropdown w formularzu adnotacji: pokazuje listę przodków + "Dodaj nowego…"
- ChromosomeDiagram: overlay w kolorze przodka zamiast indigo stripe
- Stare adnotacje (ancestor_label, ancestor_id=NULL): nadal widoczne ze stripe

---

## Testing Strategy

### Unit Tests

- `tests/test_ancestors_api.py`: list, create, update, delete, wrong-user 404
- Wzorzec mock Supabase z test_annotations_api.py

### Manual Testing Steps

1. Zaloguj się, wejdź na stronę wyników porównania
2. Dodaj 3 przodków z różnymi kolorami w panelu bocznym
3. Adnotuj 3 segmenty używając dropdownu — każdy innym przodkiem
4. Sprawdź że ChromosomeDiagram pokazuje kolorowe overlaye (nie indigo stripe)
5. Edytuj kolor jednego przodka — diagram aktualizuje się
6. Usuń przodka — powiązane adnotacje znikają z tabeli i diagramu
7. Sprawdź że stare adnotacje (z ancestor_label) nadal widoczne

## Migration Notes

Istniejące adnotacje mają `ancestor_id = NULL` — wyświetlane ze starym stripe. Nie wymagają migracji danych.

## References

- Wzorzec routera: `src/routers/annotations.py`
- Wzorzec testów: `tests/test_annotations_api.py`
- Wzorzec frontend state: `frontend/src/pages/ResultsPage.tsx`
- Poprzednia migracja: `supabase/migrations/005_segment_density_column.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: DB migration + Backend CRUD

#### Automated

- [x] 1.1 `uv run pytest` exits 0
- [x] 1.2 `uv run mypy .` exits 0
- [x] 1.3 `uv run ruff check .` exits 0
- [x] 1.4 `uv run ruff format --check .` exits 0

#### Manual

- [x] 1.5 Migration SQL poprawna przed zastosowaniem
- [x] 1.6 Migration zastosowana bez błędów
- [x] 1.7 Tabela `ancestors` widoczna w Table Editor
- [x] 1.8 Kolumna `ancestor_id` widoczna w `ancestor_annotations`
- [x] 1.9 `curl /api/ancestors` → `[]` (pusty JSON)

### Phase 2: Frontend

#### Automated

- [ ] 2.1 `cd frontend && npx tsc --noEmit` exits 0
- [ ] 2.2 `uv run pytest` exits 0

#### Manual

- [ ] 2.3 Panel boczny z przodkami widoczny na stronie wyników
- [ ] 2.4 Dodanie przodka działa z paletą kolorów
- [ ] 2.5 Usunięcie przodka usuwa powiązane adnotacje
- [ ] 2.6 Dropdown w formularzu adnotacji działa
- [ ] 2.7 ChromosomeDiagram koloruje overlay kolorem przodka
- [ ] 2.8 Stare adnotacje nadal widoczne ze stripe
