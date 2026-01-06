# 🚀 StockTracker

> Local-first portfolio management application with AI assistance

[![Smoke Tests](https://github.com/YOUR_USERNAME/app_stock/actions/workflows/smoke-tests.yml/badge.svg)](https://github.com/YOUR_USERNAME/app_stock/actions/workflows/smoke-tests.yml)

**Wersja:** 1.0.0  
**Status:** ✅ Production Ready

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
- Node.js 18+
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

### GitHub Actions

**On Pull Request:**
- ✅ Smoke tests (Chromium) - ~2 minutes
- ✅ Type checking
- ✅ Build verification

**On Push to Main:**
- ✅ Smoke tests (Chromium) - ~2 minutes
- ✅ Deployment (if configured)

**Browser Coverage:** Chromium (most stable for CI/CD)  
**Artifacts:** Test videos, screenshots, and reports available for 7 days

---

## 🐛 Troubleshooting

### App doesn't load?
- Clear browser cache and IndexedDB
- Check console for errors
- Verify Node.js version (18+)

### Tests fail?
```bash
# Clear Playwright cache
npx playwright install --force

# Reset database
# Delete IndexedDB from browser DevTools
```

### API errors?
- Check network connection
- Verify API endpoints are accessible
- Review rate limits (Yahoo Finance, NBP)

---

## 📝 License

MIT License - feel free to use for personal or commercial projects

---

## 🙏 Acknowledgments

- **Yahoo Finance** - Stock price data
- **NBP API** - Currency exchange rates
- **Alpha Vantage** - Dividend information
- **WebLLM** - Local AI inference

---

## 📧 Support

- 🐛 **Issues:** [GitHub Issues](https://github.com/YOUR_USERNAME/app_stock/issues)
- 📖 **Documentation:** See `docs/` directory
- 💬 **Discussions:** [GitHub Discussions](https://github.com/YOUR_USERNAME/app_stock/discussions)

---

**Built with ❤️ using React + TypeScript + Tailwind**

**Version:** 1.0.0 | **Last Updated:** 2026-01-06
