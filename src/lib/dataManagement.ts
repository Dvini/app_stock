import { db, normalizePortfolioType } from '../db/db';
import { reconcileDatabase } from './ledgerStore';
import type { Asset, Transaction, WatchlistItem, Cash, Dividend, PortfolioAccount } from '../types/database';
import { todayLocal } from '../utils/dates';

interface CacheItem {
    key: string;
    data: unknown;
    timestamp: number;
}

export interface ExportDataV3 {
    version: 3;
    timestamp: string;
    exportScope: 'ALL' | 'SINGLE';
    /** Stored cash already includes net dividends (exports made after dividends were credited to cash) */
    cashIncludesDividends?: boolean;
    portfolioInfo?: {
        id?: number;
        name: string;
        type: string;
        currency: string;
        taxRate?: number;
    };
    data: {
        portfolios?: PortfolioAccount[];
        assets: Asset[];
        transactions: Transaction[];
        watchlist?: WatchlistItem[];
        cash?: Cash[];
        dividends?: Dividend[];
        exchangeRates?: CacheItem[];
        priceHistory?: CacheItem[];
        metadata?: {
            lastDividendSync?: string | null;
            lastPriceUpdate?: string | null;
            cacheVersion?: string;
        };
    };
}

interface ImportDataV1 {
    assets: Asset[];
    transactions: Transaction[];
    watchlist?: WatchlistItem[];
    cash?: Cash[];
}

interface ImportDataV2 {
    version: number;
    timestamp: string;
    data: {
        assets: Asset[];
        transactions: Transaction[];
        watchlist?: WatchlistItem[];
        cash?: Cash[];
        dividends?: Dividend[];
        exchangeRates?: CacheItem[];
        priceHistory?: CacheItem[];
        metadata?: {
            lastDividendSync?: string;
            lastPriceUpdate?: string;
            cacheVersion?: string;
        };
    };
}

/**
 * Export data to JSON (all portfolios or single portfolio)
 */
