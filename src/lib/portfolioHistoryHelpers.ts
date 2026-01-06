/**
 * Portfolio History Calculator - Modular Version
 * Refactored to improve maintainability and testability
 */

import { fetchHistory, fetchCurrentPrice } from './api';
import type { HistoricalDataPoint } from '../types/api';
import type { CurrencyCode } from '../types/database';

interface AssetHistory {
    data: HistoricalDataPoint[];
    currency: CurrencyCode;
}

interface FetchHistoricalDataResult {
    histories: Record<string, AssetHistory>;
    fxHistories: Record<string, HistoricalDataPoint[]>;
}

/**
 * Helper: Get price at a specific date from historical data
 * Finds the last known price before or at the target date
 */
export const getPriceAt = (historyData: HistoricalDataPoint[], date: Date): number => {
    if (!historyData || historyData.length === 0) return 0;
    const targetTime = date.getTime() / 1000;

    // Find last known price before or at targetTime
    let lastPrice = historyData[0]?.price || 0; // Default to first if all else fails

    // Efficient loop for historical data (usually < 365 items)
    for (let i = 0; i < historyData.length; i++) {
        const point = historyData[i];
        if (!point) continue;
        if (point.timestamp > targetTime) break;
        lastPrice = point.price;
    }
    return lastPrice;
};

/**
 * Fetch historical data for assets and FX rates
 */
export const fetchHistoricalData = async (
    uniqueTickers: string[],
    currenciesToFetch: Set<string>,
    apiRange: string
): Promise<FetchHistoricalDataResult> => {
    const histories: Record<string, AssetHistory> = {};
    const fxHistories: Record<string, HistoricalDataPoint[]> = {};

    // 1. Fetch Asset Histories
    await Promise.all(
        uniqueTickers.map(async ticker => {
            let hasData = false;
            try {
                let result = await fetchHistory(ticker, apiRange, '1d');

                // Fallback for MAX range if it fails or returns empty
                if ((!result || !result.data || result.data.length === 0) && apiRange === 'max') {
                    console.warn(`MAX history failed for ${ticker}, trying 10y...`);
                    result = await fetchHistory(ticker, '10y', '1d');
                }
                if (
                    (!result || !result.data || result.data.length === 0) &&
                    (apiRange === 'max' || apiRange === '10y')
                ) {
                    console.warn(`10y history failed for ${ticker}, trying 5y...`);
                    result = await fetchHistory(ticker, '5y', '1d');
                }

                if (result && result.data && result.data.length > 0) {
                    histories[ticker] = {
                        data: result.data,
                        currency: (result.currency as CurrencyCode) || 'PLN'
                    };
                    hasData = true;
                    if (result.currency && result.currency !== 'PLN') {
                        currenciesToFetch.add(result.currency);
                    }
                }
            } catch (e) {
                console.warn('History fetch failed', ticker, e);
            }

            if (!hasData) {
                // FALLBACK: Fetch current price
                try {
                    const current = await fetchCurrentPrice(ticker);
                    if (current && current.price) {
                        histories[ticker] = {
                            data: [{ timestamp: 0, price: current.price, date: '' }], // Valid from beginning of time
                            currency: current.currency || 'PLN'
                        };
                        if (current.currency && current.currency !== 'PLN') {
                            currenciesToFetch.add(current.currency);
                        }
                    }
                } catch (e) {
                    console.warn('Asset Fallback failed', ticker, e);
                }
            }
        })
    );

    // 2. Fetch Currency Histories (e.g. USDPLN=X)
    if (currenciesToFetch.size > 0) {
        await Promise.all(
            Array.from(currenciesToFetch).map(async currency => {
                const pair = `${currency}PLN=X`;
                const result = await fetchHistory(pair, apiRange, '1d');

                if (result && result.data && result.data.length > 0) {
                    fxHistories[currency] = result.data;
                } else {
                    // Fallback: Fetch current 1-point price
                    try {
                        const current = await fetchCurrentPrice(pair);
                        if (current && current.price) {
                            fxHistories[currency] = [{ timestamp: 0, price: current.price, date: '' }];
                        }
                    } catch (e) {
                        console.warn('FX Fallback failed for', pair, e);
                    }
                }
            })
        );
    }

    return { histories, fxHistories };
};
