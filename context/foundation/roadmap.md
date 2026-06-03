---
project: dnaMatcher
version: 1
status: draft
created: 2026-05-25
updated: 2026-06-03
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: dnaMatcher

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Pasjonaci genealogii DNA posiadają pliki CSV z wynikami testów kilku członków rodziny (format MyHeritage) i chcą porównać te dane: znaleźć wspólne segmenty chromosomów oraz przypisać przodków do konkretnych odcinków (fazowanie). Istniejące narzędzia są albo drogie i przebudowane, albo wymagają ręcznej integracji wielu źródeł. dnaMatcher to prosta aplikacja webowa, która wczyta pliki z jednej platformy, porówna allele i wyda czytelny wynik segmentowy — z wizualnym diagramem chromosomów i możliwością ręcznej adnotacji przodka.

## North star

**S-03: pierwsze kompletne porównanie DNA (tabela + diagram)** — najmniejszy kompletny przepływ, który udowadnia, że produkt działa: użytkownik loguje się, wgrywa dwa profile CSV, uruchamia porównanie i widzi klasyfikację segmentów chromosomów w tabeli tekstowej i na interaktywnym diagramie.

> Gwiazda przewodnia — pierwsza historyjka, która, jeśli dostarczona, udowadnia centralną hipotezę produktu — umieszczona tak wcześnie w kolejności, jak pozwalają zależności, bo wszystko inne ma znaczenie dopiero gdy to działa. S-03 jest dosłownym §Primary Success Criteria z PRD.

## At a glance

| ID   | Change ID                   | Outcome (użytkownik może …)                                                             | Prerequisites        | PRD refs                        | Status   |
|------|-----------------------------|-----------------------------------------------------------------------------------------|----------------------|---------------------------------|----------|
| F-01 | auth-scaffold               | (foundation) middleware autoryzacji gotowy; tokeny Supabase Auth wydawane i weryfikowane | —                    | FR-001, FR-002, §Access Control | done     |
| F-02 | database-schema             | (foundation) schemat Supabase wdrożony; tabele profili, wyników segmentów i adnotacji   | F-01                 | FR-003, FR-006, FR-008          | done     |
| S-01 | user-authentication         | założyć konto, zalogować się i wylogować                                                | F-01                 | FR-001, FR-002                  | done     |
| S-02 | dna-profile-upload          | wgrać plik CSV MyHeritage jako profil DNA oraz przeglądać i usuwać profile              | F-01, F-02, S-01     | FR-003, FR-004                  | done     |
| S-03 | dna-comparison-engine       | wybrać 2+ profile, uruchomić porównanie i zobaczyć wyniki w tabeli i na diagramie chromosomów | S-02, F-02      | FR-005, FR-006, FR-007, US-01   | done     |
| S-04 | phasing-ancestor-annotation | przypisać segment chromosomu do konkretnego przodka (fazowanie ręczne)                  | S-03                 | FR-008                          | done     |
| S-05 | canvas-visualization        | widzieć chromosomy jako interaktywny diagram canvas z torami podobieństwa i fazowania   | S-04                 | FR-007                          | proposed |
| S-06 | ancestor-management         | definiować nazwanych przodków z kolorami per porównanie i używać ich wielokrotnie        | S-04                 | FR-008                          | proposed |
| S-07 | phasing-click               | kliknąć tor chromosomu i przypisać segment do przodka bez formularza                    | S-05, S-06           | FR-008                          | proposed |
| S-08 | segment-cm-density          | widzieć długość segmentu w cM i gęstość SNP/cM obok każdego segmentu                   | S-03                 | FR-006                          | proposed |
| S-09 | external-similarities       | rejestrować zewnętrzne dopasowania DNA z klastrami i widzieć je na diagramie            | S-05                 | —                               | proposed |
| S-10 | report-export               | eksportować raport HTML i zrzut JPG z wizualizacją chromosomów                          | S-05                 | FR-009                          | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme              | Chain                                      | Note                                                                          |
|--------|--------------------|------------------------------------------  |-------------------------------------------------------------------------------|
| A      | Auth & dostęp      | `F-01` → `S-01`                            | Brama do produktu; F-01 gotowy do planowania od razu. S-01 równolegle z F-02. |
| B      | Dane & produkt     | `F-02` → `S-02` → `S-03` → `S-04`         | Dołącza do Streamu A przy S-02 (wymaga F-01 i S-01 ze Streamu A).             |
| C      | Wizualizacja v2    | `S-08` → `S-06` → `S-05` → `S-07`         | Przebudowa widoku wyników: dane cM, przodkowie, canvas, phasing click.        |
| D      | Rozszerzenia       | `S-05` → `S-09` → `S-10`                  | Zewnętrzne dopasowania i eksport; zależą od canvas (S-05).                    |

