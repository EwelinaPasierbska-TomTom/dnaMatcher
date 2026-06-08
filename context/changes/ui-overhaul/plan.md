# UI Overhaul — Adaptacja do wyglądu prototypu

## Overview

Przeprojektowanie frontendu `dnaMatcher` tak, by look & feel odpowiadał prototypowi `chromosome-mapper-main`. Zmiany obejmują nowy system komponentów UI, gradient tła, ikony lucide-react, i redesign stron auth, dashboard oraz results. Canvas wizualizacji chromosomów pozostaje niezmieniony.

## Current State Analysis

Projekt używa Tailwind v4 (CSS-first, `@import "tailwindcss"`) bez pliku konfiguracyjnego i bez biblioteki komponentów. Wszystkie elementy UI to surowe `<button>`, `<input>`, `<div>` z inline klasami Tailwind. Tło szare (`bg-gray-50`), brak ikon, brak systemu wariantów przycisków, brak kart z akcentami wizualnymi.

### Key Discoveries:

- `frontend/src/pages/AppPage.tsx:38` — `bg-gray-50`, max-w-2xl, porównania jako płaskie przyciski
- `frontend/src/pages/SignInPage.tsx:32` — osobna strona `/login`, `bg-gray-50`, brak ikony logo
- `frontend/src/pages/SignUpPage.tsx:63` — osobna strona `/signup`, identyczny wzorzec
- `frontend/src/pages/ResultsPage.tsx:158` — `bg-gray-50`, `←` jako tekst, brak ikon
- `frontend/src/components/AncestorPanel.tsx` — custom UI, brak komponentów
- `frontend/package.json` — tylko 4 zależności runtime: supabase, react, react-dom, react-router-dom
- Nie ma `frontend/src/lib/utils.ts`, nie ma `frontend/src/components/ui/`

## Desired End State

- Tło wszystkich stron: `bg-gradient-to-br from-blue-50 via-white to-green-50`
- Logo `Dna` (lucide-react) z tytułem aplikacji na każdej stronie
- Dashboard: grid kart 1/2/3 kolumn, każda `border-l-4 border-l-blue-500`, `hover:shadow-lg`, max-w-6xl
- Auth pages: ten sam layout z gradientem i logo, formularz w `Card`, ikony przycisków
- Results page: gradient bg, Button z ikoną ArrowLeft i Trash2, Card wrapper wokół canvas
- AncestorPanel: Button + Badge z komponentów ui/
- Wszystkie formularze: `Input` + `Label` z komponentów ui/

### Weryfikacja:

Uruchomić `npm run dev` w `frontend/`, otworzyć `/login` — powinno być widoczne gradient tło i ikona DNA. Przejść do `/app` — grid kart. Wybrać porównanie — gradient tło, przyciski z ikonami.

## What We're NOT Doing

- Migracja do Tailwind v3 (zostajemy na v4)
- Instalacja pełnego shadcn/ui przez CLI
- CSS variables / design tokens
- Toasty (sonner) — zostają inline error messages
- Redesign `ComparePage` — zostaje bez zmian
- Modyfikacja logiki canvas (`ChromosomSection`, `ChromosomCanvas`, `ChromosomeDiagram`) — tylko UI obudowy
- Dark mode

## Implementation Approach

Faza 1 buduje fundament (zależności + komponenty UI), który jest prerekvizitem dla faz 2–4. Fazy 2, 3, 4 mogą być wdrażane niezależnie po fazie 1.

Komponenty UI (`frontend/src/components/ui/`) będą ręcznie napisanymi plikami `.tsx`, wzorowanymi na prototypie, ale używającymi hardkodowanych klas Tailwind zamiast CSS variables.

## Critical Implementation Details

**Tailwind v4 i cn():** `tailwind-merge` i `clsx` działają niezależnie od wersji Tailwind — `cn()` będzie działać z v4 bez żadnych adaptacji.

**Radix + Tailwind v4:** Komponenty Radix UI (`@radix-ui/react-tabs`, `@radix-ui/react-alert-dialog`) używają atrybutów `data-[state=*]` do warunkowego stylowania. Tailwind v4 obsługuje te selektory natywnie — wzorzec `data-[state=active]:bg-white` zadziała bez `tailwind.config.ts`.

