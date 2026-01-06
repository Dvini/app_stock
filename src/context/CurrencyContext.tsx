import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { CurrencyContextValue } from '../types/context';
import type { CurrencyCode } from '../types/database';

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

interface CurrencyProviderProps {
    children: ReactNode;
}

export const CurrencyProvider: React.FC<CurrencyProviderProps> = ({ children }) => {
    // Default to 'PLN'
    const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>(() => {
        const stored = localStorage.getItem('base_currency');
        return (stored as CurrencyCode) || 'PLN';
    });

    const supportedCurrencies: CurrencyCode[] = ['PLN', 'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CNY'];

    useEffect(() => {
        localStorage.setItem('base_currency', baseCurrency);
    }, [baseCurrency]);

    return (
        <CurrencyContext.Provider value={{ baseCurrency, setBaseCurrency, supportedCurrencies }}>
            {children}
        </CurrencyContext.Provider>
    );
};

export const useCurrency = (): CurrencyContextValue => {
    const context = useContext(CurrencyContext);
    if (!context) throw new Error('useCurrency must be used within CurrencyProvider');
    return context;
};
