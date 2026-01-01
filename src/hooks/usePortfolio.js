/**
 * Main portfolio hook - orchestrates assets, prices, and exchange rates
 * Refactored to use composition of smaller specialized hooks
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import { useCurrency } from '../context/CurrencyContext';
import { formatNumber } from '../utils/formatters';
import useAssets from './useAssets';
import usePrices from './usePrices';
import useExchangeRates from './useExchangeRates';

/**
 * Main portfolio hook
 * @returns {Object} Complete portfolio data
 */
export const usePortfolio = () => {
    const { baseCurrency } = useCurrency();

    // Use specialized hooks
    const { assets, tickers, currencies } = useAssets();
    const { prices, isLoading: isLoadingPrices } = usePrices(tickers);

    // Watchlist and transactions
    const watchlist = useLiveQuery(() => db.watchlist.toArray()) || [];
    const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().limit(10).toArray()) || [];
    const allCash = useLiveQuery(() => db.cash.toArray()) || [];
    const currentCash = allCash.find(c => c.currency === 'PLN')?.amount || 0;

    // Get watchlist tickers for prices
    const watchlistTickers = useMemo(() => {
        return watchlist.map(w => w.ticker);
    }, [watchlist]);

    // Fetch prices for watchlist too
    const { prices: watchlistPrices } = usePrices(watchlistTickers);

    // Determine currencies needed for exchange rates
    const neededCurrencies = useMemo(() => {
        const currencySet = new Set(currencies);

        // Add watchlist currencies
        watchlist.forEach(w => {
            if (w.currency && w.currency !== baseCurrency) {
                currencySet.add(w.currency);
            }
        });

        // Add PLN for cash conversion if base is different
        if (baseCurrency !== 'PLN') {
            currencySet.add('PLN');
        }

        return Array.from(currencySet);
    }, [currencies, watchlist, baseCurrency]);

    // Fetch exchange rates
    const { rates: exchangeRates, convert } = useExchangeRates(neededCurrencies, {
        targetCurrency: baseCurrency
    });

    // Process assets with prices and rates
    const processedAssets = useMemo(() => {
        return assets.map(asset => {
            const priceData = prices[asset.ticker];

            // Current price from live data or fallback to avgPrice for valuation
            const currentPrice = priceData?.price || null;
            const valuationPrice = currentPrice !== null ? currentPrice : asset.avgPrice;
            const currency = priceData?.currency || asset.currency || 'PLN';

            // Native value (in asset's currency)
            const valueNative = asset.amount * valuationPrice;

            // Exchange rate for conversion
            const rate = currency === baseCurrency ? 1 : (exchangeRates[currency] || 1);

            // Value in base currency
            const valueBase = valueNative * rate;

            // Profit/Loss calculations
            const costBasisNative = asset.amount * asset.avgPrice;
            const plValueNative = valueNative - costBasisNative;
            const plPercent = costBasisNative > 0 ? (plValueNative / costBasisNative) * 100 : 0;

            return {
                ...asset,
                price: currentPrice,
                valuationPrice,
                currency,
                value: formatNumber(valueNative),
                valueBase,
                rate,
                pl: `${plValueNative > 0 ? '+' : ''}${formatNumber(plValueNative)} ${currency} (${formatNumber(plPercent)}%)`,
                plValue: plValueNative,
                isRealData: !!priceData
            };
        });
    }, [assets, prices, baseCurrency, exchangeRates]);

    // Process watchlist
    const processedWatchlist = useMemo(() => {
        return watchlist.map(item => {
            const priceData = watchlistPrices[item.ticker];
            return {
                ...item,
                price: priceData?.price || '---',
                currency: priceData?.currency || item.currency || 'PLN'
            };
        });
    }, [watchlist, watchlistPrices]);

    // Portfolio summary with currency breakdown
    const portfolioSummary = useMemo(() => {
        // Currency breakdown
        const breakdown = {};

        // Add cash
        allCash.forEach(c => {
            if (!breakdown[c.currency]) {
                breakdown[c.currency] = { value: 0, pl: 0 };
            }
            breakdown[c.currency].value += c.amount;
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

        const breakdownEntries = Object.entries(breakdown)
            .filter(([_, data]) => data.value > 0.01)
            .map(([curr, data]) => ({
                currency: curr,
                value: data.value,
                pl: data.pl
            }));

        // Cash in base currency
        const cashRate = baseCurrency !== 'PLN' ? (exchangeRates['PLN'] || 1) : 1;
        const cashInBase = currentCash * cashRate;

        // Total values
        const totalAssetsValueBase = processedAssets.reduce((acc, curr) => acc + curr.valueBase, 0);
        const totalValueBase = totalAssetsValueBase + cashInBase;

        // Total in PLN for reference
        let totalValuePLN = 0;
        if (baseCurrency === 'PLN') {
            totalValuePLN = totalValueBase;
        } else {
            const plnToBaseRate = exchangeRates['PLN'];
            totalValuePLN = plnToBaseRate && plnToBaseRate !== 0 ? totalValueBase / plnToBaseRate : 0;
        }

        // P/L calculations
        const totalPL_Base = processedAssets.reduce((acc, curr) => acc + (curr.plValue * curr.rate), 0);
        const totalCostBase = processedAssets.reduce((acc, curr) => acc + (curr.amount * curr.avgPrice * curr.rate), 0);
        const totalPLPercent = totalCostBase > 0 ? (totalPL_Base / totalCostBase) * 100 : 0;

        const hasForeignAssets = processedAssets.some(a => a.currency !== baseCurrency);
        const approxPrefix = hasForeignAssets ? '~ ' : '';

        return {
            totalValue: `${approxPrefix}${formatNumber(totalValueBase)}`,
            totalValuePLN: formatNumber(totalValuePLN),
            totalPL: `${totalPL_Base > 0 ? '+' : ''}${formatNumber(totalPL_Base)} ${baseCurrency}`,
            totalPLPercent: `${formatNumber(totalPLPercent)}%`,
            cash: formatNumber(cashInBase),
            baseCurrency,
            isLoadingPrices,
            breakdown: breakdownEntries
        };
    }, [processedAssets, currentCash, baseCurrency, exchangeRates, isLoadingPrices, allCash]);

    return {
        assets: processedAssets,
        watchlist: processedWatchlist,
        transactions,
        portfolioSummary
    };
};

export default usePortfolio;
