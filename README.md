# 📈 Inteligentny Menedżer Portfela (Stock Manager AI)

Aplikacja webowa do zarządzania portfelem inwestycyjnym, wyposażona w **lokalnego asystenta AI** działającego w 100% w przeglądarce. Zapewnia pełną prywatność danych, śledzenie wyników w czasie rzeczywistym i zaawansowane narzędzia analityczne.

![Dashboard Preview](public/dashboard-preview.png) *(Upewnij się, że dodasz zrzut ekranu lub usuń tę linię)*

## 🚀 Główne Funkcje

### 🤖 Lokalny Asystent AI ("StockBot")
- **Prywatność przede wszystkim**: Model AI (Llama/Gemma/Qwen) działa bezpośrednio w Twojej przeglądarce dzięki technologii **WebLLM** i **WebGPU**. Twoje dane finansowe nigdy nie opuszczają Twojego urządzenia.
- **Kontekstowa Analiza**: Asystent ma dostęp do Twojego portfela i historii transakcji, oferując spersonalizowane porady i analizy.
- **Inteligentne Wykresy**: Możliwość generowania wizualizacji danych na żądanie w czacie.

### 📊 Zarządzanie Portfelem
- **Śledzenie Aktywów**: Obsługa akcji, ETF-ów i kryptowalut (dane z Yahoo Finance).
- **Czas Rzeczywisty**: Automatyczne odświeżanie cen i kursów walut (PLN, USD, EUR, GBP).
- **Wielowalutowość**: Automatyczne przeliczanie wartości zagranicznych aktywów na PLN.
- **Historia Transakcji**: Rejestrowanie kupna, sprzedaży i depozytów.

### 🧮 Narzędzia Analityczne
- **Symulator Inwestycyjny**: Testuj scenariusze "co by było gdyby" przed podjęciem decyzji (kupno/sprzedaż/uśrednianie).
- **Zaawansowane Wykresy**: Interaktywne wykresy historii cen i wartości portfela wykorzystujące akcelerację GPU.
- **Polska Lokalizacja**: Pełne wsparcie dla polskich formatów liczbowych (np. `1 234,56 zł`) i interfejsu.

### 🔒 Bezpieczeństwo Danych
- **IndexedDB (Dexie.js)**: Wszystkie dane (transakcje, ustawienia) są przechowywane lokalnie w przeglądarce.
- **Brak Logowania**: Aplikacja nie wymaga zakładania konta ani zewnętrznych serwerów bazodanowych.

## 🛠️ Stack Technologiczny

- **Frontend**: React 18, Vite
- **Styling**: TailwindCSS, Lucide React (ikony)
- **AI & Compute**: WebLLM, WebGPU
- **Baza Danych**: Dexie.js (IndexedDB wrapper)
- **Wykresy**: Recharts / WebGPU Canvas
- **Dane Rynkowe**: Yahoo Finance API (przez proxy)

## ⚙️ Wymagania

Aplikacja wymaga nowoczesnej przeglądarki ze wsparciem dla **WebGPU**:
- **Google Chrome** (wersja 113+)
- **Microsoft Edge**
- *Zalecane jest posiadanie dedykowanej karty graficznej dla płynnego działania modeli AI.*

## 📦 Instalacja i Uruchomienie

1.  **Sklonuj repozytorium:**
    ```bash
    git clone https://github.com/twoj-login/app_stock.git
    cd app_stock
    ```

2.  **Zainstaluj zależności:**
    ```bash
    npm install
    ```

3.  **Uruchom wersję deweloperską:**
    
    Standardowe uruchomienie:
    ```bash
    npm run dev
    ```

    **Opcjonalnie (z pobraniem modelu lokalnego):**
    Aby pobrać model AI przed uruchomieniem (przydatne przy słabym internecie lub przygotowaniu offline):
    ```bash
    npm run dev:lmm
    ```

4.  **Otwórz w przeglądarce:**
    Aplikacja będzie dostępna pod adresem `http://localhost:5173`.

---

*Projekt stworzony w celach edukacyjnych i hobbystycznych. Pamiętaj, że asystent AI może popełniać błędy – zawsze weryfikuj informacje finansowe.*
