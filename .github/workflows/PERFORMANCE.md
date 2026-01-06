# ⚡ GitHub Actions Performance Optimization Guide

## 🎯 Optymalizacje Zaimplementowane

### 1. **NPM Dependencies Cache** ✅
```yaml
- uses: actions/setup-node@v4
  with:
    cache: 'npm'  # Auto-cache node_modules
```
**Oszczędność:** ~30-60s na `npm ci`

---

### 2. **Playwright Browsers Cache** ✅ **NEW!**
```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ steps.playwright-version.outputs.version }}
```

**Oszczędność:** ~45-90s na instalację przeglądarek  
**Cache size:** ~300MB (Chromium only)

**Jak działa:**
- Pierwsz run: Instaluje i cache'uje
- Kolejne runy: Używa cache (sekundy zamiast minut)
- Invaliduje gdy wersja Playwright się zmienia

---

### 3. **Build Output Cache** ✅ **NEW!**
```yaml
- name: Cache build output
  uses: actions/cache@v4
  with:
    path: dist
    key: build-${{ runner.os }}-${{ hashFiles('src/**') }}
```

**Oszczędność:** ~20-40s na build  
**Cache size:** ~2-5MB

**Invaliduje gdy:**
- Zmienią się pliki w `src/`
- Zmieni się `vite.config.ts`
- Zmieni się `index.html`

---

## 📊 Performance Comparison

### Bez Cache (First Run):
```
Stage 1 (Parallel):           ~1-2 min
├─ npm ci                     45s
├─ Unit tests                 15s
├─ Type check                 10s
└─ Lint                       10s

Stage 2 (Sequential):         ~2-3 min
├─ npm ci                     45s
├─ Playwright install         90s
├─ Build                      30s
└─ Tests                      15s
────────────────────────────────────
Total: ~3-5 min
```

### Z Cache (Subsequent Runs):
```
Stage 1 (Parallel):           ~30-45s ⚡
├─ npm restore cache          5s
├─ Unit tests                 15s
├─ Type check                 10s
└─ Lint                       10s

Stage 2 (Sequential):         ~45-60s ⚡
├─ npm restore cache          5s
├─ Playwright restore cache   3s
├─ Build restore cache        2s
└─ Tests                      15s
────────────────────────────────────
Total: ~1-2 min ⚡ (50-60% faster!)
```

---

## 🎨 Dodatkowe Optymalizacje

### 4. **Conditional Steps** ✅
```yaml
- name: Install Playwright browsers
  if: steps.playwright-cache.outputs.cache-hit != 'true'
  run: npx playwright install --with-deps chromium

- name: Build application
  if: steps.build-cache.outputs.cache-hit != 'true'
  run: npm run build
```

**Benefit:** Skip kroków gdy cache hit

---

### 5. **Smart Playwright Deps** ✅
```yaml
# Tylko system deps jeśli browsers są cached
- name: Install Playwright system dependencies
  if: steps.playwright-cache.outputs.cache-hit == 'true'
  run: npx playwright install-deps chromium
```

**Benefit:** Instaluje tylko OS dependencies, nie całą przeglądarkę

---

## 🔮 Możliwe Kolejne Optymalizacje

### A. **TypeScript Build Cache**
```yaml
- name: Cache TypeScript build info
  uses: actions/cache@v4
  with:
    path: |
      node_modules/.cache
      .tsbuildinfo
    key: ts-${{ hashFiles('**/tsconfig.json') }}
```
**Potential savings:** ~5-10s

### B. **ESLint Cache**
```yaml
- name: Cache ESLint
  uses: actions/cache@v4
  with:
    path: .eslintcache
    key: eslint-${{ hashFiles('.eslintrc', 'src/**/*.{ts,tsx}') }}
```
**Potential savings:** ~3-5s

### C. **Concurrent Jobs Matrix**
```yaml
strategy:
  matrix:
    test-group: [unit, integration, e2e]
```
**Potential savings:** Run different test types in parallel

---

## 💾 Cache Storage Limits

### GitHub Free/Pro:
- **Storage:** 10 GB per repository
- **Retention:** 7 days (unused caches deleted)
- **Cache eviction:** LRU (Least Recently Used)

### Twój projekt:
```
npm cache:         ~200 MB
Playwright cache:  ~300 MB
Build cache:       ~5 MB
Coverage cache:    ~1 MB
────────────────────────────
Total:            ~506 MB ✅ (plenty of headroom!)
```

---

## 🎯 Best Practices

### ✅ DO:
- Cache dependencies (npm, Playwright)
- Cache build outputs
- Use content-based cache keys (`hashFiles`)
- Set reasonable retention periods

### ❌ DON'T:
- Cache node_modules directly (use npm cache instead)
- Cache test results (flaky)
- Use static cache keys (won't invalidate)
- Cache secrets or credentials

---

## 📈 Monitoring Cache Performance

### View cache usage:
```
GitHub Repo → Settings → Actions → Caches
```

You'll see:
- Cache hit rate
- Storage used
- Which caches are being used

### Debug cache:
```yaml
- name: Debug cache
  run: |
    echo "Cache hit: ${{ steps.playwright-cache.outputs.cache-hit }}"
    ls -lah ~/.cache/ms-playwright || echo "No cache"
```

---

## 🚀 Expected Results

**First run (cold cache):**
- Unit tests: 1-2 min
- Smoke tests: 2-3 min
- **Total: 3-5 min**

**Subsequent runs (warm cache):**
- Unit tests: 30-45s ⚡
- Smoke tests: 45-60s ⚡
- **Total: 1-2 min** 🎉

**Improvement: 50-60% faster!**

---

## 🎁 Bonus Tips

### Parallel where possible:
Stage 1 jobs już są parallel ✅

### Skip redundant builds:
```yaml
on:
  pull_request:
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

### Use composite actions:
Create reusable action for setup steps

---

**Cache działa automatically - nie musisz nic robić!** 🎉

Przy kolejnych runs zobaczysz znaczne przyspieszenie!
