import { cacheService } from './CacheService.js';

/**
 * Alpha Vantage API Service
 * Provides dividend data using TIME_SERIES_MONTHLY_ADJUSTED endpoint
 */
class AlphaVantageService {
    constructor() {
        this.baseUrl = 'https://www.alphavantage.co/query';
        this.apiKey = 'LX0UJ2KOOVE23WMO';
        this.cacheDuration = 24 * 60 * 60 * 1000; // 24 hours
        this.requestDelay = 12000; // 12 seconds between requests (5 requests per minute to stay safe)
        this.lastRequestTime = 0;
    }

    /**
     * Wait to respect rate limiting (5 requests per minute)
     * @private
     */
    async _waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.requestDelay) {
            const waitTime = this.requestDelay - timeSinceLastRequest;
            console.log(`[AlphaVantageService] Rate limiting: waiting ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();
    }

    /**
     * Fetch dividend history for a stock using monthly adjusted data
     * @param {string} symbol - Stock ticker symbol
     * @returns {Promise<Array>} Array of dividend records
     */
    async fetchDividends(symbol) {
        const cacheKey = `av_dividends_${symbol}`;

        // Check cache
        const cached = cacheService.get(cacheKey, this.cacheDuration);
        if (cached) {
            console.log(`[AlphaVantageService] Using cached dividends for ${symbol}`);
            return cached;
        }

        try {
            // Wait for rate limit
            await this._waitForRateLimit();

            const url = `${this.baseUrl}?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${symbol}&apikey=${this.apiKey}`;
            console.log(`[AlphaVantageService] Fetching dividends for ${symbol}...`);

            const response = await fetch(url);

            if (!response.ok) {
                console.error(`[AlphaVantageService] HTTP error: ${response.status} for ${symbol}`);
                return [];
            }

            const data = await response.json();

            // Check for API error messages
            if (data['Information'] || data['Error Message'] || data['Note']) {
                console.error(`[AlphaVantageService] API error for ${symbol}:`, data['Information'] || data['Error Message'] || data['Note']);
                return [];
            }

            // Extract monthly time series
            const timeSeries = data['Monthly Adjusted Time Series'];
            if (!timeSeries) {
                console.error(`[AlphaVantageService] No time series data for ${symbol}`);
                return [];
            }

            // Extract dividends from monthly data
            const dividends = [];
            for (const [date, values] of Object.entries(timeSeries)) {
                const dividendAmount = parseFloat(values['7. dividend amount']);

                // Only include months where dividends were paid
                if (dividendAmount > 0) {
                    dividends.push({
                        exDate: date, // Using month date as approximation
                        amount: dividendAmount,
                        currency: this._getCurrencyForSymbol(symbol)
                    });
                }
            }

            // Sort by date (newest first)
            dividends.sort((a, b) => new Date(b.exDate) - new Date(a.exDate));

            // Cache the result
            cacheService.set(cacheKey, dividends, { ttl: this.cacheDuration });

            console.log(`[AlphaVantageService] Fetched ${dividends.length} dividends for ${symbol}`);
            return dividends;

        } catch (error) {
            console.error(`[AlphaVantageService] Failed to fetch dividends for ${symbol}:`, error);
            return [];
        }
    }

    /**
     * Determine currency based on symbol suffix
     * @private
     */
    _getCurrencyForSymbol(symbol) {
        if (symbol.endsWith('.WA')) return 'PLN'; // Warsaw Stock Exchange
        if (symbol.endsWith('.PA')) return 'EUR'; // Paris Stock Exchange
        if (symbol.endsWith('.L')) return 'GBP'; // London Stock Exchange
        if (symbol.endsWith('.TO')) return 'CAD'; // Toronto Stock Exchange
        return 'USD'; // Default to USD
    }

    /**
     * Fetch dividends for multiple symbols with rate limiting
     * @param {Array<string>} symbols - Array of stock ticker symbols
     * @returns {Promise<Object>} Object with symbol as key and dividends array as value
     */
    async fetchMultipleDividends(symbols) {
        const results = {};

        for (const symbol of symbols) {
            results[symbol] = await this.fetchDividends(symbol);
        }

        return results;
    }

    /**
     * Clear all Alpha Vantage cache
     */
    clearCache() {
        cacheService.invalidate(/^av_/);
        console.log('[AlphaVantageService] Cleared all Alpha Vantage cache');
    }
}

// Export singleton instance
export const alphaVantageService = new AlphaVantageService();
export default AlphaVantageService;
