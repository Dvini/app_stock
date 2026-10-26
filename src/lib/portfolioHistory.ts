import { getPriceAt, fetchHistoricalData } from './portfolioHistoryHelpers';
import type { Dividend, Transaction } from '../types/database';
import { sortTransactions } from './ledger';
import { datePart, toLocalISODate } from '../utils/dates';
import { dividendNetPLN } from '../utils/dividendTax';
import { isBuyTransaction, isSellTransaction, isDepositTransaction, isWithdrawTransaction } from '../types/database';
import { logger } from '../utils/logger';

interface HistoryDataPoint {
    time: number;
    price: number;
    pl: number;
}

interface PortfolioHistoryResult {
    data: HistoryDataPoint[];
    sessionDate?: string;
}

export const calculatePortfolioHistory = async (
    transactions: Transaction[],
    range: string = '1mo',
    excludeCash: boolean = false,
    returnNative: boolean = false,
    dividends: Dividend[] = []
): Promise<PortfolioHistoryResult> => {
    if (!transactions || transactions.length === 0) return { data: [], sessionDate: undefined };

    // Sort transactions by date first to ensure correct timeline
    const sortedTx = sortTransactions(transactions);

    // Last rate actually applied per currency - used when FX history has no point for a day
    const lastTxRate: Record<string, number> = {};
    sortedTx.forEach(t => {
        if (t.currency && t.currency !== 'PLN' && t.exchangeRate) lastTxRate[t.currency] = t.exchangeRate;
    });

    // Net dividends credited to cash on payment date (same rule as the ledger)
    const dividendCredits = excludeCash
        ? []
        : dividends.flatMap(d => {
              const net = dividendNetPLN(d);
              return net !== null && (d.totalAmount || 0) > 0 ? [{ date: datePart(d.paymentDate), net }] : [];
          });
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
    const { histories, fxHistories } = await fetchHistoricalData(
        uniqueTickers,
        currenciesToFetch,
        apiRange,
        apiInterval
    );

    // Determine actual end date from Yahoo Finance data instead of using 'now'
    let endDate = new Date(0); // Start with epoch

    // Find the latest timestamp from all fetched historical data
    Object.values(histories).forEach(history => {
        if (history?.data && history.data.length > 0) {
            const lastPoint = history.data[history.data.length - 1];
            if (lastPoint) {
                const pointDate = new Date(lastPoint.timestamp * 1000);
                if (pointDate > endDate) {
                    endDate = pointDate;
                }
            }
        }
    });

    // Fallback to 'now' if no data was found
    if (endDate.getTime() === 0) {
        endDate = now;
    }

    // For 1D range, derive startDate from actual API data (handles weekends/holidays)
    if (range === '1d') {
        let earliestTimestamp = Infinity;
        Object.values(histories).forEach(history => {
            if (history?.data && history.data.length > 0) {
                const firstPoint = history.data[0];
                if (firstPoint && firstPoint.timestamp < earliestTimestamp) {
                    earliestTimestamp = firstPoint.timestamp;
                }
            }
        });
        if (earliestTimestamp !== Infinity) {
            startDate = new Date(earliestTimestamp * 1000);
        }
    }

    logger.debug('[portfolioHistory] Range:', range);
    logger.debug('[portfolioHistory] Start Date:', startDate.toISOString());
    logger.debug('[portfolioHistory] End Date from Yahoo:', endDate.toISOString());
    logger.debug('[portfolioHistory] Current Time (now):', now.toISOString());

    // 3. Replay Loop
    const timeline: Date[] = [];

    // Determine step size based on range
    let stepMinutes = 1440; // 1 day by default
    if (range === '1d')
        stepMinutes = 5; // 5 minutes for 1D
    else if (range === '5d') stepMinutes = 15; // 15 minutes for 5D

    // Timeline from the actual quote times (one point per trading day for daily ranges), like the
    // Dashboard chart: a calendar grid turns nights, weekends and holidays into flat stretches.
    // Nothing is charted before the first trade - for a single ticker that is a flat zero P/L line.
    const firstTx = sortedTx.find(t => isBuyTransaction(t.type) || isSellTransaction(t.type)) ?? sortedTx[0];
    const firstTxDay = datePart(firstTx?.date ?? '');
    // Timestamp 0 marks the current-price fallback, not a quote
    const allQuoteTimes = [...new Set(Object.values(histories).flatMap(h => h.data.map(p => p.timestamp)))].filter(
        t => t > 0
    );
    const hasQuotes = allQuoteTimes.length > 0;
    // No quote since the first trade (e.g. bought at the weekend): an empty series, not a zero line
    const quoteTimes = allQuoteTimes
        .filter(t => toLocalISODate(new Date(t * 1000)) >= firstTxDay)
        .sort((a, b) => a - b);

    if (hasQuotes && stepMinutes < 1440) {
        // Intraday: the API range already covers the sessions to show
        quoteTimes.forEach(t => timeline.push(new Date(t * 1000)));
    } else if (hasQuotes) {
        const fromDay = toLocalISODate(startDate);
        const toDay = toLocalISODate(endDate);
        const tradingDays = [...new Set(quoteTimes.map(t => toLocalISODate(new Date(t * 1000))))];
        tradingDays
            .filter(d => d >= fromDay && d <= toDay)
            .forEach(d => {
                const [y, m, dd] = d.split('-').map(Number);
                timeline.push(new Date(y!, m! - 1, dd!));
            });
    } else if (stepMinutes < 1440) {
        // No quote history (current-price fallback only): generated grid, intraday steps
        for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + stepMinutes * 60 * 1000)) {
            timeline.push(new Date(d));
        }
    } else {
        // No quote history: generated grid, one point per calendar day
        // Use while loop to avoid date mutation issues in for loop condition
        // Normalize to day-level comparison (ignore hours/minutes) to handle timezone issues
        let currentDate = new Date(startDate);
        currentDate.setHours(0, 0, 0, 0);

        const endDateDay = new Date(endDate);
        endDateDay.setHours(0, 0, 0, 0);

        while (currentDate <= endDateDay) {
            timeline.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }

    logger.debug('[portfolioHistory] Timeline length:', timeline.length);
    if (timeline.length > 0) {
        logger.debug('[portfolioHistory] Timeline first date:', timeline[0]?.toISOString());
        logger.debug('[portfolioHistory] Timeline last date:', timeline[timeline.length - 1]?.toISOString());
    }

    const resultSeries: HistoryDataPoint[] = timeline.map(day => {
        // IMPORTANT: Use ALL transactions up to this point for accurate P/L
        // Compare calendar dates: new Date('YYYY-MM-DD') is UTC midnight, `day` is local
        const dayStr = toLocalISODate(day);
        const relevantTx = sortedTx.filter(t => datePart(t.date) <= dayStr);
        const portfolio: Record<string, number> = {};
        let cash = 0;
        let investedPLN = 0;
        let investedNative = 0; // Total Net Invested in Native Currency
        const assetAvgPrices: Record<string, { qty: number; avgPrice: number }> = {};

        relevantTx.forEach(tx => {
            let txTotalPLN = tx.total;

            // Cash movement in PLN at the rate actually applied (same as the ledger)
            if (tx.currency && tx.currency !== 'PLN' && !excludeCash) {
                txTotalPLN = tx.total * (tx.exchangeRate || lastTxRate[tx.currency] || 0);
            }

            // --- TRACKING INVESTED CAPITAL & COST BASIS ---
            if (isDepositTransaction(tx.type)) {
                cash += txTotalPLN;
                investedPLN += txTotalPLN;
            } else if (isWithdrawTransaction(tx.type)) {
                cash -= txTotalPLN;
                investedPLN -= txTotalPLN;
            } else if (isBuyTransaction(tx.type)) {
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
            } else if (isSellTransaction(tx.type)) {
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

        // For daily intervals, use end-of-day time to query prices
        // This ensures getPriceAt finds prices even when Yahoo timestamps are at market close
        const queryDate = new Date(day);
        if (stepMinutes >= 1440) {
            queryDate.setHours(23, 59, 59, 999);
        }

        Object.entries(portfolio).forEach(([ticker, amount]) => {
            const history = histories[ticker];
            if (amount > 0 && history) {
                const assetPrice = getPriceAt(history.data, queryDate);
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
                            rate = getPriceAt(fxHistory, queryDate);
                        }
                        if (!rate) rate = lastTxRate[currency] ?? 0;
                        valuePLN = valueNative * rate;
                    }
                    totalValue += valuePLN;
                }
            }
        });

        if (returnNative) {
            totalPL = totalValue - investedNative;
        } else {
            totalValue += cash + dividendCredits.reduce((s, c) => (c.date <= dayStr ? s + c.net : s), 0);
            totalPL = totalValue - investedPLN;
        }

        // For daily intervals, try to use actual timestamp from historical data (market close time)
        // For intraday intervals or when no data available, use generated timeline timestamp
        let actualTimestamp = day.getTime() / 1000;

        if (stepMinutes >= 1440 && Object.keys(histories).length > 0) {
            // For daily intervals, find actual market close timestamp from data
            const dayStart = new Date(day);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(day);
            dayEnd.setHours(23, 59, 59, 999);

            // Look for any ticker's data point on this day to get actual close timestamp
            for (const ticker in histories) {
                const history = histories[ticker];
                if (history && history.data) {
                    const dataPoint = history.data.find(p => {
                        const pointTime = p.timestamp * 1000;
                        return pointTime >= dayStart.getTime() && pointTime <= dayEnd.getTime();
                    });

                    if (dataPoint) {
                        actualTimestamp = dataPoint.timestamp;
                        break; // Use first found timestamp (all tickers should have same close time on same exchange)
                    }
                }
            }
        }

        return {
            time: actualTimestamp,
            price: totalValue,
            pl: totalPL
        };
    });

    // Extract session date for 1D range (for UI label)
    let sessionDate: string | undefined;
    if (range === '1d' && endDate.getTime() !== 0) {
        sessionDate = endDate.toLocaleDateString('pl-PL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    return { data: resultSeries, sessionDate };
};
