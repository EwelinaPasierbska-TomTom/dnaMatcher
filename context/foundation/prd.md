---
project: dnaMatcher
version: 1
status: draft
created: 2026-05-19
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Pasjonaci genealogii DNA mają pliki z wynikami testów (AncestryDNA, 23andMe, FTDNA) dla kilku członków rodziny i chcą porównać te dane: znaleźć wspólne segmenty chromosomów oraz przypisać konkretnych przodków do odcinków chromosomów (fazowanie). Dziś wymaga to korzystania z kilku rozproszonych, głównie dużych i płatnych narzędzi — co oznacza żmudne ręczne łączenie wyników z różnych systemów i brak spójnego, przystępnego widoku.

Luka jest prosta: pasjonaci genealogii nie są programistami, a istniejące narzędzia są albo drogie i rozbudowane ponad potrzebę, albo wymagają ręcznej integracji wielu źródeł. Brakuje prostego, dostępnego narzędzia, które wczyta pliki z kilku platform, porówna allele i wyda czytelny wynik segmentowy.

## User & Persona

**Persona główna: pasjonat/ka genealogii DNA**

- Rola: hobby-badacz rodzinny, niekoniecznie z wiedzą techniczną
- Kontekst: posiada pliki DNA kilku osób z rodziny (rodzice, rodzeństwo, kuzyni) wyeksportowane z co najmniej jednej platformy (w MVP: MyHeritage)
- Moment sięgnięcia po produkt: ma kilka plików .csv i chce odpowiedzieć na pytanie — "czy ten segment chromosomu przyszedł od babci czy dziadka?" lub "czy te dwie osoby dzielą wspólny odcinek chromosomu?"
- Ból: musi używać 2–4 różnych, często płatnych narzędzi, ręcznie kopiować wyniki i porównywać tabele bez spójnego widoku

## Success Criteria

### Primary
- Użytkownik loguje się, wgrywa 2+ pliki CSV z MyHeritage, wybiera dwie lub więcej osób do porównania, otrzymuje listę segmentów chromosomów z klasyfikacją no match / half match / full match oraz może przypisać segment do konkretnego przodka (fazowanie). Cały przepływ działa poprawnie od końca do końca.

### Secondary
- Eksport wyników porównania do CSV lub PDF.

### Guardrails
- Poprawność klasyfikacji: no match / half match / full match musi być zgodna z algorytmem porównania alleli — błędna klasyfikacja dyskwalifikuje wynik.
- Izolacja danych między kontami: żaden użytkownik nie może zobaczyć danych innego.
- Pliki CSV z danymi DNA są przetwarzane tylko w trakcie sesji i nie są trwale przechowywane — w bazie danych zapisywane są wyłącznie obliczone wyniki segmentów.
- Czytelny komunikat błędu przy nieprawidłowym formacie pliku zamiast awarii aplikacji.

## User Stories

### US-01: Porównanie DNA dwóch lub więcej osób

- **Given** zalogowany użytkownik, który wgrał co najmniej 2 profile DNA z MyHeritage
- **When** wybiera dwa lub więcej profili i uruchamia porównanie
- **Then** widzi listę segmentów chromosomów z klasyfikacją no match / half match / full match w widoku tekstowym i na interaktywnym diagramie chromosomów

#### Acceptance Criteria
- Każdy segment ma przypisaną jedną z trzech klasyfikacji
- Wynik jest deterministyczny — te same pliki dają ten sam wynik
- Puste pliki lub brak wspólnych chromosomów → komunikat zamiast pustej listy

## Functional Requirements

### Authentication
- FR-001: Użytkownik może założyć konto (email + hasło). Priority: must-have
  > Socrates: Kontrargument rozważony: "invite-only lub jeden login redukuje friction dla małej grupy." Rozwiązanie: odrzucony — dane genetyczne w aplikacji webowej wymagają indywidualnej autoryzacji niezależnie od liczby użytkowników.
- FR-002: Użytkownik może zalogować się i wylogować. Priority: must-have
  > Socrates: Kontrargument rozważony: "hard-coded parser formatu MyHeritage to dług techniczny od dnia zero." Rozwiązanie: dot. implementacji, nie funkcjonalności — FR stoi; parser powinien być wymienialny (uwaga dla tech-stack-selector).

### DNA profiles
- FR-003: Użytkownik może wgrać plik CSV w formacie MyHeritage jako profil DNA. Priority: must-have
  > Socrates: Kontrargument rozważony: "format CSV MyHeritage może się zmienić między wersjami." Rozwiązanie: ryzyko implementacyjne, nie blokada FR — parser jako wymienialny moduł to uwaga dla downstream.
- FR-004: Użytkownik może przeglądać wgrane profile DNA i usuwać je. Priority: must-have
  > Socrates: Kontrargument rozważony: "widok listy i usuwanie to luksus w 3-tygodniowym MVP." Rozwiązanie: odrzucony — użytkownik musi kontrolować co jest załadowane; chaos przy braku zarządzania profilami.

