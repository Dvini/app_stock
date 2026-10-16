/**
 * Database schema type definitions for Dexie
 */

export type TransactionType =
    | 'buy'
    | 'sell'
    | 'deposit'
    | 'withdraw'
    | 'Kupno'
    | 'Sprzedaż'
    | 'Depozyt'
    | 'Wypłata'
    | 'Wpłata';

/** Helper to check buy-type transactions regardless of language */
export const isBuyTransaction = (type: TransactionType): boolean => type === 'buy' || type === 'Kupno';
/** Helper to check sell-type transactions regardless of language */
export const isSellTransaction = (type: TransactionType): boolean => type === 'sell' || type === 'Sprzedaż';
/** Helper to check deposit-type transactions regardless of language */
export const isDepositTransaction = (type: TransactionType): boolean =>
    type === 'deposit' || type === 'Depozyt' || type === 'Wpłata';
/** Helper to check withdraw-type transactions regardless of language */
export const isWithdrawTransaction = (type: TransactionType): boolean => type === 'withdraw' || type === 'Wypłata';
/** Check if transaction is a cash operation (deposit or withdraw) */
export const isCashTransaction = (type: TransactionType): boolean =>
    isDepositTransaction(type) || isWithdrawTransaction(type);

// Asset types
export type AssetType = 'stock' | 'etf' | 'commodity';

// Currency codes
export type CurrencyCode = 'PLN' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CHF' | 'CNY';

// Portfolio types
export type PortfolioType = 'standard' | 'ike' | 'ikze' | 'custom';

/**
 * Portfolio account table schema
 */
export interface PortfolioAccount {
    id?: number; // Auto-incremented
    name: string; // e.g. "Główny", "IKE mBank", "IKZE BOS"
    type: PortfolioType; // Account type
    currency: 'PLN'; // All accounts are PLN-denominated
    taxRate: number; // e.g. 19 for standard (19% Belka tax), 0 for IKE/IKZE
    annualLimit?: number; // Annual contribution limit (e.g. for IKE/IKZE)
    color?: string; // Accent color hex or Tailwind name
    createdAt: string; // ISO date string
}

/**
 * Asset (holdings) table schema
 */
export interface Asset {
    id?: number; // Auto-incremented
    portfolioId?: number; // Associated portfolio
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
    portfolioId?: number; // Associated portfolio
    date: string; // ISO date string
    type: TransactionType;
    ticker?: string; // Optional for deposit/withdraw
    amount: number; // Quantity for buy/sell, money amount for deposit/withdraw
    price?: number; // Price per unit (for buy/sell)
    total: number; // Total transaction value
    currency?: CurrencyCode;
    exchangeRate?: number; // Broker exchange rate actually applied (drives cash)
    taxExchangeRate?: number; // NBP average rate from the business day before the transaction (PIT, art. 11a)
    commission?: number; // Broker commission/fee amount
    commissionCurrency?: CurrencyCode; // Currency of the commission
    note?: string; // Free-text note (e.g. automatic balance correction)
}

/**
 * Cash balances table schema
 */
export interface Cash {
    id?: number; // Auto-incremented for multi-portfolio support
    portfolioId?: number; // Associated portfolio
    currency: CurrencyCode;
    amount: number;
}

/**
 * Watchlist table schema
 */
export interface WatchlistItem {
    id?: number; // Auto-incremented
    portfolioId?: number; // Associated portfolio (optional)
    ticker: string;
    dateAdded: string; // ISO date string
    currency?: CurrencyCode;
}

/**
 * Dividends table schema
 */
export interface Dividend {
    id?: number; // Auto-incremented
    portfolioId?: number; // Associated portfolio
    ticker: string;
    recordDate: string; // ISO date string
    paymentDate: string; // ISO date string
    amountPerShare: number; // Amount per share
    totalAmount?: number; // Total amount for owned shares
    currency: CurrencyCode;
    exchangeRate?: number; // NBP average rate from the business day before payment (PIT, art. 11a)
    withholdingTaxRate?: number; // Tax withheld at source, % of gross (e.g. 15 for US with W-8BEN)
    valuePLN?: number; // Total value in PLN
    sharesOwned?: number; // Shares owned on record date
    status: 'upcoming' | 'paid' | 'expected' | 'received';
}

/**
 * Dexie database interface
 */
export interface StockTrackerDB {
    portfolios: PortfolioAccount[];
    assets: Asset[];
    transactions: Transaction[];
    cash: Cash[];
    watchlist: WatchlistItem[];
    dividends: Dividend[];
}
