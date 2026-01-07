import { getExchangeRateWithFallback } from '../utils/currencyHelpers';
import { getPriceAt, fetchHistoricalData } from './portfolioHistoryHelpers';
import type { Transaction } from '../types/database';

interface HistoryDataPoint {
    time: number;
    price: number;
    pl: number;
}

export const calculatePortfolioHistory = async (
    transactions: Transaction[],
    range: string = '1mo',
    excludeCash: boolean = false,
    returnNative: boolean = false
): Promise<HistoryDataPoint[]> => {
    if (!transactions || transactions.length === 0) return [];

    // Sort transactions by date first to ensure correct timeline
    const sortedTx = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const now = new Date();
    let startDate = new Date();

    if (range === 'max') {
        const firstInvestTx = sortedTx.find(t => ['Kupno', 'Sprzedaż'].includes(t.type));
        if (firstInvestTx) {
            startDate = new Date(firstInvestTx.date);
        } else if (sortedTx.length > 0) {
            startDate = new Date(sortedTx[0]?.date || now);
        } else {
            startDate.setMonth(now.getMonth() - 1); // Fallback
        }
    } else {
        if (range === '1d') {
            // For 1D, show today's session from market open (9:30 AM)
            startDate = new Date();
            startDate.setHours(9, 30, 0, 0);
        }
        if (range === '5d') startDate.setDate(now.getDate() - 5);
        if (range === '1mo') startDate.setMonth(now.getMonth() - 1);
        if (range === '1y') startDate.setFullYear(now.getFullYear() - 1);
        if (range === '5y') startDate.setFullYear(now.getFullYear() - 5);
    }

    // Safety: don't go before 1970 or invalid dates
    if (isNaN(startDate.getTime())) startDate = new Date(new Date().setMonth(now.getMonth() - 1));

    const uniqueTickers = [
        ...new Set(transactions.map(t => t.ticker).filter((t): t is string => t !== undefined && t !== 'CASH'))
    ];

    let apiRange = range;
    let apiInterval = '1d';
    
    if (range === 'max') {
        apiRange = '10y'; // 'max' often fails via proxy, 10y is usually sufficient
        apiInterval = '1d';
    } else if (range === '5y') {
        apiRange = '5y';
        apiInterval = '1d';
    } else if (range === '1y') {
        apiRange = '1y';
        apiInterval = '1d';
    } else if (range === '1mo') {
        apiRange = '1mo';
        apiInterval = '1d';
    } else if (range === '5d') {
        apiRange = '5d';
        apiInterval = '15m';
    } else if (range === '1d') {
        apiRange = '1d';
        apiInterval = '5m';
    } else {
        apiRange = '1y';
        apiInterval = '1d';
    }

    const currenciesToFetch = new Set<string>();

    // Fetch all historical data (extracted to helper function)
    const { histories, fxHistories } = await fetchHistoricalData(uniqueTickers, currenciesToFetch, apiRange, apiInterval);

    // 3. Replay Loop
    const timeline: Date[] = [];
    
    // Determine step size based on range
    let stepMinutes = 1440; // 1 day by default
    if (range === '1d') stepMinutes = 5; // 5 minutes for 1D
    else if (range === '5d') stepMinutes = 15; // 15 minutes for 5D
    
    // Generate timeline with appropriate step
    if (stepMinutes < 1440) {
        // Intraday intervals (minutes)
        for (let d = new Date(startDate); d <= now; d = new Date(d.getTime() + stepMinutes * 60 * 1000)) {
            timeline.push(new Date(d));
        }
    } else {
        // Daily intervals - set to 23:00 (end of trading day)
        for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
            const dayPoint = new Date(d);
            dayPoint.setHours(23, 0, 0, 0);
            
            // Don't add future points
            if (dayPoint <= now) {
                timeline.push(dayPoint);
            }
        }
        
        // For 'max' range, add current time as the last point if it's not already at 23:00
        if (range === 'max' && timeline.length > 0) {
            const lastPoint = timeline[timeline.length - 1];
            const nowTime = now.getTime();
            const lastPointTime = lastPoint.getTime();
            
            // If last point is not today at current time, add current time
            if (Math.abs(nowTime - lastPointTime) > 60000) { // More than 1 minute difference
                timeline.push(new Date(now));
            }
        }
    }

    const resultSeries: HistoryDataPoint[] = timeline.map(day => {
        // IMPORTANT: Use ALL transactions up to this point for accurate P/L
        const relevantTx = sortedTx.filter(t => new Date(t.date) <= day);
        const portfolio: Record<string, number> = {};
        let cash = 0;
        let investedPLN = 0;
        let investedNative = 0; // Total Net Invested in Native Currency
        const assetAvgPrices: Record<string, { qty: number; avgPrice: number }> = {};

        relevantTx.forEach(tx => {
            let txTotalPLN = tx.total;

            // Calculate Cash Deduction in PLN
            if (tx.currency && tx.currency !== 'PLN' && !excludeCash) {
                const txDate = new Date(tx.date);
                let rateAtTx = 0;
                const fxHistory = fxHistories[tx.currency];
                if (fxHistory) {
                    rateAtTx = getPriceAt(fxHistory, txDate);
                }

                // Fallback if History missing for that date (e.g. today)
                if (!rateAtTx || rateAtTx === 0) {
                    if (fxHistory && fxHistory.length > 0) {
                        rateAtTx = fxHistory[fxHistory.length - 1]?.price || 0;
                    }
                }

                rateAtTx = getExchangeRateWithFallback(tx.currency, rateAtTx);
                txTotalPLN = tx.total * rateAtTx;
            }

            // --- TRACKING INVESTED CAPITAL & COST BASIS ---
            if (tx.type === 'Depozyt' || tx.type === 'deposit') {
                cash += txTotalPLN;
                investedPLN += txTotalPLN;
            } else if (tx.type === 'Wypłata') {
                cash -= txTotalPLN;
                investedPLN -= txTotalPLN;
            } else if (tx.type === 'Kupno') {
                const ticker = tx.ticker;
                if (ticker) {
                    portfolio[ticker] = (portfolio[ticker] || 0) + tx.amount;
                    cash -= txTotalPLN;
                    investedNative += tx.total;

                    if (!assetAvgPrices[ticker]) assetAvgPrices[ticker] = { qty: 0, avgPrice: 0 };
                    const entry = assetAvgPrices[ticker];
                    const oldVal = entry.qty * entry.avgPrice;
                    const newVal = tx.amount * (tx.price || 0);
                    entry.qty += tx.amount;
                    entry.avgPrice = (oldVal + newVal) / entry.qty;
                }
            } else if (tx.type === 'Sprzedaż') {
                const ticker = tx.ticker;
                if (ticker) {
                    portfolio[ticker] = (portfolio[ticker] || 0) - tx.amount;
                    cash += txTotalPLN;
                    investedNative -= tx.total;

                    if (assetAvgPrices[ticker]) {
                        assetAvgPrices[ticker].qty -= tx.amount;
                        if (assetAvgPrices[ticker].qty <= 0) {
                            assetAvgPrices[ticker].avgPrice = 0;
                            assetAvgPrices[ticker].qty = 0;
                        }
                    }
                }
            }
        });

        let totalValue = 0;
        let totalPL = 0;

        Object.entries(portfolio).forEach(([ticker, amount]) => {
            const history = histories[ticker];
            if (amount > 0 && history) {
                const assetPrice = getPriceAt(history.data, day);
                const currency = history.currency;

                let valueNative = assetPrice * amount;

                if (returnNative) {
                    totalValue += valueNative;
                } else {
                    let valuePLN = valueNative;
                    if (currency !== 'PLN') {
                        let rate = 0;
                        const fxHistory = fxHistories[currency];
                        if (fxHistory && fxHistory.length > 0) {
                            rate = getPriceAt(fxHistory, day);
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
