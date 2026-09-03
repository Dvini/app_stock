/**
 * Hook for managing user assets from database
 * Fetches and processes assets, filtering out sold positions
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useMemo } from 'react';
import { usePortfolioAccount } from '../context/PortfolioContext';
import type { UseAssetsReturn } from '../types/hooks';
import type { Asset, CurrencyCode } from '../types/database';

const EMPTY_ASSETS: Asset[] = [];
const EMPTY_STRINGS: string[] = [];
const EMPTY_CURRENCIES: CurrencyCode[] = [];

/**
 * Custom hook to get user's assets from database
 */
export const useAssets = (overridePortfolioId?: number | 'ALL'): UseAssetsReturn => {
    const { activePortfolioId } = usePortfolioAccount();
    const targetPortfolioId = overridePortfolioId !== undefined ? overridePortfolioId : activePortfolioId;

    // Fetch all assets from database
    const allAssets = useLiveQuery(() => db.assets.toArray()) ?? EMPTY_ASSETS;

    // Filter and process assets
    const assets: Asset[] = useMemo(() => {
        if (allAssets.length === 0) return EMPTY_ASSETS;
        return allAssets.filter(asset => {
            const matchesPortfolio = targetPortfolioId === 'ALL' || (asset.portfolioId ?? 1) === targetPortfolioId;
            return matchesPortfolio && asset.amount > 0.000001;
        });
    }, [allAssets, targetPortfolioId]);

    // Get unique tickers
    const tickers = useMemo(() => {
        if (assets.length === 0) return EMPTY_STRINGS;
        return [...new Set(assets.map(a => a.ticker))];
    }, [assets]);

    // Get unique currencies used in assets
    const currencies = useMemo(() => {
        if (assets.length === 0) return EMPTY_CURRENCIES;
        return [...new Set(assets.map(a => a.currency || 'PLN'))] as CurrencyCode[];
    }, [assets]);

    return {
        assets,
        tickers,
        currencies
    };
};

export default useAssets;