### Comparison
- FR-005: Użytkownik może wybrać dwa lub więcej profili DNA do porównania. Priority: must-have
  > Socrates: Kontrargument rozważony: "fazowanie wymaga trzech próbek (dziecko + oboje rodziców)." Rozwiązanie: nietrafiony — fazowanie w tej aplikacji opiera się na akumulacji dowodów z wielu pairwise porównań z krewnymi (nie na plikach rodziców). Pairwise jest właściwym modelem; FR zaktualizowany na "dwa lub więcej".
- FR-006: Aplikacja generuje łańcuch podobieństw alleli i klasyfikuje każdy segment chromosomu jako no match, half match lub full match — logika klasyfikacji jest silnikiem aplikacji. Priority: must-have
  > Socrates: Kontrargument rozważony: "algorytm nie jest zdefiniowany — bez precyzji implementacja jest niemożliwa." Rozwiązanie: odrzucony — algorytm jest zdefiniowany jako porównanie alleli na pozycji; logika klasyfikacji to rdzeń silnika, nie zewnętrzna biblioteka.
- FR-007: Użytkownik może przeglądać wyniki porównania zarówno w widoku wizualnym (interaktywny diagram chromosomów) jak i tekstowym (tabela segmentów z klasyfikacją). Priority: must-have
  > Socrates: Kontrargument rozważony: "surowa lista segmentów bez wizualizacji jest nieczytelna dla niespecjalistów." Rozwiązanie: potwierdzony — wizualizacja chromosomów jest must-have (nie secondary). FR zaktualizowany. Uwaga: dodanie widoku wizualnego zwiększa zakres vs. oryginalne 3 tygodnie.

### Phasing
- FR-008: Użytkownik może przypisać segment chromosomu do konkretnego przodka (fazowanie). Priority: must-have
  > Socrates: Kontrargument rozważony: "brak walidacji spokrewnienia może dać błędne fazowanie." Rozwiązanie: odrzucony — ograniczenia walidacji akceptowalne w MVP; fazowanie jest głównym celem produktu.

### Export
- FR-009: Użytkownik może eksportować wyniki porównania do pliku CSV lub PDF. Priority: nice-to-have
  > Socrates: Kontrargument rozważony: "eksport to infrastruktura, nie wartość — przy rosnącym zakresie (wizualizacja w FR-007) powinien przesunąć się do v2." Rozwiązanie: potwierdzony — FR-009 pozostaje nice-to-have, de facto v2.

## Non-Functional Requirements

- Podczas każdej operacji porównania trwającej dłużej niż 2 sekundy użytkownik otrzymuje ciągłą widoczną informację o postępie — brak twardego limitu czasowego, lecz brak jakiejkolwiek informacji zwrotnej jest niedopuszczalny.
- Żadne surowe dane genetyczne przesłane do przetworzenia nie są przechowywane po zakończeniu operacji przetwarzania — w bazie danych zapisywane są wyłącznie obliczone wyniki segmentów.
- Aplikacja jest w pełni użyteczna w najnowszych wersjach Chrome, Firefox i Safari na desktopie.

## Business Logic

Na podstawie porównania alleli na wspólnych pozycjach chromosomowych między dwoma lub więcej profilami DNA, aplikacja klasyfikuje każdy odcinek chromosomu jako no match, half match lub full match.

Użytkownik dostarcza pliki CSV w formacie MyHeritage oraz wskazuje, które profile mają być porównane. Aplikacja przetwarza allele na każdej wspólnej pozycji chromosomowej i dla każdego odcinka wyznacza stopień zgodności. Wynik jest prezentowany na żądanie — po uruchomieniu porównania — jako tabela segmentów z klasyfikacją (chromosom, pozycja, typ) oraz interaktywny diagram chromosomów. Użytkownik może następnie ręcznie oznaczyć każdy segment przodkiem, akumulując wiedzę z wielu pairwise porównań z różnymi krewnymi, aby wywnioskować linie dziedziczenia (fazowanie przez sieć krewnych, nie przez pliki rodziców).

## Access Control

Aplikacja webowa z autoryzacją login/hasło. Każdy użytkownik ma własny profil i widzi wyłącznie swoje dane. Możliwość wielu kont na jednej instancji. Płaski model ról — wszyscy użytkownicy mają identyczne uprawnienia do swoich własnych danych; brak roli administratora w MVP.

Unauthenticated access: próba dostępu do jakiegokolwiek zasobu bez aktywnej sesji przekierowuje na stronę logowania.

## Non-Goals

- Wsparcie dla platform innych niż MyHeritage (AncestryDNA, 23andMe, FTDNA) — celowo odraczane do v2; MVP ograniczony do jednego parsera.
- Automatyczne fazowanie — aplikacja nie wnioskuje linii dziedziczenia samodzielnie; adnotacja przodka jest zawsze ręczna przez użytkownika.
- Współdzielenie wyników między kontami / wspólne drzewo rodzinne — każde konto jest izolowane; brak funkcji udostępniania.
- Obsługa urządzeń mobilnych i tabletów — aplikacja przeznaczona na desktop; responsywność mobilna nie jest celem MVP.

## Open Questions

Brak otwartych pytań — wszystkie fazy discovery ukończone, quality check: accepted (2026-05-19).
