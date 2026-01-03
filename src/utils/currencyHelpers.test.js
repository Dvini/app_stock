/**
 * Unit tests for currencyHelpers.js
 * Tests currency exchange rate fallback logic
 */

import { describe, it, expect } from 'vitest';
import {
    FALLBACK_RATES,
    getExchangeRateWithFallback,
    isValidRate
} from './currencyHelpers';

describe('currencyHelpers', () => {
    describe('FALLBACK_RATES', () => {
        it('should have fallback rates for major currencies', () => {
            expect(FALLBACK_RATES.EUR).toBe(4.3);
            expect(FALLBACK_RATES.USD).toBe(4.0);
            expect(FALLBACK_RATES.GBP).toBe(5.0);
            expect(FALLBACK_RATES.CHF).toBe(4.5);
        });

        it('should have positive rates', () => {
            Object.values(FALLBACK_RATES).forEach(rate => {
                expect(rate).toBeGreaterThan(0);
            });
        });
    });

    describe('getExchangeRateWithFallback', () => {
        it('should return API rate when valid', () => {
            const result = getExchangeRateWithFallback('USD', 3.95);
            expect(result).toBe(3.95);
        });

        it('should return fallback rate when API rate is null', () => {
            const result = getExchangeRateWithFallback('USD', null);
            expect(result).toBe(4.0);
        });

        it('should return fallback rate when API rate is 0', () => {
            const result = getExchangeRateWithFallback('EUR', 0);
            expect(result).toBe(4.3);
        });

        it('should return fallback rate when API rate is undefined', () => {
            const result = getExchangeRateWithFallback('GBP', undefined);
            expect(result).toBe(5.0);
        });

        it('should return fallback rate when API rate is negative', () => {
            const result = getExchangeRateWithFallback('USD', -1);
            expect(result).toBe(4.0);
        });

        it('should return 1.0 for unknown currency with no API rate', () => {
            const result = getExchangeRateWithFallback('XYZ', null);
            expect(result).toBe(1.0);
        });

        it('should return API rate for unknown currency when API rate is valid', () => {
            const result = getExchangeRateWithFallback('XYZ', 5.5);
            expect(result).toBe(5.5);
        });

        it('should handle PLN (should return 1.0 if no API rate)', () => {
            const result = getExchangeRateWithFallback('PLN', null);
            expect(result).toBe(1.0);
        });

        it('should handle very small positive API rates', () => {
            const result = getExchangeRateWithFallback('USD', 0.001);
            expect(result).toBe(0.001);
        });

        it('should handle very large API rates', () => {
            const result = getExchangeRateWithFallback('USD', 1000.5);
            expect(result).toBe(1000.5);
        });
    });

    describe('isValidRate', () => {
        it('should return true for valid positive rates', () => {
            expect(isValidRate(4.0)).toBe(true);
            expect(isValidRate(0.5)).toBe(true);
            expect(isValidRate(100)).toBe(true);
        });

        it('should return false for zero', () => {
            expect(isValidRate(0)).toBe(false);
        });

        it('should return false for negative rates', () => {
            expect(isValidRate(-1)).toBe(false);
            expect(isValidRate(-0.5)).toBe(false);
        });

        it('should return false for null', () => {
            expect(isValidRate(null)).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(isValidRate(undefined)).toBe(false);
        });

        it('should return false for NaN', () => {
            expect(isValidRate(NaN)).toBe(false);
        });

        it('should return false for non-numeric values', () => {
            expect(isValidRate('4.0')).toBe(false);
            expect(isValidRate({})).toBe(false);
            expect(isValidRate([])).toBe(false);
        });
    });

    describe('Integration scenarios', () => {
        it('should handle typical USD transaction flow', () => {
            // Scenario: API returns valid rate
            const rate1 = getExchangeRateWithFallback('USD', 3.98);
            expect(rate1).toBe(3.98);

            // Scenario: API fails (null)
            const rate2 = getExchangeRateWithFallback('USD', null);
            expect(rate2).toBe(4.0); // fallback
        });

        it('should handle EUR with historical rate fallback', () => {
            const historicalRate = null; // API failed to fetch
            const rate = getExchangeRateWithFallback('EUR', historicalRate);
            expect(rate).toBe(4.3);
        });

        it('should prefer API rate over fallback when available', () => {
            // Even if fallback is 4.0, if API returns 3.5, use 3.5
            const currentRate = 3.5;
            const rate = getExchangeRateWithFallback('USD', currentRate);
            expect(rate).toBe(3.5);
            expect(rate).not.toBe(FALLBACK_RATES.USD);
        });
    });
});
