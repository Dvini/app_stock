/**
 * Hook for fetching and managing exchange rates
 * Handles currency conversion with caching
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchExchangeRates } from '../lib/api';
import type { CurrencyCode } from '../types/database';
import { logger } from '../utils/logger';

interface UseExchangeRatesOptions {
    targetCurrency?: CurrencyCode;
    refreshInterval?: number;
    autoRefresh?: boolean;
}

interface UseExchangeRatesReturn {
    rates: Partial<Record<CurrencyCode, number>>;
    isLoading: boolean;
    lastUpdate: Date | null;
    error: Error | null;
    targetCurrency: CurrencyCode;
    getRate: (currency: CurrencyCode) => number | null;
    convert: (amount: number, fromCurrency: CurrencyCode, toCurrency?: CurrencyCode) => number;
    hasRate: (currency: CurrencyCode) => boolean;
    refresh: () => Promise<void>;
    hasRates: boolean;
}

/**
 * Custom hook to fetch and manage exchange rates
 */
export const useExchangeRates = (
    currencies: CurrencyCode[] = [],
    options: UseExchangeRatesOptions = {}
): UseExchangeRatesReturn => {
    const {
        targetCurrency = 'PLN',
        refreshInterval = 15 * 60 * 1000, // 15 minutes
        autoRefresh = true
    } = options;

    const [rates, setRates] = useState<Partial<Record<CurrencyCode, number>>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [error, setError] = useState<Error | null>(null);

    const currenciesRef = useRef(currencies);
    currenciesRef.current = currencies;
    const currenciesKey = [...currencies].sort().join(',');

    // Fetch exchange rates
    const fetchRates = useCallback(async () => {
        // Filter out target currency (no need to fetch rate for same currency)
        const neededCurrencies = currenciesRef.current.filter(c => c && c !== targetCurrency);

        if (neededCurrencies.length === 0) {
            setRates(prev => (Object.keys(prev).length === 0 ? prev : ({} as Record<CurrencyCode, number>)));
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const fetchedRates = await fetchExchangeRates(neededCurrencies, targetCurrency);
            setRates(prev => {
                const prevKeys = Object.keys(prev);
                const newKeys = Object.keys(fetchedRates);
                if (
                    prevKeys.length === newKeys.length &&
                    prevKeys.every(
                        k =>
                            prev[k as CurrencyCode] ===
                            (fetchedRates as Record<CurrencyCode, number>)[k as CurrencyCode]
                    )
                ) {
                    return prev;
                }
                return fetchedRates as Record<CurrencyCode, number>;
            });
            setLastUpdate(new Date());
        } catch (err) {
            logger.error('Error fetching exchange rates:', err);
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setIsLoading(false);
        }
    }, [currenciesKey, targetCurrency]);

    // Initial fetch and auto-refresh
    useEffect(() => {
        fetchRates();

        if (autoRefresh && refreshInterval > 0) {
            const interval = setInterval(fetchRates, refreshInterval);
            return () => clearInterval(interval);
        }
    }, [fetchRates, autoRefresh, refreshInterval]);

    // Get rate for specific currency
    const getRate = useCallback(
        (currency: CurrencyCode): number | null => {
            if (currency === targetCurrency) return 1;
            return rates[currency] || null;
        },
        [rates, targetCurrency]
    );

    // Convert amount from one currency to target
    const convert = useCallback(
        (amount: number, fromCurrency: CurrencyCode, toCurrency: CurrencyCode = targetCurrency): number => {
            if (fromCurrency === toCurrency) return amount;

            const rate = rates[fromCurrency];
            if (!rate) {
                logger.warn(`No exchange rate available for ${fromCurrency} -> ${toCurrency}`);
                return amount; // Return original if no rate
            }

            return amount * rate;
        },
        [rates, targetCurrency]
    );

    // Check if rate is available
    const hasRate = useCallback(
        (currency: CurrencyCode): boolean => {
            if (currency === targetCurrency) return true;
            return !!rates[currency];
        },
        [rates, targetCurrency]
    );

    // Manual refresh
    const refresh = useCallback(() => {
        return fetchRates();
    }, [fetchRates]);

    return {
        rates,
        isLoading,
        lastUpdate,
        error,
        targetCurrency,
        getRate,
        convert,
        hasRate,
        refresh,
        hasRates: Object.keys(rates).length > 0
    };
};

export default useExchangeRates;
