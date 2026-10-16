import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import {
    addTransaction,
    updateTransaction,
    deleteTransaction,
    reconcileDatabase,
    refreshSnapshots,
    LedgerError
} from './ledgerStore';
import { CORRECTION_NOTE, loadLedgerReport } from './ledgerReconcile';
import type { Transaction } from '../types/database';

const deposit = (date: string, amount: number, portfolioId = 1): Transaction => ({
    portfolioId,
    date,
    type: 'Wpłata',
    ticker: 'CASH',
    amount: 1,
    price: amount,
    total: amount,
    currency: 'PLN',
    exchangeRate: 1
});
const buy = (date: string, ticker: string, amount: number, price: number, portfolioId = 1): Transaction => ({
    portfolioId,
    date,
    type: 'Kupno',
    ticker,
    amount,
    price,
    total: amount * price,
    currency: 'PLN',
    exchangeRate: 1
});

const cashOf = async (portfolioId = 1) =>
    (await db.portfolioCash.filter(c => c.portfolioId === portfolioId).toArray()).reduce((s, c) => s + c.amount, 0);

beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await db.portfolios.bulkAdd([
        { id: 1, name: 'Główny', type: 'standard', currency: 'PLN', taxRate: 19, createdAt: '' },
        { id: 2, name: 'IKE', type: 'ike', currency: 'PLN', taxRate: 0, createdAt: '' }
    ]);
    localStorage.clear();
});

describe('ledgerStore write path', () => {
    it('adds transactions and materializes holdings and cash', async () => {
        await addTransaction(deposit('2025-01-01', 1000));
        await addTransaction(buy('2025-01-02', 'CDR', 3, 100));

        const assets = await db.assets.toArray();
        expect(assets).toHaveLength(1);
        expect(assets[0]).toMatchObject({ portfolioId: 1, ticker: 'CDR', amount: 3, avgPrice: 100, currency: 'PLN' });
        expect(await cashOf()).toBeCloseTo(700);
    });

    it('keeps portfolios separate', async () => {
        await addTransaction(deposit('2025-01-01', 1000, 1));
        await addTransaction(deposit('2025-01-01', 50, 2));
        expect(await cashOf(1)).toBeCloseTo(1000);
        expect(await cashOf(2)).toBeCloseTo(50);
    });

    it('rejects a buy not covered by cash on its date and writes nothing', async () => {
        await addTransaction(deposit('2025-01-10', 1000));
        await expect(addTransaction(buy('2025-01-05', 'CDR', 1, 100))).rejects.toBeInstanceOf(LedgerError);
        expect(await db.transactions.count()).toBe(1);
        expect(await db.assets.count()).toBe(0);
    });

    it('blocks deleting a deposit that funded a later buy', async () => {
        const depId = await addTransaction(deposit('2025-01-01', 1000));
        await addTransaction(buy('2025-01-02', 'CDR', 5, 100));
        const dep = (await db.transactions.get(depId))!;

        const err = await deleteTransaction({ ...dep, id: depId }).catch(e => e);
        expect(err).toBeInstanceOf(LedgerError);
        expect((err as LedgerError).message).toContain('Kupno CDR 2025-01-02');
        expect(await db.transactions.count()).toBe(2);
    });

    it('allows deleting the buy and then the deposit', async () => {
        const depId = await addTransaction(deposit('2025-01-01', 1000));
        const buyId = await addTransaction(buy('2025-01-02', 'CDR', 5, 100));

        await deleteTransaction({ ...(await db.transactions.get(buyId))!, id: buyId });
        expect(await db.assets.count()).toBe(0);
        expect(await cashOf()).toBeCloseTo(1000);

        await deleteTransaction({ ...(await db.transactions.get(depId))!, id: depId });
        expect(await cashOf()).toBeCloseTo(0);
    });

    it('updates a transaction and recalculates the snapshot', async () => {
        await addTransaction(deposit('2025-01-01', 1000));
        const buyId = await addTransaction(buy('2025-01-02', 'CDR', 5, 100));
        const original = (await db.transactions.get(buyId))!;

        await updateTransaction({ ...original, id: buyId, amount: 2, total: 200 });
        expect((await db.assets.toArray())[0]!.amount).toBe(2);
        expect(await cashOf()).toBeCloseTo(800);

        await expect(updateTransaction({ ...original, id: buyId, amount: 20, total: 2000 })).rejects.toBeInstanceOf(
            LedgerError
        );
    });

    it('does not block unrelated changes when history already has a problem', async () => {
        // Legacy data written directly: buy before any deposit
        await db.transactions.bulkAdd([buy('2025-01-01', 'CDR', 1, 100), deposit('2025-02-01', 500)]);
        await expect(addTransaction(deposit('2025-03-01', 10))).resolves.toBeTypeOf('number');
    });
});

