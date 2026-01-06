/**
 * Legacy API module - provides backward compatibility layer over new service architecture
 * All existing code using this module will continue to work without changes
 *
 * New code should prefer importing from:
 * - ApiService.ts for direct API calls
 * - StockDataService.js for business logic operations
 * - CacheService.ts for cache management
 */

import { apiService } from './ApiService.js';
import { cacheService } from './CacheService';
import type { YahooFinancePriceData, HistoricalData, ExchangeRate } from '../types/api';
import type { CurrencyCode } from '../types/database';

// Legacy constants - kept for backward compatibility
export const CACHE_DURATION_MS = 15 * 60 * 1000;
export const PROXY_URL = 'https://corsproxy.io/?';
export const BACKUP_PROXY_URL = 'https://api.allorigins.win/raw?url=';
export const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';

/**
 * Legacy function: Fetch with backup proxy
 * @deprecated Use apiService.fetchWithBackup() instead
 */
export const fetchWithBackup = async (url: string): Promise<Response> => {
    return apiService.fetchWithBackup(url);
};

/**
 * Legacy function: Get cached price
 * @deprecated Use apiService.getCurrentPrice() instead (includes cache check)
 */
export const getCachedPrice = (ticker: string): YahooFinancePriceData | null => {
    const cached = cacheService.get<YahooFinancePriceData>(`price_${ticker}`, CACHE_DURATION_MS);
    return cached;
};

/**
 * Fetch current price for a ticker
 */
export const fetchCurrentPrice = async (ticker: string): Promise<YahooFinancePriceData | null> => {
    return apiService.getCurrentPrice(ticker);
};

/**
 * Fetch exchange rates for converting foreign assets to Target Currency
 */
export const fetchExchangeRates = async (
    currencies: string[],
    targetCurrency: CurrencyCode = 'PLN'
): Promise<Record<string, number>> => {
    return apiService.getExchangeRates(currencies, targetCurrency);
};

/**
 * Fetch history for charts
 */
export const fetchHistory = async (ticker: string, range = '1mo', interval = '1d'): Promise<HistoricalData | null> => {
    return apiService.getHistory(ticker, range, interval);
};

/**
 * Fetch historical exchange rate for a specific date
 */
export const fetchHistoricalRate = async (currency: string, dateStr: string): Promise<ExchangeRate | null> => {
    return apiService.getHistoricalRate(currency, dateStr);
};

/**
 * Clear all API cache
 * Useful for debugging or forcing fresh data
 */
export const clearApiCache = (): void => {
    apiService.clearCache();
};

/**
 * Invalidate cache for a specific ticker
 */
export const invalidateTickerCache = (ticker: string): void => {
    apiService.invalidateTickerCache(ticker);
};

// Export service instances for advanced usage
export { apiService, cacheService };