export const exportData = async (portfolioId?: number | 'ALL'): Promise<boolean> => {
    try {
        const isSingle = typeof portfolioId === 'number';
        const allPortfolios = await db.portfolios.toArray();
        const targetPortfolio = isSingle ? allPortfolios.find(p => p.id === portfolioId) : null;

        const rawAssets = await db.assets.toArray();
        const rawTransactions = await db.transactions.toArray();
        const rawWatchlist = await db.watchlist.toArray();
        const rawCash = await db.cash.toArray();
        const rawDividends = await db.dividends.toArray();

        const assets = isSingle ? rawAssets.filter(a => (a.portfolioId ?? 1) === portfolioId) : rawAssets;
        const transactions = isSingle
            ? rawTransactions.filter(t => (t.portfolioId ?? 1) === portfolioId)
            : rawTransactions;
        const watchlist = isSingle ? rawWatchlist.filter(w => (w.portfolioId ?? 1) === portfolioId) : rawWatchlist;
        const cash = isSingle ? rawCash.filter(c => (c.portfolioId ?? 1) === portfolioId) : rawCash;
        const dividends = isSingle ? rawDividends.filter(d => (d.portfolioId ?? 1) === portfolioId) : rawDividends;
        const portfolios = isSingle && targetPortfolio ? [targetPortfolio] : allPortfolios;

        // Extract cache from localStorage
        const exchangeRates: CacheItem[] = [];
        const priceHistory: CacheItem[] = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;

            // Extract NBP exchange rates
            if (key.startsWith('stock_cache_v2_nbp_rate_')) {
                try {
                    const item = localStorage.getItem(key);
                    if (item) {
                        const cached = JSON.parse(item);
                        exchangeRates.push({
                            key: key.replace('stock_cache_v2_', ''),
                            data: cached.value,
                            timestamp: cached.timestamp
                        });
                    }
                } catch {
                    console.warn(`Failed to parse cache key: ${key}`);
                }
            }

            // Extract price/chart cache
            if (
                key.startsWith('stock_cache_v2_price_') ||
                key.startsWith('stock_cache_v2_chart_') ||
                key.startsWith('stock_cache_v2_av_dividends_')
            ) {
                try {
                    const item = localStorage.getItem(key);
                    if (item) {
                        const cached = JSON.parse(item);
                        priceHistory.push({
                            key: key.replace('stock_cache_v2_', ''),
                            data: cached.value,
                            timestamp: cached.timestamp
                        });
                    }
                } catch {
                    console.warn(`Failed to parse cache key: ${key}`);
                }
            }
        }

        const data: ExportDataV3 = {
            version: 3,
            timestamp: new Date().toISOString(),
            cashIncludesDividends: true,
            exportScope: isSingle ? 'SINGLE' : 'ALL',
            portfolioInfo:
                isSingle && targetPortfolio
                    ? {
                          id: targetPortfolio.id,
                          name: targetPortfolio.name,
                          type: targetPortfolio.type,
                          currency: targetPortfolio.currency,
                          taxRate: targetPortfolio.taxRate
                      }
                    : undefined,
            data: {
                portfolios,
                assets,
                transactions,
                watchlist,
                cash,
                dividends,
                exchangeRates,
                priceHistory,
                metadata: {
                    lastDividendSync: localStorage.getItem('dividends_lastSync'),
                    lastPriceUpdate: localStorage.getItem('lastPriceUpdate'),
                    cacheVersion: 'v3'
                }
            }
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const dateStr = todayLocal();
        const safeName =
            isSingle && targetPortfolio
                ? targetPortfolio.name.toLowerCase().replace(/[^a-z0-9]/gi, '_')
                : 'wszystkie_portfele';

        const a = document.createElement('a');
        a.href = url;
        a.download = `stock_backup_${safeName}_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(
            `[Export] v3.0 (${data.exportScope}): ${transactions.length} txs, ${assets.length} assets, ${dividends.length} divs`
        );
        return true;
    } catch (error) {
        console.error('Export failed:', error);
        return false;
    }
};

/**
 * Export transactions to CSV (with Polish Excel friendly formatting)
 */
export const exportTransactionsCSV = async (portfolioId?: number | 'ALL'): Promise<boolean> => {
    try {
        const isSingle = typeof portfolioId === 'number';
        const allPortfolios = await db.portfolios.toArray();
        const portfolioMap = new Map(allPortfolios.map(p => [p.id ?? 1, p]));
        const targetPortfolio = isSingle ? portfolioMap.get(portfolioId) : null;

        const rawTransactions = await db.transactions.toArray();
        const transactions = isSingle
            ? rawTransactions.filter(t => (t.portfolioId ?? 1) === portfolioId)
            : rawTransactions;

        transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const headers = [
            'Data',
            'Portfel',
            'Typ',
            'Ticker',
            'Ilość',
            'Cena',
            'Waluta',
            'Wartość',
            'Kurs NBP',
            'Prowizja',
            'Wartość PLN'
        ];

        const rows = transactions.map(tx => {
            const port = portfolioMap.get(tx.portfolioId ?? 1);
            const totalPLN = tx.total * (tx.exchangeRate || 1);
            return [
                `"${tx.date}"`,
                `"${port?.name || 'Główny'}"`,
                `"${tx.type}"`,
                `"${tx.ticker || ''}"`,
                tx.amount !== undefined ? tx.amount : '',
                tx.price !== undefined ? tx.price : '',
                `"${tx.currency || 'PLN'}"`,
                tx.total,
                tx.exchangeRate || 1,
                tx.commission || 0,
                totalPLN.toFixed(2)
            ].join(';');
        });

        const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const dateStr = todayLocal();
        const safeName =
            isSingle && targetPortfolio
                ? targetPortfolio.name.toLowerCase().replace(/[^a-z0-9]/gi, '_')
                : 'wszystkie_portfele';

        const a = document.createElement('a');
        a.href = url;
        a.download = `transakcje_${safeName}_${dateStr}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return true;
    } catch (error) {
        console.error('CSV Export failed:', error);
        return false;
    }
};

