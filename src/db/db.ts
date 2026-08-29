import Dexie, { Table } from 'dexie';
import type { Asset, Transaction, Cash, WatchlistItem, Dividend, PortfolioAccount } from '../types/database';

/**
 * Typed Dexie database class
 */
export class StockTrackerDatabase extends Dexie {
    // Typed table declarations
    portfolios!: Table<PortfolioAccount>;
    assets!: Table<Asset>;
    transactions!: Table<Transaction>;
    portfolioCash!: Table<Cash>;
    watchlist!: Table<WatchlistItem>;
    dividends!: Table<Dividend>;

    get cash(): Table<Cash> {
        return this.portfolioCash;
    }

    constructor() {
        super('StockTrackerDB');

        // Version 1
        this.version(1).stores({
            assets: '++id, ticker, type, amount, avgPrice',
            transactions: '++id, date, type, ticker, amount, price, total',
            cash: 'currency'
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

        // Version 6: Add compound indexes for optimized queries
        this.version(6).stores({
            assets: '++id, ticker, type, amount, avgPrice, currency',
            transactions:
                '++id, date, type, ticker, [ticker+date], [ticker+type], amount, price, total, currency, exchangeRate',
            cash: 'currency, amount',
            watchlist: '++id, ticker, dateAdded, currency',
            dividends: '++id, ticker, recordDate, [ticker+recordDate], paymentDate, status, [status+paymentDate]'
        });

        // Version 7: Multi-portfolio support (IKE, IKZE, standard brokerage, crypto, etc.)
        this.version(7)
            .stores({
                portfolios: '++id, name, type, currency',
                assets: '++id, portfolioId, ticker, type, amount, avgPrice, currency, [portfolioId+ticker]',
                transactions:
                    '++id, portfolioId, date, type, ticker, [portfolioId+date], [portfolioId+ticker], [ticker+date], amount, price, total, currency, exchangeRate',
                cash: 'currency, amount', // Keep legacy cash table schema untouched to avoid UpgradeError
                portfolioCash: '++id, portfolioId, currency, [portfolioId+currency], amount',
                watchlist: '++id, portfolioId, ticker, dateAdded, currency, [portfolioId+ticker]',
                dividends:
                    '++id, portfolioId, ticker, recordDate, [ticker+recordDate], paymentDate, status, [portfolioId+paymentDate], [status+paymentDate]'
            })
            .upgrade(async tx => {
                // Ensure default portfolio exists
                const portfolioCount = await tx.table('portfolios').count();
                let defaultPortfolioId = 1;
                if (portfolioCount === 0) {
                    defaultPortfolioId = await tx.table('portfolios').add({
                        id: 1,
                        name: 'Główny',
                        type: 'standard',
                        currency: 'PLN',
                        taxRate: 19,
                        color: '#3b82f6',
                        createdAt: new Date().toISOString()
                    });
                }

                // Copy existing cash rows into portfolioCash
                const oldCashRows = await tx.table('cash').toArray();
                const portCashTable = tx.table('portfolioCash');
                for (const c of oldCashRows) {
                    await portCashTable.add({
                        portfolioId: defaultPortfolioId,
                        currency: c.currency,
                        amount: c.amount
                    });
                }

                // Migrate existing assets, transactions, dividends, watchlist to portfolioId = 1
                await tx
                    .table('assets')
                    .toCollection()
                    .modify(asset => {
                        if (!asset.portfolioId) asset.portfolioId = defaultPortfolioId;
                    });
                await tx
                    .table('transactions')
                    .toCollection()
                    .modify(txItem => {
                        if (!txItem.portfolioId) txItem.portfolioId = defaultPortfolioId;
                    });
                await tx
                    .table('dividends')
                    .toCollection()
                    .modify(div => {
                        if (!div.portfolioId) div.portfolioId = defaultPortfolioId;
                    });
                await tx
                    .table('watchlist')
                    .toCollection()
                    .modify(w => {
                        if (!w.portfolioId) w.portfolioId = defaultPortfolioId;
                    });
            });
    }
}

// Export singleton instance
export const db = new StockTrackerDatabase();

/**
 * Helper to initialize DB if empty
 */
export const initDB = async (): Promise<void> => {
    try {
        const portfolioCount = await db.portfolios.count();
        if (portfolioCount === 0) {
            await db.portfolios.add({
                id: 1,
                name: 'Główny',
                type: 'standard',
                currency: 'PLN',
                taxRate: 19,
                color: '#3b82f6',
                createdAt: new Date().toISOString()
            });
        }

        // Check if cash entry exists for default portfolio
        const cash = await db.cash.where('[portfolioId+currency]').equals([1, 'PLN']).first();
        if (!cash) {
            await db.cash.add({ portfolioId: 1, currency: 'PLN', amount: 0 });
        }
    } catch (error) {
        // Ignore duplicate key errors (common in React Strict Mode double-invoke)
        if (error instanceof Error && error.name === 'ConstraintError') return;
        throw error;
    }
};
