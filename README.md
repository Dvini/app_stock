# 📈 Inteligentny Menedżer Portfela (Stock Manager AI)

Aplikacja webowa do zarządzania portfelem inwestycyjnym, wyposażona w **lokalnego asystenta AI** działającego w 100% w przeglądarce. Zapewnia pełną prywatność danych, śledzenie wyników w czasie rzeczywistym i zaawansowane narzędzia analityczne.

## 🚀 Główne Funkcje

### 🤖 Lokalny Asystent AI ("StockBot")
- **Prywatność przede wszystkim**: Model AI (Llama/Gemma/Qwen) działa bezpośrednio w Twojej przeglądarce dzięki technologii **WebLLM** i **WebGPU**. Twoje dane finansowe nigdy nie opuszczają Twojego urządzenia.
- **Kontekstowa Analiza**: Asystent ma dostęp do Twojego portfela i historii transakcji, oferując spersonalizowane porady i analizy.
- **Inteligentne Wykresy**: Możliwość generowania wizualizacji danych na żądanie w czacie.
- **Wybór Modeli**: Możliwość wyboru z różnych modeli AI (Llama, Gemma, Qwen) w zależności od potrzeb i dostępnych zasobów.

### 📊 Zarządzanie Portfelem
- **Dashboard**: Przejrzysty widok wartości portfela z podziałem na waluty i zyskami/stratami (P/L).
- **Śledzenie Aktywów**: Obsługa akcji, ETF-ów i kryptowalut (dane z Yahoo Finance i Alpha Vantage).
- **Czas Rzeczywisty**: Automatyczne odświeżanie cen i kursów walut (PLN, USD, EUR, GBP).
- **Wielowalutowość**: Automatyczne przeliczanie wartości zagranicznych aktywów na PLN z historycznymi kursami walut.
- **Historia Transakcji**: Pełne rejestrowanie kupna, sprzedaży, depozytów i wypłat z edytwalnymi kursami wymiany.
- **Lista Obserwowanych**: Dodawaj akcje do watchlisty i śledź ich wyniki bez konieczności zakupu.

### 💰 Dywidendy
- **Automatyczne Śledzenie**: Automatyczne pobieranie informacji o dywidendach dla posiadanych akcji.
- **Suma Otrzymanych Dywidend**: Wyświetlanie łącznej sumy wszystkich otrzymanych dywidend (YTD).
- **Historia Wypłat**: Szczegółowa historia wypłat dywidend dla każdego aktywa.
- **Integracja z Portfelem**: Bezpośrednia integracja z transakcjami i wartością portfela.

### 🧮 Narzędzia Analityczne
- **Symulator Inwestycyjny**: Testuj scenariusze "co by było gdyby" przed podjęciem decyzji (kupno/sprzedaż/uśrednianie).
- **Zaawansowane Wykresy**: Interaktywne wykresy historii cen i wartości portfela z różnymi przedziałami czasowymi (1D, 5D, 1M, 6M, 1Y, 5Y).
- **WebGPU Rendering**: Akceleracja GPU dla płynnego wyświetlania dużych zbiorów danych.
- **Tooltips z Danymi**: Szczegółowe informacje po najechaniu na elementy wykresów i kart podsumowań.
- **Breakdown Walutowy**: Podział wartości portfela według walut oryginalnych z P/L dla każdej waluty.

### 🎨 Interfejs Użytkownika
- **Polska Lokalizacja**: Pełne wsparcie dla polskich formatów liczbowych (np. `1 234,56 zł`) i interfejsu.
- **Responsywny Design**: Przystosowany do różnych rozmiarów ekranów.
- **Ciemny Motyw**: Przyjazny dla oczu interfejs z eleganckimi gradientami.
- **Intuicyjna Nawigacja**: Boczny panel z dostępem do wszystkich sekcji aplikacji.

### 🔒 Bezpieczeństwo i Prywatność
- **IndexedDB (Dexie.js)**: Wszystkie dane (transakcje, ustawienia) są przechowywane lokalnie w przeglądarce.
- **Brak Logowania**: Aplikacja nie wymaga zakładania konta ani zewnętrznych serwerów bazodanowych.
- **Lokalne AI**: Model AI działa w przeglądarce bez wysyłania danych na zewnętrzne serwery.
- **Cache Service**: Inteligentne cachowanie danych API z konfigurowalnymi TTL.

