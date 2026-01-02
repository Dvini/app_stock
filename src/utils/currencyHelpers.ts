/**
 * Currency Helper Utilities
 * Centralized currency exchange rate fallbacks and helpers
 */

/**
 * Fallback exchange rates for major currencies when API is unavailable
 * These are approximate rates and should be updated periodically
 */
export const FALLBACK_RATES: Record<string, number> = {
    EUR: 4.3,
    USD: 4.0,
    GBP: 5.0,
    CHF: 4.5
} as const;

/**
 * Get exchange rate with fallback
 * Returns API rate if valid, otherwise falls back to predefined rate
 */
export const getExchangeRateWithFallback = (currency: string, rateFromAPI: number | null | undefined): number => {
    // If API rate is valid and non-zero, use it
    if (rateFromAPI && rateFromAPI > 0) {
        return rateFromAPI;
    }

    // Fall back to predefined rate, or 1.0 if currency not in fallbacks
    return FALLBACK_RATES[currency] || 1.0;
};

/**
 * Check if a rate value is valid
 */
export const isValidRate = (rate: unknown): rate is number => {
    return typeof rate === 'number' && rate > 0 && !isNaN(rate);
};
