import { describe, it, expect } from 'vitest';
import { replayLedger, newViolations, sortTransactions, cashImpactPLN } from './ledger';
import type { Dividend, Transaction } from '../types/database';

let nextId = 1;
const deposit = (date: string, amount: number): Transaction => ({
    id: nextId++,
    date,
    type: 'Wpłata',
    ticker: 'CASH',
    amount: 1,
    price: amount,
    total: amount,
    currency: 'PLN',
    exchangeRate: 1
});
const withdraw = (date: string, amount: number): Transaction => ({ ...deposit(date, amount), type: 'Wypłata' });
const trade = (
    type: 'Kupno' | 'Sprzedaż',
    date: string,
    ticker: string,
    amount: number,
    price: number,
    extra: Partial<Transaction> = {}
): Transaction => ({
    id: nextId++,
    date,
    type,
    ticker,
    amount,
    price,
    total: amount * price,
    currency: 'PLN',
    exchangeRate: 1,
    ...extra
});
const buy = (date: string, ticker: string, amount: number, price: number, extra?: Partial<Transaction>) =>
    trade('Kupno', date, ticker, amount, price, extra);
const sell = (date: string, ticker: string, amount: number, price: number, extra?: Partial<Transaction>) =>
    trade('Sprzedaż', date, ticker, amount, price, extra);

describe('sortTransactions', () => {
    it('orders same-day operations: deposit, buy, sell, withdraw', () => {
        const txs = [
            withdraw('2025-01-10', 10),
            buy('2025-01-10', 'CDR', 1, 100),
            sell('2025-01-10', 'PKO', 1, 50),
            deposit('2025-01-10', 500)
        ];
        expect(sortTransactions(txs).map(t => t.type)).toEqual(['Wpłata', 'Kupno', 'Sprzedaż', 'Wypłata']);
    });

    it('compares only the calendar date part of ISO timestamps', () => {
        const a = buy('2025-01-10T23:00:00.000Z', 'CDR', 1, 1);
        const b = deposit('2025-01-10', 5);
        expect(sortTransactions([a, b])[0]).toBe(b);
    });
});

describe('replayLedger', () => {
    it('computes cash, amount and average price with buy commission', () => {
        const r = replayLedger([
            deposit('2025-01-01', 10_000),
            buy('2025-01-02', 'CDR', 10, 100, { commission: 5, commissionCurrency: 'PLN' }),
            buy('2025-01-03', 'CDR', 10, 200)
        ]);
        expect(r.violations).toEqual([]);
        expect(r.cashPLN).toBeCloseTo(10_000 - 1005 - 2000);
        expect(r.holdings).toHaveLength(1);
        expect(r.holdings[0]!.amount).toBe(20);
        expect(r.holdings[0]!.avgPrice).toBeCloseTo(3005 / 20);
        expect(r.holdings[0]!.costPLN).toBeCloseTo(3005);
    });

    it('converts foreign trades to PLN for cash and keeps avg price in native currency', () => {
        const r = replayLedger([
            deposit('2025-01-01', 10_000),
            buy('2025-01-02', 'AAPL', 2, 200, {
                currency: 'USD',
                exchangeRate: 4,
                commission: 1,
                commissionCurrency: 'USD'
            })
        ]);
        expect(r.cashPLN).toBeCloseTo(10_000 - 2 * 200 * 4 - 4);
        expect(r.holdings[0]!.currency).toBe('USD');
        expect(r.holdings[0]!.avgPrice).toBeCloseTo(200.5);
        expect(r.holdings[0]!.costPLN).toBeCloseTo(1604);
    });

    it('sell keeps average price, reduces cost proportionally and drops closed positions', () => {
        const r1 = replayLedger([
            deposit('2025-01-01', 1000),
            buy('2025-01-02', 'CDR', 10, 50),
            sell('2025-01-03', 'CDR', 4, 80, { commission: 2, commissionCurrency: 'PLN' })
        ]);
        expect(r1.holdings[0]!.amount).toBe(6);
        expect(r1.holdings[0]!.avgPrice).toBe(50);
        expect(r1.holdings[0]!.costPLN).toBeCloseTo(300);
        expect(r1.cashPLN).toBeCloseTo(1000 - 500 + 320 - 2);

        const r2 = replayLedger([
            deposit('2025-01-01', 1000),
            buy('2025-01-02', 'CDR', 10, 50),
            sell('2025-01-03', 'CDR', 10, 60)
        ]);
        expect(r2.holdings).toEqual([]);
    });

    it('same-day deposit covers a buy entered before it', () => {
        const r = replayLedger([buy('2025-02-01', 'CDR', 1, 100), deposit('2025-02-01', 100)]);
        expect(r.violations).toEqual([]);
        expect(r.cashPLN).toBeCloseTo(0);
    });

    it('allows a same-day buy and sell of the same ticker (day trade)', () => {
        const r = replayLedger([
            deposit('2025-01-01', 1000),
            sell('2025-01-02', 'CDR', 2, 110),
            buy('2025-01-02', 'CDR', 5, 100)
        ]);
        expect(r.violations).toEqual([]);
        expect(r.holdings[0]!.amount).toBe(3);
    });

    it('lets a same-day sell fund a buy (cash checked at end of day)', () => {
        const r = replayLedger([
            deposit('2025-01-01', 500),
            buy('2025-01-01', 'PKO', 10, 50),
            buy('2025-01-05', 'CDR', 1, 400),
            sell('2025-01-05', 'PKO', 10, 50)
        ]);
        expect(r.violations).toEqual([]);
        expect(r.cashPLN).toBeCloseTo(100);
    });

    it('reports a buy not covered by cash on its date', () => {
        const b = buy('2025-01-05', 'CDR', 10, 100);
        const r = replayLedger([deposit('2025-01-01', 400), b, deposit('2025-02-01', 1000)]);
        expect(r.violations).toHaveLength(1);
        expect(r.violations[0]).toMatchObject({ kind: 'cash', txId: b.id, shortfall: 600 });
        expect(r.cashPLN).toBeCloseTo(400);
    });

    it('reports a withdrawal larger than cash', () => {
        const r = replayLedger([deposit('2025-01-01', 100), withdraw('2025-01-02', 150)]);
        expect(r.violations[0]).toMatchObject({ kind: 'cash', shortfall: 50 });
    });

    it('reports selling more shares than held on that date', () => {
        const s = sell('2025-01-02', 'CDR', 5, 10);
        const r = replayLedger([deposit('2025-01-01', 1000), s, buy('2025-01-03', 'CDR', 5, 10)]);
        expect(r.violations.find(v => v.kind === 'shares')).toMatchObject({ txId: s.id, shortfall: 5 });
    });

    it('reports currency change for an existing ticker and keeps the first currency', () => {
        const r = replayLedger([
            deposit('2025-01-01', 10_000),
            buy('2025-01-02', 'AAPL', 1, 100, { currency: 'USD', exchangeRate: 4 }),
            buy('2025-01-03', 'AAPL', 1, 100, { currency: 'EUR', exchangeRate: 4.3 })
        ]);
        expect(r.violations.map(v => v.kind)).toEqual(['currency']);
        expect(r.holdings[0]!.currency).toBe('USD');
    });

    it('accepts English legacy type names', () => {
        const r = replayLedger([
            { ...deposit('2025-01-01', 100), type: 'deposit' },
            { ...buy('2025-01-02', 'X', 1, 50), type: 'buy' }
        ]);
        expect(r.cashPLN).toBeCloseTo(50);
        expect(r.holdings[0]!.amount).toBe(1);
    });
});

