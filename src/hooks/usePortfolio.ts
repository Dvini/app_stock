/**
 * Main portfolio hook - orchestrates assets, prices, and exchange rates
 * Refactored to use composition of smaller specialized hooks
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import { formatNumber } from '../utils/formatters';
import useAssets from './useAssets';
import usePrices from './usePrices';
import useExchangeRates from './useExchangeRates';
import { usePortfolioAccount } from '../context/PortfolioContext';
import { calculateNetProfitLoss } from '../utils/taxCalculations';
import type { Transaction, WatchlistItem, Cash, CurrencyCode, PortfolioAccount } from '../types/database';

interface ProcessedAsset {
    id?: number;
    portfolioId?: number;
    ticker: string;
    type: string;
    amount: number;
    avgPrice: number;
    currency: CurrencyCode;
    price: number | null;
    valuationPrice: number;
    value: string;
    valueBase: number;
    rate: number;
    hasRate: boolean;
    pl: string;
    plValue: number;
    isRealData: boolean;
    taxRate: number;
    netPL: string;
    netPLValue: number;
    estimatedTax: number;
}

interface ProcessedWatchlistItem {
    id?: number;
    portfolioId?: number;
    ticker: string;
    dateAdded: string;
    currency: CurrencyCode;
    price: number | string;
}

interface CurrencyBreakdown {
    currency: string;
    value: number;
    pl: number;
}

interface PortfolioSummary {
    totalValue: string;
    totalValuePLN: string;
    totalPL: string;
    totalPLPercent: string;
    totalPL_Value: number;
    totalNetPL: string;
    totalNetPL_Value: number;
    totalTaxReserve: string;
    totalTaxReserveValue: number;
    isTaxExempt: boolean;
    cash: string;
    baseCurrency: CurrencyCode;
    isLoadingPrices: boolean;
    breakdown: CurrencyBreakdown[];
    taxRate?: number;
    /** Currencies without a live exchange rate; their positions are left out of PLN totals */
    missingRateCurrencies: string[];
}

export interface UsePortfolioReturn {
    assets: ProcessedAsset[];
    watchlist: ProcessedWatchlistItem[];
    transactions: Transaction[];
    portfolioSummary: PortfolioSummary;
    currentPortfolio: PortfolioAccount | null;
    isAllPortfolios: boolean;
}

const EMPTY_WATCHLIST: WatchlistItem[] = [];
const EMPTY_TRANSACTIONS: Transaction[] = [];
const EMPTY_CASH: Cash[] = [];
const EMPTY_TICKERS: string[] = [];
const EMPTY_CURRENCIES: CurrencyCode[] = [];

/**
 * Main portfolio hook
 */
