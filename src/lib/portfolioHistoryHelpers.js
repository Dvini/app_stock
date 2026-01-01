/**
 * Portfolio History Calculator - Modular Version
 * Refactored to improve maintainability and testability
 */

import { fetchHistory, fetchCurrentPrice } from './api';
import { getExchangeRateWithFallback } from '../utils/currencyHelpers';

/**
 * Helper: Get price at a specific date from historical data
 * Finds the last known price before or at the target date
 * 
 * @param {Array} historyData - Array of {time, price} objects
 * @param {Date} date - Target date
 * @returns {number} Price at the target date
 */
export const getPriceAt = (historyData, date) => {
    if (!historyData || historyData.length === 0) return 0;
    const targetTime = date.getTime() / 1000;

    // Find last known price before or at targetTime
    let lastPrice = historyData[0].price; // Default to first if all else fails

    // Efficient loop for historical data (usually < 365 items)
    for (let i = 0; i < historyData.length; i++) {
        if (historyData[i].time > targetTime) break;
        lastPrice = historyData[i].price;
    }
    return lastPrice;
};

/**
 * Fetch historical data for assets and FX rates
 * 
 * @param {Array} uniqueTickers - Array of unique ticker symbols
 * @param {Set} currenciesToFetch - Set of currencies needing exchange rates
 * @param {string} apiRange - API range parameter
 * @returns {Promise<{histories, fxHistories}>} Historical data objects
 */
export const fetchHistoricalData = async (uniqueTickers, currenciesToFetch, apiRange) => {
    const histories = {}; // { AAPL: { data: [...], currency: 'USD' } }
    const fxHistories = {}; // { USD: [{time, price}, ...] }

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
    if (currenciesToFetch.size > 0) {
        await Promise.all(Array.from(currenciesToFetch).map(async (currency) => {
            const pair = `${currency}PLN=X`;
            const result = await fetchHistory(pair, apiRange, '1d');

            if (result && result.data && result.data.length > 0) {
                fxHistories[currency] = result.data;
            } else {
                // Fallback: Fetch current 1-point price
                try {
                    const current = await fetchCurrentPrice(pair);
                    if (current && current.price) {
                        fxHistories[currency] = [{ time: 0, price: current.price }];
                    }
                } catch (e) {
                    console.warn("FX Fallback failed for", pair, e);
                }
            }
        }));
    }

    return { histories, fxHistories };
};
