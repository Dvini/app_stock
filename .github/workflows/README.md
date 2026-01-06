# CI/CD Configuration

This directory contains GitHub Actions workflows for automated testing.

## Workflows

### 🔥 [smoke-tests.yml](smoke-tests.yml)

**Purpose:** Fast smoke tests to catch critical failures

**Triggers:**
- **Pull Request** → Runs on Chromium (~2 min)
- **Push to Main** → Runs on Chromium (~2 min)
- **Manual** → Can be triggered from Actions tab

**Browser:** Chromium only (fastest, most stable for CI)

**What it does:**
1. Installs dependencies
2. Builds the app with AI disabled
3. Runs 20 smoke tests covering:
   - Navigation & routing
   - CRUD operations (transactions, watchlist)
   - Portfolio & charts
   - Dividends sync
   - Data management (export/import/reset)
   - Validation

**Success criteria:**
- All 20 tests must pass
- Execution time < 10 minutes
- Artifacts uploaded on failure (videos, screenshots, reports)

---

## Running Locally

```bash
# Simulate PR check (Chromium only)
npm run test:e2e tests/smoke.spec.ts -- --project=chromium

# Simulate Main branch (all browsers)
npm run test:e2e tests/smoke.spec.ts

# Debug mode
npm run test:e2e:debug tests/smoke.spec.ts
```

---

## Viewing Results

### In GitHub:
1. Go to **Actions** tab
2. Click on workflow run
3. View test results and download artifacts

### Artifacts include:
- 📊 HTML test report
- 🎥 Failure videos (.webm)
- 📸 Screenshots (.png)
- 📋 Test traces (for debugging)

---

## Status Badges

Add to README.md:

```markdown
[![Smoke Tests](https://github.com/YOUR_USERNAME/app_stock/actions/workflows/smoke-tests.yml/badge.svg)](https://github.com/YOUR_USERNAME/app_stock/actions/workflows/smoke-tests.yml)
```

---

## Configuration

### Environment Variables
- `VITE_DISABLE_AI=true` - AI features disabled during CI
- `CI=true` - Enables CI-specific behaviors

### Timeouts
- Job timeout: 10 minutes
- Individual test timeout: 30 seconds (from playwright.config.ts)

### Retention
- Test artifacts: 7 days
- Videos/screenshots: 7 days

---

## Troubleshooting

### Tests fail in CI but pass locally?
- Check if AI is disabled (`VITE_DISABLE_AI=true`)
- Verify Node version matches (20+)
- Clear npm cache: `npm ci` instead of `npm install`

### Timeout errors?
- Increase job timeout in workflow file
- Check if dev server starts properly
- Review webkit-specific issues

### Flaky tests?
- Review video recordings in artifacts
- Add `waitForLoadState('networkidle')` 
- Increase timeout for slow operations

---

## Future Enhancements

When adding full E2E suite:

1. Create `e2e-full.yml` for nightly runs
2. Add performance testing workflow
3. Add visual regression testing
4. Add accessibility testing (axe-core)
