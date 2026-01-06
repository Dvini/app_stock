/**
 * Hook for fetching and managing live prices for tickers
 * Implements caching and automatic refresh
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchCurrentPrice, getCachedPrice } from '../lib/api';
import type { PriceData } from '../types/api';

interface UsePricesOptions {
    refreshInterval?: number;
    autoRefresh?: boolean;
}

interface UsePricesReturn {
    prices: Record<string, PriceData>;
    isLoading: boolean;
    lastUpdate: Date | null;
    errors: Record<string, string>;
    getPrice: (ticker: string) => PriceData | null;
    hasPrice: (ticker: string) => boolean;
    refresh: () => Promise<void>;
    hasPrices: boolean;
}

/**
 * Custom hook to fetch and manage prices for multiple tickers
 */
export const usePrices = (tickers: string[] = [], options: UsePricesOptions = {}): UsePricesReturn => {
    const {
        refreshInterval = 15 * 60 * 1000, // 15 minutes
        autoRefresh = true
    } = options;

    const [prices, setPrices] = useState<Record<string, PriceData>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Fetch prices for all tickers
    const fetchPrices = useCallback(async () => {
        if (tickers.length === 0) {
            setPrices({});
            return;
        }

        setIsLoading(true);
        const newPrices: Record<string, PriceData> = {};
        const newErrors: Record<string, string> = {};

        const promises = tickers.map(async ticker => {
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
                newErrors[ticker] = error instanceof Error ? error.message : 'Unknown error';
                return null;
            }
        });

        const results = await Promise.all(promises);

        results.forEach(res => {
            if (res && 'ticker' in res) {
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
    }, [tickers]);

    // Initial fetch and auto-refresh
    useEffect(() => {
        fetchPrices();

        if (autoRefresh && refreshInterval > 0) {
            const interval = setInterval(fetchPrices, refreshInterval);
            return () => clearInterval(interval);
        }
    }, [fetchPrices, autoRefresh, refreshInterval]);

    // Get price for specific ticker
    const getPrice = useCallback(
        (ticker: string): PriceData | null => {
            return prices[ticker] || null;
        },
        [prices]
    );

    // Check if price is available
    const hasPrice = useCallback(
        (ticker: string): boolean => {
            return !!prices[ticker];
        },
        [prices]
    );

    // Manual refresh
    const refresh = useCallback(() => {
        return fetchPrices();
    }, [fetchPrices]);

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
