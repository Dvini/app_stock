/**
 * Unit Tests for DividendService - Simplified
 * Tests critical business logic for dividend calculations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TIME_CONSTANTS } from '../utils/constants';

// Mock modules FIRST (hoisted)
vi.mock('../db/db', () => ({
    db: {
        dividends: {
            toArray: vi.fn(),
            where: vi.fn(),
            add: vi.fn(),
            delete: vi.fn()
        },
        transactions: {
            orderBy: vi.fn(),
            where: vi.fn()
        }
    }
}));

vi.mock('./NBPService', () => ({
    nbpService: {
        getHistoricalRate: vi.fn()
    }
}));

// Import after mocks
import { dividendService } from './DividendService';
import { db } from '../db/db';

describe('DividendService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('calculateYTDTotal', () => {
        it('should calculate total dividends for current year', async () => {
            const currentYear = new Date().getFullYear();
            const ytdDividends = [
                { paymentDate: `${currentYear}-03-15`, valuePLN: 100, status: 'received' },
                { paymentDate: `${currentYear}-06-15`, valuePLN: 150, status: 'received' }
            ];

            db.dividends.where.mockReturnValue({
                aboveOrEqual: vi.fn().mockReturnValue({
                    and: vi.fn().mockReturnValue({
                        toArray: vi.fn().mockResolvedValue(ytdDividends)
                    })
                })
            });

            const result = await dividendService.calculateYTDTotal();
            expect(result).toBe(250);
        });

        it('should return 0 when no dividends', async () => {
            db.dividends.where.mockReturnValue({
                aboveOrEqual: vi.fn().mockReturnValue({
                    and: vi.fn().mockReturnValue({
                        toArray: vi.fn().mockResolvedValue([])
                    })
                })
            });

            const result = await dividendService.calculateYTDTotal();
            expect(result).toBe(0);
        });
    });

    describe('calculateMonthlyAverage', () => {
        it('should calculate average over 12 months', async () => {
            const dividends = [
                { valuePLN: 100, status: 'received' },
                { valuePLN: 200, status: 'received' }
            ];

            db.dividends.where.mockReturnValue({
                aboveOrEqual: vi.fn().mockReturnValue({
                    and: vi.fn().mockReturnValue({
                        toArray: vi.fn().mockResolvedValue(dividends)
                    })
                })
            });

            const result = await dividendService.calculateMonthlyAverage();
            const expected = 300 / TIME_CONSTANTS.MONTHS_PER_YEAR;
            expect(result).toBe(expected);
        });
    });

    describe('_calculateSharesOnDate', () => {
        it('should calculate shares owned on specific date', () => {
            const transactions = [
                { ticker: 'AAPL', type: 'Kupno', amount: 10, date: '2024-01-01' },
                { ticker: 'AAPL', type: 'Kupno', amount: 5, date: '2024-02-01' },
                { ticker: 'AAPL', type: 'Sprzedaż', amount: 3, date: '2024-03-01' }
            ];

            const shares = dividendService._calculateSharesOnDate(transactions, 'AAPL', '2024-03-15');
            expect(shares).toBe(12); // 10 + 5 - 3
        });

        it('should not count transactions after target date', () => {
            const transactions = [
                { ticker: 'AAPL', type: 'Kupno', amount: 10, date: '2024-01-01' },
                { ticker: 'AAPL', type: 'Kupno', amount: 5, date: '2024-05-01' }
            ];

            const shares = dividendService._calculateSharesOnDate(transactions, 'AAPL', '2024-02-01');
            expect(shares).toBe(10);
        });

        it('should return 0 for ticker with no transactions', () => {
            const transactions = [{ ticker: 'AAPL', type: 'Kupno', amount: 10, date: '2024-01-01' }];

            const shares = dividendService._calculateSharesOnDate(transactions, 'MSFT', '2024-02-01');
            expect(shares).toBe(0);
        });
    });
});
