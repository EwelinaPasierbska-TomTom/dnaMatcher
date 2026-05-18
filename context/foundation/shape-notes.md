---
project: "dnaMatcher"
context_type: greenfield
created: 2026-05-18
updated: 2026-05-18
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "persona"
      decision: "pasjonaci genealogii DNA — hobbyist niche, samodzielna analiza bez wiedzy bioinformatycznej"
    - topic: "main operation"
      decision: "algorytm porównuje dane DNA → tworzy segmenty → aplikacja wizualizuje → użytkownik interpretuje pokrewieństwo i ręcznie przypisuje fazowanie"
    - topic: "data input"
      decision: "pliki lokalne (CSV/XLSX/txt) eksportowane z platform testowych"
    - topic: "insight"
      decision: "brak jednego zintegrowanego narzędzia desktop/offline łączącego porównanie, wizualizację i fazowanie"
  frs_drafted: 7
  quality_check_status: accepted
product_type: desktop
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Business Logic

Aplikacja porównuje ciąg alleli w pliku DNA i na podstawie wygenerowanego łańcucha podobieństw klasyfikuje wynik jako segment odpowiedniego typu: brak dopasowania, half match lub full match.

Wejście: pliki CSV (format MyHeritage) zawierające dane alleli dla co najmniej dwóch osób. Użytkownik dostarcza pliki — nie konfiguruje parametrów algorytmu w MVP.

Wyjście: zbiór segmentów chromosomowych z przypisaną klasyfikacją (brak / half / full). Użytkownik napotyka wynik jako kolorową mapę chromosomów i opis tekstowy ze statystykami — aplikacja klasyfikuje, użytkownik interpretuje pokrewieństwo i przypisuje fazowanie.

## Non-Functional Requirements

- Wynik generowania jest deterministyczny: te same pliki wejściowe CSV dają identyczne segmenty przy każdym uruchomieniu.
- Żadne dane DNA nie opuszczają urządzenia użytkownika — brak połączeń sieciowych, brak telemetrii, brak zapisu do lokalizacji poza katalogiem aplikacji.
- Aplikacja działa na macOS (najnowsze dwie główne wersje systemu).
- Aplikacja pozostaje responsywna podczas generowania — użytkownik widzi sygnał postępu; czas generowania nie jest ograniczony w MVP (poprawność ponad prędkość).
- Wizualizacja obejmuje wszystkie 22 chromosomy autosomalne oraz chromosom X.

## Access Control

Jeden użytkownik, jeden komputer. Brak logowania, brak kont, brak synchronizacji sieciowej. Dane DNA przechowywane wyłącznie lokalnie na urządzeniu użytkownika.

MVP: jeden aktywny projekt (jeden zbiór danych DNA) na raz. Zarządzanie wieloma projektami / liniami rodzinnymi — eksplicitnie poza zakresem MVP, planowane w v2.

## Success Criteria

### Primary
- Użytkownik tworzy projekt, wczytuje pliki DNA co najmniej dwóch osób, uruchamia generowanie i widzi wizualną mapę chromosomów z segmentami oznaczonymi kolorem (brak dopasowania → czerwony, half match → żółty, pełne dopasowanie → zielony) oraz towarzyszący opis tekstowy podobieństw.

### Secondary
- Wizualizacja obsługuje porównanie 3 lub więcej osób jednocześnie.
- Opis tekstowy zawiera statystyki: długość segmentów w cM, liczbę segmentów i procentowe podobieństwo.

### Guardrails
- Wynik jest deterministyczny — te same pliki wejściowe dają te same segmenty przy każdym uruchomieniu.
- Dane DNA nie opuszczają urządzenia użytkownika (brak telemetrii, brak połączeń sieciowych).
- Wizualizacja obejmuje co najmniej 22 chromosomy autosomalne + chromosom X.
- Aplikacja nie zawiesza się ani nie crashuje podczas procesu generowania.

## Non-Goals

- **Fazowanie chromosomów** (przypisywanie konkretnych przodków do segmentów) — to krok drugi; MVP tylko generuje i wizualizuje segmenty, bez możliwości ich etykietowania przodkami.
- **Import z zewnętrznych systemów** (GEDmatch API, AncestryDNA API itp.) — MVP operuje wyłącznie na lokalnych plikach CSV. Integracje zewnętrzne to osobna iteracja.
- **Obsługa innych formatów plików DNA** (23andMe, FTDNA, RAW SNP, VCF) — tylko CSV w formacie MyHeritage w MVP; wieloformatowy import wydłużyłby timeline.
- **Zarządzanie wieloma projektami** — MVP = jeden obszar roboczy; przełączanie projektów / linia rodzinna to v2.
- **Synchronizacja danych, chmura, multi-device** — aplikacja jest wyłącznie lokalna; brak jakiejkolwiek synchronizacji jest twardą gwarancją prywatności.
- **Windows / Linux** — MVP działa tylko na macOS; wsparcie innych systemów operacyjnych poza zakresem pierwszego wydania.

## Vision & Problem Statement

