import { cacheService } from './CacheService.js';

/**
 * NBP (Narodowy Bank Polski) API Service
 * Provides historical and current exchange rates from Polish National Bank
 */
class NBPService {
    constructor() {
        this.baseUrl = 'https://api.nbp.pl/api/exchangerates/rates';
        this.cacheDuration = 60 * 60 * 1000; // 1 hour for current rates
        // Historical rates cached permanently (they don't change)
    }

    /**
     * Get historical exchange rate for a specific date
     * @param {string} currency - Currency code (e.g., 'USD', 'EUR')
     * @param {string} dateStr - Date in YYYY-MM-DD format
     * @param {string} table - NBP table type ('A' or 'B'), default 'A'
     * @returns {Promise<{rate: number, date: string}|null>}
     */
    async getHistoricalRate(currency, dateStr, table = 'A') {
        // Validate currency
        if (!currency || currency === 'PLN') {
            return { rate: 1.0, date: dateStr };
        }

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            console.error('[NBPService] Invalid date format. Expected YYYY-MM-DD, got:', dateStr);
            return null;
        }

        const cacheKey = `nbp_rate_${currency}_${dateStr}_${table}`;

        // Check cache (historical rates never expire)
        const cached = cacheService.get(cacheKey);
        if (cached) {
            console.log(`[NBPService] Using cached historical rate for ${currency} on ${dateStr}`);
            return cached;
        }

        // Fetch from NBP API
        try {
            const url = `${this.baseUrl}/${table.toLowerCase()}/${currency.toLowerCase()}/${dateStr}/?format=json`;
            console.log(`[NBPService] Fetching rate from: ${url}`);

            const response = await fetch(url);

            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`[NBPService] No rate found for ${currency} on ${dateStr} (probably weekend/holiday)`);
                    // Try to get rate from previous day (NBP might be closed)
                    return await this._getRateFromPreviousDay(currency, dateStr, table);
                }
                throw new Error(`NBP API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const rate = data.rates[0]?.mid;

            if (!rate) {
                console.warn(`[NBPService] No rate data in response for ${currency} on ${dateStr}`);
                return null;
            }

            const rateData = { rate, date: dateStr };

            // Cache forever (historical data doesn't change)
            cacheService.set(cacheKey, rateData);

            console.log(`[NBPService] Fetched historical rate for ${currency} on ${dateStr}: ${rate}`);
            return rateData;

        } catch (error) {
            console.error(`[NBPService] Failed to fetch historical rate for ${currency} on ${dateStr}:`, error);
            return null;
        }
    }

    /**
     * Get rate from previous day (for weekends/holidays)
     * @private
     */
    async _getRateFromPreviousDay(currency, dateStr, table, maxAttempts = 5) {
        const date = new Date(dateStr);

        for (let i = 1; i <= maxAttempts; i++) {
            date.setDate(date.getDate() - 1);
            const prevDateStr = date.toISOString().split('T')[0];

            console.log(`[NBPService] Trying previous day: ${prevDateStr}`);

            const cacheKey = `nbp_rate_${currency}_${prevDateStr}_${table}`;
            const cached = cacheService.get(cacheKey);

            if (cached) {
                console.log(`[NBPService] Found cached rate from ${prevDateStr}`);
                return { ...cached, date: prevDateStr };
            }

            try {
                const url = `${this.baseUrl}/${table.toLowerCase()}/${currency.toLowerCase()}/${prevDateStr}/?format=json`;
                const response = await fetch(url);

                if (response.ok) {
                    const data = await response.json();
                    const rate = data.rates[0]?.mid;

                    if (rate) {
                        const rateData = { rate, date: prevDateStr };
                        cacheService.set(cacheKey, rateData);
                        console.log(`[NBPService] Found rate from ${prevDateStr}: ${rate}`);
                        return rateData;
                    }
                }
            } catch (error) {
                console.warn(`[NBPService] Failed to fetch from ${prevDateStr}:`, error.message);
            }
        }

        console.error(`[NBPService] Could not find rate for ${currency} within ${maxAttempts} days before ${dateStr}`);
        return null;
    }

    /**
     * Get current exchange rate
     * @param {string} currency - Currency code (e.g., 'USD', 'EUR')
     * @param {string} table - NBP table type ('A' or 'B'), default 'A'
     * @returns {Promise<{rate: number, date: string}|null>}
     */
    async getCurrentRate(currency, table = 'A') {
        if (!currency || currency === 'PLN') {
            return { rate: 1.0, date: new Date().toISOString().split('T')[0] };
        }

        const cacheKey = `nbp_current_rate_${currency}_${table}`;

        // Check cache (1 hour)
        const cached = cacheService.get(cacheKey, this.cacheDuration);
        if (cached) {
            console.log(`[NBPService] Using cached current rate for ${currency}`);
            return cached;
        }

        try {
            const url = `${this.baseUrl}/${table.toLowerCase()}/${currency.toLowerCase()}/?format=json`;
            console.log(`[NBPService] Fetching current rate from: ${url}`);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`NBP API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const rate = data.rates[0]?.mid;
            const date = data.rates[0]?.effectiveDate;

            if (!rate) {
                console.warn(`[NBPService] No current rate data for ${currency}`);
                return null;
            }

            const rateData = { rate, date };

            // Cache for 1 hour
            cacheService.set(cacheKey, rateData, { ttl: this.cacheDuration });

            console.log(`[NBPService] Fetched current rate for ${currency}: ${rate} (effective: ${date})`);
            return rateData;

        } catch (error) {
            console.error(`[NBPService] Failed to fetch current rate for ${currency}:`, error);
            return null;
        }
    }

    /**
     * Get average rate from specific NBP table
     * Alias for getCurrentRate and getHistoricalRate with table parameter
     * @param {string} currency - Currency code
     * @param {string} date - Optional date (YYYY-MM-DD). If not provided, returns current rate
     * @param {string} table - 'A' (major currencies) or 'B' (others)
     * @returns {Promise<{rate: number, date: string}|null>}
     */
    async getAverageRate(currency, date = null, table = 'A') {
        if (date) {
            return this.getHistoricalRate(currency, date, table);
        }
        return this.getCurrentRate(currency, table);
    }

    /**
     * Clear all NBP cache
     */
    clearCache() {
        // Clear all cache entries starting with 'nbp_'
        cacheService.invalidate(/^nbp_/);
        console.log('[NBPService] Cleared all NBP cache');
    }
}

// Export singleton instance
export const nbpService = new NBPService();
export default NBPService;
