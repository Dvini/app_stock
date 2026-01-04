# StockTracker API Reference

Complete API documentation for all services and utilities.

---

## Table of Contents

1. [Services](#services)
   - [ApiService](#apiservice)
   - [DividendService](#dividendservice)
   - [NBPService](#nbpservice)
   - [CacheService](#cacheservice)
   - [AlphaVantageService](#alphaventageservice)
   - [StooqService](#stooqservice)
2. [Hooks](#hooks)
   - [usePortfolio](#useportfolio)
   - [useDividends](#usedividends)
   - [usePrices](#useprices)
   - [useAssets](#useassets)
3. [Utilities](#utilities)
   - [Formatters](#formatters)
   - [Calculations](#calculations)
   - [Validators](#validators)
   - [Currency Helpers](#currency-helpers)

---

## Services

### ApiService

**File:** [`src/lib/ApiService.ts`](/src/lib/ApiService.ts)

**Purpose:** Primary service for fetching stock prices and historical data from Yahoo Finance.

#### Methods

##### `fetchStockPrice(ticker: string): Promise<number | null>`

Fetch current stock price.

**Parameters:**
- `ticker` (string) - Stock symbol (e.g., "AAPL", "TSLA.WA")

**Returns:** Current price in USD or null if unavailable

**Caching:** 30 minutes

**Example:**
```typescript
const price = await apiService.fetchStockPrice('AAPL');
console.log(`AAPL: $${price}`);
```

---

##### `fetchHistoricalData(ticker: string, interval: string): Promise<HistoricalDataPoint[]>`

Fetch historical price data.

**Parameters:**
- `ticker` (string) - Stock symbol
- `interval` (string) - One of: '1d', '1w', '1mo', '3mo', '1y', 'max'

**Returns:** Array of `{date: string, price: number}`

**Caching:** 24 hours

**Example:**
```typescript
const data = await apiService.fetchHistoricalData('TSLA', '1mo');
data.forEach(point => {
  console.log(`${point.date}: $${point.price}`);
});
```

---

##### `fetchDividends(ticker: string): Promise<DividendData[]>`

Fetch dividend history from Yahoo Finance.

**Parameters:**
- `ticker` (string) - Stock symbol

**Returns:** Array of `{exDate: string, amount: number, currency: string}`

**Example:**
```typescript
const dividends = await apiService.fetchDividends('MSFT');
```

---

### DividendService

**File:** [`src/lib/DividendService.ts`](/src/lib/DividendService.ts)

**Purpose:** Comprehensive dividend management with multi-source API fallback.

#### Methods

##### `syncDividendsFromAPI(): Promise<{added: number, skipped: number}>`

Synchronize dividends from external APIs with intelligent fallback.

**Fallback Chain:**
1. Alpha Vantage
2. Yahoo Finance
3. Stooq (for .WA stocks only)

**Returns:** Object with count of added and skipped dividends

**Example:**
```typescript
const result = await dividendService.syncDividendsFromAPI();
console.log(`Added ${result.added}, Skipped ${result.skipped}`);
```

---

##### `calculateReceivedDividends(): Promise<ProcessedDividend[]>`

Calculate dividends received based on transaction history.

**Returns:** Array of dividends with shares owned on record date

**Example:**
```typescript
const received = await dividendService.calculateReceivedDividends();
received.forEach(div => {
  console.log(`${div.ticker}: ${div.valuePLN} PLN`);
});
```

---

##### `calculateYTDTotal(): Promise<number>`

Calculate year-to-date dividend total in PLN.

**Returns:** Total YTD dividends

**Example:**
```typescript
const ytd = await dividendService.calculateYTDTotal();
console.log(`YTD Dividends: ${ytd} PLN`);
```

---

##### `calculateYieldOnCost(): Promise<number>`

Calculate Yield on Cost percentage.

**Formula:** `(Annual Dividends / Total Cost Basis) * 100`

**Returns:** YoC percentage

**Example:**
```typescript
const yoc = await dividendService.calculateYieldOnCost();
console.log(`YoC: ${yoc.toFixed(2)}%`);
```

---

##### `calculateMonthlyAverage(): Promise<number>`

Calculate average monthly dividend (trailing 12 months).

**Returns:** Monthly average in PLN

**Example:**
```typescript
const monthly = await dividendService.calculateMonthlyAverage();
console.log(`Monthly Average: ${monthly} PLN`);
```

---

##### `addDividend(data: DividendData): Promise<number>`

Manually add dividend to database.

**Parameters:**
- `data.ticker` (string) - Stock symbol
- `data.recordDate` (string) - Ex-dividend date
- `data.paymentDate` (string) - Payment date
- `data.amountPerShare` (number) - Amount per share
- `data.currency` (string, optional) - Currency (default: USD)
- `data.status` (string, optional) - Status (default: received)

**Returns:** Database ID of created dividend

**Example:**
```typescript
const id = await dividendService.addDividend({
  ticker: 'AAPL',
  recordDate: '2024-02-09',
  paymentDate: '2024-02-16',
  amountPerShare: 0.24,
  currency: 'USD'
});
```

---

### NBPService

**File:** [`src/lib/NBPService.ts`](/src/lib/NBPService.ts)

**Purpose:** Fetch Polish exchange rates from NBP (National Bank of Poland).

#### Methods

##### `getHistoricalRate(currency: string, date: string): Promise<{rate: number, date: string} | null>`

Fetch historical exchange rate for a specific date.

**Parameters:**
- `currency` (string) - Currency code (USD, EUR, GBP, etc.)
- `date` (string) - ISO date string (YYYY-MM-DD)

**Returns:** Exchange rate object or null

**Caching:** Permanent (rates are immutable)

**Example:**
```typescript
const rate = await nbpService.getHistoricalRate('USD', '2024-01-15');
console.log(`USD/PLN on 2024-01-15: ${rate.rate}`);
```

---

##### `getCurrentRate(currency: string): Promise<number | null>`

Fetch latest exchange rate.

**Parameters:**
- `currency` (string) - Currency code

**Returns:** Current rate or null

**Example:**
```typescript
const rate = await nbpService.getCurrentRate('EUR');
console.log(`Current EUR/PLN: ${rate}`);
```

---

### CacheService

**File:** [`src/lib/CacheService.ts`](/src/lib/CacheService.ts)

**Purpose:** Local storage caching with automatic expiration.

#### Methods

##### `get<T>(key: string): T | null`

Retrieve cached data if not expired.

**Parameters:**
- `key` (string) - Cache key

**Returns:** Cached data or null if expired/missing

**Example:**
```typescript
const price = cacheService.get<number>('price_AAPL');
if (price) {
  console.log(`Cached: ${price}`);
}
```

---

##### `set<T>(key: string, data: T, ttlMs: number): void`

Store data with TTL (time to live).

**Parameters:**
- `key` (string) - Cache key
- `data` (T) - Data to cache
- `ttlMs` (number) - Time to live in milliseconds

**Example:**
```typescript
const THIRTY_MINUTES = 30 * 60 * 1000;
cacheService.set('price_AAPL', 150.25, THIRTY_MINUTES);
```

---

##### `invalidate(pattern?: string): void`

Clear cache entries matching pattern.

**Parameters:**
- `pattern` (string, optional) - Pattern to match (e.g., 'price_*')

**Example:**
```typescript
// Clear all price cache
cacheService.invalidate('price_');

// Clear all cache
cacheService.invalidate();
```

---

## Hooks

### usePortfolio

**File:** [`src/hooks/usePortfolio.ts`](/src/hooks/usePortfolio.ts)

**Purpose:** Central portfolio state management and calculations.

#### Return Value

```typescript
interface UsePortfolioReturn {
  // State
  assets: Asset[];
  cashBalances: Cash[];
  transactions: Transaction[];
  
  // Calculated Values
  totalValuePLN: number;
  totalInvestedPLN: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  
  // Breakdowns
  currencyBreakdown: {
    [currency: string]: {
      value: number;
      invested: number;
      profitLoss: number;
    }
  };
  
  // Loading State
  isLoading: boolean;
  error: string | null;
  
  // Actions
  addTransaction: (tx: Transaction) => Promise<void>;
  deleteTransaction: (id: number) => Promise<void>;
}
```

#### Usage Example

```typescript
function Portfolio() {
  const {
    assets,
    totalValuePLN,
    totalProfitLoss,
    addTransaction
  } = usePortfolio();
  
  return (
    <div>
      <h1>Portfolio Value: {totalValuePLN} PLN</h1>
      <p>P/L: {totalProfitLoss} PLN</p>
      
      {assets.map(asset => (
        <div key={asset.ticker}>{asset.ticker}</div>
      ))}
    </div>
  );
}
```

---

### useDividends

**File:** [`src/hooks/useDividends.ts`](/src/hooks/useDividends.ts)

**Purpose:** Dividend data and statistics.

#### Return Value

```typescript
interface UseDividendsReturn {
  // Statistics
  ytdTotal: number;
  upcoming60Days: number;
  yieldOnCost: number;
  monthlyAverage: number;
  
  // Tables
  calendar: Dividend[];        // Upcoming (next 60 days)
  received: Dividend[];        // Historical
  
  // Actions
  addDividend: (data: Partial<Dividend>) => Promise<void>;
  deleteDividend: (id: number) => Promise<void>;
  syncDividendsManually: () => Promise<{added: number, skipped: number}>;
  
  // Loading State
  isLoading: boolean;
  error: string | null;
}
```

#### Usage Example

```typescript
function Dividends() {
  const {
    ytdTotal,
    yieldOnCost,
    received,
    syncDividendsManually
  } = useDividends();
  
  const handleRefresh = async () => {
    const result = await syncDividendsManually();
    alert(`Synced ${result.added} dividends`);
  };
  
  return (
    <div>
      <h2>YTD: {ytdTotal} PLN</h2>
      <p>YoC: {yieldOnCost}%</p>
      <button onClick={handleRefresh}>Refresh</button>
    </div>
  );
}
```

---

### usePrices

**File:** [`src/hooks/usePrices.ts`](/src/hooks/usePrices.ts)

**Purpose:** Real-time stock price fetching for multiple tickers.

#### Return Value

```typescript
interface UsePricesReturn {
  prices: Map<string, number>;   // ticker -> price
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

#### Usage Example

```typescript
function StockList({ tickers }: { tickers: string[] }) {
  const { prices, loading } = usePrices(tickers);
  
  if (loading) return <div>Loading prices...</div>;
  
  return (
    <ul>
      {tickers.map(ticker => (
        <li key={ticker}>
          {ticker}: ${prices.get(ticker) || 'N/A'}
        </li>
      ))}
    </ul>
  );
}
```

---

## Utilities

### Formatters

**File:** [`src/utils/formatters.ts`](/src/utils/formatters.ts)

#### `formatNumber(value: number, minDecimals?: number, maxDecimals?: number): string`

Format number with Polish locale (space as thousand separator).

**Example:**
```typescript
formatNumber(1234.56);        // "1 234.56"
formatNumber(0.123456, 2, 4); // "0.1235"
```

---

#### `formatCurrency(value: number, currency: string): string`

Format currency value.

**Example:**
```typescript
formatCurrency(1234.56, 'USD'); // "1 234.56 USD"
formatCurrency(5000, 'PLN');    // "5 000 PLN"
```

---

#### `formatPercent(value: number): string`

Format percentage.

**Example:**
```typescript
formatPercent(12.3456); // "12.35%"
formatPercent(-5.6);    // "-5.60%"
```

---

### Calculations

**File:** [`src/utils/calculations.ts`](/src/utils/calculations.ts)

#### `calculateProfitLoss(current: number, invested: number): {amount: number, percent: number}`

Calculate profit/loss.

**Example:**
```typescript
const pl = calculateProfitLoss(1500, 1000);
// { amount: 500, percent: 50 }
```

---

#### `calculateAverage(values: number[]): number`

Calculate arithmetic mean.

**Example:**
```typescript
calculateAverage([10, 20, 30]); // 20
```

---

### Validators

**File:** [`src/utils/validators.ts`](/src/utils/validators.ts)

#### `isValidTicker(ticker: string): boolean`

Validate stock ticker format.

**Example:**
```typescript
isValidTicker('AAPL');      // true
isValidTicker('TSLA.WA');   // true
isValidTicker('invalid$');  // false
```

---

#### `isValidDate(dateStr: string): boolean`

Validate ISO date string.

**Example:**
```typescript
isValidDate('2024-01-15'); // true
isValidDate('invalid');    // false
```

---

#### `isValidAmount(amount: number): boolean`

Validate positive number.

**Example:**
```typescript
isValidAmount(10);   // true
isValidAmount(-5);   // false
isValidAmount(0);    // true
```

---

### Currency Helpers

**File:** [`src/utils/currencyHelpers.ts`](/src/utils/currencyHelpers.ts)

#### `convertCurrency(amount: number, rate: number): number`

Convert currency using exchange rate.

**Example:**
```typescript
convertCurrency(100, 4.05); // 405 (100 USD to PLN)
```

---

#### `getCurrencySymbol(currency: string): string`

Get currency symbol.

**Example:**
```typescript
getCurrencySymbol('USD'); // "$"
getCurrencySymbol('EUR'); // "€"
getCurrencySymbol('PLN'); // "zł"
```

---

## Error Handling

All services follow a consistent error handling pattern:

```typescript
try {
  const result = await service.method();
  return result;
} catch (error) {
  console.error('[ServiceName] Error:', error);
  // Return safe fallback (null, [], 0, etc.)
  return null;
}
```

**User-facing errors** are handled via:
- Toast notifications (using Sonner)
- Error boundaries (React Error Boundary)
- Error state in hooks

---

## Caching Strategy

| API Call | Cache Location | TTL | Invalidation |
|----------|---------------|-----|--------------|
| Stock Prices | localStorage | 30 min | Manual or expiry |
| Historical Data | localStorage | 24 hours | Manual or expiry |
| Exchange Rates | IndexedDB | Permanent | Never (immutable) |
| Dividends | IndexedDB | Permanent | Manual refresh only |

---

**API Reference Version:** 1.0.0  
**Last Updated:** 2026-01-04
