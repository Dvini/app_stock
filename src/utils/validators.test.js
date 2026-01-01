/**
 * Simplified tests for validators
 */

import { describe, it, expect } from 'vitest';
import {
    validateTicker,
    validateAmount,
    validateDate,
    validateCurrency,
    validateTransaction,
    validateExchangeRate,
    sanitizeInput
} from '../utils/validators';

describe('Validators', () => {
    describe('validateTicker', () => {
        it('should validate correct tickers', () => {
            expect(validateTicker('AAPL').valid).toBe(true);
            expect(validateTicker('GOOGL').valid).toBe(true);
            expect(validateTicker('BRK.B').valid).toBe(true);
        });

        it('should reject invalid tickers', () => {
            expect(validateTicker('').valid).toBe(false);
            expect(validateTicker(null).valid).toBe(false);
            expect(validateTicker('TOOLONGTICKER123').valid).toBe(false);
        });

        it('should normalize to uppercase', () => {
            const result = validateTicker('aapl');
            expect(result.valid).toBe(true);
            expect(result.ticker).toBe('AAPL');
        });
    });

    describe('validateAmount', () => {
        it('should validate positive amounts', () => {
            expect(validateAmount(100).valid).toBe(true);
            expect(validateAmount('100').valid).toBe(true);
            expect(validateAmount('100,50').valid).toBe(true);
        });

        it('should reject negative amounts by default', () => {
            expect(validateAmount(-100).valid).toBe(false);
        });

        it('should allow negative when configured', () => {
            expect(validateAmount(-100, { allowNegative: true }).valid).toBe(true);
        });

        it('should enforce min/max', () => {
            expect(validateAmount(50, { min: 100 }).valid).toBe(false);
            expect(validateAmount(150, { max: 100 }).valid).toBe(false);
        });
    });

    describe('validateDate', () => {
        it('should validate dates', () => {
            const pastDate = new Date('2024-01-15');
            expect(validateDate(pastDate).valid).toBe(true);
        });

        it('should reject future dates by default', () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);
            expect(validateDate(futureDate).valid).toBe(false);
        });

        it('should allow future when configured', () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);
            expect(validateDate(futureDate, { allowFuture: true }).valid).toBe(true);
        });
    });

    describe('validateCurrency', () => {
        it('should validate supported currencies', () => {
            expect(validateCurrency('PLN').valid).toBe(true);
            expect(validateCurrency('USD').valid).toBe(true);
            expect(validateCurrency('EUR').valid).toBe(true);
        });

        it('should normalize to uppercase', () => {
            const result = validateCurrency('usd');
            expect(result.valid).toBe(true);
            expect(result.currency).toBe('USD');
        });

        it('should reject unsupported currencies', () => {
            expect(validateCurrency('XYZ').valid).toBe(false);
        });
    });

    describe('validateTransaction', () => {
        it('should validate buy transaction', () => {
            const transaction = {
                type: 'buy',
                ticker: 'AAPL',
                amount: 10,
                price: 150,
                date: new Date('2024-01-15'),
                currency: 'USD'
            };

            const result = validateTransaction(transaction);
            expect(result.valid).toBe(true);
        });

        it('should validate deposit transaction', () => {
            const transaction = {
                type: 'deposit',
                amount: 1000,
                date: new Date('2024-01-15')
            };

            const result = validateTransaction(transaction);
            expect(result.valid).toBe(true);
        });

        it('should reject invalid type', () => {
            const transaction = {
                type: 'invalid',
                amount: 100,
                date: new Date()
            };

            const result = validateTransaction(transaction);
            expect(result.valid).toBe(false);
        });
    });

    describe('validateExchangeRate', () => {
        it('should validate correct rates', () => {
            expect(validateExchangeRate(4.5).valid).toBe(true);
            expect(validateExchangeRate(0.85).valid).toBe(true);
        });

        it('should reject zero or negative', () => {
            expect(validateExchangeRate(0).valid).toBe(false);
            expect(validateExchangeRate(-1).valid).toBe(false);
        });
    });

    describe('sanitizeInput', () => {
        it('should remove HTML tags', () => {
            const result = sanitizeInput('<script>alert("xss")</script>');
            expect(result).not.toContain('<script>');
            expect(result).not.toContain('</script>');
        });

        it('should remove dangerous characters', () => {
            const result = sanitizeInput('Test<>"\'');
            expect(result).not.toContain('<');
            expect(result).not.toContain('>');
        });

        it('should trim whitespace', () => {
            expect(sanitizeInput('  test  ')).toBe('test');
        });

        it('should handle non-string inputs', () => {
            expect(sanitizeInput(null)).toBe('');
            expect(sanitizeInput(undefined)).toBe('');
            expect(sanitizeInput(123)).toBe('');
        });
    });
});
