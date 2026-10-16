import { cacheService } from './CacheService';
import type { CurrencyCode } from '../types/database';
import type { Ticker } from './tickers';
import { toLocalISODate } from '../utils/dates';
import { logger } from '../utils/logger';

interface ApiServiceOptions {
    baseUrl?: string;
    cacheDuration?: number;
    maxRetries?: number;
}

interface PriceData {
    price: number;
    currency: CurrencyCode;
}

interface HistoryDataPoint {
    timestamp: number;
    price: number;
    date: string;
}

interface HistoryData {
    data: HistoryDataPoint[];
    currency: CurrencyCode;
}

interface RateData {
    rate: number;
    date: string;
    from: CurrencyCode;
    to: CurrencyCode;
}

interface DividendRecord {
    exDate: string;
    amount: number;
    currency: string;
}

/**
 * API Service for fetching stock data from Yahoo Finance
 * Implements caching, retry logic, and error handling
 */
class ApiService {
    private baseUrl: string;
    private cacheDuration: number;
    private maxRetries: number;

    /**
     * Create a new ApiService instance
     */
    constructor(options: ApiServiceOptions = {}) {
        this.baseUrl = options.baseUrl || 'https://query1.finance.yahoo.com/v8/finance/chart/';
        this.cacheDuration = options.cacheDuration || 15 * 60 * 1000; // 15 minutes
        this.maxRetries = options.maxRetries || 2;
    }

    /**
     * Fetch a Yahoo Finance URL through the local Vite proxy (/api/yahoo), retrying with backoff.
     * The app is meant to run via `npm run dev` / `npm run preview`, so no third-party CORS proxies are used.
     */
    async fetchWithBackup(url: string, retryCount: number = 0): Promise<Response> {
        const localUrl = url.replace(/^https:\/\/query[12]\.finance\.yahoo\.com/, '/api/yahoo');

        try {
            const response = await fetch(localUrl);
            if (response.ok) return response;
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            if (retryCount < this.maxRetries) {
                logger.warn(`[ApiService] Fetch failed (${errorMessage}), retry ${retryCount + 1}/${this.maxRetries}`);
                await this._wait(1000 * Math.pow(2, retryCount));
                return this.fetchWithBackup(url, retryCount + 1);
            }

            throw new Error(`Failed to fetch after ${this.maxRetries} retries: ${errorMessage}`);
        }
    }

    /**
     * Wait for specified milliseconds
     */
    private _wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get current price for a ticker
     */
    async getCurrentPrice(ticker: string): Promise<PriceData | null> {
        const cacheKey = `price_${ticker}`;

        // 1. Check cache - use 2 minutes for live prices to match 1D chart responsiveness
        const cached = cacheService.get<PriceData>(cacheKey, 2 * 60 * 1000);
        if (cached) {
            logger.debug(`[ApiService] Using cached price for ${ticker}`);
            return cached;
        }

        // 2. Fetch from API
        try {
            // Use 5m interval to ensure we get intraday data (matching chart behavior)
            // Add timestamp to bypass proxy/browser cache
            const targetUrl = `${this.baseUrl}${ticker}?range=1d&interval=5m&nocache=${Date.now()}`;
            const response = await this.fetchWithBackup(targetUrl);
            const data = await response.json();

            if (!data?.chart?.result?.[0]) {
                logger.warn(`[ApiService] No chart data for ${ticker}`);
                return null;
            }

            const result = data.chart.result[0];
            let price = result.meta?.regularMarketPrice;
            let currency = result.meta?.currency || 'PLN';

            // Fallback to close prices if regularMarketPrice is not available
            if (!price && result.indicators?.quote?.[0]?.close) {
                const closes = result.indicators.quote[0].close;
                for (let i = closes.length - 1; i >= 0; i--) {
                    if (closes[i]) {
                        price = closes[i];
                        break;
                    }
                }
            }

            if (price) {
                const priceData: PriceData = { price, currency };

                // 3. Cache the result for 2 minutes
                cacheService.set(cacheKey, priceData, { ttl: 2 * 60 * 1000 });

                logger.debug(`[ApiService] Fetched price for ${ticker}: ${price} ${currency}`);
                return priceData;
            }

            logger.warn(`[ApiService] No price data found for ${ticker}`);
            return null;
        } catch (error) {
            logger.error(`[ApiService] Failed to fetch price for ${ticker}:`, error);
            return null;
        }
    }

