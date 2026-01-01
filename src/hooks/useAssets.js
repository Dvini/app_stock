/**
 * Hook for managing user assets from database
 * Fetches and processes assets, filtering out sold positions
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useMemo } from 'react';

/**
 * Custom hook to get user's assets from database
 * @returns {Object} Assets data and utilities
 */
export const useAssets = () => {
    // Fetch all assets from database
    const allAssets = useLiveQuery(() => db.assets.toArray()) || [];

    // Filter and process assets
    const assets = useMemo(() => {
        return allAssets.filter(asset => {
            // Filter out sold assets (with epsilon for float errors)
            return asset.amount > 0.000001;
        });
    }, [allAssets]);

    // Group assets by ticker (in case of multiple purchases)
    const assetsByTicker = useMemo(() => {
        const grouped = {};

        assets.forEach(asset => {
            if (!grouped[asset.ticker]) {
                grouped[asset.ticker] = [];
            }
            grouped[asset.ticker].push(asset);
        });

        return grouped;
    }, [assets]);

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
        assetsByTicker,
        tickers,
        currencies,
        hasAssets: assets.length > 0,
        assetCount: assets.length
    };
};

export default useAssets;
