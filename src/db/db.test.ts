import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach } from 'vitest';
import { StockTrackerDatabase, normalizePortfolioType } from './db';
import { CORRECTION_NOTE, loadLedgerReport } from '../lib/ledgerReconcile';

beforeEach(async () => {
    await Dexie.delete('StockTrackerDB');
    localStorage.clear();
});

describe('normalizePortfolioType', () => {
    it('keeps supported types', () => {
        expect(normalizePortfolioType('ike')).toBe('ike');
        expect(normalizePortfolioType('ikze')).toBe('ikze');
        expect(normalizePortfolioType('custom')).toBe('custom');
    });

    it('maps removed or unknown types to standard', () => {
        expect(normalizePortfolioType('crypto')).toBe('standard');
        expect(normalizePortfolioType(undefined)).toBe('standard');
        expect(normalizePortfolioType('foo')).toBe('standard');
    });
});

describe('DB migration v10 (ledger)', () => {
    it('rebuilds holdings/cash from transactions and corrects cash drift', async () => {
        const legacy = new Dexie('StockTrackerDB');
        legacy.version(8).stores({
            portfolios: '++id, name, type, currency',
            assets: '++id, portfolioId, ticker, type, amount, avgPrice, currency, [portfolioId+ticker]',
            transactions: '++id, portfolioId, date, type, ticker',
            portfolioCash: '++id, portfolioId, currency, [portfolioId+currency], amount'
        });
        await legacy.open();
        await legacy
            .table('portfolios')
            .add({ id: 1, name: 'Główny', type: 'standard', currency: 'PLN', taxRate: 19, createdAt: '' });
        await legacy.table('transactions').bulkAdd([
            {
                portfolioId: 1,
                date: '2025-01-01',
                type: 'Wpłata',
                ticker: 'CASH',
                amount: 1,
                price: 1000,
                total: 1000,
                currency: 'PLN',
                exchangeRate: 1
            },
            {
                portfolioId: 1,
                date: '2025-01-02',
                type: 'Kupno',
                ticker: 'CDR',
                amount: 2,
                price: 100,
                total: 200,
                currency: 'PLN',
                exchangeRate: 1
            },
            {
                portfolioId: 1,
                date: '2025-01-03',
                type: 'Kupno',
                ticker: 'CDR',
                amount: 1,
                price: 100,
                total: 100,
                currency: 'EUR',
                exchangeRate: 4
            }
        ]);
        // Stored state drifted: avg price overwritten with EUR, cash off by 50
        await legacy
            .table('assets')
            .add({ portfolioId: 1, ticker: 'CDR', type: 'stock', amount: 3, avgPrice: 100, currency: 'EUR' });
        await legacy.table('portfolioCash').add({ portfolioId: 1, currency: 'PLN', amount: 450 });
        legacy.close();

        const db = new StockTrackerDatabase();
        await db.open();
        const assets = await db.assets.toArray();
        const cash = await db.portfolioCash.toArray();
        const correction = await db.transactions.filter(t => t.note === CORRECTION_NOTE).first();
        db.close();

        // History: 1000 - 200 - 400 = 400 PLN; stored 450 -> +50 correction keeps displayed cash
        expect(correction).toMatchObject({ type: 'Wpłata', total: 50, date: '2025-01-01' });
        expect(cash).toHaveLength(1);
        expect(cash[0]!.amount).toBeCloseTo(450);
        expect(assets).toHaveLength(1);
        expect(assets[0]).toMatchObject({ ticker: 'CDR', amount: 3, currency: 'PLN' });
        const report = loadLedgerReport();
        expect(report?.source).toBe('migration');
        expect(report?.items.some(i => i.includes('waluta EUR'))).toBe(true);
    });

    it('backfills dividend withholding, drops placeholder FX rates and credits dividends to cash', async () => {
        const legacy = new Dexie('StockTrackerDB');
        legacy.version(9).stores({
            portfolios: '++id, name, type, currency',
            transactions: '++id, portfolioId, date, type, ticker',
            portfolioCash: '++id, portfolioId, currency, [portfolioId+currency], amount',
            dividends: '++id, portfolioId, ticker, recordDate, paymentDate, status'
        });
        await legacy.open();
        await legacy.table('portfolios').bulkAdd([
            { id: 1, name: 'Główny', type: 'standard', currency: 'PLN', taxRate: 19, createdAt: '' },
            { id: 2, name: 'IKE', type: 'ike', currency: 'PLN', taxRate: 0, createdAt: '' }
        ]);
        const base = { recordDate: '2025-02-01', paymentDate: '2025-02-01', amountPerShare: 1, status: 'received' };
        await legacy.table('dividends').bulkAdd([
            { ...base, portfolioId: 1, ticker: 'AAPL', totalAmount: 10, currency: 'USD', exchangeRate: 1 },
            { ...base, portfolioId: 1, ticker: 'CDR', totalAmount: 100, currency: 'PLN', exchangeRate: 1 },
            { ...base, portfolioId: 2, ticker: 'PKO', totalAmount: 100, currency: 'PLN', exchangeRate: 1 }
        ]);
        legacy.close();

        const db = new StockTrackerDatabase();
        await db.open();
        const dividends = await db.dividends.orderBy('id').toArray();
        const cash = await db.portfolioCash.toArray();
        db.close();

        expect(dividends.map(d => [d.withholdingTaxRate, d.exchangeRate])).toEqual([
            [15, undefined],
            [19, 1],
            [0, 1]
        ]);
        const cashBy = (id: number) => cash.find(c => c.portfolioId === id)?.amount;
        expect(cashBy(1)).toBeCloseTo(81); // USD dividend has no rate yet -> not credited
        expect(cashBy(2)).toBeCloseTo(100); // IKE: no Polish withholding
        expect(loadLedgerReport()?.items.some(i => i.includes('bez kursu NBP'))).toBe(true);
    });
});

describe('DB migration v8', () => {
    it('converts crypto portfolios to standard and forces PLN currency', async () => {
        // Seed a database at schema v7 (version 70 in IndexedDB terms) with legacy data
        const legacy = new Dexie('StockTrackerDB');
        legacy.version(7).stores({
            portfolios: '++id, name, type, currency'
        });
        await legacy.open();
        await legacy.table('portfolios').bulkAdd([
            { id: 1, name: 'Główny', type: 'standard', currency: 'PLN', taxRate: 19, createdAt: '' },
            { id: 2, name: 'Krypto', type: 'crypto', currency: 'USD', taxRate: 19, createdAt: '' },
            { id: 3, name: 'IKE', type: 'ike', currency: 'EUR', taxRate: 0, createdAt: '' }
        ]);
        legacy.close();

        const db = new StockTrackerDatabase();
        await db.open();
        const portfolios = await db.portfolios.orderBy('id').toArray();
        db.close();

        expect(portfolios.map(p => [p.type, p.currency])).toEqual([
            ['standard', 'PLN'],
            ['standard', 'PLN'],
            ['ike', 'PLN']
        ]);
    });
});
