import { cacheService } from './CacheService';
import type { CurrencyCode } from '../types/database';

interface ApiServiceOptions {
    proxyUrls?: string[];
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
    private proxyUrls: string[];
    private baseUrl: string;
    private cacheDuration: number;
    private maxRetries: number;
    private currentProxyIndex: number;

    /**
     * Create a new ApiService instance
     */
    constructor(options: ApiServiceOptions = {}) {
        this.proxyUrls = options.proxyUrls || ['https://corsproxy.io/?', 'https://api.allorigins.win/raw?url='];
        this.baseUrl = options.baseUrl || 'https://query1.finance.yahoo.com/v8/finance/chart/';
        this.cacheDuration = options.cacheDuration || 15 * 60 * 1000; // 15 minutes
        this.maxRetries = options.maxRetries || 2;
        this.currentProxyIndex = 0;
    }

    /**
     * Fetch with automatic proxy fallback and retry
     */
    async fetchWithBackup(url: string, retryCount: number = 0): Promise<Response> {
        const proxyUrl = this.proxyUrls[this.currentProxyIndex];
        const fullUrl = `${proxyUrl}${encodeURIComponent(url)}`;

        try {
            const response = await fetch(fullUrl);

            if (response.ok) {
                return response;
            }

            // If response is not OK, throw to trigger retry
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[ApiService] Fetch failed with proxy ${this.currentProxyIndex}:`, errorMessage);

            // Try next proxy
            if (this.currentProxyIndex < this.proxyUrls.length - 1) {
                this.currentProxyIndex++;
                console.log(`[ApiService] Switching to backup proxy ${this.currentProxyIndex}`);
                return this.fetchWithBackup(url, retryCount);
            }

            // Reset proxy index and retry if we haven't exceeded max retries
            if (retryCount < this.maxRetries) {
                this.currentProxyIndex = 0;
                console.log(`[ApiService] Retrying request (attempt ${retryCount + 1}/${this.maxRetries})`);

                // Wait before retry (exponential backoff)
                await this._wait(1000 * Math.pow(2, retryCount));
                return this.fetchWithBackup(url, retryCount + 1);
            }

            // All retries failed
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

        // 1. Check cache
        const cached = cacheService.get<PriceData>(cacheKey, this.cacheDuration);
        if (cached) {
            console.log(`[ApiService] Using cached price for ${ticker}`);
            return cached;
        }

        // 2. Fetch from API
        try {
            const targetUrl = `${this.baseUrl}${ticker}?range=1d&interval=1d`;
            const response = await this.fetchWithBackup(targetUrl);
            const data = await response.json();

            const result = data.chart.result[0];
            let price = result.meta.regularMarketPrice;
            let currency = result.meta.currency || 'PLN';

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

                // 3. Cache the result
                cacheService.set(cacheKey, priceData, { ttl: this.cacheDuration });

                console.log(`[ApiService] Fetched price for ${ticker}: ${price} ${currency}`);
                return priceData;
            }

            console.warn(`[ApiService] No price data found for ${ticker}`);
            return null;
        } catch (error) {
            console.error(`[ApiService] Failed to fetch price for ${ticker}:`, error);
            return null;
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
            console.log(`[ApiService] Using cached rates for all currencies`);
            return rates;
        }

        // 2. Fetch missing rates in parallel
        try {
            const promises = missingPairs.map(async ({ currency, pair }) => {
                try {
                    const targetUrl = `${this.baseUrl}${pair}?range=1d&interval=1d`;
                    const response = await this.fetchWithBackup(targetUrl);
                    const data = await response.json();
                    const result = data.chart.result[0];
                    const rate = result.meta.regularMarketPrice;

                    if (rate) {
                        return { currency, rate };
                    }

                    console.warn(`[ApiService] No rate data found for ${pair}`);
                    return null;
                } catch (error) {
                    console.error(`[ApiService] Failed to fetch rate for ${pair}:`, error);
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

            console.log(`[ApiService] Fetched ${results.filter(r => r).length} exchange rates`);
            return rates;
        } catch (error) {
            console.error('[ApiService] Failed to fetch exchange rates:', error);
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

        // Shorter cache for intraday data (5 minutes for fresh data during market hours)
        const cacheDuration = (range === '1d' || range === '5d') ? 5 * 60 * 1000 : this.cacheDuration;

        // 1. Check cache (only for reasonable ranges)
        if (shouldCache) {
            const cached = cacheService.get<HistoryData>(cacheKey, cacheDuration);
            if (cached) {
                console.log(`[ApiService] Using cached history for ${ticker} (${range}, ${interval})`);
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
                console.warn(`[ApiService] No history data found for ${ticker}`);
                return null;
            }

            // Clean and format data
            const cleanData: HistoryDataPoint[] = timestamps
                .map((t: number, i: number) => {
                    const date = new Date(t * 1000).toISOString().split('T')[0]!;
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
                console.log(`[ApiService] Skipping cache for ${ticker} (${range}) - range too large`);
            }

            console.log(`[ApiService] Fetched ${cleanData.length} history points for ${ticker}`);
            return historyData;
        } catch (error) {
            console.error(`[ApiService] Failed to fetch history for ${ticker}:`, error);
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
            console.log(`[ApiService] Using cached historical rate for ${currency} on ${dateStr}`);
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
                console.warn(`[ApiService] No historical rate found for ${pair} on ${dateStr}`);
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

                console.log(`[ApiService] Fetched historical rate for ${pair} on ${dateStr}: ${validPrice}`);
                return rateData;
            }

            console.warn(`[ApiService] No valid price found for ${pair} on ${dateStr}`);
            return null;
        } catch (error) {
            console.error(`[ApiService] Failed to fetch historical rate for ${pair} on ${dateStr}:`, error);
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
            console.log(`[ApiService] Using cached dividends for ${ticker}`);
            return cached;
        }

        try {
            // Yahoo Finance dividend endpoint requires period parameters
            // Fetch last 5 years of dividend data
            const endDate = Math.floor(Date.now() / 1000);
            const startDate = endDate - 5 * 365 * 24 * 60 * 60; // 5 years ago

            const targetUrl = `${this.baseUrl}${ticker}?period1=${startDate}&period2=${endDate}&interval=1d&events=div`;
            console.log(`[ApiService] Fetching dividends for ${ticker}...`);

            const response = await this.fetchWithBackup(targetUrl);
            const data = await response.json();

            const result = data.chart?.result?.[0];
            if (!result || !result.events?.dividends) {
                console.log(`[ApiService] No dividend data found for ${ticker}`);
                return [];
            }

            const dividendsObj = result.events.dividends;
            const dividends: DividendRecord[] = [];

            // Determine currency
            const currency = result.meta?.currency || 'USD';

            // Convert dividends object to array
            for (const [timestamp, divData] of Object.entries(dividendsObj)) {
                const date = new Date(parseInt(timestamp) * 1000);
                const isoDate = date.toISOString().split('T')[0];

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

            console.log(`[ApiService] Fetched ${dividends.length} dividends for ${ticker}`);
            return dividends;
        } catch (error) {
            console.error(`[ApiService] Failed to fetch dividends for ${ticker}:`, error);
            return [];
        }
    }

    /**
     * Invalidate all cache entries for a specific ticker
     */
    invalidateTickerCache(ticker: string): void {
        cacheService.invalidate(new RegExp(`_(price|history)_${ticker}`));
        console.log(`[ApiService] Invalidated cache for ${ticker}`);
    }

    /**
     * Clear all API cache
     */
    clearCache(): void {
        cacheService.clear();
        console.log('[ApiService] Cleared all API cache');
    }
}

// Export singleton instance
export const apiService = new ApiService();
export default ApiService;
