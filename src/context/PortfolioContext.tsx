import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { PortfolioAccount } from '../types/database';

export type ActivePortfolioId = number | 'ALL';

interface PortfolioContextValue {
    activePortfolioId: ActivePortfolioId;
    isAllPortfolios: boolean;
    currentPortfolio: PortfolioAccount | null;
    portfolios: PortfolioAccount[];
    isLoadingPortfolios: boolean;
    setActivePortfolioId: (id: ActivePortfolioId) => void;
    createPortfolio: (data: Omit<PortfolioAccount, 'id' | 'createdAt'>) => Promise<number>;
    updatePortfolio: (id: number, data: Partial<PortfolioAccount>) => Promise<void>;
    deletePortfolio: (id: number) => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

const EMPTY_PORTFOLIOS: PortfolioAccount[] = [];

interface PortfolioProviderProps {
    children: ReactNode;
}

export const PortfolioProvider: React.FC<PortfolioProviderProps> = ({ children }) => {
    const rawPortfolios = useLiveQuery(() => db.portfolios.toArray());
    const portfolios = rawPortfolios ?? EMPTY_PORTFOLIOS;
    const isLoadingPortfolios = rawPortfolios === undefined;

    const [activePortfolioId, setActivePortfolioIdState] = useState<ActivePortfolioId>(() => {
        const stored = localStorage.getItem('active_portfolio_id');
        if (stored === 'ALL') return 'ALL';
        if (stored) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed)) return parsed;
        }
        return 1; // Default
    });

    // Auto-adjust active portfolio if needed
    useEffect(() => {
        if (isLoadingPortfolios || portfolios.length === 0) return;

        // If only 1 portfolio, never stay on 'ALL' unless user wants, but requirement says:
        // "pierwszy ekran to było podsumowanie wszystkich portfeli gdy isteniej wiecej niż 1 portfel"
        if (activePortfolioId !== 'ALL') {
            const exists = portfolios.some(p => p.id === activePortfolioId);
            if (!exists) {
                // Default to first available or 'ALL' if >1
                if (portfolios.length > 1) {
                    setActivePortfolioIdState('ALL');
                    localStorage.setItem('active_portfolio_id', 'ALL');
                } else if (portfolios[0]?.id) {
                    setActivePortfolioIdState(portfolios[0].id);
                    localStorage.setItem('active_portfolio_id', portfolios[0].id.toString());
                }
            }
        } else if (portfolios.length === 1 && portfolios[0]?.id) {
            // When there's only 1 portfolio, show that portfolio directly
            setActivePortfolioIdState(portfolios[0].id);
            localStorage.setItem('active_portfolio_id', portfolios[0].id.toString());
        }
    }, [portfolios, activePortfolioId, isLoadingPortfolios]);

    const setActivePortfolioId = (id: ActivePortfolioId) => {
        setActivePortfolioIdState(id);
        localStorage.setItem('active_portfolio_id', id.toString());
    };

    const currentPortfolio = useMemo(() => {
        if (activePortfolioId === 'ALL') return null;
        return portfolios.find(p => p.id === activePortfolioId) || portfolios[0] || null;
    }, [portfolios, activePortfolioId]);

    const isAllPortfolios = activePortfolioId === 'ALL';

    const createPortfolio = async (data: Omit<PortfolioAccount, 'id' | 'createdAt'>): Promise<number> => {
        const newId = await db.portfolios.add({
            ...data,
            createdAt: new Date().toISOString()
        });

        // Initialize cash entry for new portfolio
        await db.cash.add({
            portfolioId: Number(newId),
            currency: data.currency || 'PLN',
            amount: 0
        });

        // Switch to the newly created portfolio
        setActivePortfolioId(Number(newId));

        return Number(newId);
    };

    const updatePortfolio = async (id: number, data: Partial<PortfolioAccount>): Promise<void> => {
        await db.portfolios.update(id, data);
    };

    const deletePortfolio = async (id: number): Promise<void> => {
        // Prevent deleting the last remaining portfolio
        if (portfolios.length <= 1) {
            throw new Error('Nie można usunąć jedynego portfela.');
        }

        await db.transaction(
            'rw',
            [db.portfolios, db.assets, db.transactions, db.cash, db.dividends, db.watchlist],
            async () => {
                await db.portfolios.delete(id);
                await db.assets.where('portfolioId').equals(id).delete();
                await db.transactions.where('portfolioId').equals(id).delete();
                await db.cash.where('portfolioId').equals(id).delete();
                await db.dividends.where('portfolioId').equals(id).delete();
                await db.watchlist.where('portfolioId').equals(id).delete();
            }
        );

        // If currently on the deleted portfolio, switch to 'ALL' or remaining
        const remaining = portfolios.filter(p => p.id !== id);
        if (activePortfolioId === id) {
            if (remaining.length > 1) {
                setActivePortfolioId('ALL');
            } else if (remaining[0]?.id) {
                setActivePortfolioId(remaining[0].id);
            }
        }
    };

    return (
        <PortfolioContext.Provider
            value={{
                activePortfolioId,
                isAllPortfolios,
                currentPortfolio,
                portfolios,
                isLoadingPortfolios,
                setActivePortfolioId,
                createPortfolio,
                updatePortfolio,
                deletePortfolio
            }}
        >
            {children}
        </PortfolioContext.Provider>
    );
};

export const usePortfolioAccount = (): PortfolioContextValue => {
    const context = useContext(PortfolioContext);
    if (!context) throw new Error('usePortfolioAccount must be used within PortfolioProvider');
    return context;
};
