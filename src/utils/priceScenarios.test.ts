import { describe, it, expect } from 'vitest';
import { breakEvenSellPrice, positionScenarios, sellScenarios } from './priceScenarios';
import { simulateSell, type SellSimulationParams } from './sellSimulation';
import type { PortfolioAccount, Transaction } from '../types/database';

const standard: PortfolioAccount = {
    id: 1,
    name: 'Główny',
    type: 'standard',
    currency: 'PLN',
    taxRate: 19,
    createdAt: '2026-01-01T00:00:00.000Z'
};

const buy = (overrides: Partial<Transaction>): Transaction => ({
    portfolioId: 1,
    date: '2026-01-10',
    type: 'Kupno',
    ticker: 'CDR.WA',
    amount: 10,
    price: 100,
    total: 1000,
    currency: 'PLN',
    ...overrides
});

const params: SellSimulationParams = {
    transactions: [buy({ id: 1, price: 100 }), buy({ id: 2, date: '2026-03-10', price: 200 })],
    portfolios: [standard],
    portfolioId: 1,
    ticker: 'CDR.WA',
    shares: 15,
    price: 150,
    currency: 'PLN',
    date: '2026-10-17',
    brokerRate: 1,
    nbpTaxRate: null
};

describe('priceScenarios', () => {
    it('finds the sell price at which the FIFO result is zero', () => {
        const outcome = simulateSell({ ...params, commission: 10, commissionCurrency: 'PLN' });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;

        // Cost 10 × 100 + 5 × 200 = 2000, plus 10 commission, spread over 15 shares
        const breakEven = breakEvenSellPrice(outcome.result.trade)!;
        expect(breakEven).toBeCloseTo(2010 / 15);

        const atBreakEven = simulateSell({ ...params, price: breakEven, commission: 10, commissionCurrency: 'PLN' });
        expect(atBreakEven.ok && atBreakEven.result.trade.gainLossPLN).toBeCloseTo(0);
    });

    it('accounts for the exchange rate in a foreign break-even price', () => {
        const outcome = simulateSell({
            ...params,
            transactions: [buy({ id: 1, ticker: 'AAPL', currency: 'USD', price: 100, taxExchangeRate: 4 })],
            ticker: 'AAPL',
            currency: 'USD',
            shares: 10,
            price: 120,
            brokerRate: 3.6,
            nbpTaxRate: 3.6
        });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        // 4000 PLN cost recovered at 3.6 PLN/USD
        expect(breakEvenSellPrice(outcome.result.trade)).toBeCloseTo(4000 / 36);
    });

    it('re-runs the FIFO sell at each price step', () => {
        const rows = sellScenarios(params, [-10, 0, 10]);
        expect(rows.map(r => r.price)).toEqual([135, 150, 165]);
        // 10 × (p − 100) + 5 × (p − 200)
        expect(rows[0]!.pl).toBeCloseTo(25);
        expect(rows[1]!.pl).toBeCloseTo(250);
        expect(rows[2]!.pl).toBeCloseTo(475);
        expect(rows[1]!.tax).toBeCloseTo(47.5);
        expect(rows[1]!.afterTax).toBeCloseTo(202.5);

        const losing = sellScenarios(params, [-20]);
        expect(losing[0]!.pl).toBeCloseTo(-200);
        expect(losing[0]!.tax).toBe(0);
    });

    it('values the whole position after a buy', () => {
        const rows = positionScenarios(20, 150, 150, 19, [-10, 0, 20]);
        expect(rows[0]!.pl).toBeCloseTo(-300);
        expect(rows[0]!.tax).toBe(0);
        expect(rows[1]!.pl).toBeCloseTo(0);
        expect(rows[2]!.pl).toBeCloseTo(600);
        expect(rows[2]!.plPercent).toBeCloseTo(20);
        expect(rows[2]!.afterTax).toBeCloseTo(486);

        expect(positionScenarios(20, 150, 150, 0, [20])[0]!.tax).toBe(0);
    });
});
