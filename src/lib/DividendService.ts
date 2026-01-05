import { db } from '../db/db';
import { nbpService } from './NBPService';
import { alphaVantageService } from './AlphaVantageService';
import { stooqService } from './StooqService';
import { apiService } from './ApiService';
import { TIME_CONSTANTS } from '../utils/constants';
import type { Transaction, Dividend, Asset, CurrencyCode } from '../types/database';

interface ProcessedDividend extends Dividend {
    sharesOwned: number;
    totalAmount: number;
    exchangeRate: number;
    valuePLN: number;
}

interface UpcomingDividend extends Dividend {
    sharesOwned: number;
    estimatedTotal: number;
    estimatedPLN: number;
}

interface DividendData {
    ticker: string;
    recordDate: string;
    paymentDate: string;
    amountPerShare: number;
    currency?: string;
    status?: 'upcoming' | 'paid' | 'expected' | 'received';
}

interface SyncStatistics {
    added: number;
    skipped: number;
}

/**
 * Dividend Service
 * Handles dividend calculations, calendar, and historical tracking
 */
class DividendService {
    /**
     * Calculate received dividends based on transaction history
     * Analyzes buy/sell transactions to determine share ownership on record dates
     */
    async calculateReceivedDividends(): Promise<ProcessedDividend[]> {
        try {
            // Get all dividends from database
            const dividends = await db.dividends.toArray();

            // Get all transactions to calculate share ownership on record dates
            const transactions = await db.transactions
                .orderBy('date')
                .toArray();

            // Process each dividend to ensure accurate share counts
            const processed = await Promise.all(
                dividends.map(async (dividend) => {
                    // Calculate shares owned on record date
                    const sharesOnRecordDate = this._calculateSharesOnDate(
                        transactions,
                        dividend.ticker,
                        dividend.recordDate
                    );

                    // Get NBP rate for the payment date (previous day)
                    let exchangeRate = dividend.exchangeRate;
                    if (!exchangeRate && dividend.currency !== 'PLN') {
                        const prevDate = this._getPreviousDay(dividend.paymentDate);
                        const rateData = await nbpService.getHistoricalRate(dividend.currency || 'USD', prevDate);
                        exchangeRate = rateData?.rate || 1.0;
                    }

                    // Calculate values
                    const totalAmount = sharesOnRecordDate * dividend.amountPerShare;
                    const valuePLN = totalAmount * (exchangeRate || 1.0);

                    return {
                        ...dividend,
                        sharesOwned: sharesOnRecordDate,
                        totalAmount,
                        exchangeRate: exchangeRate || 1.0,
                        valuePLN
                    };
                })
            );

            return processed.filter(d => d.sharesOwned > 0);
        } catch (error) {
            console.error('[DividendService] Failed to calculate received dividends:', error);
            return [];
        }
    }

    /**
     * Calculate shares owned on a specific date based on transaction history
     */
    private _calculateSharesOnDate(transactions: Transaction[], ticker: string, date: string): number {
        let shares = 0;
        const recordDate = new Date(date);

        for (const tx of transactions) {
            if (tx.ticker !== ticker) continue;
            
            // Compare dates properly (not as strings)
            const txDate = new Date(tx.date);
            if (txDate > recordDate) break; // Stop if transaction is after record date

            if (tx.type === 'buy' || tx.type === 'Kupno') {
                shares += tx.amount;
            } else if (tx.type === 'sell' || tx.type === 'Sprzedaż') {
                shares -= tx.amount;
            }
        }

        return shares;
    }

    /**
     * Get previous day (for finding NBP rate)
     */
    private _getPreviousDay(dateStr: string): string {
        const date = new Date(dateStr);
        date.setDate(date.getDate() - 1);
        return date.toISOString().split('T')[0]!;
    }

    /**
     * Calculate upcoming dividends for next 60 days
     */
    async calculateUpcomingDividends(assets: Asset[]): Promise<UpcomingDividend[]> {
        try {
            const today = new Date();
            const sixtyDaysLater = new Date(today.getTime() + TIME_CONSTANTS.SIXTY_DAYS_MS);

            // Get all expected dividends from database within 60 days
            const upcomingDividends = await db.dividends
                .where('paymentDate')
                .between(
                    today.toISOString().split('T')[0]!,
                    sixtyDaysLater.toISOString().split('T')[0]!,
                    true,
                    true
                )
                .and(d => d.status === 'expected')
                .toArray();

            // Calculate estimated amounts based on current holdings
            const processed: UpcomingDividend[] = upcomingDividends.map(dividend => {
                const asset = assets.find(a => a.ticker === dividend.ticker);
                const sharesOwned = asset?.amount || 0;
                const estimatedTotal = sharesOwned * dividend.amountPerShare;

                // Use current exchange rate for estimation
                const estimatedPLN = estimatedTotal * (dividend.exchangeRate || 1.0);

                return {
                    ...dividend,
                    sharesOwned,
                    estimatedTotal,
                    estimatedPLN,
                    totalAmount: estimatedTotal,
                    valuePLN: estimatedPLN
                };
            });

            return processed.filter(d => d.sharesOwned > 0);
        } catch (error) {
            console.error('[DividendService] Failed to calculate upcoming dividends:', error);
            return [];
        }
    }

