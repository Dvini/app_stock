import Dexie from 'dexie';

export const db = new Dexie('StockTrackerDB');

// Version 1
db.version(1).stores({
    assets: '++id, ticker, type, amount, avgPrice',
    transactions: '++id, date, type, ticker, amount, price, total',
    cash: 'currency',
});

// Version 3: Add currency field to assets and watchlist
db.version(3).stores({
    assets: '++id, ticker, type, amount, avgPrice, currency',
    transactions: '++id, date, type, ticker, amount, price, total, currency',
    cash: 'currency, amount',
    watchlist: '++id, ticker, dateAdded, currency'
});

// Helper to initialize DB if empty (optional, for dev)
export const initDB = async () => {
    // Check if cash entry exists
    const cash = await db.cash.get('PLN');
    if (!cash) {
        await db.cash.add({ currency: 'PLN', amount: 0 }); // Default starting cash
    }
};
