# Playwright E2E Tests

Ten katalog zawiera testy end-to-end napisane w TypeScript przy użyciu Playwright.

## Struktura testów

Organizuj testy według funkcjonalności aplikacji, na przykład:

```
tests/
├── dashboard.spec.ts      # Testy Dashboard
├── portfolio.spec.ts      # Testy Portfolio 
├── transactions.spec.ts   # Testy transakcji
├── dividends.spec.ts      # Testy dywidend
└── ai.spec.ts             # E2E Testing with Playwright
```

This directory contains end-to-end tests for the StockTracker application.

## 🔥 Smoke Tests

Fast, critical tests that verify basic app functionality. Run after every commit.

**Location:** `smoke.spec.ts`

**Coverage:**
- App loads without errors
- All routes are accessible  
- Navigation works
- Database is accessible
- Critical user paths (deposit cash, buy stock)
- Basic validation

**Run time:** < 1 minute

```bash
# Run smoke tests only
npm run test:e2e tests/smoke.spec.ts

# Run in headed mode
npm run test:e2e:headed tests/smoke.spec.ts

# Run in UI mode
npm run test:e2e:ui tests/smoke.spec.ts
```

## 📁 Structure

```
tests/
├── smoke.spec.ts           # 🔥 Smoke tests (PRIORITY 1)
├── fixtures/
│   ├── database.ts         # Database helpers (reset, seed)
│   └── test-data.ts        # Test data fixtures
└── README.md
```

## Running Tests

```bash
# Run all tests
npm run test:e2e

# Run specific test file
npm run test:e2e tests/smoke.spec.ts

# Run in UI mode (interactive)
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Run in debug mode
npm run test:e2e:debug

# Run on specific browser
npm run test:e2e --project=chromium
npm run test:e2e --project=firefox
npm run test:e2e --project=webkit
```

## 🚀 CI/CD Integration

### GitHub Actions
Smoke tests automatically run on:
- **Pull Requests** - Chromium only (~2 min)
- **Push to Main** - Chromium only (~2 min)

See [.github/workflows/smoke-tests.yml](../.github/workflows/smoke-tests.yml) for configuration.

### Local CI Simulation
```bash
# Simulate CI check (Chromium only)
npm run test:e2e tests/smoke.spec.ts -- --project=chromium
```

## Przykład testu

```typescript
import { test, expect } from '@playwright/test';

test('should display dashboard', async ({ page }) => {
  await page.goto('/');
  
  // Sprawdź czy dashboard się załadował
  await expect(page.locator('h1')).toContainText('Dashboard');
});
```

## Dokumentacja

- [Playwright Docs](https://playwright.dev/docs/intro)
- [Test API](https://playwright.dev/docs/api/class-test)
- [Assertions](https://playwright.dev/docs/test-assertions)
