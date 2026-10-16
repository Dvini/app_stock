import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect } from 'vitest';
import { StockTrackerDatabase, normalizePortfolioType } from './db';

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
