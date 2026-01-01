import { cacheService } from './CacheService.js';

/**
 * API Service for fetching stock data from Yahoo Finance
 * Implements caching, retry logic, and error handling
 */
class ApiService {
    /**
     * Create a new ApiService instance
     * @param {Object} options - Configuration options
     * @param {string[]} options.proxyUrls - List of proxy URLs to try
     * @param {string} options.baseUrl - Yahoo Finance base URL
     * @param {number} options.cacheDuration - Default cache duration in ms
     * @param {number} options.maxRetries - Maximum number of retries
     */
    constructor(options = {}) {
        this.proxyUrls = options.proxyUrls || [
            'https://corsproxy.io/?',
            'https://api.allorigins.win/raw?url='
        ];
        this.baseUrl = options.baseUrl || 'https://query1.finance.yahoo.com/v8/finance/chart/';
        this.cacheDuration = options.cacheDuration || 15 * 60 * 1000; // 15 minutes
        this.maxRetries = options.maxRetries || 2;
        this.currentProxyIndex = 0;
    }

    /**
     * Fetch with automatic proxy fallback and retry
     * @param {string} url - The URL to fetch
     * @param {number} retryCount - Current retry count
     * @returns {Promise<Response>} Fetch response
     */
    async fetchWithBackup(url, retryCount = 0) {
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
            console.warn(`[ApiService] Fetch failed with proxy ${this.currentProxyIndex}:`, error.message);

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
            throw new Error(`Failed to fetch after ${this.maxRetries} retries: ${error.message}`);
        }
    }

    /**
     * Wait for specified milliseconds
     * @param {number} ms - Milliseconds to wait
     * @returns {Promise<void>}
     */
    _wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get current price for a ticker
     * @param {string} ticker - Stock ticker symbol
     * @returns {Promise<{price: number, currency: string}|null>} Price data or null
     */
    async getCurrentPrice(ticker) {
        const cacheKey = `price_${ticker}`;

        // 1. Check cache
        const cached = cacheService.get(cacheKey, this.cacheDuration);
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
                const priceData = { price, currency };

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
     * @param {string[]} currencies - Array of currency codes (e.g. ['USD', 'EUR'])
     * @param {string} targetCurrency - Target currency (default: 'PLN')
     * @returns {Promise<Object>} Object mapping currency codes to rates
     */
    async getExchangeRates(currencies, targetCurrency = 'PLN') {
        const uniqueCurrencies = currencies.filter(c => c && c !== targetCurrency);
        if (uniqueCurrencies.length === 0) return {};

        const rates = {};
        const missingPairs = [];

        // 1. Check cache for each currency
        for (const currency of uniqueCurrencies) {
            const cacheKey = `rate_${currency}${targetCurrency}`;
            const cached = cacheService.get(cacheKey, this.cacheDuration);

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
     * @param {string} ticker - Stock ticker symbol
     * @param {string} range - Time range (1d, 1mo, 1y, etc.)
     * @param {string} interval - Data interval (1m, 1h, 1d, etc.)
     * @returns {Promise<{data: Array, currency: string}|null>} Historical data or null
     */
    async getHistory(ticker, range = '1mo', interval = '1d') {
        const cacheKey = `history_${ticker}_${range}_${interval}`;

        // Shorter cache for intraday data
        const cacheDuration = range === '1d' ? 5 * 60 * 1000 : this.cacheDuration;

        // 1. Check cache
        const cached = cacheService.get(cacheKey, cacheDuration);
        if (cached) {
            console.log(`[ApiService] Using cached history for ${ticker} (${range}, ${interval})`);
            return cached;
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
            const cleanData = timestamps
                .map((t, i) => ({
                    time: t,
                    price: quotes.close[i]
                }))
                .filter(item => item.price !== null && item.price !== undefined);

            const currency = result.meta.currency || 'PLN';
            const historyData = { data: cleanData, currency };

            // 3. Cache the result
            cacheService.set(cacheKey, historyData, { ttl: cacheDuration });

            console.log(`[ApiService] Fetched ${cleanData.length} history points for ${ticker}`);
            return historyData;

        } catch (error) {
            console.error(`[ApiService] Failed to fetch history for ${ticker}:`, error);
            return null;
        }
    }

    /**
     * Get historical exchange rate for a specific date
     * @param {string} currency - Currency code
     * @param {string} dateStr - Date string (YYYY-MM-DD)
     * @returns {Promise<{rate: number, date: string}|null>} Historical rate or null
     */
    async getHistoricalRate(currency, dateStr) {
        const cacheKey = `rate_history_${currency}PLN_${dateStr}`;

        // 1. Check cache (historical rates don't expire)
        const cached = cacheService.get(cacheKey);
        if (cached) {
            console.log(`[ApiService] Using cached historical rate for ${currency} on ${dateStr}`);
            return cached;
        }

        // 2. Calculate timestamp range
        const dateObj = new Date(dateStr);
        const startTimestamp = Math.floor(dateObj.getTime() / 1000);
        const endTimestamp = startTimestamp + (4 * 24 * 60 * 60); // +4 days buffer for weekends

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
            let validPrice = null;
            for (let i = 0; i < quotes.close.length; i++) {
                if (quotes.close[i]) {
                    validPrice = quotes.close[i];
                    break;
                }
            }

            if (validPrice) {
                const rateData = { rate: validPrice, date: dateStr };

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
     * Invalidate all cache entries for a specific ticker
     * @param {string} ticker - Stock ticker symbol
     */
    invalidateTickerCache(ticker) {
        cacheService.invalidate(new RegExp(`_(price|history)_${ticker}`));
        console.log(`[ApiService] Invalidated cache for ${ticker}`);
    }

    /**
     * Clear all API cache
     */
    clearCache() {
        cacheService.clear();
        console.log('[ApiService] Cleared all API cache');
    }
}

// Export singleton instance
export const apiService = new ApiService();
export default ApiService;
