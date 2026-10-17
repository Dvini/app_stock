import { describe, it, expect } from 'vitest';
import { simulateSell, heldSharesOf } from './sellSimulation';
import type { PortfolioAccount, Transaction } from '../types/database';

const standard: PortfolioAccount = {
    id: 1,
    name: 'Główny',
    type: 'standard',
    currency: 'PLN',
    taxRate: 19,
    createdAt: '2026-01-01T00:00:00.000Z'
};
const ike: PortfolioAccount = { ...standard, id: 2, name: 'IKE', type: 'ike', taxRate: 0 };

const buy = (overrides: Partial<Transaction>): Transaction => ({
    portfolioId: 1,
    date: '2026-01-10',
    type: 'Kupno',
    ticker: 'PKN.WA',
    amount: 10,
    price: 50,
    total: 500,
    currency: 'PLN',
    ...overrides
});

const base = {
    portfolios: [standard, ike],
    portfolioId: 1,
    ticker: 'PKN.WA',
    currency: 'PLN' as const,
    date: '2026-10-17',
    brokerRate: 1,
    nbpTaxRate: null
};

describe('sellSimulation', () => {
    it('matches lots FIFO and reports gain, tax and per-lot results', () => {
        const transactions = [
            buy({ id: 1, date: '2026-01-10', amount: 10, price: 50 }),
            buy({ id: 2, date: '2026-03-10', amount: 10, price: 80 })
        ];

        const outcome = simulateSell({ ...base, transactions, shares: 15, price: 70 });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        const { result } = outcome;

        expect(result.heldShares).toBe(20);
        expect(result.lots).toHaveLength(2);
        expect(result.lots[0]!.shares).toBe(10);
        expect(result.lots[0]!.gainPLN).toBeCloseTo(200); // 10 × (70 − 50)
        expect(result.lots[1]!.shares).toBe(5);
        expect(result.lots[1]!.gainPLN).toBeCloseTo(-50); // 5 × (70 − 80)
        expect(result.trade.gainLossPLN).toBeCloseTo(150);
        expect(result.trade.taxLiabilityPLN).toBeCloseTo(28.5);
        expect(result.afterTaxPLN).toBeCloseTo(121.5);
        expect(result.gainPercent).toBeCloseTo((150 / 900) * 100);
        expect(result.netCashPLN).toBeCloseTo(1050);
    });

    it('skips lots already consumed by earlier sells', () => {
        const transactions = [
            buy({ id: 1, date: '2026-01-10', amount: 10, price: 50 }),
            buy({ id: 2, date: '2026-03-10', amount: 10, price: 80 }),
            buy({ id: 3, date: '2026-05-10', type: 'Sprzedaż', amount: 10, price: 60 })
        ];

        const outcome = simulateSell({ ...base, transactions, shares: 10, price: 70 });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.result.lots).toHaveLength(1);
        expect(outcome.result.lots[0]!.buyPriceNative).toBe(80);
        expect(outcome.result.trade.gainLossPLN).toBeCloseTo(-100);
        expect(outcome.result.trade.taxLiabilityPLN).toBe(0);
    });

    it('deducts buy and sell commissions from the gain and cash', () => {
        const transactions = [buy({ id: 1, amount: 10, price: 50, commission: 5, commissionCurrency: 'PLN' })];

        const outcome = simulateSell({
            ...base,
            transactions,
            shares: 10,
            price: 60,
            commission: 3,
            commissionCurrency: 'PLN'
        });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.result.trade.gainLossPLN).toBeCloseTo(100 - 5 - 3);
        expect(outcome.result.lots[0]!.gainPLN).toBeCloseTo(92);
        expect(outcome.result.netCashPLN).toBeCloseTo(597);
        expect(outcome.result.gainNative).toBeCloseTo(100);
    });

    it('splits a foreign gain into share price and exchange rate parts', () => {
        const transactions = [
            buy({
                id: 1,
                ticker: 'AAPL',
                amount: 10,
                price: 100,
                currency: 'USD',
                exchangeRate: 4.05,
                taxExchangeRate: 4.0
            })
        ];

        const outcome = simulateSell({
            ...base,
            transactions,
            ticker: 'AAPL',
            currency: 'USD',
            shares: 10,
            price: 120,
            brokerRate: 3.55,
            nbpTaxRate: 3.6
        });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        const { result } = outcome;

        // Revenue 1200 × 3.6 = 4320, cost 1000 × 4.0 = 4000
        expect(result.trade.gainLossPLN).toBeCloseTo(320);
        expect(result.priceGainPLN).toBeCloseTo(800); // 10 × 20 USD × 4.0
        expect(result.fxGainPLN).toBeCloseTo(-480); // 1200 USD × (3.6 − 4.0)
        expect(result.gainNative).toBeCloseTo(200);
        expect(result.gainNativePercent).toBeCloseTo(20);
        expect(result.netCashPLN).toBeCloseTo(1200 * 3.55);
        expect(result.trade.usesBrokerRate).toBe(false);
    });

    it('flags the broker rate when the NBP rate is unavailable', () => {
        const transactions = [
            buy({ id: 1, ticker: 'AAPL', currency: 'USD', price: 100, exchangeRate: 4, taxExchangeRate: 4 })
        ];
        const outcome = simulateSell({
            ...base,
            transactions,
            ticker: 'AAPL',
            currency: 'USD',
            shares: 5,
            price: 110,
            brokerRate: 3.7,
            nbpTaxRate: null
        });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.result.trade.usesBrokerRate).toBe(true);
        expect(outcome.result.trade.sellExchangeRate).toBe(3.7);
    });

    it('has no tax on an IKE account', () => {
        const transactions = [buy({ id: 1, portfolioId: 2, amount: 10, price: 50 })];
        const outcome = simulateSell({ ...base, transactions, portfolioId: 2, shares: 10, price: 100 });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.result.trade.gainLossPLN).toBeCloseTo(500);
        expect(outcome.result.trade.taxLiabilityPLN).toBe(0);
        expect(outcome.result.afterTaxPLN).toBeCloseTo(500);
    });

    it('refuses to sell more shares than held in that portfolio', () => {
        const transactions = [
            buy({ id: 1, amount: 10 }),
            buy({ id: 2, portfolioId: 2, amount: 50 }),
            buy({ id: 3, ticker: 'CDR.WA', amount: 100 })
        ];
        expect(heldSharesOf(transactions, 1, 'pkn.wa')).toBe(10);

        const outcome = simulateSell({ ...base, transactions, shares: 11, price: 60 });
        expect(outcome).toEqual({ ok: false, heldShares: 10 });
    });
});