/**
 * Import data from file (v1, v2 or v3)
 */
export const importData = async (file: File): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async e => {
            try {
                const result = e.target?.result;
                if (typeof result !== 'string') {
                    throw new Error('Invalid file content');
                }

                const imported = JSON.parse(result) as ImportDataV1 | ImportDataV2 | ExportDataV3;
                const version = 'version' in imported ? imported.version : 1;

                console.log(`[Import] Detected version: ${version}`);

                if (version === 1) {
                    await importV1(imported as ImportDataV1);
                } else if (version === 2) {
                    await importV2(imported as ImportDataV2);
                } else if (version === 3) {
                    await importV3(imported as ExportDataV3);
                } else {
                    throw new Error(`Unsupported backup version: ${version}`);
                }

                // Holdings and cash are derived from transactions; align imported balances with history
                await reconcileDatabase('import', {
                    storedCashIncludesDividends: (imported as ExportDataV3).cashIncludesDividends === true
                });

                resolve(true);
            } catch (error) {
                console.error('Import failed:', error);
                reject(error);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
};

// Import v1.0 (legacy)
const importV1 = async (data: ImportDataV1): Promise<void> => {
    if (!data.assets || !data.transactions) {
        throw new Error('Invalid v1.0 backup file format');
    }

    const defaultPort = await ensureDefaultPortfolio();

    const assets = data.assets.map(a => ({ ...a, portfolioId: defaultPort }));
    const txs = data.transactions.map(t => ({ ...t, portfolioId: defaultPort }));
    const watch = (data.watchlist || []).map(w => ({ ...w, portfolioId: defaultPort }));
    const cash = (data.cash || []).map(c => ({ ...c, portfolioId: defaultPort }));

    await db.transaction('rw', [db.assets, db.transactions, db.watchlist, db.cash], async () => {
        await db.assets.clear();
        await db.transactions.clear();
        await db.watchlist.clear();
        await db.cash.clear();

        await db.assets.bulkAdd(assets);
        await db.transactions.bulkAdd(txs);
        if (watch.length) await db.watchlist.bulkAdd(watch);
        if (cash.length) await db.cash.bulkAdd(cash);
    });

    console.log('[Import] v1.0 data imported successfully');
};

// Import v2.0 (with dividends and cache)
const importV2 = async (imported: ImportDataV2): Promise<void> => {
    const { data } = imported;

    if (!data || !data.assets || !data.transactions) {
        throw new Error('Invalid v2.0 backup file format');
    }

    const defaultPort = await ensureDefaultPortfolio();

    const assets = data.assets.map(a => ({ ...a, portfolioId: a.portfolioId || defaultPort }));
    const txs = data.transactions.map(t => ({ ...t, portfolioId: t.portfolioId || defaultPort }));
    const watch = (data.watchlist || []).map(w => ({ ...w, portfolioId: w.portfolioId || defaultPort }));
    const cash = (data.cash || []).map(c => ({ ...c, portfolioId: c.portfolioId || defaultPort }));
    const divs = (data.dividends || []).map(d => ({ ...d, portfolioId: d.portfolioId || defaultPort }));

    // Clear and import database tables
    await db.transaction('rw', [db.assets, db.transactions, db.watchlist, db.cash, db.dividends], async () => {
        await db.assets.clear();
        await db.transactions.clear();
        await db.watchlist.clear();
        await db.cash.clear();
        await db.dividends.clear();

        await db.assets.bulkAdd(assets);
        await db.transactions.bulkAdd(txs);
        if (watch.length) await db.watchlist.bulkAdd(watch);
        if (cash.length) await db.cash.bulkAdd(cash);
        if (divs.length) await db.dividends.bulkAdd(divs);
    });

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
    }
};