**AlertDialog zamiast `confirm()`:** `ResultsPage:129` używa `confirm()`. W fazie 4 zastąpimy to komponentem `AlertDialog` — zmiana wymaga przeniesienia `handleDelete()` do callbacka `onConfirm`.

---

## Phase 1: Fundament — Zależności i komponenty UI

### Overview

Instalacja nowych pakietów npm i stworzenie wszystkich komponentów UI wielokrotnego użytku, które będą potrzebne w fazach 2–4. Żadna strona nie jest jeszcze modyfikowana.

### Changes Required:

#### 1. Instalacja zależności

**File**: `frontend/package.json` (via `npm install`)

**Intent**: Dodać 6 nowych pakietów: `lucide-react`, `class-variance-authority`, `tailwind-merge`, `clsx`, `@radix-ui/react-tabs`, `@radix-ui/react-alert-dialog`.

**Contract**: Polecenie do uruchomienia w katalogu `frontend/`:
```
npm install lucide-react class-variance-authority tailwind-merge clsx @radix-ui/react-tabs @radix-ui/react-alert-dialog
```

#### 2. Utility cn()

**File**: `frontend/src/lib/utils.ts`

**Intent**: Stworzyć funkcję `cn()` łączącą `clsx` z `tailwind-merge` — używana przez wszystkie komponenty UI do bezpiecznego łączenia klas Tailwind.

