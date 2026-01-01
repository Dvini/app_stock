/**
 * Hook for fetching and managing live prices for tickers
 * Implements caching and automatic refresh
 */

import { useState, useEffect } from 'react';
import { fetchCurrentPrice, getCachedPrice } from '../lib/api';

/**
 * Custom hook to fetch and manage prices for multiple tickers
 * @param {string[]} tickers - Array of ticker symbols
 * @param {Object} options - Configuration options
 * @returns {Object} Prices data and loading state
 */
export const usePrices = (tickers = [], options = {}) => {
    const {
        refreshInterval = 15 * 60 * 1000, // 15 minutes
        autoRefresh = true
    } = options;

    const [prices, setPrices] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [errors, setErrors] = useState({});

    // Fetch prices for all tickers
    const fetchPrices = async () => {
        if (tickers.length === 0) {
            setPrices({});
            return;
        }

        setIsLoading(true);
        const newPrices = {};
        const newErrors = {};

        const promises = tickers.map(async (ticker) => {
            try {
                // Try cache first
                const cached = getCachedPrice(ticker);
                if (cached?.price) {
                    return { ticker, ...cached };
                }

                // Fetch from API
                const result = await fetchCurrentPrice(ticker);
                if (result) {
                    return { ticker, ...result };
                }

                newErrors[ticker] = 'No data available';
                return null;
            } catch (error) {
                console.error(`Error fetching price for ${ticker}:`, error);
                newErrors[ticker] = error.message;
                return null;
            }
        });

        const results = await Promise.all(promises);

        results.forEach(res => {
            if (res) {
                newPrices[res.ticker] = {
                    price: res.price,
                    currency: res.currency
                };
            }
        });

        setPrices(newPrices);
        setErrors(newErrors);
        setLastUpdate(new Date());
        setIsLoading(false);
    };

    // Initial fetch and auto-refresh
    useEffect(() => {
        fetchPrices();

        if (autoRefresh && refreshInterval > 0) {
            const interval = setInterval(fetchPrices, refreshInterval);
            return () => clearInterval(interval);
        }
    }, [tickers.join(','), refreshInterval, autoRefresh]);

    // Get price for specific ticker
    const getPrice = (ticker) => {
        return prices[ticker] || null;
    };

    // Check if price is available
    const hasPrice = (ticker) => {
        return !!prices[ticker];
    };

    // Manual refresh
    const refresh = () => {
        return fetchPrices();
    };

    return {
        prices,
        isLoading,
        lastUpdate,
        errors,
        getPrice,
        hasPrice,
        refresh,
        hasPrices: Object.keys(prices).length > 0
    };
};

export default usePrices;