export const usePortfolio = (portfolioIdOverride?: number | 'ALL'): UsePortfolioReturn => {
    const { activePortfolioId, currentPortfolio: contextPortfolio, portfolios } = usePortfolioAccount();

    const effectivePortfolioId = portfolioIdOverride !== undefined ? portfolioIdOverride : activePortfolioId;
    const isAllPortfolios = effectivePortfolioId === 'ALL';

    // All accounts are PLN-denominated
    const baseCurrency: CurrencyCode = 'PLN';

    // Use specialized hooks for assets
    const { assets, tickers, currencies } = useAssets(effectivePortfolioId);

    // Watchlist, transactions, and cash from database
    const rawWatchlist = useLiveQuery(() => db.watchlist.toArray()) ?? EMPTY_WATCHLIST;
    const rawTransactions =
        useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray()) ?? EMPTY_TRANSACTIONS;
    const rawCash = useLiveQuery(() => db.cash.toArray()) ?? EMPTY_CASH;

    const watchlist = useMemo(() => {
        return rawWatchlist.filter(w => isAllPortfolios || (w.portfolioId ?? 1) === effectivePortfolioId);
    }, [rawWatchlist, effectivePortfolioId, isAllPortfolios]);

    const transactions = useMemo(() => {
        return rawTransactions.filter(t => isAllPortfolios || (t.portfolioId ?? 1) === effectivePortfolioId);
    }, [rawTransactions, effectivePortfolioId, isAllPortfolios]);

    const allCash = useMemo(() => {
        return rawCash.filter(c => isAllPortfolios || (c.portfolioId ?? 1) === effectivePortfolioId);
    }, [rawCash, effectivePortfolioId, isAllPortfolios]);

    // Combine asset and watchlist tickers for single usePrices call
    const allTickers = useMemo(() => {
        if (tickers.length === 0 && watchlist.length === 0) return EMPTY_TICKERS;
        const watchlistTickers = watchlist.map(w => w.ticker);
        return [...new Set([...tickers, ...watchlistTickers])]; // Deduplicate
    }, [tickers, watchlist]);

    // Fetch prices for all tickers at once (optimization: single call instead of two)
    const { prices, isLoading: isLoadingPrices } = usePrices(allTickers);

    // Determine currencies needed for exchange rates
    const neededCurrencies = useMemo(() => {
        if (currencies.length === 0 && watchlist.length === 0) return EMPTY_CURRENCIES;
        const currencySet = new Set(currencies);

        // Add watchlist currencies
        watchlist.forEach(w => {
            if (w?.currency && w.currency !== baseCurrency) {
                currencySet.add(w.currency);
            }
        });

        // Add cash currencies
        allCash.forEach(c => {
            if (c?.currency && c.currency !== baseCurrency) {
                currencySet.add(c.currency);
            }
        });

        return Array.from(currencySet);
    }, [currencies, watchlist, allCash, baseCurrency]);

    // Fetch exchange rates
    const { rates: exchangeRates, isLoading: isLoadingRates } = useExchangeRates(neededCurrencies, {
        targetCurrency: baseCurrency
    });

    const currentCash = useMemo(() => {
        const ratesMap = exchangeRates as Record<string, number>;
        return allCash.reduce((sum, c) => {
            const rate = c.currency === baseCurrency ? 1 : (ratesMap[c.currency] ?? 0);
            return sum + (c.amount || 0) * rate;
        }, 0);
    }, [allCash, baseCurrency, exchangeRates]);

    // Process assets with prices and rates
    const processedAssets = useMemo(() => {
        return assets.map(asset => {
            const priceData = prices[asset.ticker];

            // Current price from live data or fallback to avgPrice for valuation
            const currentPrice = priceData?.price || null;
            const valuationPrice = currentPrice !== null ? currentPrice : asset.avgPrice;
            const currency = (priceData?.currency || asset.currency || 'PLN') as CurrencyCode;

            // Native value (in asset's currency)
            const valueNative = asset.amount * valuationPrice;

            // Exchange rate for conversion; 0 when unknown so the position is left out of totals
            // instead of being counted 1:1 (100 USD as 100 PLN)
            const knownRate = currency === baseCurrency ? 1 : exchangeRates[currency];
            const hasRate = !!knownRate && knownRate > 0;
            const rate = hasRate ? knownRate! : 0;

            // Value in base currency
            const valueBase = valueNative * rate;

            // Profit/Loss calculations
            const costBasisNative = asset.amount * asset.avgPrice;
            const plValueNative = valueNative - costBasisNative;
            const plPercent = costBasisNative > 0 ? (plValueNative / costBasisNative) * 100 : 0;

            // Tax calculations (0% for IKE/IKZE, 19% default for standard)
            const assetTaxRate = isAllPortfolios
                ? (portfolios.find(p => p.id === (asset.portfolioId ?? 1))?.taxRate ?? 19)
                : (contextPortfolio?.taxRate ?? 19);

            const { netPL: netPLValueNative, taxAmount: taxAmountNative } = calculateNetProfitLoss(
                plValueNative,
                assetTaxRate
            );
            const netPLPercent = costBasisNative > 0 ? (netPLValueNative / costBasisNative) * 100 : 0;

            return {
                ...asset,
                price: currentPrice,
                valuationPrice,
                currency,
                value: formatNumber(valueNative),
                valueBase,
                rate,
                hasRate,
                pl: `${plValueNative > 0 ? '+' : ''}${formatNumber(plValueNative)} ${currency} (${formatNumber(plPercent)}%)`,
                plValue: plValueNative,
                isRealData: !!priceData,
                taxRate: assetTaxRate,
                netPL: `${netPLValueNative > 0 ? '+' : ''}${formatNumber(netPLValueNative)} ${currency} (${formatNumber(netPLPercent)}%)`,
                netPLValue: netPLValueNative,
                estimatedTax: taxAmountNative
            };
        });
    }, [assets, prices, baseCurrency, exchangeRates, isAllPortfolios, portfolios, contextPortfolio]);

    // Process watchlist
    const processedWatchlist = useMemo(() => {
        return watchlist.map(item => {
            const priceData = prices[item?.ticker]; // Use unified prices object
            return {
                ...item,
                price: priceData?.price || '---',
                currency: (priceData?.currency || item?.currency || 'PLN') as CurrencyCode
            };
        });
    }, [watchlist, prices]); // Updated dependency

    // Portfolio summary with currency breakdown
    const portfolioSummary = useMemo(() => {
        // Currency breakdown
        const breakdown: Record<string, { value: number; pl: number }> = {};

        // Add cash
        allCash.forEach(c => {
            const curr = c.currency;
            if (!breakdown[curr]) {
                breakdown[curr] = { value: 0, pl: 0 };
            }
            breakdown[curr]!.value += c.amount;
        });

        // Add assets
        processedAssets.forEach(a => {
            const currency = a.currency || 'PLN';
            if (!breakdown[currency]) {
                breakdown[currency] = { value: 0, pl: 0 };
            }

            const valNative = a.amount * a.valuationPrice;
            breakdown[currency].value += valNative;
            breakdown[currency].pl += a.plValue;
        });

        const breakdownEntries: CurrencyBreakdown[] = Object.entries(breakdown)
            .filter(([_, data]) => data.value > 0.01)
            .map(([curr, data]) => ({
                currency: curr,
                value: data.value,
                pl: data.pl
            }));

        // currentCash is already converted to base currency
        const cashInBase = currentCash;

        // Total values
        const totalAssetsValueBase = processedAssets.reduce((acc, curr) => acc + curr.valueBase, 0);
        const totalValueBase = totalAssetsValueBase + cashInBase;

        const totalValuePLN = totalValueBase;

        // P/L calculations
        const totalPL_Base = processedAssets.reduce((acc, curr) => acc + curr.plValue * curr.rate, 0);
        const totalCostBase = processedAssets.reduce((acc, curr) => acc + curr.amount * curr.avgPrice * curr.rate, 0);
        const totalPLPercent = totalCostBase > 0 ? (totalPL_Base / totalCostBase) * 100 : 0;

        // Net P/L and Belka tax reserve calculations
        const totalNetPL_Base = processedAssets.reduce((acc, curr) => acc + curr.netPLValue * curr.rate, 0);
        const totalTaxReserve_Base = processedAssets.reduce((acc, curr) => acc + curr.estimatedTax * curr.rate, 0);
        const isTaxExempt = !isAllPortfolios && contextPortfolio?.taxRate === 0;

        const hasForeignAssets = processedAssets.some(a => a.currency !== baseCurrency);
        const missingRateCurrencies = isLoadingRates
            ? []
            : [...new Set(processedAssets.filter(a => !a.hasRate).map(a => a.currency))];
        const approxPrefix = hasForeignAssets ? '~ ' : '';

        return {
            totalValue: `${approxPrefix}${formatNumber(totalValueBase)}`,
            totalValuePLN: formatNumber(totalValuePLN),
            totalPL: `${totalPL_Base > 0 ? '+' : ''}${formatNumber(totalPL_Base)} ${baseCurrency}`,
            totalPLPercent: `${formatNumber(totalPLPercent)}%`,
            totalPL_Value: totalPL_Base,
            totalNetPL: `${totalNetPL_Base > 0 ? '+' : ''}${formatNumber(totalNetPL_Base)} ${baseCurrency}`,
            totalNetPL_Value: totalNetPL_Base,
            totalTaxReserve: `${formatNumber(totalTaxReserve_Base)} ${baseCurrency}`,
            totalTaxReserveValue: totalTaxReserve_Base,
            isTaxExempt,
            cash: formatNumber(cashInBase),
            baseCurrency,
            isLoadingPrices,
            breakdown: breakdownEntries,
            taxRate: isAllPortfolios ? undefined : (contextPortfolio?.taxRate ?? 19),
            missingRateCurrencies
        };
    }, [
        processedAssets,
        currentCash,
        baseCurrency,
        exchangeRates,
        isLoadingPrices,
        allCash,
        isAllPortfolios,
        contextPortfolio,
        isLoadingRates
    ]);

    return {
        assets: processedAssets,
        watchlist: processedWatchlist,
        transactions,
        portfolioSummary,
        currentPortfolio: isAllPortfolios ? null : contextPortfolio,
        isAllPortfolios
    };
};

export default usePortfolio;
