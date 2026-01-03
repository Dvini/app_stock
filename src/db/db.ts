import Dexie, { Table } from 'dexie';
import type { Asset, Transaction, Cash, WatchlistItem, Dividend } from '../types/database';

/**
 * Typed Dexie database class
 */
export class StockTrackerDatabase extends Dexie {
    // Typed table declarations
    assets!: Table<Asset>;
    transactions!: Table<Transaction>;
    cash!: Table<Cash>;
    watchlist!: Table<WatchlistItem>;
    dividends!: Table<Dividend>;

    constructor() {
        super('StockTrackerDB');

        // Version 1
        this.version(1).stores({
            assets: '++id, ticker, type, amount, avgPrice',
            transactions: '++id, date, type, ticker, amount, price, total',
            cash: 'currency',
        });

        // Version 3: Add currency field to assets and watchlist
        this.version(3).stores({
            assets: '++id, ticker, type, amount, avgPrice, currency',
            transactions: '++id, date, type, ticker, amount, price, total, currency',
            cash: 'currency, amount',
            watchlist: '++id, ticker, dateAdded, currency'
        });

        // Version 4: Add dividends table
        this.version(4).stores({
            assets: '++id, ticker, type, amount, avgPrice, currency',
            transactions: '++id, date, type, ticker, amount, price, total, currency, exchangeRate',
            cash: 'currency, amount',
            watchlist: '++id, ticker, dateAdded, currency',
            dividends: '++id, ticker, recordDate, paymentDate'
        });

        // Version 5: Add compound indexes for performance
        this.version(5).stores({
            assets: '++id, ticker, type, amount, avgPrice, currency',
            transactions: '++id, date, type, ticker, amount, price, total, currency, exchangeRate',
            cash: 'currency, amount',
            watchlist: '++id, ticker, dateAdded, currency',
            dividends: '++id, ticker, recordDate, paymentDate, status, [status+paymentDate]' // Compound index for filtering
        });
    }
}

// Export singleton instance
export const db = new StockTrackerDatabase();

/**
 * Helper to initialize DB if empty (optional, for dev)
 */
export const initDB = async (): Promise<void> => {
    try {
        // Check if cash entry exists
        const cash = await db.cash.get('PLN');
        if (!cash) {
            await db.cash.add({ currency: 'PLN', amount: 0 }); // Default starting cash
        }
    } catch (error) {
        // Ignore duplicate key errors (common in React Strict Mode double-invoke)
        if (error instanceof Error && error.name === 'ConstraintError') return;
        throw error;
    }
};