## Baseline

What's already in place as of 2026-05-25 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** absent — brak katalogu frontend/, brak JS/TS, brak frameworku UI
- **Backend / API:** present — FastAPI stub (`main.py:1-13`): `GET /` i `GET /health`; runtime: uvicorn
- **Data:** absent — brak ORM, brak migracji, brak sterownika DB; app bezstanowa
- **Auth:** absent — brak middleware, brak JWT/session, brak integracji z dostawcą auth
- **Deploy / infra:** present — `render.yaml` + `.github/workflows/ci.yml` (lint→type-check→test→deploy hook)
- **Observability:** absent — tylko domyślny output uvicorna; brak logowania strukturyzowanego

## Foundations

### F-01: Auth scaffold

- **Outcome:** (foundation) middleware autoryzacji gotowy; tokeny sesji wydawane przez Supabase Auth i weryfikowane per-request; chroniona trasa zwraca 401 bez ważnego tokenu
- **Change ID:** auth-scaffold
- **PRD refs:** FR-001, FR-002, §Access Control ("Aplikacja webowa z autoryzacją login/hasło. Każdy użytkownik ma własny profil i widzi wyłącznie swoje dane.")
- **Unlocks:** S-01 (endpointy auth), S-02 (upload wymaga auth), S-03 (porównanie wymaga auth), S-04 (fazowanie wymaga auth)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Auth jest prerequisitem wszystkich slice'ów — błąd tu blokuje cały pipeline; Supabase Auth wybrany w `tech-stack.md`, ale wzorzec integracji z FastAPI wymaga weryfikacji podczas `/10x-plan`
- **Status:** done

### F-02: Database schema

- **Outcome:** (foundation) schemat Supabase wdrożony: tabele `dna_profiles` (metadane — bez surowego CSV), `comparison_results` (chromosom, pozycja, klasyfikacja, user_id) i `ancestor_annotations` (segment_id, etykieta przodka)
- **Change ID:** database-schema
- **PRD refs:** FR-003 (metadane profilu), FR-006 (wyniki segmentów), FR-008 (adnotacje przodków), §Data storage model ("pliki CSV wgrywane tylko do przetworzenia; wyniki segmentów zapisywane w bazie"), §NFR ("Pliki CSV z danymi DNA nie są trwale przechowywane po zakończeniu przetwarzania")
- **Unlocks:** S-02 (zapis metadanych profilu), S-03 (zapis wyników porównania), S-04 (zapis adnotacji przodków)
- **Prerequisites:** F-01
- **Parallel with:** S-01 (po wdrożeniu F-01, F-02 i S-01 można budować równolegle w osobnych sesjach agenta)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Schemat musi odzwierciedlać NFR o prywatności — surowe dane CSV nigdy nie trafiają do bazy; błąd projektowy tu wymaga późniejszej migracji
- **Status:** done

## Slices

### S-01: Rejestracja i logowanie

- **Outcome:** użytkownik może założyć konto (email + hasło), zalogować się i wylogować
- **Change ID:** user-authentication
- **PRD refs:** FR-001, FR-002
- **Prerequisites:** F-01
- **Parallel with:** F-02 (po wdrożeniu F-01, S-01 i F-02 można budować równolegle)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Prosta funkcjonalność, ale błędy walidacji formularza muszą być czytelne dla nietech użytkownika — §Guardrails: "Czytelny komunikat błędu przy nieprawidłowym formacie"
- **Status:** done

### S-02: Wgrywanie i zarządzanie profilami DNA

- **Outcome:** użytkownik może wgrać plik CSV w formacie MyHeritage jako profil DNA, przeglądać listę swoich profili i usuwać je
- **Change ID:** dna-profile-upload
- **PRD refs:** FR-003, FR-004
- **Prerequisites:** F-01, F-02, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Dokładna struktura kolumn eksportu MyHeritage CSV — czy format jest stabilny między wersjami eksportu? — Owner: user. Block: no (do rozwiązania podczas `/10x-plan` przez inspekcję przykładowego pliku CSV).
- **Risk:** Parser MyHeritage CSV — rdzeń slice'a; §PRD notes "parser jako wymienialny moduł"; błąd parsowania blokuje cały downstream. Izolacja danych: surowy CSV musi być odrzucony po przetworzeniu, nie zapisany (§NFR + §Guardrails)
- **Status:** done

### S-03: Silnik porównania DNA + wyniki (tabela + diagram) ★ north star

