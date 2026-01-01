import { fetchHistory, fetchCurrentPrice } from './api';
import { getExchangeRateWithFallback } from '../utils/currencyHelpers';
import { getPriceAt, fetchHistoricalData } from './portfolioHistoryHelpers';

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

    const currenciesToFetch = new Set();

    // Fetch all historical data (extracted to helper function)
    const { histories, fxHistories } = await fetchHistoricalData(uniqueTickers, currenciesToFetch, apiRange);

    // 3. Replay Loop
    const timeline = [];
    // If range is large, step might need optimization, but 1d is fine for charts
    for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
        timeline.push(new Date(d));
    }

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

                rateAtTx = getExchangeRateWithFallback(tx.currency, rateAtTx);
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
                        rate = getExchangeRateWithFallback(currency, rate);
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
