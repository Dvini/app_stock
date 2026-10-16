# StockTracker

Prywatna aplikacja do śledzenia portfela akcji (konta PLN: standardowe, IKE, IKZE). Dane trzymane lokalnie w IndexedDB przeglądarki — kopię zapasową robisz ręcznie (Ustawienia → Eksport JSON).

## Uruchomienie

```bash
npm install
npm run dev        # http://localhost:5173
```

Ceny (Yahoo, Stooq) idą przez proxy Vite, więc aplikacja działa przez `npm run dev` lub `npm run build && npm run preview`, a nie jako statyczne pliki z `dist/`.

## Konfiguracja

Opcjonalny plik `.env.local`:

```bash
# Darmowy klucz: https://www.alphavantage.co/support/#api-key
# Bez niego synchronizacja dywidend z AlphaVantage działa tylko dla IBM (klucz "demo").
VITE_ALPHA_VANTAGE_API_KEY=twoj_klucz
```

## Komendy

```bash
npm run typecheck
npm run lint
npm run test          # Vitest (unit)
npm run test:e2e      # Playwright (smoke)
```
