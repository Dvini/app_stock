/**
 * Legacy API module - provides backward compatibility layer over new service architecture
 * All existing code using this module will continue to work without changes
 * 
 * New code should prefer importing from:
 * - ApiService.js for direct API calls
 * - StockDataService.js for business logic operations
 * - CacheService.js for cache management
 */

import { apiService } from './ApiService.js';
import { cacheService } from './CacheService.js';

// Legacy constants - kept for backward compatibility
export const CACHE_DURATION_MS = 15 * 60 * 1000;
export const PROXY_URL = "https://corsproxy.io/?";
export const BACKUP_PROXY_URL = "https://api.allorigins.win/raw?url=";
export const YAHOO_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";

/**
 * Legacy function: Fetch with backup proxy
 * @deprecated Use apiService.fetchWithBackup() instead
 * @param {string} url - URL to fetch
 * @returns {Promise<Response>}
 */
export const fetchWithBackup = async (url) => {
    return apiService.fetchWithBackup(url);
};

/**
 * Legacy function: Get cached price
 * @deprecated Use apiService.getCurrentPrice() instead (includes cache check)
 * @param {string} ticker - Stock ticker symbol
 * @returns {{price: number, currency: string}|null}
 */
export const getCachedPrice = (ticker) => {
    const cached = cacheService.get(`price_${ticker}`, CACHE_DURATION_MS);
    return cached;
};

/**
 * Fetch current price for a ticker
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<{price: number, currency: string}|null>}
 */
export const fetchCurrentPrice = async (ticker) => {
    return apiService.getCurrentPrice(ticker);
};

/**
 * Fetch exchange rates for converting foreign assets to Target Currency
 * @param {string[]} currencies - Array of currency codes
 * @param {string} targetCurrency - Target currency (default: PLN)
 * @returns {Promise<Object>} Object mapping currency codes to rates
 */
export const fetchExchangeRates = async (currencies, targetCurrency = 'PLN') => {
    return apiService.getExchangeRates(currencies, targetCurrency);
};

/**
 * Fetch history for charts
 * @param {string} ticker - Stock ticker symbol
 * @param {string} range - Time range (1d, 1mo, 1y, etc.)
 * @param {string} interval - Data interval (1m, 1h, 1d, etc.)
 * @returns {Promise<{data: Array, currency: string}|null>}
 */
export const fetchHistory = async (ticker, range = '1mo', interval = '1d') => {
    return apiService.getHistory(ticker, range, interval);
};

/**
 * Fetch historical exchange rate for a specific date
 * @param {string} currency - Currency code
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @returns {Promise<{rate: number, date: string}|null>}
 */
export const fetchHistoricalRate = async (currency, dateStr) => {
    return apiService.getHistoricalRate(currency, dateStr);
};

/**
 * Clear all API cache
 * Useful for debugging or forcing fresh data
 */
export const clearApiCache = () => {
    apiService.clearCache();
};

/**
 * Invalidate cache for a specific ticker
 * @param {string} ticker - Stock ticker symbol
 */
export const invalidateTickerCache = (ticker) => {
    apiService.invalidateTickerCache(ticker);
};

// Export service instances for advanced usage
export { apiService, cacheService };