describe('cashImpactPLN', () => {
    it('applies PLN commission on sell', () => {
        expect(cashImpactPLN(sell('2025-01-01', 'X', 2, 10, { commission: 3, commissionCurrency: 'PLN' }))).toBe(17);
    });
});

describe('newViolations', () => {
    it('returns only violations introduced by a change', () => {
        const b = buy('2025-01-05', 'CDR', 10, 100);
        const legacy = replayLedger([b]).violations;
        const after = replayLedger([b, withdraw('2025-01-06', 1)]).violations;
        expect(newViolations(legacy, legacy)).toEqual([]);
        expect(newViolations(legacy, after)).toHaveLength(1);
        expect(newViolations(legacy, after)[0]!.type).toBe('Wypłata');
    });
});

describe('replayLedger with dividends', () => {
    const div = (paymentDate: string, totalAmount: number, extra: Partial<Dividend> = {}): Dividend => ({
        id: nextId++,
        ticker: 'AAPL',
        recordDate: paymentDate,
        paymentDate,
        amountPerShare: 1,
        totalAmount,
        currency: 'USD',
        exchangeRate: 4,
        withholdingTaxRate: 15,
        status: 'received',
        ...extra
    });

    it('credits the net foreign dividend in PLN on the payment date', () => {
        const r = replayLedger([deposit('2025-01-01', 100)], [div('2025-02-01', 10)], '2025-12-31');
        expect(r.dividendsPLN).toBeCloseTo(34);
        expect(r.cashPLN).toBeCloseTo(134);
    });

    it('applies the default 19% withholding to PLN dividends without a stored rate', () => {
        const d = div('2025-02-01', 100, { currency: 'PLN', exchangeRate: 1, withholdingTaxRate: undefined });
        expect(replayLedger([], [d], '2025-12-31').cashPLN).toBeCloseTo(81);
    });

    it('ignores dividends paid after today', () => {
        const r = replayLedger([], [div('2026-02-01', 10)], '2026-01-15');
        expect(r.dividendsPLN).toBe(0);
    });

    it('skips dividends without an exchange rate and reports them', () => {
        const r = replayLedger([], [div('2025-02-01', 10, { exchangeRate: 1 })], '2025-12-31');
        expect(r.cashPLN).toBe(0);
        expect(r.unpricedDividends).toHaveLength(1);
    });

    it('lets a dividend fund a buy on the same day', () => {
        const r = replayLedger(
            [buy('2025-03-03', 'CDR', 1, 30)],
            [div('2025-03-03', 50, { currency: 'PLN', exchangeRate: 1, withholdingTaxRate: 0 })],
            '2025-12-31'
        );
        expect(r.violations).toEqual([]);
        expect(r.cashPLN).toBeCloseTo(20);
    });
});
