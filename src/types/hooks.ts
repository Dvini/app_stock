/**
 * Custom hooks return type definitions
 */

import { Asset, Transaction, WatchlistItem, CurrencyCode } from './database';

/**
 * Processed asset with calculated values
 */
export interface ProcessedAsset extends Asset {
    price: number | null; // Current market price
    valuationPrice: number; // Price used for valuation (current or avgPrice fallback)
    currency: CurrencyCode;
    value: string; // Formatted native currency value
    valueBase: number; // Value in base currency
    rate: number; // Exchange rate to base currency
    pl: string; // Formatted P/L string
    plValue: number; // P/L value in native currency
    isRealData: boolean; // Whether price is from real-time data
}

/**
 * Processed watchlist item with current price
 */
export interface ProcessedWatchlistItem extends WatchlistItem {
    price: number | string; // Current price or '---'
    currency: CurrencyCode;
}

/**
 * Currency breakdown in portfolio
 */
export interface CurrencyBreakdown {
    currency: CurrencyCode;
    value: number;
    pl: number;
}

/**
 * Portfolio summary data
 */
export interface PortfolioSummary {
    totalValue: string; // Formatted total value
    totalValuePLN: string; // Total value in PLN
    totalPL: string; // Formatted total P/L
    totalPLPercent: string; // Formatted P/L percentage
    cash: string; // Formatted cash in base currency
    baseCurrency: CurrencyCode;
    isLoadingPrices: boolean;
    breakdown: CurrencyBreakdown[]; // Currency breakdown
}

/**
 * usePortfolio hook return type
 */
export interface UsePortfolioReturn {
    assets: ProcessedAsset[];
    watchlist: ProcessedWatchlistItem[];
    transactions: Transaction[];
    portfolioSummary: PortfolioSummary;
}

/**
 * Price data from usePrices hook
 */
export interface PriceData {
    price: number;
    currency: CurrencyCode;
}

/**
 * usePrices hook return type
 */
export interface UsePricesReturn {
    prices: Record<string, PriceData | undefined>;
    isLoading: boolean;
    error: Error | null;
}

/**
 * useAssets hook return type
 */
export interface UseAssetsReturn {
    assets: Asset[];
    tickers: string[];
    currencies: CurrencyCode[];
}

/**
 * useExchangeRates hook return type
 */
export interface UseExchangeRatesReturn {
    rates: Record<CurrencyCode, number>;
    isLoading: boolean;
    error: Error | null;
    convert: (amount: number, from: CurrencyCode, to: CurrencyCode) => number;
}

/**
 * useDividends hook return type
 */
export interface UseDividendsReturn {
    upcomingDividends: Array<{
        ticker: string;
        exDate: string;
        paymentDate: string;
        amount: number;
        currency: CurrencyCode;
    }>;
    paidDividends: Array<{
        ticker: string;
        paymentDate: string;
        amount: number;
        currency: CurrencyCode;
    }>;
    isLoading: boolean;
    totalPaid: number;
    totalUpcoming: number;
}
