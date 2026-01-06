/**
 * Hook for fetching and managing exchange rates
 * Handles currency conversion with caching
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchExchangeRates } from '../lib/api';
import { useCurrency } from '../context/CurrencyContext';
import type { CurrencyCode } from '../types/database';

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
    const { baseCurrency: defaultBaseCurrency } = useCurrency();
    const {
        targetCurrency = defaultBaseCurrency,
        refreshInterval = 15 * 60 * 1000, // 15 minutes
        autoRefresh = true
    } = options;

    const [rates, setRates] = useState<Partial<Record<CurrencyCode, number>>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [error, setError] = useState<Error | null>(null);

    // Fetch exchange rates
    const fetchRates = useCallback(async () => {
        // Filter out target currency (no need to fetch rate for same currency)
        const neededCurrencies = currencies.filter(c => c && c !== targetCurrency);

        if (neededCurrencies.length === 0) {
            setRates({} as Record<CurrencyCode, number>);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const fetchedRates = await fetchExchangeRates(neededCurrencies, targetCurrency);
            setRates(fetchedRates as Record<CurrencyCode, number>);
            setLastUpdate(new Date());
        } catch (err) {
            console.error('Error fetching exchange rates:', err);
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setIsLoading(false);
        }
    }, [currencies, targetCurrency]);

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
                console.warn(`No exchange rate available for ${fromCurrency} -> ${toCurrency}`);
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
