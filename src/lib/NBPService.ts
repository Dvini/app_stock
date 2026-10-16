import { cacheService } from './CacheService';
import { addDaysISO, todayLocal } from '../utils/dates';
import { logger } from '../utils/logger';

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
    async getHistoricalRate(
        currency: string,
        dateStr: string,
        table: 'A' | 'B' = 'A'
    ): Promise<NBPRateResponse | null> {
        // Validate currency
        if (!currency || currency === 'PLN') {
            return { rate: 1.0, date: dateStr };
        }

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            logger.error('[NBPService] Invalid date format. Expected YYYY-MM-DD, got:', dateStr);
            return null;
        }

        const cacheKey = `nbp_rate_${currency}_${dateStr}_${table}`;

        // Check cache (historical rates never expire)
        const cached = cacheService.get<NBPRateResponse>(cacheKey);
        if (cached) {
            logger.debug(`[NBPService] Using cached historical rate for ${currency} on ${dateStr}`);
            return cached;
        }

        // Fetch from NBP API
        try {
            const url = `${this.baseUrl}/${table.toLowerCase()}/${currency.toLowerCase()}/${dateStr}/?format=json`;
            logger.debug(`[NBPService] Fetching rate from: ${url}`);

            const response = await fetch(url);

            if (!response.ok) {
                if (response.status === 404) {
                    logger.warn(`[NBPService] No rate found for ${currency} on ${dateStr} (probably weekend/holiday)`);
                    // Try to get rate from previous day (NBP might be closed)
                    return await this._getRateFromPreviousDay(currency, dateStr, table);
                }
                throw new Error(`NBP API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const rate = data.rates[0]?.mid;

            if (!rate) {
                logger.warn(`[NBPService] No rate data in response for ${currency} on ${dateStr}`);
                return null;
            }

            const rateData: NBPRateResponse = { rate, date: dateStr };

            // Cache forever (historical data doesn't change)
            cacheService.set(cacheKey, rateData);

            logger.debug(`[NBPService] Fetched historical rate for ${currency} on ${dateStr}: ${rate}`);
            return rateData;
        } catch (error) {
            logger.error(`[NBPService] Failed to fetch historical rate for ${currency} on ${dateStr}:`, error);
            return null;
        }
    }

    /**
     * Rate for tax purposes (art. 11a ustawy o PIT): NBP average rate (table A) from the last
     * business day BEFORE `dateStr`. One range request covers weekends and holidays.
     * Returns null on any failure - callers must not substitute another rate silently.
     */
    async getTaxRate(currency: string, dateStr: string): Promise<NBPRateResponse | null> {
        if (!currency || currency === 'PLN') return { rate: 1, date: dateStr };
        if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateStr)) return null;

        const cacheKey = `nbp_tax_rate_${currency}_${dateStr}`;
        const cached = cacheService.get<NBPRateResponse>(cacheKey);
        if (cached) return cached;

        const from = addDaysISO(dateStr, -14);
        const to = addDaysISO(dateStr, -1);
        try {
            const url = `${this.baseUrl}/a/${currency.toLowerCase()}/${from}/${to}/?format=json`;
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            const rates: Array<{ mid: number; effectiveDate: string }> = data.rates ?? [];
            const last = rates[rates.length - 1];
            if (!last?.mid) return null;
            const rateData: NBPRateResponse = { rate: last.mid, date: last.effectiveDate };
            cacheService.set(cacheKey, rateData);
            return rateData;
        } catch (error) {
            logger.error(`[NBPService] Failed to fetch tax rate for ${currency} before ${dateStr}:`, error);
            return null;
        }
    }

    /**
     * Get rate from previous day (for weekends/holidays)
     */
    private async _getRateFromPreviousDay(
        currency: string,
        dateStr: string,
        table: 'A' | 'B',
        maxAttempts = 10
    ): Promise<NBPRateResponse | null> {
        for (let i = 1; i <= maxAttempts; i++) {
            const prevDateStr = addDaysISO(dateStr, -i);

            logger.debug(`[NBPService] Trying previous day: ${prevDateStr}`);

            const cacheKey = `nbp_rate_${currency}_${prevDateStr}_${table}`;
            const cached = cacheService.get<NBPRateResponse>(cacheKey);

            if (cached) {
                logger.debug(`[NBPService] Found cached rate from ${prevDateStr}`);
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
                        logger.debug(`[NBPService] Found rate from ${prevDateStr}: ${rate}`);
                        return rateData;
                    }
                }
                // Only 404 means "no table that day"; anything else must not skip to an older day
                if (response.status !== 404) return null;
            } catch (error) {
                logger.warn(
                    `[NBPService] Failed to fetch from ${prevDateStr}:`,
                    error instanceof Error ? error.message : 'Unknown error'
                );
                return null;
            }
        }

        logger.error(`[NBPService] Could not find rate for ${currency} within ${maxAttempts} days before ${dateStr}`);
        return null;
    }

    /**
     * Get current exchange rate
     */
    async getCurrentRate(currency: string, table: 'A' | 'B' = 'A'): Promise<NBPRateResponse | null> {
        if (!currency || currency === 'PLN') {
            const today = todayLocal(); // Non-null assertion
            return { rate: 1.0, date: today };
        }

        const cacheKey = `nbp_current_rate_${currency}_${table}`;

        // Check cache (1 hour)
        const cached = cacheService.get<NBPRateResponse>(cacheKey, this.cacheDuration);
        if (cached) {
            logger.debug(`[NBPService] Using cached current rate for ${currency}`);
            return cached;
        }

        try {
            const url = `${this.baseUrl}/${table.toLowerCase()}/${currency.toLowerCase()}/?format=json`;
            logger.debug(`[NBPService] Fetching current rate from: ${url}`);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`NBP API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const rate = data.rates[0]?.mid;
            const date = data.rates[0]?.effectiveDate || todayLocal();

            if (!rate) {
                logger.warn(`[NBPService] No current rate data for ${currency}`);
                return null;
            }

            const rateData: NBPRateResponse = { rate, date };

            // Cache for 1 hour
            cacheService.set(cacheKey, rateData, { ttl: this.cacheDuration });

            logger.debug(`[NBPService] Fetched current rate for ${currency}: ${rate} (effective: ${date})`);
            return rateData;
        } catch (error) {
            logger.error(`[NBPService] Failed to fetch current rate for ${currency}:`, error);
            return null;
        }
    }

    /**
     * Get average rate from specific NBP table
     * Alias for getCurrentRate and getHistoricalRate with table parameter
     */
    async getAverageRate(
        currency: string,
        date: string | null = null,
        table: 'A' | 'B' = 'A'
    ): Promise<NBPRateResponse | null> {
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
        logger.debug('[NBPService] Cleared all NBP cache');
    }
}

// Export singleton instance
export const nbpService = new NBPService();
export default NBPService;
