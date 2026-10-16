/**
 * useDividends Hook
 * Manages dividend data, calculations, and statistics
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { dividendService } from '../lib/DividendService';
import { DIVIDEND_CONSTANTS } from '../utils/constants';
import { usePortfolioAccount } from '../context/PortfolioContext';
import type { Dividend, Asset } from '../types/database';
import { toLocalISODate, todayLocal } from '../utils/dates';

interface DividendStats {
    ytdTotal: number;
    upcoming60Days: number;
    yieldOnCost: number;
    monthlyAverage: number;
}

interface UseDividendsReturn {
    ytdTotal: number;
    upcoming60Days: number;
    yieldOnCost: number;
    monthlyAverage: number;
    calendar: Dividend[];
    received: Dividend[];
    addDividend: (dividendData: Partial<Dividend>) => Promise<void>;
    deleteDividend: (id: number) => Promise<void>;
    syncDividendsManually: () => Promise<{ added: number; skipped: number }>;
    isLoading: boolean;
    error: string | null;
}

const EMPTY_DIVIDENDS: Dividend[] = [];
const EMPTY_ASSETS_LIST: Asset[] = [];

export const useDividends = (overridePortfolioId?: number | 'ALL'): UseDividendsReturn => {
    const { activePortfolioId } = usePortfolioAccount();
    const effectivePortfolioId = overridePortfolioId !== undefined ? overridePortfolioId : activePortfolioId;
    const isAll = effectivePortfolioId === 'ALL';

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Live queries from database
    const rawDividends = useLiveQuery(() => db.dividends.toArray()) ?? EMPTY_DIVIDENDS;
    const rawAssets = useLiveQuery(() => db.assets.toArray()) ?? EMPTY_ASSETS_LIST;

    const dividends = useMemo(() => {
        return rawDividends.filter(d => isAll || (d.portfolioId ?? 1) === effectivePortfolioId);
    }, [rawDividends, effectivePortfolioId, isAll]);

    const assets = useMemo(() => {
        return rawAssets.filter(a => isAll || (a.portfolioId ?? 1) === effectivePortfolioId);
    }, [rawAssets, effectivePortfolioId, isAll]);

    // Statistics state
    const [stats, setStats] = useState<DividendStats>({
        ytdTotal: 0,
        upcoming60Days: 0,
        yieldOnCost: 0,
        monthlyAverage: 0
    });

    // Run migration once on mount to fix existing dividend statuses
    useEffect(() => {
        const runMigration = async () => {
            const migrationKey = 'dividends_statusMigration_v1';
            const hasRun = localStorage.getItem(migrationKey);

            if (!hasRun) {
                try {
                    console.log('[useDividends] Running one-time dividend status migration...');
                    const result = await dividendService.migrateDividendStatus();
                    console.log(
                        `[useDividends] Migration complete: ${result.updated} updated, ${result.skipped} skipped`
                    );
                    localStorage.setItem(migrationKey, 'true');
                } catch (error) {
                    console.error('[useDividends] Migration failed:', error);
                }
            }

            // Always ensure legacy dividends have portfolioId assigned
            try {
                await dividendService.migrateDividendPortfolios();
            } catch (error) {
                console.error('[useDividends] Portfolio migration failed:', error);
            }
        };

        runMigration();
    }, []); // Run once on mount

    // Calculate statistics with smart auto-sync
    useEffect(() => {
        const calculateStats = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // Smart sync logic: sync if table is empty OR >24h since last sync
                const lastSync = localStorage.getItem('dividends_lastSync');
                const now = Date.now();
                const dayInMs = DIVIDEND_CONSTANTS.DAILY_SYNC_INTERVAL_MS;

                const shouldSync = !lastSync || now - parseInt(lastSync) > dayInMs;

                // Initial sync if dividends table is empty
                if (dividends.length === 0 && assets.length > 0) {
                    console.log('[useDividends] Empty dividends table, triggering initial sync...');
                    try {
                        const result = await dividendService.syncDividendsFromAPI(effectivePortfolioId);
                        console.log(`[useDividends] Initial sync complete: ${result.added} dividends added`);
                        localStorage.setItem('dividends_lastSync', now.toString());
                    } catch (syncError) {
                        console.error('[useDividends] Initial sync failed:', syncError);
                    }
                } else if (shouldSync) {
                    // Periodic sync if >24h since last sync
                    console.log('[useDividends] 24h sync interval passed, triggering auto-sync...');
                    try {
                        const result = await dividendService.syncDividendsFromAPI();
                        console.log(
                            `[useDividends] Auto-sync complete: ${result.added} added, ${result.skipped} skipped`
                        );
                        localStorage.setItem('dividends_lastSync', now.toString());
                    } catch (syncError) {
                        console.error('[useDividends] Auto-sync failed:', syncError);
                    }
                }

                const [ytdTotal, yoc, monthlyAverage] = await Promise.all([
                    dividendService.calculateYTDTotal(effectivePortfolioId),
                    dividendService.calculateYieldOnCost(effectivePortfolioId),
                    dividendService.calculateMonthlyAverage(effectivePortfolioId)
                ]);

                // Calculate upcoming dividends
                const upcomingDividends = await dividendService.calculateUpcomingDividends(
                    assets,
                    effectivePortfolioId
                );
                const upcoming60Days = upcomingDividends.reduce((sum: number, d) => sum + (d.estimatedPLN || 0), 0);

                setStats({
                    ytdTotal,
                    upcoming60Days,
                    yieldOnCost: yoc,
                    monthlyAverage
                });
            } catch (err) {
                console.error('[useDividends] Error calculating stats:', err);
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setIsLoading(false);
            }
        };

        calculateStats();
    }, [effectivePortfolioId, dividends, assets.length]); // Recalculate when effectivePortfolioId, dividends, or assets change

    // Processed received dividends - filtered by portfolio
    const rawReceived =
        useLiveQuery(
            () =>
                db.dividends
                    .where('status')
                    .equals('received')
                    .and(d => (d.sharesOwned || 0) > 0)
                    .reverse()
                    .sortBy('paymentDate'),
            []
        ) ?? EMPTY_DIVIDENDS;

    const received = useMemo(() => {
        return rawReceived.filter(d => isAll || (d.portfolioId ?? 1) === effectivePortfolioId);
    }, [rawReceived, effectivePortfolioId, isAll]);

    // Processed calendar (upcoming dividends) - filtered by portfolio
    const rawCalendar =
        useLiveQuery(() => {
            const today = todayLocal();
            const sixtyDaysLater = toLocalISODate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));

            return db.dividends
                .where('status')
                .equals('expected')
                .and(d => d.paymentDate >= today && d.paymentDate <= sixtyDaysLater)
                .sortBy('paymentDate');
        }, []) ?? EMPTY_DIVIDENDS;

    const calendar = useMemo(() => {
        return rawCalendar.filter(d => isAll || (d.portfolioId ?? 1) === effectivePortfolioId);
    }, [rawCalendar, effectivePortfolioId, isAll]);

    /**
     * Add a new dividend
     */
    const addDividend = useCallback(
        async (dividendData: Partial<Dividend>) => {
            try {
                // Validate required fields
                if (
                    !dividendData.ticker ||
                    !dividendData.recordDate ||
                    !dividendData.paymentDate ||
                    !dividendData.amountPerShare
                ) {
                    throw new Error('Missing required fields');
                }

                const targetPortfolioId = effectivePortfolioId === 'ALL' ? 1 : effectivePortfolioId;

                // Add to database
                await db.dividends.add({
                    portfolioId: targetPortfolioId,
                    ticker: dividendData.ticker.toUpperCase(),
                    recordDate: dividendData.recordDate,
                    paymentDate: dividendData.paymentDate,
                    amountPerShare: dividendData.amountPerShare,
                    currency: dividendData.currency || 'PLN',
                    status: dividendData.status || 'upcoming',
                    sharesOwned: dividendData.sharesOwned,
                    totalAmount: dividendData.totalAmount,
                    exchangeRate: dividendData.exchangeRate,
                    valuePLN: dividendData.valuePLN
                });
            } catch (err) {
                console.error('[useDividends] Error adding dividend:', err);
                throw err;
            }
        },
        [effectivePortfolioId]
    );

    /**
     * Delete a dividend
     */
    const deleteDividend = useCallback(async (id: number) => {
        try {
            await dividendService.deleteDividend(id);
        } catch (err) {
            console.error('[useDividends] Error deleting dividend:', err);
            throw err;
        }
    }, []);

    /**
     * Manually trigger dividend sync (for refresh button)
     */
    const syncDividendsManually = useCallback(async () => {
        try {
            setIsLoading(true);
            const result = await dividendService.syncDividendsFromAPI(effectivePortfolioId);
            const now = Date.now();
            localStorage.setItem('dividends_lastSync', now.toString());
            console.log(`[useDividends] Manual sync complete: ${result.added} added, ${result.skipped} skipped`);

            // Recalculate stats immediately after sync (prevents double loading state)
            const [ytdTotal, yoc, monthlyAverage] = await Promise.all([
                dividendService.calculateYTDTotal(effectivePortfolioId),
                dividendService.calculateYieldOnCost(effectivePortfolioId),
                dividendService.calculateMonthlyAverage(effectivePortfolioId)
            ]);

            const upcomingDividends = await dividendService.calculateUpcomingDividends(assets, effectivePortfolioId);
            const upcoming60Days = upcomingDividends.reduce((sum: number, d) => sum + (d.estimatedPLN || 0), 0);

            setStats({
                ytdTotal,
                upcoming60Days,
                yieldOnCost: yoc,
                monthlyAverage
            });

            return result;
        } catch (err) {
            console.error('[useDividends] Manual sync failed:', err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [assets, effectivePortfolioId]);

    return {
        // Statistics
        ytdTotal: stats.ytdTotal,
        upcoming60Days: stats.upcoming60Days,
        yieldOnCost: stats.yieldOnCost,
        monthlyAverage: stats.monthlyAverage,

        // Tables
        calendar,
        received,

        // Actions
        addDividend,
        deleteDividend,
        syncDividendsManually,

        // Status
        isLoading,
        error
    };
};

export default useDividends;
