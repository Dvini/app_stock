import { db } from '../db/db';

export const exportData = async () => {
    try {
        const assets = await db.assets.toArray();
        const transactions = await db.transactions.toArray();
        const watchlist = await db.watchlist.toArray();
        const cash = await db.cash.toArray();
        const dividends = await db.dividends.toArray(); // NEW

        // Extract cache from localStorage
        const exchangeRates = [];
        const priceHistory = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;

            // Extract NBP exchange rates
            if (key.startsWith('stock_cache_v2_nbp_rate_')) {
                try {
                    const cached = JSON.parse(localStorage.getItem(key));
                    exchangeRates.push({
                        key: key.replace('stock_cache_v2_', ''),
                        data: cached.value,
                        timestamp: cached.timestamp
                    });
                } catch (e) {
                    console.warn(`Failed to parse cache key: ${key}`);
                }
            }

            // Extract price/chart cache
            if (key.startsWith('stock_cache_v2_price_') ||
                key.startsWith('stock_cache_v2_chart_') ||
                key.startsWith('stock_cache_v2_av_dividends_')) {
                try {
                    const cached = JSON.parse(localStorage.getItem(key));
                    priceHistory.push({
                        key: key.replace('stock_cache_v2_', ''),
                        data: cached.value,
                        timestamp: cached.timestamp
                    });
                } catch (e) {
                    console.warn(`Failed to parse cache key: ${key}`);
                }
            }
        }

        const data = {
            version: 2, // UPGRADED to v2
            timestamp: new Date().toISOString(),
            data: {
                assets,
                transactions,
                watchlist,
                cash,
                dividends, // NEW
                exchangeRates, // NEW
                priceHistory, // NEW
                metadata: { // NEW
                    lastDividendSync: localStorage.getItem('dividends_lastSync'),
                    lastPriceUpdate: localStorage.getItem('lastPriceUpdate'),
                    cacheVersion: 'v2'
                }
            }
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `portfolio_backup_v2_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`[Export] v2.0 exported: ${dividends.length} dividends, ${exchangeRates.length} rates, ${priceHistory.length} cache items`);
        return true;
    } catch (error) {
        console.error("Export failed:", error);
        return false;
    }
};

export const importData = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                const version = imported.version || 1;

                console.log(`[Import] Detected version: ${version}`);

                if (version === 1) {
                    // Legacy v1.0 format
                    await importV1(imported);
                } else if (version === 2) {
                    // New v2.0 format
                    await importV2(imported);
                } else {
                    throw new Error(`Unsupported backup version: ${version}`);
                }

                resolve(true);
            } catch (error) {
                console.error("Import failed:", error);
                reject(error);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
};

// Import v1.0 (legacy)
const importV1 = async (data) => {
    if (!data.assets || !data.transactions) {
        throw new Error("Invalid v1.0 backup file format");
    }

    await db.transaction('rw', db.assets, db.transactions, db.watchlist, db.cash, async () => {
        await db.assets.clear();
        await db.transactions.clear();
        await db.watchlist.clear();
        await db.cash.clear();

        await db.assets.bulkAdd(data.assets);
        await db.transactions.bulkAdd(data.transactions);
        if (data.watchlist) await db.watchlist.bulkAdd(data.watchlist);
        if (data.cash) await db.cash.bulkAdd(data.cash);
    });

    console.log('[Import] v1.0 data imported successfully');
};

// Import v2.0 (with dividends and cache)
const importV2 = async (imported) => {
    const { data } = imported;

    if (!data || !data.assets || !data.transactions) {
        throw new Error("Invalid v2.0 backup file format");
    }

    // Clear and import database tables
    await db.transaction('rw',
        [db.assets, db.transactions, db.watchlist, db.cash, db.dividends],
        async () => {
            await db.assets.clear();
            await db.transactions.clear();
            await db.watchlist.clear();
            await db.cash.clear();
            await db.dividends.clear();

            await db.assets.bulkAdd(data.assets);
            await db.transactions.bulkAdd(data.transactions);
            if (data.watchlist) await db.watchlist.bulkAdd(data.watchlist);
            if (data.cash) await db.cash.bulkAdd(data.cash);
            if (data.dividends) await db.dividends.bulkAdd(data.dividends);
        }
    );

    // Restore cache from backup
    if (data.exchangeRates) {
        data.exchangeRates.forEach(item => {
            localStorage.setItem(
                `stock_cache_v2_${item.key}`,
                JSON.stringify({
                    value: item.data,
                    timestamp: item.timestamp
                })
            );
        });
        console.log(`[Import] Restored ${data.exchangeRates.length} exchange rate cache items`);
    }

    if (data.priceHistory) {
        data.priceHistory.forEach(item => {
            localStorage.setItem(
                `stock_cache_v2_${item.key}`,
                JSON.stringify({
                    value: item.data,
                    timestamp: item.timestamp
                })
            );
        });
        console.log(`[Import] Restored ${data.priceHistory.length} price/chart cache items`);
    }

    // Restore metadata
    if (data.metadata) {
        if (data.metadata.lastDividendSync) {
            localStorage.setItem('dividends_lastSync', data.metadata.lastDividendSync);
        }
        if (data.metadata.lastPriceUpdate) {
            localStorage.setItem('lastPriceUpdate', data.metadata.lastPriceUpdate);
        }
    }

    console.log('[Import] v2.0 data imported successfully');
};

export const clearData = async () => {
    try {
        await db.transaction('rw',
            [db.assets, db.transactions, db.watchlist, db.cash, db.dividends],
            async () => {
                await db.assets.clear();
                await db.transactions.clear();
                await db.watchlist.clear();
                await db.cash.clear();
                await db.dividends.clear(); // ADDED
            }
        );
        console.log('[ClearData] All data cleared including dividends');
        return true;
    } catch (error) {
        console.error("Clear failed:", error);
        return false;
    }
};