## 🛠️ Stack Technologiczny

### Frontend
- **React 19** - Najnowsza wersja z ulepszoną wydajnością
- **React Router** 7 - Routing i nawigacja
- **Vite** - Szybki build tool i dev server
- **TailwindCSS** 4 - Nowoczesny framework CSS
- **Lucide React** - Piękne ikony SVG

### AI & Compute
- **WebLLM** (@mlc-ai/web-llm) - Uruchamianie modeli LLM w przeglądarce
- **WebGPU** - Akceleracja GPU dla AI i wykresów

### Baza Danych & State
- **Dexie.js** - Wrapper dla IndexedDB
- **React Context API** - Zarządzanie stanem aplikacji

### Dane Rynkowe
- **Yahoo Finance API** - Ceny akcji i dane historyczne
- **Alpha Vantage API** - Dodatkowe dane finansowe i dywidendy
- **Exchange Rate API** - Historyczne kursy walut

### Testing
- **Vitest** - Szybki framework testowy
- **Vitest UI** - Interfejs graficzny dla testów
- **Coverage** - Analiza pokrycia kodu testami

## ⚙️ Wymagania

### Przeglądarka
Aplikacja wymaga nowoczesnej przeglądarki ze wsparciem dla **WebGPU**:
- **Google Chrome** (wersja 113+) - Zalecana
- **Microsoft Edge** (wersja 113+)
- **Opera** (najnowsza wersja)

*Funkcje AI wymagają WebGPU. Zalecane jest posiadanie dedykowanej karty graficznej dla płynnego działania modeli AI.*

### System
- **RAM**: Minimum 8 GB (zalecane 16 GB dla większych modeli AI)
- **Procesor**: Nowoczesny CPU z obsługą WebAssembly
- **Karta Graficzna**: Dedykowana GPU zalecana dla WebGPU

## 📦 Instalacja i Uruchomienie

### 1. Sklonuj Repozytorium
```bash
git clone https://github.com/twoj-login/app_stock.git
cd app_stock
```

### 2. Zainstaluj Zależności
```bash
npm install
```

### 3. Uruchom Aplikację

#### Standardowe uruchomienie:
```bash
npm run dev
```

#### Z pobraniem modelu AI (opcjonalne):
Aby pobrać model AI przed uruchomieniem (przydatne przy słabym internecie lub przygotowaniu offline):
```bash
npm run dev:lmm
```

#### Bez modelu AI:
Jeśli chcesz uruchomić aplikację bez funkcji AI:
```bash
npm run dev:nolmm
```

### 4. Otwórz w Przeglądarce
Aplikacja będzie dostępna pod adresem: **`http://localhost:5173`**

## 🧪 Testowanie

### Uruchom wszystkie testy:
```bash
npm test
```

### Uruchom testy z interfejsem graficznym:
```bash
npm run test:ui
```

### Analiza pokrycia kodu testami:
```bash
npm run test:coverage
```

## 🔧 Budowanie Produkcyjne

### Build aplikacji:
```bash
npm run build
```

### Podgląd wersji produkcyjnej:
```bash
npm run preview
```

## 📁 Struktura Projektu

```
app_stock/
├── src/
│   ├── components/         # Komponenty React
│   │   ├── AddTransactionModal.jsx
│   │   ├── AddToWatchlistModal.jsx
│   │   ├── Layout.jsx
│   │   ├── PieChart.jsx
│   │   ├── Sidebar.jsx
│   │   ├── UIComponents.jsx
│   │   └── WebGPUChart.jsx
│   ├── context/           # Context API (AI, Portfolio, Dividends)
│   │   ├── AIContext.jsx
│   │   ├── DividendContext.jsx
│   │   └── PortfolioContext.jsx
│   ├── db/                # Konfiguracja Dexie.js
│   │   └── database.js
│   ├── hooks/             # Custom React hooks
│   │   ├── useAnalytics.js
│   │   ├── useDividends.js
│   │   ├── useExchangeRates.js
│   │   ├── usePortfolio.js
│   │   └── useStockData.js
│   ├── lib/               # Logika biznesowa i serwisy
│   │   ├── AlphaVantageService.js
│   │   ├── CacheService.js
│   │   ├── DividendService.js
│   │   └── ...
│   ├── pages/             # Główne widoki aplikacji
│   │   ├── AI.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Dividends.jsx
│   │   ├── Portfolio.jsx
│   │   ├── Settings.jsx
│   │   ├── Simulator.jsx
│   │   └── Transactions.jsx
│   ├── utils/             # Funkcje pomocnicze
│   │   ├── calculations.js
│   │   ├── formatters.js
│   │   ├── validators.js
│   │   └── ...
│   └── tests/             # Testy jednostkowe
├── public/                # Pliki statyczne
├── scripts/               # Skrypty pomocnicze
│   └── download_model.js
└── package.json
```