// Import v3.0 (with multi-portfolio support)
const importV3 = async (imported: ExportDataV3): Promise<void> => {
    const { data, exportScope, portfolioInfo } = imported;

    if (!data) throw new Error('Invalid v3.0 backup format');

    if (exportScope === 'SINGLE' && portfolioInfo) {
        // Import single portfolio as a new portfolio into existing database
        const newPortId = await db.portfolios.add({
            name: `${portfolioInfo.name} (Import)`,
            type: normalizePortfolioType(portfolioInfo.type),
            currency: 'PLN',
            taxRate: portfolioInfo.taxRate ?? 19,
            createdAt: new Date().toISOString()
        });

        const assets = data.assets.map(({ id: _id, ...rest }) => ({ ...rest, portfolioId: Number(newPortId) }));
        const txs = data.transactions.map(({ id: _id, ...rest }) => ({ ...rest, portfolioId: Number(newPortId) }));
        const watch = (data.watchlist || []).map(({ id: _id, ...rest }) => ({
            ...rest,
            portfolioId: Number(newPortId)
        }));
        const cash = (data.cash || []).map(({ id: _id, ...rest }) => ({ ...rest, portfolioId: Number(newPortId) }));
        const divs = (data.dividends || []).map(({ id: _id, ...rest }) => ({
            ...rest,
            portfolioId: Number(newPortId)
        }));

        await db.transaction('rw', [db.assets, db.transactions, db.watchlist, db.cash, db.dividends], async () => {
            if (assets.length) await db.assets.bulkAdd(assets as Asset[]);
            if (txs.length) await db.transactions.bulkAdd(txs as Transaction[]);
            if (watch.length) await db.watchlist.bulkAdd(watch as WatchlistItem[]);
            if (cash.length) await db.cash.bulkAdd(cash as Cash[]);
            if (divs.length) await db.dividends.bulkAdd(divs as Dividend[]);
        });

        console.log(`[Import] Single portfolio "${portfolioInfo.name}" imported as new portfolio #${newPortId}`);
    } else {
        // Full restore (ALL portfolios)
        await db.transaction(
            'rw',
            [db.portfolios, db.assets, db.transactions, db.watchlist, db.cash, db.dividends],
            async () => {
                await db.portfolios.clear();
                await db.assets.clear();
                await db.transactions.clear();
                await db.watchlist.clear();
                await db.cash.clear();
                await db.dividends.clear();

                if (data.portfolios?.length) {
                    await db.portfolios.bulkAdd(
                        data.portfolios.map(p => ({
                            ...p,
                            type: normalizePortfolioType(p.type),
                            currency: 'PLN' as const
                        }))
                    );
                }
                if (data.assets?.length) await db.assets.bulkAdd(data.assets);
                if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions);
                if (data.watchlist?.length) await db.watchlist.bulkAdd(data.watchlist);
                if (data.cash?.length) await db.cash.bulkAdd(data.cash);
                if (data.dividends?.length) await db.dividends.bulkAdd(data.dividends);
            }
        );

        console.log('[Import] All portfolios and data restored successfully');
    }

    // Restore cache
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
    }
};

const ensureDefaultPortfolio = async (): Promise<number> => {
    const p = await db.portfolios.toCollection().first();
    if (p && p.id) return p.id;
    const newId = await db.portfolios.add({
        id: 1,
        name: 'Główny',
        type: 'standard',
        currency: 'PLN',
        taxRate: 19,
        color: '#3b82f6',
        createdAt: new Date().toISOString()
    });
    return Number(newId);
};

export const clearData = async (): Promise<void> => {
    try {
        await db.transaction(
            'rw',
            [db.portfolios, db.assets, db.transactions, db.watchlist, db.cash, db.dividends],
            async () => {
                await db.portfolios.clear();
                await db.assets.clear();
                await db.transactions.clear();
                await db.watchlist.clear();
                await db.cash.clear();
                await db.dividends.clear();
            }
        );

        // Clear local storage cache
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (
                key &&
                (key.startsWith('stock_cache_') ||
                    key.startsWith('dividends_') ||
                    key.startsWith('lastPriceUpdate') ||
                    key === 'stock_tracker_active_portfolio')
            ) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));

        console.log('All data and cache cleared');
    } catch (error) {
        console.error('Clear failed:', error);
        throw error;
    }
};