- **Outcome:** użytkownik może wybrać 2+ profile DNA, uruchomić porównanie i zobaczyć wyniki segmentów chromosomów z klasyfikacją no match / half match / full match — zarówno w tabeli tekstowej (chromosom, pozycja, typ) jak i na interaktywnym diagramie chromosomów
- **Change ID:** dna-comparison-engine
- **PRD refs:** FR-005, FR-006, FR-007, US-01
- **Prerequisites:** S-02, F-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Algorytm klasyfikacji alleli — jak porównywać pozycje SNP gdy dwa profile nie mają identycznego zestawu pozycji chromosomowych? — Owner: user. Block: no (zarys w §Business Logic, szczegóły do rozstrzygnięcia podczas `/10x-plan` przez analizę próbkowych danych)
- **Risk:** Dwa najważniejsze ryzyka techniczne w jednym slice: (1) poprawność algorytmu klasyfikacji — §Guardrails: "błędna klasyfikacja dyskwalifikuje wynik", wynik musi być deterministyczny; (2) wizualizacja chromosomów (D3.js/Recharts) jest must-have (FR-007) i zwiększa zakres — §Timeline acknowledgment: "user accepted increased risk". Rozważyć podział na dwa etapy w `/10x-plan` (tabela najpierw, diagram jako etap 2 tego samego slice'a)
- **Status:** done

### S-04: Fazowanie — adnotacja przodka

- **Outcome:** użytkownik może przypisać segment chromosomu do konkretnego przodka (fazowanie ręczne)
- **Change ID:** phasing-ancestor-annotation
- **PRD refs:** FR-008
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zakres dobrze zdefiniowany — ręczna adnotacja, nie automatyczne fazowanie (§Non-Goals). Ryzyko UX: jak elegancko zezwolić na przypisanie segmentów do różnych przodków bezpośrednio z diagramu chromosomów
- **Status:** done

### S-05: Interaktywna wizualizacja chromosomów (Canvas)

- **Outcome:** użytkownik widzi chromosomy jako interaktywny diagram canvas z torami podobieństwa (no/half/full match) i torami fazowania per osoba (maternal/paternal), dla 3 osób — wszystkie 3 pary jednocześnie
- **Change ID:** canvas-visualization
- **PRD refs:** FR-007
- **Prerequisites:** S-04
- **Parallel with:** S-08 (S-08 niezależne, można równolegle)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Największa zmiana wizualna — zastępuje istniejący SVG ChromosomeDiagram; canvas hit-testing wymaga precyzyjnej implementacji
- **Status:** proposed

### S-06: Zarządzanie przodkami

- **Outcome:** użytkownik definiuje nazwanych przodków z kolorami per porównanie i używa ich wielokrotnie przy fazowaniu
- **Change ID:** ancestor-management
- **PRD refs:** FR-008
- **Prerequisites:** S-04
- **Parallel with:** S-05 (można budować równolegle)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wymaga migracji istniejących adnotacji `ancestor_label` (wolny tekst) na FK do nowej tabeli `ancestors`
- **Status:** proposed

### S-07: Fazowanie przez kliknięcie na diagramie

- **Outcome:** użytkownik klika tor chromosomu i przypisuje segment do nazwanego przodka bez formularza; istniejące fazowanie edytowalne w miejscu
- **Change ID:** phasing-click
- **PRD refs:** FR-008
- **Prerequisites:** S-05, S-06
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Canvas hit-testing musi być zsynchronizowany z modelem danych przodków z S-06
- **Status:** proposed

### S-08: Szczegóły segmentów — cM i gęstość SNP

- **Outcome:** użytkownik widzi długość segmentu w centiMorganach (cM) i gęstość SNP/cM w tabeli i tooltipach diagramu
- **Change ID:** segment-cm-density
- **PRD refs:** FR-006
- **Prerequisites:** S-03
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:** Czy parser CSV MyHeritage dostarcza dane cM — do weryfikacji podczas planowania
- **Risk:** Niskie; jeśli parser nie dostarcza cM, pola pozostają null i wyświetlane jako „—"
- **Status:** proposed

### S-09: Zewnętrzne dopasowania DNA

- **Outcome:** użytkownik rejestruje zewnętrzne dopasowania DNA (z innych baz) z pozycją, relacją i klastrami, widzi je na diagramie canvas
- **Change ID:** external-similarities
- **PRD refs:** —
- **Prerequisites:** S-05
- **Parallel with:** S-10
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Nowa tabela i endpointy; integracja z canvas wymaga osobnej warstwy renderowania
- **Status:** proposed

### S-10: Eksport raportu

- **Outcome:** użytkownik eksportuje samodzielny raport HTML i zrzut JPG z wizualizacją chromosomów
- **Change ID:** report-export
- **PRD refs:** FR-009
- **Prerequisites:** S-05
- **Parallel with:** S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Eksport HTML generowany client-side; canvas-to-JPG działa tylko gdy canvas jest wyrenderowany w DOM
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                   | Suggested issue title                                                          | Ready for `/10x-plan` | Notes                                      |
|------------|-----------------------------|--------------------------------------------------------------------------------|-----------------------|--------------------------------------------|
| F-01       | auth-scaffold               | Auth scaffold: Supabase Auth + JWT middleware dla FastAPI                      | yes                   | Uruchom `/10x-plan auth-scaffold`          |
| F-02       | database-schema             | Database schema: dna_profiles, comparison_results, ancestor_annotations        | no                    | Czeka na F-01                              |
| S-01       | user-authentication         | User auth: rejestracja, logowanie, wylogowanie                                 | no                    | Czeka na F-01; równolegle z F-02           |
| S-02       | dna-profile-upload          | DNA profile upload: parser MyHeritage CSV + zarządzanie profilami              | no                    | Czeka na F-01, F-02, S-01                  |
| S-03       | dna-comparison-engine       | DNA comparison engine: klasyfikator alleli + tabela segmentów + diagram chromosomów | no               | Czeka na S-02, F-02 — gwiazda przewodnia   |
| S-04       | phasing-ancestor-annotation | Phasing: ręczna adnotacja segmentu chromosomu przodkiem                        | no                    | Czeka na S-03                              |
| S-08       | segment-cm-density          | Segmenty: długość cM + gęstość SNP/cM w tabeli i tooltipach                   | yes                   | Pierwsze w kolejności (Stream C)           |
| S-06       | ancestor-management         | Przodkowie: nazwani przodkowie z kolorami per porównanie                       | no                    | Czeka na S-04                              |
| S-05       | canvas-visualization        | Wizualizacja canvas: tory podobieństwa + fazowania, 3-pair view                | no                    | Czeka na S-06 (kolory przodków)            |
| S-07       | phasing-click               | Phasing click: kliknięcie toru → przypisanie przodka                          | no                    | Czeka na S-05 + S-06                       |
| S-09       | external-similarities       | Zewnętrzne dopasowania DNA z klastrami                                        | no                    | Czeka na S-05                              |
| S-10       | report-export               | Eksport HTML + JPG                                                            | no                    | Czeka na S-05                              |

## Open Roadmap Questions

Brak otwartych pytań — PRD ma wynik 0 otwartych pytań (quality check: accepted 2026-05-19). Pytania per-slice (parser CSV, algorytm klasyfikacji) pozostają w sekcjach poszczególnych slice'ów i są oznaczone `Block: no` — nie blokują planowania, rozwiązywane podczas `/10x-plan`.

## Parked

- **Export do CSV / PDF (FR-009)** — Why parked: nice-to-have per §PRD Socrates review; "eksport to infrastruktura, nie wartość — de facto v2"
- **Wsparcie dla innych platform DNA (AncestryDNA, 23andMe, FTDNA)** — Why parked: §Non-Goals: "MVP ograniczony do jednego parsera (MyHeritage)"
- **Automatyczne fazowanie** — Why parked: §Non-Goals: "adnotacja przodka jest zawsze ręczna przez użytkownika"
- **Współdzielenie wyników między kontami / wspólne drzewo rodzinne** — Why parked: §Non-Goals: "każde konto jest izolowane; brak funkcji udostępniania"
- **Obsługa urządzeń mobilnych i tabletów** — Why parked: §Non-Goals: "aplikacja desktopowa; responsywność mobilna nie jest celem MVP"

## Done

- **F-01: (foundation) middleware autoryzacji gotowy; tokeny Supabase Auth wydawane i weryfikowane** — Archived 2026-05-25 → `context/archive/2026-05-25-auth-scaffold/`. Lesson: —.
- **S-04: użytkownik może przypisać segment chromosomu do konkretnego przodka (fazowanie ręczne)** — Archived 2026-06-03 → `context/archive/2026-06-02-phasing-ancestor-annotation/`. Lesson: —.
- **S-01: użytkownik może założyć konto (email + hasło), zalogować się i wylogować** — Archived 2026-06-03 → `context/archive/2026-05-29-user-authentication/`. Lesson: —.
- **S-02: użytkownik może wgrać plik CSV MyHeritage jako profil DNA oraz przeglądać i usuwać profile** — Archived 2026-06-03 → `context/archive/2026-05-30-dna-comparison/`. Lesson: —.
- **S-03: użytkownik może wybrać 2+ profile DNA, uruchomić porównanie i zobaczyć wyniki w tabeli i na diagramie chromosomów** — Archived 2026-06-03 → `context/archive/2026-05-30-dna-comparison/`. Lesson: —.
- **F-02: (foundation) schemat Supabase wdrożony; tabele profili, wyników segmentów i adnotacji** — Archived 2026-06-03 → `context/archive/2026-05-25-database-schema/`. Lesson: —.
