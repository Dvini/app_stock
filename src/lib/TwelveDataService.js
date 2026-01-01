import { cacheService } from './CacheService.js';

/**
 * Twelve Data API Service
 * Provides dividend data and other stock market information
 */
class TwelveDataService {
    constructor() {
        this.baseUrl = 'https://api.twelvedata.com';
        this.apiKey = '81cf647aca014141b00ee9dd7b3b2d98';
        this.cacheDuration = 24 * 60 * 60 * 1000; // 24 hours for dividend data
    }

    /**
     * Fetch dividend history for a stock
     * @param {string} symbol - Stock ticker symbol (e.g., 'AAPL', 'PKN.WA')
     * @param {string} range - Time range: 'last', '1y', '5y', 'full' (default: 'full')
     * @returns {Promise<Array>} Array of dividend records
     */
    async fetchDividends(symbol, range = 'full') {
        const cacheKey = `td_dividends_${symbol}_${range}`;

        // Check cache
        const cached = cacheService.get(cacheKey, this.cacheDuration);
        if (cached) {
            console.log(`[TwelveDataService] Using cached dividends for ${symbol}`);
            return cached;
        }

        try {
            const url = `${this.baseUrl}/dividends?symbol=${symbol}&range=${range}&apikey=${this.apiKey}`;
            console.log(`[TwelveDataService] Fetching dividends for ${symbol}...`);

            const response = await fetch(url);

            if (!response.ok) {
                console.error(`[TwelveDataService] API error: ${response.status} for ${symbol}`);
                return [];
            }

            const data = await response.json();

            // Check for API error in response
            if (data.status === 'error') {
                console.error(`[TwelveDataService] API error: ${data.message} for ${symbol}`);
                return [];
            }

            // Extract dividends array
            const dividends = data.dividends || [];

            // Transform to our format
            const formattedDividends = dividends.map(div => ({
                exDate: div.ex_date,
                amount: div.amount,
                currency: data.meta?.currency || 'USD'
            }));

            // Cache the result
            cacheService.set(cacheKey, formattedDividends, { ttl: this.cacheDuration });

            console.log(`[TwelveDataService] Fetched ${formattedDividends.length} dividends for ${symbol}`);
            return formattedDividends;

        } catch (error) {
            console.error(`[TwelveDataService] Failed to fetch dividends for ${symbol}:`, error);
            return [];
        }
    }

    /**
     * Fetch dividends for multiple symbols
     * @param {Array<string>} symbols - Array of stock ticker symbols
     * @param {string} range - Time range
     * @returns {Promise<Object>} Object with symbol as key and dividends array as value
     */
    async fetchMultipleDividends(symbols, range = 'full') {
        const results = {};

        // Fetch one by one to avoid rate limiting
        for (const symbol of symbols) {
            results[symbol] = await this.fetchDividends(symbol, range);

            // Small delay to prevent rate limiting (800 requests/min = ~75ms between requests)
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return results;
    }

    /**
     * Clear all Twelve Data cache
     */
    clearCache() {
        cacheService.invalidate(/^td_/);
        console.log('[TwelveDataService] Cleared all Twelve Data cache');
    }
}

// Export singleton instance
export const twelveDataService = new TwelveDataService();
export default TwelveDataService;
