/**
 * Hook for managing user assets from database
 * Fetches and processes assets, filtering out sold positions
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useMemo } from 'react';
import type { UseAssetsReturn } from '../types/hooks';
import type { Asset } from '../types/database';

/**
 * Custom hook to get user's assets from database
 */
export const useAssets = (): UseAssetsReturn => {
    // Fetch all assets from database
    const allAssets = useLiveQuery(() => db.assets.toArray()) || [];

    // Filter and process assets
    const assets: Asset[] = useMemo(() => {
        return allAssets.filter(asset => {
            // Filter out sold assets (with epsilon for float errors)
            return asset.amount > 0.000001;
        });
    }, [allAssets]);

    // Get unique tickers
    const tickers = useMemo(() => {
        return [...new Set(assets.map(a => a.ticker))];
    }, [assets]);

    // Get unique currencies used in assets
    const currencies = useMemo(() => {
        return [...new Set(assets.map(a => a.currency || 'PLN'))];
    }, [assets]);

    return {
        assets,
        tickers,
        currencies
    };
};

export default useAssets;
