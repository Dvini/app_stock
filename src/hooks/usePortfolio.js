import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useEffect, useMemo } from 'react';
import { db } from '../db/db';
import { fetchCurrentPrice, getCachedPrice, fetchExchangeRates } from '../lib/api';
import { useCurrency } from '../context/CurrencyContext';
import { formatNumber } from '../utils/formatters';

export const usePortfolio = () => {
    const { baseCurrency } = useCurrency(); // 'PLN', 'USD', 'EUR'
    const assets = useLiveQuery(() => db.assets.toArray()) || [];
    const allCash = useLiveQuery(() => db.cash.toArray()) || [];
    const currentCash = allCash.find(c => c.currency === 'PLN')?.amount || 0;

    // ... (rest of code)


    // New Data for AI
    const watchlist = useLiveQuery(() => db.watchlist.toArray()) || [];
    const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().limit(10).toArray()) || []; // Last 10 txs

    // State
    const [livePrices, setLivePrices] = useState({});
    const [exchangeRates, setExchangeRates] = useState({});
    const [isLoadingPrices, setIsLoadingPrices] = useState(false);

    // Fetch prices & rates
    useEffect(() => {
        if (assets.length === 0 && watchlist.length === 0) return;

        const loadData = async () => {
            setIsLoadingPrices(true);
            const newPrices = { ...livePrices };
            const neededCurrencies = new Set();

            // Allow Cash conversion if Base != PLN
            if (baseCurrency !== 'PLN') {
                neededCurrencies.add('PLN'); // Assuming Cash is always PLN for now? 
                // DB Schema says cash: 'currency, amount'. User starts with PLN.
                // If user has 'PLN' cash, and Base is 'USD', me Need PLN -> USD rate.
            }

            const allTickers = new Set([
                ...assets.map(a => a.ticker),
                ...watchlist.map(w => w.ticker)
            ]);

            // 1. Fetch Prices
            const promises = Array.from(allTickers).map(async (ticker) => {
                const cached = getCachedPrice(ticker);
                if (cached && cached.price) return { ticker, ...cached };
                const result = await fetchCurrentPrice(ticker);
                if (result) return { ticker, ...result };
                return null;
            });

            const results = await Promise.all(promises);

            results.forEach(res => {
                if (res) {
                    newPrices[res.ticker] = { price: res.price, currency: res.currency };
                    if (res.currency !== baseCurrency) neededCurrencies.add(res.currency);
                }
            });

            setLivePrices(newPrices);

            // 2. Fetch Exchange Rates to BASE CURRENCY
            if (neededCurrencies.size > 0) {
                // api.js updated to accept targetCurrency
                const rates = await fetchExchangeRates(Array.from(neededCurrencies), baseCurrency);
                setExchangeRates(rates);
            }

            setIsLoadingPrices(false);
        };

        loadData();
        const interval = setInterval(loadData, 15 * 60 * 1000);
        return () => clearInterval(interval);

    }, [assets.length, watchlist.length, baseCurrency]); // Add baseCurrency dependency

    // Calculate details
    const processedAssets = useMemo(() => {
        return assets
            .filter(asset => asset.amount > 0.000001) // [FIX] Filter out sold assets (epsilon for float errors)
            .map(asset => {
                const liveData = livePrices[asset.ticker];

                // If live data is missing, we use avgPrice for VALUATION purposes only, 
                // but we should display '---' or similar in the PRICE column so user knows it's not real.
                const currentPrice = liveData ? liveData.price : null;
                const valuationPrice = currentPrice !== null ? currentPrice : asset.avgPrice;

                const currency = liveData ? liveData.currency : (asset.currency || 'PLN');

                // Native Value
                const valueNative = asset.amount * valuationPrice;

                // Value in Base Currency
                let rate = 1;
                if (currency !== baseCurrency) {
                    rate = exchangeRates[currency] || 0;
                    // ...
                }
                const valueBase = valueNative * rate;

                const costBasisNative = asset.amount * asset.avgPrice;
                const plValueNative = valueNative - costBasisNative;
                const plPercent = costBasisNative > 0 ? (plValueNative / costBasisNative) * 100 : 0;

                const isRealData = !!liveData;

                return {
                    ...asset,
                    price: currentPrice, // Return raw number or null
                    valuationPrice: valuationPrice, // Internal use
                    currency,
                    value: formatNumber(valueNative),
                    valueBase: valueBase,
                    rate: rate,
                    pl: `${plValueNative > 0 ? '+' : ''}${formatNumber(plValueNative)} ${currency} (${formatNumber(plPercent)}%)`,
                    plValue: plValueNative,
                    isRealData
                };
            });
    }, [assets, livePrices, baseCurrency, exchangeRates]);

    // Process Watchlist
    const processedWatchlist = useMemo(() => {
        return watchlist.map(item => {
            const liveData = livePrices[item.ticker];
            return {
                ...item,
                price: liveData ? liveData.price : '---',
                currency: liveData ? liveData.currency : (item.currency || 'PLN')
            };
        });
    }, [watchlist, livePrices]);

    const portfolioSummary = useMemo(() => {
        // [NEW] Currency Breakdown
        const breakdown = {};

        // 1. Add Cash
        allCash.forEach(c => {
            breakdown[c.currency] = (breakdown[c.currency] || 0) + c.amount;
        });

        // 2. Add Assets
        processedAssets.forEach(a => {
            const currency = a.currency || 'PLN';
            // Use valuationPrice for total value calculation (price or avgPrice fallback)
            // But we need total native value.
            // In processedAssets map: const valueNative = asset.amount * valuationPrice;
            // Let's re-calculate or grab it if exposed (not exposed in return currently, only formatted 'value')
            // Re-calc:
            const valNative = a.amount * a.valuationPrice;
            breakdown[currency] = (breakdown[currency] || 0) + valNative;
        });

        const breakdownEntries = Object.entries(breakdown)
            .filter(([_, val]) => val > 0.01) // Filter small residuals
            .map(([curr, val]) => ({ currency: curr, value: val }));

        // Existing Logic
        let cashInBase = 0;
        let cashRate = 1;
        if (baseCurrency !== 'PLN') {
            cashRate = exchangeRates['PLN'] || 0;
        }
        cashInBase = currentCash * cashRate;

        const totalAssetsValueBase = processedAssets.reduce((acc, curr) => acc + curr.valueBase, 0);
        const totalValueBase = totalAssetsValueBase + cashInBase;

        // Calculate Total in PLN explicitly for reference
        let totalValuePLN = 0;
        if (baseCurrency === 'PLN') {
            totalValuePLN = totalValueBase;
        } else {
            const plnToBaseRate = exchangeRates['PLN'];
            if (plnToBaseRate && plnToBaseRate !== 0) {
                totalValuePLN = totalValueBase / plnToBaseRate;
            } else {
                totalValuePLN = 0;
            }
        }

        // P/L Logic (Simplified: P/L Native * Rate)
        const totalPL_Base = processedAssets.reduce((acc, curr) => acc + (curr.plValue * curr.rate), 0);

        // Weighted PL Percent
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
