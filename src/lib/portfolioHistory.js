import { fetchHistory, fetchCurrentPrice } from './api';

export const calculatePortfolioHistory = async (transactions, range = '1mo', excludeCash = false, returnNative = false) => {
    if (!transactions || transactions.length === 0) return [];

    // Sort transactions by date first to ensure correct timeline
    const sortedTx = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    const now = new Date();
    let startDate = new Date();

    if (range === 'max') {
        const firstInvestTx = sortedTx.find(t => ['Kupno', 'Sprzedaż'].includes(t.type));
        if (firstInvestTx) {
            startDate = new Date(firstInvestTx.date);
        } else if (sortedTx.length > 0) {
            startDate = new Date(sortedTx[0].date);
        } else {
            startDate.setMonth(now.getMonth() - 1); // Fallback
        }
    } else {
        if (range === '1d') startDate.setDate(now.getDate() - 1);
        if (range === '5d') startDate.setDate(now.getDate() - 5);
        if (range === '1mo') startDate.setMonth(now.getMonth() - 1);
        if (range === '1y') startDate.setFullYear(now.getFullYear() - 1);
        if (range === '5y') startDate.setFullYear(now.getFullYear() - 5);
    }

    // Safety: don't go before 1970 or invalid dates
    if (isNaN(startDate.getTime())) startDate = new Date(new Date().setMonth(now.getMonth() - 1));

    const uniqueTickers = [...new Set(transactions.map(t => t.ticker))].filter(t => t !== 'CASH');

    let apiRange = range;
    if (range === 'max') apiRange = '10y'; // 'max' often fails via proxy, 10y is usually sufficient
    else if (range === '5y') apiRange = '5y';
    else if (['1y', 'ytd', '1mo', '5d', '1d'].includes(range)) apiRange = '1y';
    else apiRange = '1y';

    const histories = {}; // { AAPL: { data: [...], currency: 'USD' } }
    const currenciesToFetch = new Set();

    // 1. Fetch Asset Histories
    await Promise.all(uniqueTickers.map(async (ticker) => {
        let hasData = false;
        try {
            let result = await fetchHistory(ticker, apiRange, '1d');

            // Fallback for MAX range if it fails or returns empty
            if ((!result || !result.data || result.data.length === 0) && apiRange === 'max') {
                console.warn(`MAX history failed for ${ticker}, trying 10y...`);
                result = await fetchHistory(ticker, '10y', '1d');
            }
            if ((!result || !result.data || result.data.length === 0) && (apiRange === 'max' || apiRange === '10y')) {
                console.warn(`10y history failed for ${ticker}, trying 5y...`);
                result = await fetchHistory(ticker, '5y', '1d');
            }

            if (result && result.data && result.data.length > 0) {
                histories[ticker] = result;
                hasData = true;
                if (result.currency && result.currency !== 'PLN') {
                    currenciesToFetch.add(result.currency);
                }
            }
        } catch (e) { console.warn("History fetch failed", ticker, e); }

        if (!hasData) {
            // FALLBACK: Fetch current price
            try {
                const current = await fetchCurrentPrice(ticker);
                if (current && current.price) {
                    histories[ticker] = {
                        data: [{ time: 0, price: current.price }], // Valid from beginning of time
                        currency: current.currency || 'PLN'
                    };
                    if (current.currency && current.currency !== 'PLN') {
                        currenciesToFetch.add(current.currency);
                    }
                }
            } catch (e) { console.warn("Asset Fallback failed", ticker, e); }
        }
    }));

    // 2. Fetch Currency Histories (e.g. USDPLN=X)
    const fxHistories = {}; // { USD: [{time, price}, ...] }

    if (currenciesToFetch.size > 0) {
        await Promise.all(Array.from(currenciesToFetch).map(async (currency) => {
            // Yahoo symbols: USDPLN=X, EURPLN=X
            const pair = `${currency}PLN=X`;
            const result = await fetchHistory(pair, apiRange, '1d');

            if (result && result.data && result.data.length > 0) {
                fxHistories[currency] = result.data;
            } else {
                // Fallback: Fetch current 1-point price
                try {
                    const current = await fetchCurrentPrice(pair);
                    if (current && current.price) {
                        // Create pseudo-history with 1 point at beginning of time so getPriceAt always finds it
                        fxHistories[currency] = [{ time: 0, price: current.price }];
                    }
                } catch (e) {
                    console.warn("FX Fallback failed for", pair, e);
                }
            }
        }));
    }

    // 3. Replay Loop
    const timeline = [];
    // If range is large, step might need optimization, but 1d is fine for charts
    for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
        timeline.push(new Date(d));
    }

    // sortedTx is already defined at the top

    // Helper: Get Price (Asset or FX)
    const getPriceAt = (historyData, date) => {
        if (!historyData || historyData.length === 0) return 0;
        const targetTime = date.getTime() / 1000;

        // Find last known price before or at targetTime
        let lastPrice = historyData[0].price; // Default to first if all else fails

        // Efficient enough loop for < 365 items
        for (let i = 0; i < historyData.length; i++) {
            if (historyData[i].time > targetTime) break;
            lastPrice = historyData[i].price;
        }
        return lastPrice;
    };

    const resultSeries = timeline.map(day => {
        const relevantTx = sortedTx.filter(t => new Date(t.date) <= day);
        const portfolio = {};
        let cash = 0;
        let investedPLN = 0;
        let investedNative = 0; // Total Net Invested in Native Currency
        let assetAvgPrices = {};

        relevantTx.forEach(tx => {
            let txTotalPLN = tx.total;

            // Calculate Cash Deduction in PLN
            if (tx.currency && tx.currency !== 'PLN' && !excludeCash) {
                const txDate = new Date(tx.date);
                let rateAtTx = 0;
                if (fxHistories[tx.currency]) {
                    rateAtTx = getPriceAt(fxHistories[tx.currency], txDate);
                }

                // Fallback if History missing for that date (e.g. today)
                if (!rateAtTx || rateAtTx === 0) {
                    if (fxHistories[tx.currency] && fxHistories[tx.currency].length > 0) {
                        rateAtTx = fxHistories[tx.currency][fxHistories[tx.currency].length - 1].price;
                    }
                }

                if (!rateAtTx) {
                    if (tx.currency === 'EUR') rateAtTx = 4.3;
                    else if (tx.currency === 'USD') rateAtTx = 4.0;
                    else rateAtTx = 1.0;
                }

                txTotalPLN = tx.total * rateAtTx;
            }

            // --- TRACKING INVESTED CAPITAL & COST BASIS ---
            if (tx.type === 'Depozyt' || tx.type === 'Wpłata') {
                cash += txTotalPLN;
                investedPLN += txTotalPLN;
            } else if (tx.type === 'Wypłata') {
                cash -= txTotalPLN;
                investedPLN -= txTotalPLN;
            } else if (tx.type === 'Kupno') {
                portfolio[tx.ticker] = (portfolio[tx.ticker] || 0) + tx.amount;
                cash -= txTotalPLN;
                investedNative += tx.total;

                if (!assetAvgPrices[tx.ticker]) assetAvgPrices[tx.ticker] = { qty: 0, avgPrice: 0 };
                const entry = assetAvgPrices[tx.ticker];
                const oldVal = entry.qty * entry.avgPrice;
                const newVal = tx.amount * tx.price;
                entry.qty += tx.amount;
                entry.avgPrice = (oldVal + newVal) / entry.qty;

            } else if (tx.type === 'Sprzedaż') {
                portfolio[tx.ticker] = (portfolio[tx.ticker] || 0) - tx.amount;
                cash += txTotalPLN;
                investedNative -= tx.total;

                if (assetAvgPrices[tx.ticker]) {
                    assetAvgPrices[tx.ticker].qty -= tx.amount;
                    if (assetAvgPrices[tx.ticker].qty <= 0) {
                        assetAvgPrices[tx.ticker].avgPrice = 0;
                        assetAvgPrices[tx.ticker].qty = 0;
                    }
                }
            }
        });

        let totalValue = 0;
        let totalPL = 0;

        Object.entries(portfolio).forEach(([ticker, amount]) => {
            if (amount > 0 && histories[ticker]) {
                const assetPrice = getPriceAt(histories[ticker].data, day);
                const currency = histories[ticker].currency;

                let valueNative = assetPrice * amount;

                if (returnNative) {
                    totalValue += valueNative;
                } else {
                    let valuePLN = valueNative;
                    if (currency !== 'PLN') {
                        let rate = 0;
                        if (fxHistories[currency] && fxHistories[currency].length > 0) {
                            rate = getPriceAt(fxHistories[currency], day);
                        }
                        if (!rate) {
                            if (currency === 'EUR') rate = 4.3;
                            else if (currency === 'USD') rate = 4.0;
                            else rate = 1.0;
                        }
                        valuePLN = valueNative * rate;
                    }
                    totalValue += valuePLN;
                }
            }
        });

        if (returnNative) {
            totalPL = totalValue - investedNative;
        } else {
            totalValue += cash;
            totalPL = totalValue - investedPLN;
        }

        return {
            time: day.getTime() / 1000,
            price: totalValue,
            pl: totalPL
        };
    });

    return resultSeries;
};
