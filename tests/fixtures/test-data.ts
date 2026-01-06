/**
 * Test Data Fixtures
 * 
 * Predefined test data for seeding database
 */

export const minimalTestData = {
    cash: 10000,
    transactions: [
        {
            date: '2024-01-01',
            type: 'Wpłata',
            ticker: 'CASH',
            amount: 1,
            price: 10000,
            total: 10000,
            currency: 'PLN',
            exchangeRate: 1.0
        }
    ]
};

export const portfolioTestData = {
    cash: 5000,
    transactions: [
        {
            date: '2024-01-01',
            type: 'Wpłata',
            ticker: 'CASH',
            amount: 1,
            price: 20000,
            total: 20000,
            currency: 'PLN',
            exchangeRate: 1.0
        },
        {
            date: '2024-01-15',
            type: 'Kupno',
            ticker: 'AAPL',
            amount: 10,
            price: 150.50,
            total: 1505.00,
            currency: 'USD',
            exchangeRate: 4.05
        },
        {
            date: '2024-01-20',
            type: 'Kupno',
            ticker: 'MSFT',
            amount: 5,
            price: 350.00,
            total: 1750.00,
            currency: 'USD',
            exchangeRate: 4.07
        }
    ],
    assets: [
        {
            ticker: 'AAPL',
            amount: 10,
            avgPrice: 150.50,
            currency: 'USD',
            type: 'stock'
        },
        {
            ticker: 'MSFT',
            amount: 5,
            avgPrice: 350.00,
            currency: 'USD',
            type: 'stock'
        }
    ],
    dividends: [
        {
            ticker: 'AAPL',
            recordDate: '2024-02-09',
            paymentDate: '2024-02-16',
            amountPerShare: 0.24,
            currency: 'USD',
            status: 'expected',
            sharesOwned: 10
        },
        {
            ticker: 'MSFT',
            recordDate: '2024-01-16',
            paymentDate: '2024-01-23',
            amountPerShare: 0.68,
            totalAmount: 3.40,
            currency: 'USD',
            exchangeRate: 4.05,
            valuePLN: 13.77,
            status: 'received',
            sharesOwned: 5
        }
    ],
    watchlist: [
        {
            ticker: 'NVDA',
            dateAdded: '2024-01-01',
            currency: 'USD'
        },
        {
            ticker: 'TSLA',
            dateAdded: '2024-01-05',
            currency: 'USD'
        }
    ]
};

export const largePortfolioTestData = {
    // Helper to generate large dataset for performance testing
    generateLarge: (numStocks: number = 100, numTransactions: number = 1000) => {
        const tickers = Array.from({ length: numStocks }, (_, i) => `STOCK${i}`);
        
        const transactions = [];
        const assets = [];
        
        // Initial deposit
        transactions.push({
            date: '2023-01-01',
            type: 'Wpłata',
            ticker: 'CASH',
            amount: 1,
            price: 1000000,
            total: 1000000,
            currency: 'PLN',
            exchangeRate: 1.0
        });
        
        // Generate random transactions
        for (let i = 0; i < numTransactions; i++) {
            const ticker = tickers[Math.floor(Math.random() * tickers.length)];
            const type = Math.random() > 0.7 ? 'Sprzedaż' : 'Kupno';
            
            transactions.push({
                date: `2023-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
                type,
                ticker,
                amount: Math.floor(Math.random() * 10) + 1,
                price: Math.random() * 500 + 10,
                total: 0, // Calculate if needed
                currency: 'USD',
                exchangeRate: 4.0 + Math.random()
            });
        }
        
        // Generate assets based on transactions
        tickers.forEach(ticker => {
            assets.push({
                ticker,
                amount: Math.floor(Math.random() * 100) + 1,
                avgPrice: Math.random() * 500 + 10,
                currency: 'USD',
                type: 'stock'
            });
        });
        
        return {
            cash: 50000,
            transactions,
            assets
        };
    }
};
