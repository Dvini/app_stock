/**
 * Currency Helper Utilities
 * Centralized currency exchange rate fallbacks and helpers
 */

/**
 * Fallback exchange rates for major currencies when API is unavailable
 * These are approximate rates and should be updated periodically
 */
export const FALLBACK_RATES = {
    EUR: 4.3,
    USD: 4.0,
    GBP: 5.0,
    CHF: 4.5
};

/**
 * Get exchange rate with fallback
 * Returns API rate if valid, otherwise falls back to predefined rate
 * 
 * @param {string} currency - Currency code (e.g., 'USD', 'EUR')
 * @param {number} rateFromAPI - Exchange rate from API (may be null/0)
 * @returns {number} Valid exchange rate
 */
export const getExchangeRateWithFallback = (currency, rateFromAPI) => {
    // If API rate is valid and non-zero, use it
    if (rateFromAPI && rateFromAPI > 0) {
        return rateFromAPI;
    }

    // Fall back to predefined rate, or 1.0 if currency not in fallbacks
    return FALLBACK_RATES[currency] || 1.0;
};

/**
 * Check if a rate value is valid
 * @param {number} rate - Exchange rate to validate
 * @returns {boolean} True if rate is valid (non-zero, positive number)
 */
export const isValidRate = (rate) => {
    return typeof rate === 'number' && rate > 0 && !isNaN(rate);
};
