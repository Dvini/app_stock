import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useEffect } from 'react';
import { db } from '../db/db';
import { fetchCurrentPrice, getCachedPrice, fetchExchangeRates } from '../lib/api';
import { useCurrency } from '../context/CurrencyContext';

export const usePortfolio = () => {
    const { baseCurrency } = useCurrency(); // 'PLN', 'USD', 'EUR'
    const assets = useLiveQuery(() => db.assets.toArray()) || [];
    const cashEntry = useLiveQuery(() => db.cash.get('PLN'));
    const currentCash = cashEntry ? cashEntry.amount : 0;

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
    const processedAssets = assets.map(asset => {
        const liveData = livePrices[asset.ticker];
        const currentPrice = liveData ? liveData.price : asset.avgPrice;
        const currency = liveData ? liveData.currency : (asset.currency || 'PLN');

        // Native Value
        const valueNative = asset.amount * currentPrice;

        // Value in Base Currency
        let rate = 1;
        if (currency !== baseCurrency) {
            rate = exchangeRates[currency] || 0; // 0 if loading or failed
            if (rate === 0 && currency === 'PLN' && baseCurrency === 'USD') rate = 0.25; // Fallback approx? No, better show 0.
            // Actually, if rate is missing, fallback to 1 is dangerous if currencies differ.
            // Let's rely on fetch. If missing, maybe keep native? No, we need total.
            // For Safety: if rate is missing and currencies differ, total might be wrong.
        }
        const valueBase = valueNative * rate;

        const costBasisNative = asset.amount * asset.avgPrice;
        const plValueNative = valueNative - costBasisNative;
        const plPercent = costBasisNative > 0 ? (plValueNative / costBasisNative) * 100 : 0;

        const isRealData = !!liveData;

        return {
            ...asset,
            price: currentPrice.toFixed(2),
            currency,
            value: valueNative.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            valueBase: valueBase,
            rate: rate,
            pl: `${plValueNative > 0 ? '+' : ''}${plValueNative.toFixed(2)} ${currency} (${plPercent.toFixed(2)}%)`,
            plValue: plValueNative,
            isRealData
        };
    });

    // Process Watchlist
    const processedWatchlist = watchlist.map(item => {
        const liveData = livePrices[item.ticker];
        return {
            ...item,
            price: liveData ? liveData.price : '---',
            currency: liveData ? liveData.currency : (item.currency || 'PLN')
        };
    });

    // Cash Handling - simplistic assumption for now: Cash is in PLN.
    // Ideally Loop through all cash entries.
    let cashInBase = 0;
    // We only query 'PLN' cash above. TODO: Query all cash?
    // For now:
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
        // If baseCurrency is not PLN, we need the rate from baseCurrency to PLN.
        // Our exchangeRates map stores rates from other currencies TO baseCurrency.
        // So, if exchangeRates['PLN'] exists, it means 1 PLN = X baseCurrency.
        // Therefore, 1 baseCurrency = 1/X PLN.
        const plnToBaseRate = exchangeRates['PLN']; // e.g., if baseCurrency is USD, this is PLN_to_USD rate
        if (plnToBaseRate && plnToBaseRate !== 0) {
            totalValuePLN = totalValueBase / plnToBaseRate;
        } else {
            // Fallback if rate is missing or zero, cannot convert to PLN reliably
            totalValuePLN = 0;
        }
    }

    // P/L Logic (Simplified: P/L Native * Rate)
    const totalPL_Base = processedAssets.reduce((acc, curr) => acc + (curr.plValue * curr.rate), 0);

    // Weighted PL Percent
    const totalCostBase = processedAssets.reduce((acc, curr) => acc + (curr.amount * curr.avgPrice * curr.rate), 0);
    const totalPLPercent = totalCostBase > 0 ? (totalPL_Base / totalCostBase) * 100 : 0;

    return {
        assets: processedAssets,
        watchlist: processedWatchlist,
        transactions,
        portfolioSummary: {
            totalValue: totalValueBase.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            totalValuePLN: totalValuePLN.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            totalPL: `${totalPL_Base > 0 ? '+' : ''}${totalPL_Base.toFixed(2)} ${baseCurrency}`,
            totalPLPercent: `${totalPLPercent.toFixed(2)}%`,
            cash: cashInBase.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            baseCurrency, // Export for UI
            isLoadingPrices
        }
    };
};