    /**
     * Search for tickers using Yahoo Finance Search API
     */
    async search(query: string): Promise<Ticker[]> {
        if (!query || query.length < 2) return [];

        const cacheKey = `search_${query.toUpperCase()}`;
        const cached = cacheService.get<Ticker[]>(cacheKey, 24 * 60 * 60 * 1000); // 24 hours cache
        if (cached) {
            logger.debug(`[ApiService] Using cached search results for ${query}`);
            return cached;
        }

        try {
            // Yahoo Finance Search API
            const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`;
            const response = await this.fetchWithBackup(url);
            const data = await response.json();

            if (!data.quotes || !Array.isArray(data.quotes)) {
                return [];
            }

            const results: Ticker[] = data.quotes
                .filter(
                    (q: Record<string, string>) =>
                        q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'INDEX'
                )
                .map((q: Record<string, string>) => ({
                    symbol: q.symbol,
                    name: q.shortname || q.longname || q.symbol,
                    region: q.exchDisp || q.exchange || 'Unknown'
                }));

            // Cache results
            cacheService.set(cacheKey, results, { ttl: 24 * 60 * 60 * 1000 });

            logger.debug(`[ApiService] Found ${results.length} results for ${query}`);
            return results;
        } catch (error) {
            logger.error(`[ApiService] Search failed for ${query}:`, error);
            return [];
        }
    }

    /**
     * Get exchange rates for multiple currencies
     */
    async getExchangeRates(currencies: string[], targetCurrency: string = 'PLN'): Promise<Record<string, number>> {
        const uniqueCurrencies = currencies.filter(c => c && c !== targetCurrency);
        if (uniqueCurrencies.length === 0) return {};

        const rates: Record<string, number> = {};
        const missingPairs: Array<{ currency: string; pair: string }> = [];

        // 1. Check cache for each currency
        for (const currency of uniqueCurrencies) {
            const cacheKey = `rate_${currency}${targetCurrency}`;
            const cached = cacheService.get<number>(cacheKey, this.cacheDuration);

            if (cached) {
                rates[currency] = cached;
            } else {
                missingPairs.push({ currency, pair: `${currency}${targetCurrency}=X` });
            }
        }

        if (missingPairs.length === 0) {
            logger.debug(`[ApiService] Using cached rates for all currencies`);
            return rates;
        }

        // 2. Fetch missing rates in parallel
        try {
            const promises = missingPairs.map(async ({ currency, pair }) => {
                try {
                    // Use 5m interval and nocache for currency pairs as well
                    const targetUrl = `${this.baseUrl}${pair}?range=1d&interval=5m&nocache=${Date.now()}`;
                    const response = await this.fetchWithBackup(targetUrl);
                    const data = await response.json();
                    const result = data.chart.result[0];

                    let rate = result.meta.regularMarketPrice;

                    // Fallback to close prices if regularMarketPrice is not available (common for currency pairs)
                    if (!rate && result.indicators?.quote?.[0]?.close) {
                        const closes = result.indicators.quote[0].close;
                        for (let i = closes.length - 1; i >= 0; i--) {
                            if (closes[i]) {
                                rate = closes[i];
                                break;
                            }
                        }
                    }

                    if (rate) {
                        return { currency, rate };
                    }

                    logger.warn(`[ApiService] No rate data found for ${pair}`);
                    return null;
                } catch (error) {
                    logger.error(`[ApiService] Failed to fetch rate for ${pair}:`, error);
                    return null;
                }
            });

            const results = await Promise.all(promises);

            // 3. Cache results
            results.forEach(result => {
                if (result && result.rate) {
                    rates[result.currency] = result.rate;
                    const cacheKey = `rate_${result.currency}${targetCurrency}`;
                    cacheService.set(cacheKey, result.rate, { ttl: this.cacheDuration });
                }
            });

            logger.debug(`[ApiService] Fetched ${results.filter(r => r).length} exchange rates`);
            return rates;
        } catch (error) {
            logger.error('[ApiService] Failed to fetch exchange rates:', error);
            return rates; // Return whatever we have cached
        }
    }

    /**
     * Get historical price data for charting
     */
    async getHistory(ticker: string, range: string = '1mo', interval: string = '1d'): Promise<HistoryData | null> {
        // Don't cache very long ranges - they're too large and overflow localStorage
        const shouldCache = !['5y', '10y', 'max'].includes(range);
        const cacheKey = `history_${ticker}_${range}_${interval}`;

        // Shorter cache for intraday data (2 min for 1D, 5 min for 5D)
        const cacheDuration = range === '1d' ? 2 * 60 * 1000 : range === '5d' ? 5 * 60 * 1000 : this.cacheDuration;

        // 1. Check cache (only for reasonable ranges)
        if (shouldCache) {
            const cached = cacheService.get<HistoryData>(cacheKey, cacheDuration);
            if (cached) {
                logger.debug(`[ApiService] Using cached history for ${ticker} (${range}, ${interval})`);
                return cached;
            }
        }

        // 2. Fetch from API
        try {
            const targetUrl = `${this.baseUrl}${ticker}?range=${range}&interval=${interval}`;
            const response = await this.fetchWithBackup(targetUrl);
            const data = await response.json();

            const result = data.chart.result[0];
            const timestamps = result.timestamp;
            const quotes = result.indicators?.quote?.[0];

            if (!timestamps || !quotes || !quotes.close) {
                logger.warn(`[ApiService] No history data found for ${ticker}`);
                return null;
            }

            // Clean and format data
            // Yahoo Finance already provides timestamps at market close for daily intervals
            // For intraday intervals (5m, 15m), timestamps are exact
            const cleanData: HistoryDataPoint[] = timestamps
                .map((t: number, i: number) => {
                    const date = toLocalISODate(new Date(t * 1000));
                    return {
                        timestamp: t,
                        price: quotes.close[i],
                        date
                    };
                })
                .filter((item: HistoryDataPoint) => item.price !== null && item.price !== undefined);

            const currency = result.meta.currency || 'PLN';
            const historyData: HistoryData = { data: cleanData, currency: currency as CurrencyCode };

            // 3. Cache the result (only for reasonable ranges to avoid localStorage overflow)
            if (shouldCache) {
                cacheService.set(cacheKey, historyData, { ttl: cacheDuration });
            } else {
                logger.debug(`[ApiService] Skipping cache for ${ticker} (${range}) - range too large`);
            }

            logger.debug(`[ApiService] Fetched ${cleanData.length} history points for ${ticker}`);
            return historyData;
        } catch (error) {
            logger.error(`[ApiService] Failed to fetch history for ${ticker}:`, error);
            return null;
        }
    }

    /**
     * Get historical exchange rate for a specific date
     */
    async getHistoricalRate(currency: string, dateStr: string): Promise<RateData | null> {
        const cacheKey = `rate_history_${currency}PLN_${dateStr}`;

        // 1. Check cache (historical rates don't expire)
        const cached = cacheService.get<RateData>(cacheKey);
        if (cached) {
            logger.debug(`[ApiService] Using cached historical rate for ${currency} on ${dateStr}`);
            return cached;
        }

        // 2. Calculate timestamp range
        const dateObj = new Date(dateStr);
        const startTimestamp = Math.floor(dateObj.getTime() / 1000);
        const endTimestamp = startTimestamp + 4 * 24 * 60 * 60; // +4 days buffer for weekends

        const pair = `${currency}PLN=X`;

        // 3. Fetch from API
        try {
            const targetUrl = `${this.baseUrl}${pair}?period1=${startTimestamp}&period2=${endTimestamp}&interval=1d`;
            const response = await this.fetchWithBackup(targetUrl);
            const data = await response.json();

            const result = data.chart.result[0];
            const timestamps = result.timestamp;
            const quotes = result.indicators?.quote?.[0];

            if (!timestamps || !quotes || !quotes.close) {
                logger.warn(`[ApiService] No historical rate found for ${pair} on ${dateStr}`);
                return null;
            }

            // Find first valid price (closest available date >= requested date)
            let validPrice: number | null = null;
            for (let i = 0; i < quotes.close.length; i++) {
                if (quotes.close[i]) {
                    validPrice = quotes.close[i];
                    break;
                }
            }

            if (validPrice) {
                const rateData: RateData = {
                    rate: validPrice,
                    date: dateStr,
                    from: currency as CurrencyCode,
                    to: 'PLN'
                };

                // 4. Cache forever (historical data doesn't change)
                cacheService.set(cacheKey, rateData);

                logger.debug(`[ApiService] Fetched historical rate for ${pair} on ${dateStr}: ${validPrice}`);
                return rateData;
            }

            logger.warn(`[ApiService] No valid price found for ${pair} on ${dateStr}`);
            return null;
        } catch (error) {
            logger.error(`[ApiService] Failed to fetch historical rate for ${pair} on ${dateStr}:`, error);
            return null;
        }
    }

    /**
     * Fetch dividends for a stock from Yahoo Finance
     * Uses Yahoo Finance API to get dividend history
     */
    async fetchDividends(ticker: string): Promise<DividendRecord[]> {
        const cacheKey = `yahoo_dividends_${ticker}`;

        // Check cache
        const cached = cacheService.get<DividendRecord[]>(cacheKey, this.cacheDuration * 16); // 4 hours for dividends
        if (cached) {
            logger.debug(`[ApiService] Using cached dividends for ${ticker}`);
            return cached;
        }

        try {
            // Yahoo Finance dividend endpoint requires period parameters
            // Fetch last 5 years of dividend data
            const endDate = Math.floor(Date.now() / 1000);
            const startDate = endDate - 5 * 365 * 24 * 60 * 60; // 5 years ago

            const targetUrl = `${this.baseUrl}${ticker}?period1=${startDate}&period2=${endDate}&interval=1d&events=div`;
            logger.debug(`[ApiService] Fetching dividends for ${ticker}...`);

            const response = await this.fetchWithBackup(targetUrl);
            const data = await response.json();

            const result = data.chart?.result?.[0];
            if (!result || !result.events?.dividends) {
                logger.debug(`[ApiService] No dividend data found for ${ticker}`);
                return [];
            }

            const dividendsObj = result.events.dividends;
            const dividends: DividendRecord[] = [];

            // Determine currency
            const currency = result.meta?.currency || 'USD';

            // Convert dividends object to array
            for (const [timestamp, divData] of Object.entries(dividendsObj)) {
                const date = new Date(parseInt(timestamp) * 1000);
                const isoDate = toLocalISODate(date);

                if (isoDate && typeof divData === 'object' && divData !== null && 'amount' in divData) {
                    dividends.push({
                        exDate: isoDate,
                        amount: (divData as { amount: number }).amount,
                        currency: currency
                    });
                }
            }

            // Sort by date (newest first)
            dividends.sort((a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime());

            // Cache the result
            cacheService.set(cacheKey, dividends, { ttl: this.cacheDuration * 16 });

            logger.debug(`[ApiService] Fetched ${dividends.length} dividends for ${ticker}`);
            return dividends;
        } catch (error) {
            logger.error(`[ApiService] Failed to fetch dividends for ${ticker}:`, error);
            return [];
        }
    }

    /**
     * Invalidate all cache entries for a specific ticker
     */
    invalidateTickerCache(ticker: string): void {
        cacheService.invalidate(new RegExp(`_(price|history)_${ticker}`));
        logger.debug(`[ApiService] Invalidated cache for ${ticker}`);
    }

    /**
     * Clear all API cache
     */
    clearCache(): void {
        cacheService.clear();
        logger.debug('[ApiService] Cleared all API cache');
    }
}

// Export singleton instance
export const apiService = new ApiService();
export default ApiService;