    /**
     * Fetch dividend calendar from Yahoo Finance API
     * Note: Yahoo Finance doesn't have a dedicated dividend endpoint
     * This is a placeholder - real implementation may require different approach
     */
    async fetchDividendCalendar(ticker: string): Promise<object | null> {
        try {
            // Yahoo Finance doesn't have reliable dividend data via their chart API
            // This would require scraping or alternative API
            // For now, return null - dividends should be added manually
            console.warn('[DividendService] fetchDividendCalendar not fully implemented - use manual entry');
            return null;
        } catch (error) {
            console.error(`[DividendService] Failed to fetch dividend calendar for ${ticker}:`, error);
            return null;
        }
    }

    /**
     * Add dividend manually to database
     */
    async addDividend(dividendData: DividendData): Promise<number> {
        try {
            const {
                ticker,
                recordDate,
                paymentDate,
                amountPerShare,
                currency = 'USD',
                status = 'received'
            } = dividendData;

            // Validate required fields
            if (!ticker || !recordDate || !paymentDate || !amountPerShare) {
                throw new Error('Missing required dividend fields');
            }

            // Get NBP rate for payment date (previous day)
            let exchangeRate = 1.0;
            if (currency !== 'PLN') {
                const prevDate = this._getPreviousDay(paymentDate);
                const rateData = await nbpService.getHistoricalRate(currency, prevDate);
                exchangeRate = rateData?.rate || 1.0;
            }

            // Calculate shares owned on record date
            const transactions = await db.transactions.orderBy('date').toArray();
            const sharesOwned = this._calculateSharesOnDate(transactions, ticker, recordDate);

            // Calculate values
            const totalAmount = sharesOwned * amountPerShare;
            const valuePLN = totalAmount * exchangeRate;

            // Add to database
            const id = await db.dividends.add({
                ticker,
                recordDate,
                paymentDate,
                amountPerShare,
                totalAmount,
                currency: currency as CurrencyCode,
                exchangeRate,
                valuePLN,
                sharesOwned,
                status
            });

            console.log(`[DividendService] Added dividend for ${ticker}: ${amountPerShare} ${currency} (ID: ${id})`);
            return id;

        } catch (error) {
            console.error('[DividendService] Failed to add dividend:', error);
            throw error;
        }
    }