describe('reconcileDatabase', () => {
    it('adds a correction deposit when stored cash exceeds history, and reports share differences', async () => {
        await db.transactions.bulkAdd([deposit('2025-01-05', 1000), buy('2025-01-06', 'CDR', 2, 100)]);
        await db.portfolioCash.add({ portfolioId: 1, currency: 'PLN', amount: 1300 }); // history says 800
        await db.assets.add({
            portfolioId: 1,
            ticker: 'CDR',
            type: 'stock',
            amount: 3,
            avgPrice: 100,
            currency: 'PLN'
        });

        const report = await reconcileDatabase('import', { storedCashIncludesDividends: true });

        const correction = await db.transactions.filter(t => t.note === CORRECTION_NOTE).first();
        expect(correction).toMatchObject({ type: 'Wpłata', total: 500, date: '2025-01-05' });
        expect(await cashOf()).toBeCloseTo(1300);
        expect((await db.assets.toArray())[0]!.amount).toBe(2);
        expect(report.some(l => l.includes('CDR: zapisane 3 szt.'))).toBe(true);
        expect(loadLedgerReport()?.items).toEqual(report);
    });

    it('adds a correction withdrawal dated today when stored cash is lower', async () => {
        await db.transactions.add(deposit('2025-01-05', 1000));
        await db.portfolioCash.add({ portfolioId: 1, currency: 'PLN', amount: 900 });

        await reconcileDatabase('import', { storedCashIncludesDividends: true });

        const correction = await db.transactions.filter(t => t.note === CORRECTION_NOTE).first();
        expect(correction).toMatchObject({ type: 'Wypłata', total: 100 });
        expect(await cashOf()).toBeCloseTo(900);
    });

    it('does nothing and stores no report when data is consistent', async () => {
        await addTransaction(deposit('2025-01-01', 1000));
        const report = await reconcileDatabase('import', { storedCashIncludesDividends: true });
        expect(report).toEqual([]);
        expect(loadLedgerReport()).toBeNull();
        expect(await db.transactions.count()).toBe(1);
    });
});

describe('dividends and cash', () => {
    const plnDividend = (paymentDate: string, totalAmount: number, portfolioId = 1) => ({
        portfolioId,
        ticker: 'CDR',
        recordDate: paymentDate,
        paymentDate,
        amountPerShare: 1,
        totalAmount,
        currency: 'PLN' as const,
        exchangeRate: 1,
        withholdingTaxRate: 19,
        status: 'received' as const
    });

    it('legacy reconcile adds dividends to cash without a correction and reports it', async () => {
        await db.transactions.add(deposit('2025-01-01', 1000));
        await db.dividends.add(plnDividend('2025-02-01', 100));
        await db.portfolioCash.add({ portfolioId: 1, currency: 'PLN', amount: 1000 }); // cash before dividends

        const report = await reconcileDatabase('migration', { storedCashIncludesDividends: false });

        expect(await db.transactions.count()).toBe(1);
        expect(await cashOf()).toBeCloseTo(1081);
        expect(report.some(l => l.includes('doliczono 81,00 zł'))).toBe(true);
    });

    it('reconcile of a new-format backup expects cash to include dividends', async () => {
        await db.transactions.add(deposit('2025-01-01', 1000));
        await db.dividends.add(plnDividend('2025-02-01', 100));
        await db.portfolioCash.add({ portfolioId: 1, currency: 'PLN', amount: 1081 });

        const report = await reconcileDatabase('import', { storedCashIncludesDividends: true });

        expect(report).toEqual([]);
        expect(await cashOf()).toBeCloseTo(1081);
    });

    it('refreshSnapshots credits a newly added dividend', async () => {
        await addTransaction(deposit('2025-01-01', 1000));
        await db.dividends.add(plnDividend('2025-02-01', 100));
        await refreshSnapshots([1]);
        expect(await cashOf()).toBeCloseTo(1081);
    });

    it('validation counts dividends as available cash', async () => {
        await db.dividends.add(plnDividend('2025-02-01', 100));
        await refreshSnapshots();
        await expect(addTransaction(buy('2025-02-02', 'CDR', 1, 80))).resolves.toBeTypeOf('number');
    });
});
