import { cacheService } from './CacheService';

interface NBPRateResponse {
    rate: number;
    date: string;
}

/**
 * NBP (Narodowy Bank Polski) API Service
 * Provides historical and current exchange rates from Polish National Bank
 */
class NBPService {
    private baseUrl: string;
    private cacheDuration: number;

    constructor() {
        this.baseUrl = 'https://api.nbp.pl/api/exchangerates/rates';
        this.cacheDuration = 60 * 60 * 1000; // 1 hour for current rates
    }

    /**
     * Get historical exchange rate for a specific date
     */
    async getHistoricalRate(currency: string, dateStr: string, table: 'A' | 'B' = 'A'): Promise<NBPRateResponse | null> {
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
        const cached = cacheService.get<NBPRateResponse>(cacheKey);
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

            const rateData: NBPRateResponse = { rate, date: dateStr };

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
     */
    private async _getRateFromPreviousDay(currency: string, dateStr: string, table: 'A' | 'B', maxAttempts = 5): Promise<NBPRateResponse | null> {
        const date = new Date(dateStr);

        for (let i = 1; i <= maxAttempts; i++) {
            date.setDate(date.getDate() - 1);
            const prevDateStr = date.toISOString().split('T')[0]!; // Non-null assertion - toISOString always has 'T'

            console.log(`[NBPService] Trying previous day: ${prevDateStr}`);

            const cacheKey = `nbp_rate_${currency}_${prevDateStr}_${table}`;
            const cached = cacheService.get<NBPRateResponse>(cacheKey);

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
                        const rateData: NBPRateResponse = { rate, date: prevDateStr };
                        cacheService.set(cacheKey, rateData);
                        console.log(`[NBPService] Found rate from ${prevDateStr}: ${rate}`);
                        return rateData;
                    }
                }
            } catch (error) {
                console.warn(`[NBPService] Failed to fetch from ${prevDateStr}:`, error instanceof Error ? error.message : 'Unknown error');
            }
        }

        console.error(`[NBPService] Could not find rate for ${currency} within ${maxAttempts} days before ${dateStr}`);
        return null;
    }

    /**
     * Get current exchange rate
     */
    async getCurrentRate(currency: string, table: 'A' | 'B' = 'A'): Promise<NBPRateResponse | null> {
        if (!currency || currency === 'PLN') {
            const today = new Date().toISOString().split('T')[0]!; // Non-null assertion
            return { rate: 1.0, date: today };
        }

        const cacheKey = `nbp_current_rate_${currency}_${table}`;

        // Check cache (1 hour)
        const cached = cacheService.get<NBPRateResponse>(cacheKey, this.cacheDuration);
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
            const date = data.rates[0]?.effectiveDate || new Date().toISOString().split('T')[0] || '';

            if (!rate) {
                console.warn(`[NBPService] No current rate data for ${currency}`);
                return null;
            }

            const rateData: NBPRateResponse = { rate, date };

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
     */
    async getAverageRate(currency: string, date: string | null = null, table: 'A' | 'B' = 'A'): Promise<NBPRateResponse | null> {
        if (date) {
            return this.getHistoricalRate(currency, date, table);
        }
        return this.getCurrentRate(currency, table);
    }

    /**
     * Clear all NBP cache
     */
    clearCache(): void {
        // Clear all cache entries starting with 'nbp_'
        cacheService.invalidate(/^nbp_/);
        console.log('[NBPService] Cleared all NBP cache');
    }
}

// Export singleton instance
export const nbpService = new NBPService();
export default NBPService;
