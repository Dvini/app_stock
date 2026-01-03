/**
 * Simplified tests for formatters - testing functionality, not exact formatting
 */

import { describe, it, expect } from 'vitest';
import {
    formatNumber,
    formatCurrency,
    formatPercentage,
    formatDate,
    formatProfitLoss,
    formatAbbreviated
} from '../utils/formatters';

describe('Formatters', () => {
    describe('formatNumber', () => {
        it('should format numbers', () => {
            const result = formatNumber(1234.56);
            expect(result).toContain('1');
            expect(result).toContain('234');
            expect(result).toContain('56');
        });

        it('should handle edge cases', () => {
            expect(formatNumber(0)).toBeTruthy();
            expect(formatNumber(null)).toBe('0,00');
            expect(formatNumber(undefined)).toBe('0,00');
        });
    });

    describe('formatCurrency', () => {
        it('should format PLN currency', () => {
            const result = formatCurrency(1234.56, 'PLN');
            expect(result).toContain('1');
            expect(result).toContain('234');
            expect(result).toContain('56');
            expect(result).toContain('zł');
        });

        it('should format USD currency', () => {
            const result = formatCurrency(1234.56, 'USD');
            expect(result).toContain('$');
            expect(result).toContain('1');
            expect(result).toContain('234');
        });

        it('should handle showSymbol parameter', () => {
            const result = formatCurrency(1234.56, 'PLN', false);
            expect(result).not.toContain('zł');
        });
    });

    describe('formatPercentage', () => {
        it('should format percentages', () => {
            expect(formatPercentage(0.15)).toContain('15');
            expect(formatPercentage(0.15)).toContain('%');
        });

        it('should include sign when requested', () => {
            expect(formatPercentage(0.15, 2, true)).toContain('+');
        });
    });

    describe('formatDate', () => {
        it('should format dates', () => {
            const date = new Date('2024-01-15');
            const result = formatDate(date, 'short');
            expect(result).toBeTruthy();
            expect(result.length).toBeGreaterThan(5);
        });

        it('should handle invalid dates', () => {
            expect(formatDate('invalid')).toBe('');
            expect(formatDate(null)).toBe('');
        });
    });

    describe('formatProfitLoss', () => {
        it('should format positive P/L', () => {
            const result = formatProfitLoss(100, 'PLN');
            expect(result.withSign).toContain('+');
            expect(result.className).toBe('text-green-500');
        });

        it('should format negative P/L', () => {
            const result = formatProfitLoss(-100, 'PLN');
            expect(result.withSign).toContain('-');
            expect(result.className).toBe('text-red-500');
        });
    });

    describe('formatAbbreviated', () => {
        it('should abbreviate large numbers', () => {
            expect(formatAbbreviated(1234567890)).toContain('mld');
            expect(formatAbbreviated(1234567)).toContain('mln');
            expect(formatAbbreviated(1234)).toContain('tys');
        });

        it('should not abbreviate small numbers', () => {
            const result = formatAbbreviated(123);
            expect(result).not.toContain('tys');
        });
    });
});
