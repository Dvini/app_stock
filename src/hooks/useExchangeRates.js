/**
 * Hook for fetching and managing exchange rates
 * Handles currency conversion with caching
 */

import { useState, useEffect } from 'react';
import { fetchExchangeRates } from '../lib/api';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Custom hook to fetch and manage exchange rates
 * @param {string[]} currencies - Array of currency codes to fetch rates for
 * @param {Object} options - Configuration options
 * @returns {Object} Exchange rates and utilities
 */
export const useExchangeRates = (currencies = [], options = {}) => {
    const { baseCurrency: defaultBaseCurrency } = useCurrency();
    const {
        targetCurrency = defaultBaseCurrency,
        refreshInterval = 15 * 60 * 1000, // 15 minutes
        autoRefresh = true
    } = options;

    const [rates, setRates] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [error, setError] = useState(null);

    // Fetch exchange rates
    const fetchRates = async () => {
        // Filter out target currency (no need to fetch rate for same currency)
        const neededCurrencies = currencies.filter(c => c && c !== targetCurrency);

        if (neededCurrencies.length === 0) {
            setRates({});
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const fetchedRates = await fetchExchangeRates(neededCurrencies, targetCurrency);
            setRates(fetchedRates);
            setLastUpdate(new Date());
        } catch (err) {
            console.error('Error fetching exchange rates:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Initial fetch and auto-refresh
    useEffect(() => {
        fetchRates();

        if (autoRefresh && refreshInterval > 0) {
            const interval = setInterval(fetchRates, refreshInterval);
            return () => clearInterval(interval);
        }
    }, [currencies.join(','), targetCurrency, refreshInterval, autoRefresh]);

    // Get rate for specific currency
    const getRate = (currency) => {
        if (currency === targetCurrency) return 1;
        return rates[currency] || null;
    };

    // Convert amount from one currency to target
    const convert = (amount, fromCurrency) => {
        if (fromCurrency === targetCurrency) return amount;

        const rate = rates[fromCurrency];
        if (!rate) {
            console.warn(`No exchange rate available for ${fromCurrency} -> ${targetCurrency}`);
            return amount; // Return original if no rate
        }

        return amount * rate;
    };

    // Check if rate is available
    const hasRate = (currency) => {
        if (currency === targetCurrency) return true;
        return !!rates[currency];
    };

    // Manual refresh
    const refresh = () => {
        return fetchRates();
    };

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