## 🎯 Główne Strony Aplikacji

- **📊 Dashboard** - Przegląd wartości portfela, wykres historyczny, podsumowanie YTD
- **💼 Portfel** - Lista wszystkich aktywów z cenami aktualnymi i P/L
- **💰 Dywidendy** - Historia i suma otrzymanych dywidend
- **📝 Transakcje** - Historia wszystkich transakcji (kupno, sprzedaż, depozyty)
- **🎮 Symulator** - Testowanie scenariuszy inwestycyjnych
- **🤖 AI Asystent** - Chat z lokalnym asystentem AI
- **⚙️ Ustawienia** - Wybór modelu AI, konfiguracja API, zarządzanie danymi

## 🔑 Konfiguracja API (Opcjonalna)

Aplikacja działa out-of-the-box z domyślnymi punktami końcowymi API. Jeśli chcesz użyć własnych kluczy API:

1. Utwórz plik `.env.local` w katalogu głównym
2. Dodaj swoje klucze API:
```env
VITE_ALPHA_VANTAGE_API_KEY=your_key_here
```

## 🚀 Najlepsze Praktyki

1. **Regularne Backupy**: Eksportuj dane z ustawień przed dużymi zmianami
2. **Aktualizacje Cen**: Dane są cachoowane - odśwież ręcznie jeśli potrzebujesz najnowszych cen
3. **Modele AI**: Rozpocznij od mniejszych modeli (Gemma 1B) i stopniowo zwiększaj rozmiar
4. **Wydajność**: Zamknij inne karty używające GPU dla lepszej wydajności AI

## 🐛 Znane Problemy i Rozwiązania

### WebGPU niedostępne
- Upewnij się, że używasz Chrome/Edge 113+
- Sprawdź `chrome://gpu` czy WebGPU jest włączone
- Zaktualizuj sterowniki karty graficznej

### Model AI nie ładuje się
- Sprawdź połączenie internetowe (pierwszy download)
- Upewnij się, że masz wystarczająco RAM
- Spróbuj mniejszego modelu w ustawieniach

### Dane nie pobierają się
- Sprawdź czy nie przekroczyłeś limitów API
- Wyczyść cache w ustawieniach
- Sprawdź połączenie internetowe

## 🤝 Wkład w Projekt

Projekt jest otwarty na sugestie i pull requesty. Jeśli znajdziesz błąd lub masz pomysł na ulepszenie:

1. Utwórz Issue z opisem problemu/pomysłu
2. Fork repozytorium
3. Stwórz branch dla swojej funkcji (`git checkout -b feature/AmazingFeature`)
4. Commit zmian (`git commit -m 'Add some AmazingFeature'`)
5. Push do brancha (`git push origin feature/AmazingFeature`)
6. Otwórz Pull Request

## 📝 Licencja

Projekt stworzony w celach edukacyjnych i hobbystycznych.

## ⚠️ Zastrzeżenia

- **Nie jest to porada finansowa**: Aplikacja służy wyłącznie celom edukacyjnym i śledzenia portfela.
- **AI może się mylić**: Zawsze weryfikuj informacje finansowe z wiarygodnych źródeł.
- **Dane API**: Dokładność danych zależy od dostawców zewnętrznych (Yahoo Finance, Alpha Vantage).
- **Bezpieczeństwo**: Dane są przechowywane lokalnie - backupuj regularnie.

## 📧 Kontakt

Jeśli masz pytania lub sugestie, możesz otworzyć Issue na GitHubie.

---

**Zbudowano z ❤️ używając React, WebLLM, i WebGPU**
