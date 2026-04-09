/**
 * Database schema type definitions for Dexie
 */

// Transaction types
export type TransactionType = 'buy' | 'sell' | 'deposit' | 'withdraw' | 'Kupno' | 'Sprzedaż' | 'Depozyt' | 'Wypłata';

// Asset types
export type AssetType = 'stock' | 'etf' | 'crypto' | 'commodity';

// Currency codes
export type CurrencyCode = 'PLN' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CHF' | 'CNY';

/**
 * Asset (holdings) table schema
 */
export interface Asset {
    id?: number; // Auto-incremented
    ticker: string;
    type: AssetType;
    amount: number; // Quantity of shares/units
    avgPrice: number; // Average purchase price
    currency?: CurrencyCode;
}

/**
 * Transaction history table schema
 */
export interface Transaction {
    id?: number; // Auto-incremented
    date: string; // ISO date string
    type: TransactionType;
    ticker?: string; // Optional for deposit/withdraw
    amount: number; // Quantity for buy/sell, money amount for deposit/withdraw
    price?: number; // Price per unit (for buy/sell)
    total: number; // Total transaction value
    currency?: CurrencyCode;
    exchangeRate?: number; // Exchange rate at time of transaction
    commission?: number; // Broker commission/fee amount
    commissionCurrency?: CurrencyCode; // Currency of the commission
}

/**
 * Cash balances table schema
 */
export interface Cash {
    currency: CurrencyCode; // Primary key
    amount: number;
}

/**
 * Watchlist table schema
 */
export interface WatchlistItem {
    id?: number; // Auto-incremented
    ticker: string;
    dateAdded: string; // ISO date string
    currency?: CurrencyCode;
}

/**
 * Dividends table schema
 */
export interface Dividend {
    id?: number; // Auto-incremented
    ticker: string;
    recordDate: string; // ISO date string
    paymentDate: string; // ISO date string
    amountPerShare: number; // Amount per share
    totalAmount?: number; // Total amount for owned shares
    currency: CurrencyCode;
    exchangeRate?: number; // Exchange rate to PLN
    valuePLN?: number; // Total value in PLN
    sharesOwned?: number; // Shares owned on record date
    status: 'upcoming' | 'paid' | 'expected' | 'received';
}

/**
 * Dexie database interface
 */
export interface StockTrackerDB {
    assets: Asset[];
    transactions: Transaction[];
    cash: Cash[];
    watchlist: WatchlistItem[];
    dividends: Dividend[];
}