    /**
     * Calculate Yield on Cost (YoC)
     * Returns dividend yield based on original purchase cost
     */
    async calculateYieldOnCost(): Promise<number> {
        try {
            // Get all buy transactions
            const buyTransactions = await db.transactions
                .where('type')
                .equals('Kupno')
                .toArray();

            // Calculate total cost basis (in PLN)
            let totalCostPLN = 0;
            for (const tx of buyTransactions) {
                const costInOriginalCurrency = tx.amount * (tx.price || 0);
                const exchangeRate = tx.exchangeRate || 1.0;
                totalCostPLN += costInOriginalCurrency * exchangeRate;
            }

            if (totalCostPLN === 0) {
                return 0;
            }

            // Get annual dividends (last 12 months)
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0]!;

            const recentDividends = await db.dividends
                .where('paymentDate')
                .aboveOrEqual(oneYearAgoStr)
                .and(d => d.status === 'received')
                .toArray();

            const annualDividendsPLN = recentDividends.reduce((sum, d) => sum + (d.valuePLN || 0), 0);

            // YoC = (Annual Dividends / Total Cost) * 100
            const yoc = (annualDividendsPLN / totalCostPLN) * 100;

            return yoc;

        } catch (error) {
            console.error('[DividendService] Failed to calculate YoC:', error);
            return 0;
        }
    }

    /**
     * Calculate monthly average dividends (last 12 months)
     */
    async calculateMonthlyAverage(): Promise<number> {
        try {
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0]!;

            const recentDividends = await db.dividends
                .where('paymentDate')
                .aboveOrEqual(oneYearAgoStr)
                .and(d => d.status === 'received')
                .toArray();

            const totalPLN = recentDividends.reduce((sum, d) => sum + (d.valuePLN || 0), 0);
            const monthlyAverage = totalPLN / TIME_CONSTANTS.MONTHS_PER_YEAR;

            return monthlyAverage;

        } catch (error) {
            console.error('[DividendService] Failed to calculate monthly average:', error);
            return 0;
        }
    }

    /**
     * Calculate YTD (Year-to-Date) total dividends in PLN
     */
    async calculateYTDTotal(): Promise<number> {
        try {
            const currentYear = new Date().getFullYear();
            const yearStart = `${currentYear}-01-01`;

            const ytdDividends = await db.dividends
                .where('paymentDate')
                .aboveOrEqual(yearStart)
                .and(d => d.status === 'received')
                .toArray();

            const totalPLN = ytdDividends.reduce((sum, d) => sum + (d.valuePLN || 0), 0);

            return totalPLN;

        } catch (error) {
            console.error('[DividendService] Failed to calculate YTD total:', error);
            return 0;
        }
    }

    /**
     * Synchronize dividends from multiple sources with fallback mechanism
     * Priority: Alpha Vantage → Yahoo Finance → Stooq (for Polish stocks)
     */
    async syncDividendsFromAPI(): Promise<SyncStatistics> {
        try {
            console.log('[DividendService] Starting dividend synchronization with multi-source fallback...');

            // Get all unique tickers from transactions
            const transactions = await db.transactions.orderBy('date').toArray(); // CRITICAL: Sort chronologically
            const tickers = [...new Set(transactions.map(tx => tx.ticker).filter((t): t is string => t !== undefined))];

            if (tickers.length === 0) {
                console.log('[DividendService] No tickers found in transactions');
                return { added: 0, skipped: 0 };
            }

            console.log(`[DividendService] Found ${tickers.length} unique tickers:`, tickers);

            let added = 0;
            let skipped = 0;

            // Process each ticker with fallback logic
            for (const ticker of tickers) {
                console.log(`\n[DividendService] Processing ticker: ${ticker}`);
                
                let dividends: Array<{ exDate: string; amount: number; currency: string }> = [];
                let source = '';

                // 1. Try Alpha Vantage first
                console.log(`[DividendService] Trying Alpha Vantage for ${ticker}...`);
                dividends = await alphaVantageService.fetchDividends(ticker);
                if (dividends.length > 0) {
                    source = 'Alpha Vantage';
                    console.log(`[DividendService] ✓ Found ${dividends.length} dividends from Alpha Vantage`);
                }

                // 2. Fallback to Yahoo Finance if Alpha Vantage returns empty
                if (dividends.length === 0) {
                    console.log(`[DividendService] Alpha Vantage returned no data, trying Yahoo Finance for ${ticker}...`);
                    dividends = await apiService.fetchDividends(ticker);
                    if (dividends.length > 0) {
                        source = 'Yahoo Finance';
                        console.log(`[DividendService] ✓ Found ${dividends.length} dividends from Yahoo Finance`);
                    }
                }

                // 3. Fallback to Stooq for Polish stocks (.WA suffix)
                if (dividends.length === 0 && ticker.toUpperCase().endsWith('.WA')) {
                    console.log(`[DividendService] Yahoo Finance returned no data, trying Stooq for Polish stock ${ticker}...`);
                    dividends = await stooqService.fetchDividends(ticker);
                    if (dividends.length > 0) {
                        source = 'Stooq';
                        console.log(`[DividendService] ✓ Found ${dividends.length} dividends from Stooq`);
                    }
                }

                // No dividends found from any source
                if (dividends.length === 0) {
                    console.log(`[DividendService] ✗ No dividends found for ${ticker} from any source`);
                    continue;
                }

                console.log(`[DividendService] Using ${source} data for ${ticker}`);

                // OPTIMIZATION: Fetch all existing dividends for this ticker once
                const existingDividends = await db.dividends
                    .where('ticker').equals(ticker)
                    .toArray();

                // Create a Map for O(1) lookup by recordDate
                const existingMap = new Map(existingDividends.map(d => [d.recordDate, d]));

                // Process each dividend
                for (const div of dividends) {
                    // Check if dividend already exists using Map
                    if (existingMap.has(div.exDate)) {
                        skipped++;
                        continue;
                    }

                    // Calculate shares owned on ex-date
                    const sharesOwned = this._calculateSharesOnDate(transactions, ticker, div.exDate);

                    if (sharesOwned === 0) {
                        // User didn't own shares on this ex-date, skip
                        skipped++;
                        continue;
                    }

                    // Get NBP rate for the ex-date (use ex-date as payment approximation)
                    let exchangeRate = 1.0;
                    if (div.currency !== 'PLN') {
                        // Try to get rate from day before ex-date
                        const prevDate = this._getPreviousDay(div.exDate);
                        const rateData = await nbpService.getHistoricalRate(div.currency, prevDate);
                        exchangeRate = rateData?.rate || 1.0;
                    }

                    // Calculate values
                    const totalAmount = sharesOwned * div.amount;
                    const valuePLN = totalAmount * exchangeRate;

                    // Determine status based on payment date
                    const today = new Date().toISOString().split('T')[0]!;
                    const status = div.exDate > today ? 'expected' : 'received';

                    // Add to database
                    await db.dividends.add({
                        ticker,
                        recordDate: div.exDate,
                        paymentDate: div.exDate, // Using ex-date as approximation
                        amountPerShare: div.amount,
                        totalAmount,
                        currency: div.currency as CurrencyCode,
                        exchangeRate,
                        valuePLN,
                        sharesOwned,
                        status
                    });

                    added++;
                    console.log(`[DividendService] Added dividend from ${source}: ${ticker} - ${div.exDate} - ${div.amount} ${div.currency}`);
                }
            }

            console.log(`[DividendService] Sync complete: ${added} added, ${skipped} skipped`);
            return { added, skipped };

        } catch (error) {
            console.error('[DividendService] Failed to sync dividends:', error);
            throw error;
        }
    }

    /**
     * Delete dividend by ID
     */
    async deleteDividend(id: number): Promise<void> {
        try {
            await db.dividends.delete(id);
            console.log(`[DividendService] Deleted dividend ID: ${id}`);
        } catch (error) {
            console.error('[DividendService] Failed to delete dividend:', error);
            throw error;
        }
    }

    /**
     * Recalculate dividends for a specific ticker after transaction changes
     * This updates sharesOwned, totalAmount, and valuePLN for all dividends of the ticker
     */
    async recalculateDividendsForTicker(ticker: string): Promise<number> {
        try {
            console.log(`[DividendService] Recalculating dividends for ${ticker}...`);

            // Get all transactions sorted chronologically
            const transactions = await db.transactions.orderBy('date').toArray();

            // Get all dividends for this ticker
            const dividends = await db.dividends.where('ticker').equals(ticker).toArray();

            if (dividends.length === 0) {
                console.log(`[DividendService] No dividends found for ${ticker}`);
                return 0;
            }

            let updated = 0;

            // Update each dividend
            for (const dividend of dividends) {
                // Recalculate shares owned on record date
                const sharesOwned = this._calculateSharesOnDate(transactions, ticker, dividend.recordDate);

                // If shares owned is now 0, delete the dividend
                if (sharesOwned === 0) {
                    await db.dividends.delete(dividend.id!);
                    console.log(`[DividendService] Deleted dividend ${dividend.id} (no shares owned on ${dividend.recordDate})`);
                    updated++;
                    continue;
                }

                // Recalculate values
                const totalAmount = sharesOwned * dividend.amountPerShare;
                const valuePLN = totalAmount * (dividend.exchangeRate || 1.0);

                // Update the dividend
                await db.dividends.update(dividend.id!, {
                    sharesOwned,
                    totalAmount,
                    valuePLN
                });

                console.log(`[DividendService] Updated dividend ${dividend.id}: ${sharesOwned} shares, ${totalAmount} ${dividend.currency}`);
                updated++;
            }

            console.log(`[DividendService] Recalculated ${updated} dividends for ${ticker}`);
            return updated;

        } catch (error) {
            console.error(`[DividendService] Failed to recalculate dividends for ${ticker}:`, error);
            throw error;
        }
    }

    /**
     * Migration: Update status of existing dividends based on payment date
     * This fixes dividends that were added before the status logic was implemented
     */
    async migrateDividendStatus(): Promise<{ updated: number; skipped: number }> {
        try {
            console.log('[DividendService] Starting dividend status migration...');
            
            const today = new Date().toISOString().split('T')[0]!;
            const allDividends = await db.dividends.toArray();
            
            let updated = 0;
            let skipped = 0;

            for (const dividend of allDividends) {
                // Determine correct status based on payment date
                const correctStatus = dividend.paymentDate > today ? 'expected' : 'received';
                
                // Update if status is incorrect
                if (dividend.status !== correctStatus) {
                    await db.dividends.update(dividend.id!, { status: correctStatus });
                    console.log(`[DividendService] Updated ${dividend.ticker} (${dividend.paymentDate}): ${dividend.status} → ${correctStatus}`);
                    updated++;
                } else {
                    skipped++;
                }
            }

            console.log(`[DividendService] Migration complete: ${updated} updated, ${skipped} already correct`);
            return { updated, skipped };

        } catch (error) {
            console.error('[DividendService] Failed to migrate dividend status:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const dividendService = new DividendService();
export default DividendService;
