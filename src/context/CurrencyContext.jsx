import React, { createContext, useContext, useState, useEffect } from 'react';

const CurrencyContext = createContext(null);

export const CurrencyProvider = ({ children }) => {
    // Default to 'PLN'
    const [baseCurrency, setBaseCurrency] = useState(localStorage.getItem('base_currency') || 'PLN');

    useEffect(() => {
        localStorage.setItem('base_currency', baseCurrency);
    }, [baseCurrency]);

    return (
        <CurrencyContext.Provider value={{ baseCurrency, setBaseCurrency }}>
            {children}
        </CurrencyContext.Provider>
    );
};

export const useCurrency = () => {
    const context = useContext(CurrencyContext);
    if (!context) throw new Error("useCurrency must be used within CurrencyProvider");
    return context;
};
