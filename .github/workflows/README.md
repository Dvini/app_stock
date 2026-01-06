# CI/CD Configuration

This directory contains GitHub Actions workflows for automated testing.

## Active Workflow

### 🚀 [ci.yml](ci.yml)

**Comprehensive CI pipeline with sequential stages**

**Triggers:**
- **Pull Request** → Full pipeline
- **Push to Main** → Full pipeline
- **Manual** → Can be triggered from Actions tab

**Pipeline Stages:**

#### Stage 1: Fast Checks (Parallel - ~1 min)
1. **Unit Tests** - Vitest with coverage
2. **Type Check** - TypeScript validation
3. **Lint & Format** - ESLint + Prettier

#### Stage 2: Smoke Tests (~2 min)
**Only runs if Stage 1 passes** ✅
- E2E tests with Playwright (Chromium)
- Build verification
- Critical path testing

#### Stage 3: Status Summary
- Final status check
- Ready to merge indicator

**Total Time:**
- ⚡ Fast fail: ~1 min (if Stage 1 fails)
- ✅ Full pass: ~3 min (both stages)

**Key Feature:** `needs: [unit-tests, typecheck, lint]` prevents expensive E2E tests from running if quick checks fail.

---

## Strategy

See [STRATEGY.md](STRATEGY.md) for detailed explanation of the sequential pipeline approach.

**Benefits:**
- ⚡ Fast feedback (fails in 1 min instead of 2 min)
- 💰 Cost savings (skip E2E if unit tests fail)
- 🎯 Logical flow (quick → slow checks)

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