Pasjonat genealogii DNA posiada pliki z wynikami testów DNA kilku osób — eksportowane z platform takich jak AncestryDNA, 23andMe czy FTDNA — i chce porównać te dane, zidentyfikować wspólne segmenty chromosomów oraz przypisać konkretnych przodków do odcinków chromosomów (fazowanie). Dziś wymaga to korzystania z kilku rozproszonych, głównie internetowych narzędzi, co oznacza konieczność przesyłania wrażliwych danych DNA do chmury oraz ręczne łączenie wyników z różnych systemów.

Istniejące narzędzia (DNA Painter, Genome Mate Pro, GEDmatch) są albo wyłącznie online, albo obsługują tylko część procesu. Brakuje jednej aplikacji desktopowej, która łączy algorytmiczne wyznaczanie segmentów, ich wizualizację na mapie chromosomów i interaktywne fazowanie chromosomów — bez konieczności wysyłania danych do zewnętrznych serwerów.

## Functional Requirements

### Obszar roboczy
- FR-001: Aplikacja otwiera się z domyślnym obszarem roboczym — brak dedykowanego kroku tworzenia projektu w MVP. Priority: must-have
  > Socrates: Kontrargument rozważony: "tworzenie projektu to zbędna ceremonia — aplikacja może po prostu otwierać się z domyślnym obszarem roboczym." Rozwiązanie: zaakceptowany — FR-001 zrewidowany; brak ekranu tworzenia projektu w MVP.

### Import danych
- FR-002: Użytkownik może wczytać plik DNA osoby w formacie CSV (MyHeritage) do aplikacji. Priority: must-have
  > Socrates: Kontrargument rozważony: "różne platformy = różne formaty." Rozwiązanie: zawężono do jednego formatu — CSV MyHeritage — co eliminuje ryzyko przebudżetowania importu.
- FR-003: Użytkownik może wczytać pliki DNA dla co najmniej dwóch osób w jednej sesji. Priority: must-have
  > Socrates: Kontrargument rozważony: "limit co najmniej dwóch bez górnej granicy może dać problemy wydajnościowe." Rozwiązanie: FR stoi — górny limit nie jest definiowany w MVP.

### Generowanie segmentów
- FR-004: Użytkownik może uruchomić generowanie segmentów podobieństwa DNA dla wczytanych osób. Priority: must-have
  > Socrates: Brak kontrargumentu — generowanie jest sercem aplikacji.

### Wizualizacja
- FR-005: Użytkownik może zobaczyć wizualną mapę chromosomów z segmentami oznaczonymi kolorem (brak dopasowania → czerwony, half match → żółty, pełne dopasowanie → zielony). Priority: must-have
  > Socrates: Kontrargument rozważony: "może MVP = tabela, wizualizacja w v2." Rozwiązanie: FR stoi — kolorowa mapa chromosomów jest rdzeniem produktu; tabela nie daje tej samej wartości interpretacyjnej.
- FR-006: Użytkownik może zobaczyć tekstowy opis podobieństw zawierający statystyki: długość segmentów w cM, liczba segmentów, procent podobieństwa. Priority: must-have
  > Socrates: Kontrargument zaakceptowany: "opis tekstowy bez liczb ma małą wartość analityczną." Rozwiązanie: FR-006 zrewidowany — opis obejmuje statystyki (cM, liczba segmentów, procent).

### Eksport
- FR-007: Użytkownik może wyeksportować wizualizację lub raport do pliku. Priority: nice-to-have
  > Socrates: Kontrargument rozważony: "eksport to feature creep w MVP." Rozwiązanie: FR stoi jako nice-to-have — zostaje w scope jeśli czas pozwoli.

## User Stories

### US-01: Użytkownik generuje mapę podobieństw DNA dwóch osób

- **Given** aplikacja jest otwarta z wczytanymi plikami CSV (MyHeritage) co najmniej dwóch osób
- **When** użytkownik uruchamia generowanie segmentów
- **Then** widzi wizualną mapę chromosomów (22 autosomalne + X) z segmentami oznaczonymi kolorem oraz tekstowy opis z liczbą segmentów, długością w cM i procentem podobieństwa

#### Acceptance Criteria
- Mapa obejmuje wszystkie 22 chromosomy autosomalne + chromosom X
- Segmenty oznaczone: brak dopasowania → czerwony, half match → żółty, pełne → zielony
- Opis tekstowy zawiera: liczbę segmentów, łączną długość w cM, procent podobieństwa
- Wynik jest deterministyczny — te same pliki dają te same segmenty przy każdym uruchomieniu
- Dane nie opuszczają urządzenia użytkownika w trakcie całego procesu

## User & Persona

Pasjonaci genealogii DNA — osoby prywatne, które wykonały testy DNA (np. na AncestryDNA, 23andMe lub FTDNA) i samodzielnie analizują wyniki w celu odkrywania pokrewieństwa i historii rodziny. Sięgają po zaawansowane analizy segmentowe i fazowanie chromosomów, gdy podstawowe narzędzia platformy testowej nie wystarczają do mapowania wspólnych przodków. Nie muszą posiadać wiedzy bioinformatycznej — aplikacja wykonuje obliczenia, a użytkownik interpretuje wyniki i podejmuje decyzje analityczne.

