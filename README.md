# 🚀 StockTracker

> Local-first portfolio management application with AI assistance

---

## 🎯 Kluczowe Funkcje

✅ **Śledzenie portfela akcji, ETF i kryptowalut**  
✅ **Automatyczne pobieranie cen w czasie rzeczywistym**  
✅ **Zarządzanie dywidendami z prognozą wypłat**  
✅ **Obsługa wielu walut** (PLN, USD, EUR, GBP, JPY, CHF, CNY)  
✅ **Wykresy historyczne** powered by WebGPU  
✅ **Asystent AI** do analizy portfela (opcjonalnie)  
✅ **100% prywatność** - brak kont, brak śledzenia

---

## 🚀 Quick Start

```bash
# 1. Instalacja
npm install

# 2. Uruchomienie (dev)
npm run dev

# 3. Otwórz przeglądarkę
http://localhost:5173
```

---

## 📁 Struktura Projektu

```
app_stock/
├── src/
│   ├── pages/          # Główne strony (Dashboard, Portfolio, etc.)
│   ├── components/     # Komponenty React
│   ├── services/       # API services (Yahoo Finance, NBP, etc.)
│   ├── hooks/          # Custom React hooks
│   └── lib/            # Utilities i helpery
├── tests/
│   ├── smoke.spec.ts   # 🔥 Smoke tests (20 testów)
│   └── fixtures/       # Test data helpers
├── docs/               # Dokumentacja
└── .github/workflows/  # CI/CD (GitHub Actions)
```

---

## 🛠️ Tech Stack

| Kategoria | Technology |
|-----------|-----------|
| **Frontend** | React 18 + TypeScript |
| **Styling** | Tailwind CSS |
| **Database** | IndexedDB (Dexie.js) |
| **Charts** | Recharts |
| **AI** | WebLLM (local inference) |
| **Testing** | Playwright E2E |
| **Build** | Vite |

---

## 📚 Dokumentacja

- 📖 **[User Manual](USER_MANUAL.md)** - Kompletna instrukcja użytkownika
- 🏗️ **[Technical Documentation](DOCUMENTATION.md)** - Architektura i procesy
- 📡 **[API Reference](API_REFERENCE.md)** - Dokumentacja API i hooków
- 🔄 **[Process Flows](PROCESS_FLOWS.md)** - Diagramy procesów biznesowych
- 🧪 **[Test Plan](tests/README.md)** - Strategia testowania

---

## 🧪 Testing

### Unit Tests (Vitest)
```bash
# Run unit tests
npm run test

# Watch mode (auto-rerun on changes)
npm run test

# UI mode (interactive)
npm run test:ui

# Coverage report
npm run test:coverage
```

**Test files:**
- `src/lib/*.test.js` - Service tests
- `src/utils/*.test.js` - Utility function tests

### Smoke Tests (Fast - CI/CD)
```bash
# Run smoke tests (20 tests, ~15 seconds)
npm run test:e2e tests/smoke.spec.ts

# UI mode (interactive)
npm run test:e2e:ui tests/smoke.spec.ts

# Debug mode
npm run test:e2e:debug tests/smoke.spec.ts
```

### Coverage
| Category | Tests | Status |
|----------|-------|--------|
| Navigation | 6 | ✅ 100% |
| Transactions | 4 | ✅ 100% |
| Watchlist | 2 | ✅ 100% |
| Charts | 8 | ✅ 100% |
| Data Management | 3 | ✅ 100% |
| Validation | 2 | ✅ 100% |

**Total:** 20 smoke tests × 3 browsers = **60 tests**

---

## 🔧 Development

```bash
# Development server
npm run dev

# Type checking
npm run typecheck

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm run test:e2e
```

---

## 🌐 Deployment

### Prerequisites
- Node.js 20+
- Modern browser (Chrome 90+, Firefox 88+, Safari 14+)

### Environment Variables
```bash
# Optional: Disable AI features
VITE_DISABLE_AI=true

# API Keys (optional - uses free tier by default)
VITE_ALPHA_VANTAGE_KEY=your_key_here
```

### Build & Deploy
```bash
# Build
npm run build

# Output: dist/
# Deploy dist/ to any static hosting (Vercel, Netlify, GitHub Pages)
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

**Note:** All PRs must pass smoke tests (automated via GitHub Actions)

---

## 📊 CI/CD

### GitHub Actions - Sequential Pipeline

**Pipeline Flow:**
```
Stage 1 (Parallel):          Stage 2 (Sequential):
├─ Unit Tests (1 min)        
├─ Type Check (30s)   ────→  Smoke Tests (2 min)
└─ Lint (30s)                     ↓
     ↓                        ✅ Ready to Merge
  ✅ ALL PASS?
```

**On Pull Request:**
1. ⚡ Fast checks run in parallel (~1 min)
   - Unit tests (Vitest)
   - Type checking (TypeScript)
   - Linting (ESLint + Prettier)
2. 🔥 Smoke tests (only if step 1 passes)
   - E2E tests (Playwright Chromium)
   - Build verification

**On Push to Main:**
- Same pipeline as PR
- Optional deployment trigger

**Key Benefits:**
- ⚡ Fast fail in ~1 min (if unit tests fail)
- 💰 Saves compute (skips E2E if quick checks fail)
- ✅ Full validation in ~3 min if all pass

**Artifacts:** Coverage reports, test videos, screenshots (7 days)

---

## 🐛 Troubleshooting

### App doesn't load?
- Clear browser cache and IndexedDB
- Check console for errors
- Verify Node.js version (20+)

### Tests fail?
```bash
# Clear Playwright cache
npx playwright install --force

# Reset database
# Delete IndexedDB from browser DevTools
```
**Built with AI assistance using React + TypeScript + Tailwind**