**Contract**:
```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

#### 3. Komponent Button

**File**: `frontend/src/components/ui/button.tsx`

**Intent**: Stworzyć komponent `Button` oparty na CVA z wariantami `default`, `outline`, `ghost`, `destructive`, `secondary` i rozmiarami `sm`, `default`, `lg`, `icon`. Implementuje `forwardRef` i przekazuje wszystkie props do `<button>`.

**Contract**: Wariant `default` to `bg-blue-600 hover:bg-blue-700 text-white`. Wariant `destructive` to `bg-red-600 hover:bg-red-700 text-white`. Wariant `outline` to `border border-gray-300 bg-white hover:bg-gray-50`. Wariant `ghost` to `hover:bg-gray-100`. Eksportuje typ `ButtonProps` i CVA `buttonVariants`.

#### 4. Komponent Card

**File**: `frontend/src/components/ui/card.tsx`

**Intent**: Stworzyć compound component `Card` z eksportami `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`. Każdy eksport to `forwardRef` wrapper `<div>` z odpowiednimi klasami Tailwind.

**Contract**: `Card` ma `rounded-lg border border-gray-200 bg-white shadow-sm`. `CardHeader` ma `flex flex-col space-y-1.5 p-6`. `CardTitle` to `h3` z `text-2xl font-semibold text-gray-900`. `CardDescription` to `<p>` z `text-sm text-gray-500`.

#### 5. Komponent Input

**File**: `frontend/src/components/ui/input.tsx`

**Intent**: Stworzyć styled `<input>` jako `forwardRef` komponent z klasami odpowiadającymi prototypowi.

**Contract**: `flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50`.

#### 6. Komponent Label

**File**: `frontend/src/components/ui/label.tsx`

**Intent**: Stworzyć styled `<label>` jako `forwardRef` komponent.

**Contract**: `block text-sm font-medium text-gray-700 mb-1`.

#### 7. Komponent Badge

**File**: `frontend/src/components/ui/badge.tsx`

**Intent**: Stworzyć `Badge` z wariantami `default`, `secondary`, `destructive`, `outline` — używany w AncestorPanel do wyświetlania kolorów przodków.

**Contract**: Bazowe klasy: `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold`.

#### 8. Komponent Tabs

**File**: `frontend/src/components/ui/tabs.tsx`

**Intent**: Stworzyć `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` na bazie `@radix-ui/react-tabs` z klasami Tailwind odpowiadającymi prototypowi.

**Contract**: `TabsList` ma `inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1`. `TabsTrigger` ma `data-[state=active]:bg-white data-[state=active]:shadow-sm` z `rounded-sm px-3 py-1.5 text-sm font-medium`.

#### 9. Komponent AlertDialog

**File**: `frontend/src/components/ui/alert-dialog.tsx`

**Intent**: Stworzyć `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel` na bazie `@radix-ui/react-alert-dialog`.

**Contract**: Overlay `fixed inset-0 bg-black/50`. Content `fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] bg-white rounded-lg shadow-lg p-6 max-w-md w-full`. `AlertDialogAction` używa `buttonVariants({ variant: 'destructive' })`.

### Success Criteria:

#### Automated Verification:

- Instalacja pakietów: `cd frontend && npm install` kończy się bez błędów
- TypeScript kompiluje: `npm run build` bez błędów type
- Wszystkie 8 nowych plików komponentów istnieje w `frontend/src/components/ui/` i `frontend/src/lib/utils.ts`

#### Manual Verification:

- Żadna istniejąca strona nie zmieniła wyglądu (komponenty nie są jeszcze używane)
- Brak błędów w konsoli przeglądarki po uruchomieniu dev serwera

**Implementation Note**: Przed przejściem do fazy 2, potwierdź ręcznie że dev server uruchamia się bez błędów i że `npm run build` przechodzi.

---

## Phase 2: Redesign Auth Pages

### Overview

Przeprojektowanie `SignInPage` i `SignUpPage` przy użyciu komponentów z fazy 1. Routing (`/login`, `/signup`) bez zmian. Logika auth (supabase calls, error handling) bez zmian.

### Changes Required:

#### 1. SignInPage — nowy layout

**File**: `frontend/src/pages/SignInPage.tsx`

**Intent**: Zastąpić tło `bg-gray-50` gradientem, dodać ikonę `Dna` i tytuł "dnaMatcher" nad formularzem, opakować formularz w `Card`, zastąpić `<input>` i `<label>` komponentami `Input` i `Label`, zastąpić `<button>` komponentem `Button`. Link do rejestracji zachować.

**Contract**: Struktura: `div.min-h-screen.bg-gradient-to-br.from-blue-50.via-white.to-green-50` > centered `div.max-w-md` > header z `Dna` (w-10 h-10 text-blue-600) + `<h1>dnaMatcher</h1>` + podtytuł > `Card` > `CardHeader` z `CardTitle="Zaloguj się"` > `CardContent` z formularzem. Inline error `<p className="text-red-600 text-sm">` pozostaje w formularzu.

#### 2. SignUpPage — nowy layout

**File**: `frontend/src/pages/SignUpPage.tsx`

**Intent**: Identyczne podejście jak SignInPage — gradient, Dna logo, Card, Input/Label/Button. Formularz ma 4 pola (imię, email, hasło, powtórz hasło) — wszystkie z komponentami `Input`/`Label`. Logika walidacji (phantom user detection, password match) bez zmian.

**Contract**: Identyczna struktura jak SignInPage, `CardTitle="Zarejestruj się"`.

### Success Criteria:

#### Automated Verification:

- `npm run build` bez błędów TypeScript
- Brak broken imports

#### Manual Verification:

- `/login` wyświetla gradient tło + ikonę DNA + "dnaMatcher" + Card z formularzem
- `/signup` ma identyczny wygląd z 4 polami
- Logowanie działa (nie tylko wygląd)
- Rejestracja działa z walidacją
- Link "Nie masz konta?" na `/login` prowadzi do `/signup` i odwrotnie
- Błędy auth wyświetlają się inline pod przyciskiem

**Implementation Note**: Przetestuj pełny przepływ auth (logowanie z poprawnym i złym hasłem) przed przejściem do fazy 3.

---

## Phase 3: Redesign Dashboard (AppPage)

### Overview

Przeprojektowanie `AppPage` do layoutu z gridiem kart jak w prototypie. Logika fetchowania porównań bez zmian.

### Changes Required:

#### 1. AppPage — nowy layout

**File**: `frontend/src/pages/AppPage.tsx`

**Intent**: Zastąpić layout: `bg-gray-50` → gradient, `max-w-2xl` → `max-w-6xl`, header scentralizować z ikoną `Dna`, dodać ikonę `LogOut` do przycisku wylogowania, listę porównań zastąpić gridem kart (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), każdą kartę zapakować w `Card` z `border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow`, dodać ikonę `Plus` do przycisku nowego porównania. Empty state z dużą ikoną `Dna` (w-24 h-24 text-gray-300). Loading state z `Dna className="animate-spin"`.

**Contract**: Każda karta porównania: `<Card className="border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow cursor-pointer" onClick={...}>`. `CardTitle` = `c.name`. `CardDescription` = data. Poniżej data: lista `c.person_names` jako plain text (`c.person_names.join(' · ')`). Przycisk wylogowania: `<Button variant="ghost" size="sm"><LogOut className="w-4 h-4 mr-1" />Wyloguj się</Button>`. Przycisk nowego porównania: `<Button size="lg"><Plus className="w-5 h-5 mr-2" />Nowe porównanie</Button>`.

### Success Criteria:

#### Automated Verification:

- `npm run build` bez błędów

#### Manual Verification:

- `/app` wyświetla gradient tło + Dna logo + centered header
- Przy 0 porównaniach: duża ikona Dna + tekst zachęty
- Przy 1+ porównaniach: grid kart z `border-l-4 border-l-blue-500`
- Kliknięcie karty nawiguje do `/results/:id`
- Wylogowanie działa
- Layout responsywny: 1 kolumna na mobile, 2 na md, 3 na lg

**Implementation Note**: Sprawdź oba stany empty i filled, oraz responsywność przez zmianę rozmiaru okna.

---

## Phase 4: Redesign ResultsPage + AncestorPanel

### Overview

Aktualizacja otoczenia wizualizacji DNA: gradient tło, przyciski z ikonami, `AlertDialog` zamiast `confirm()`. Canvas `ChromosomCanvas` i jego potomki są niemodyfikowane.

### Changes Required:

#### 1. ResultsPage — nowy layout

**File**: `frontend/src/pages/ResultsPage.tsx`

**Intent**: Zastąpić `bg-gray-50` gradientem, zastąpić `← Powrót` przyciskiem `<Button variant="ghost">` z ikoną `ArrowLeft`, zastąpić "Usuń porównanie" przyciskiem `<Button variant="destructive">` z ikoną `Trash2`, zastąpić `confirm()` komponentem `AlertDialog`, opakować canvas w `Card`, zaktualizować loading i error state do gradientu z ikoną Dna.

**Contract**: Przycisk Powrót: `<Button variant="ghost" onClick={() => navigate('/app')}><ArrowLeft className="w-4 h-4 mr-1" />Powrót</Button>`. Przycisk usunięcia jako trigger `AlertDialog` — callback `handleDelete()` przeniesiony do `AlertDialogAction onClick`. Canvas wrapper: `<Card><CardContent className="p-4">`...`</CardContent></Card>`. Loading state: `<Dna className="w-8 h-8 text-blue-600 animate-spin" />` + tekst "Ładowanie…". Error state: `<p className="text-red-600">{error}</p>`.

#### 2. AncestorPanel — update przycisków i odznak

**File**: `frontend/src/components/AncestorPanel.tsx`

**Intent**: Zastąpić surowe `<button>` komponentami `Button` (variant="outline" dla edycji, variant="destructive" dla usunięcia), zastąpić surowe `<div>` z kolorami kodem używającym `Badge` lub inline `<span>` z color swatch (kółko z kolorem przodka). Logika add/edit/delete przodków bez zmian.

**Contract**: Przyciski edycji: `<Button variant="ghost" size="sm">`. Przyciski usunięcia: `<Button variant="destructive" size="sm">`. Swatch koloru: `<span className="inline-block w-4 h-4 rounded-full border border-gray-200" style={{ backgroundColor: ancestor.color }} />`.

### Success Criteria:

#### Automated Verification:

- `npm run build` bez błędów

#### Manual Verification:

- `/results/:id` wyświetla gradient tło
- Przycisk "Powrót" ma ikonę ArrowLeft i nawiguje do `/app`
- Przycisk "Usuń porównanie" otwiera AlertDialog z potwierdzeniem (nie `confirm()`)
- Po potwierdzeniu usunięcia: nawigacja do `/app`, porównanie znika z listy
- Canvas chromosomów wyświetla się i działa identycznie jak przed zmianami
- AncestorPanel: dodawanie, edycja, usuwanie przodków działa
- Swatch kolorów przodków widoczny

**Implementation Note**: Kluczowe jest zweryfikowanie, że canvas wizualizacja DNA działa identycznie po zmianach — kliknij na segment chromosomu, sprawdź czy popup adnotacji się otwiera.

---

## Testing Strategy

### Manual Testing Steps:

1. `cd frontend && npm run dev` — dev server uruchamia się bez błędów
2. Odwiedź `/login`: gradient tło, ikona DNA, Card z formularzem — zaloguj się poprawnie i niepoprawnie
3. Na `/app`: grid kart, ikona DNA w headerze, przycisk nowego porównania z Plus
4. Kliknij istniejące porównanie → `/results/:id`
5. Na stronie wyników: przycisk Powrót z ArrowLeft, Usuń z AlertDialog, canvas działa
6. Dodaj/edytuj/usuń przodka w AncestorPanel
7. Kliknij segment na canvas → popup adnotacji otwiera się
8. `npm run build` — brak błędów TypeScript

## Migration Notes

Brak zmian w backendzie, routingu, ani logice auth. Tylko pliki w `frontend/src/` są modyfikowane.

## References

- Prototyp: `/Users/ewelina.pasierbska/Downloads/chromosome-mapper-main/src/`
- Prototyp Index: `chromosome-mapper-main/src/pages/Index.tsx`
- Prototyp Auth: `chromosome-mapper-main/src/components/Auth.tsx`
- Prototyp design tokens: `chromosome-mapper-main/src/index.css`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Fundament — Zależności i komponenty UI

#### Automated

- [x] 1.1 Instalacja pakietów: `cd frontend && npm install` kończy się bez błędów — aac7675
- [x] 1.2 TypeScript kompiluje: `npm run build` bez błędów type — aac7675
- [x] 1.3 Wszystkie 8 nowych plików komponentów istnieje w `frontend/src/components/ui/` i `frontend/src/lib/utils.ts` — aac7675

#### Manual

- [x] 1.4 Żadna istniejąca strona nie zmieniła wyglądu po fazie 1 — aac7675
- [x] 1.5 Dev server uruchamia się bez błędów w konsoli — aac7675

### Phase 2: Redesign Auth Pages

#### Automated

- [x] 2.1 `npm run build` bez błędów TypeScript — 6f7eea6
- [x] 2.2 Brak broken imports — 6f7eea6

#### Manual

- [x] 2.3 `/login` wyświetla gradient tło + ikonę DNA + "dnaMatcher" + Card z formularzem — 6f7eea6
- [x] 2.4 `/signup` ma identyczny wygląd z 4 polami — 6f7eea6
- [x] 2.5 Logowanie działa z poprawnymi danymi — 6f7eea6
- [x] 2.6 Błędy auth wyświetlają się inline — 6f7eea6

### Phase 3: Redesign Dashboard (AppPage)

#### Automated

- [x] 3.1 `npm run build` bez błędów — 623f085

#### Manual

- [x] 3.2 `/app` wyświetla gradient tło + Dna logo + centered header — 623f085
- [x] 3.3 Empty state: duża ikona Dna + tekst zachęty — 623f085
- [x] 3.4 Filled state: grid kart z `border-l-4 border-l-blue-500` — 623f085
- [x] 3.5 Kliknięcie karty nawiguje do `/results/:id` — 623f085
- [x] 3.6 Layout responsywny: 1/2/3 kolumny — 623f085

### Phase 4: Redesign ResultsPage + AncestorPanel

#### Automated

- [x] 4.1 `npm run build` bez błędów — 99d6517

#### Manual

- [x] 4.2 `/results/:id` wyświetla gradient tło — 99d6517
- [x] 4.3 Przycisk "Powrót" ma ikonę ArrowLeft — 99d6517
- [x] 4.4 Przycisk "Usuń" otwiera AlertDialog (nie natywny `confirm()`) — 99d6517
- [x] 4.5 Canvas chromosomów działa identycznie — popup adnotacji otwiera się — 99d6517
- [x] 4.6 AncestorPanel: dodawanie/edycja/usuwanie przodków działa — 99d6517
