import { load } from 'cheerio';
import { cacheService } from './CacheService';

interface StooqDividendRecord {
    exDate: string;
    amount: number;
    currency: string;
}

/**
 * Stooq Service - Polish stock exchange data provider
 * Fetches dividend data via HTML scraping (no official REST API available)
 */
class StooqService {
    private baseUrl: string;
    private cacheDuration: number;
    private userAgent: string;

    constructor() {
        this.baseUrl = 'https://stooq.pl/q/g/';
        this.cacheDuration = 24 * 60 * 60 * 1000; // 24 hours
        this.userAgent =
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    /**
     * Parse Polish date format from Stooq (e.g., "31 sie 2024")
     */
    private parseStooqDate(stooqDate: string): Date | null {
        const months: Record<string, number> = {
            sty: 0,
            lut: 1,
            mar: 2,
            kwi: 3,
            maj: 4,
            cze: 5,
            lip: 6,
            sie: 7,
            wrz: 8,
            paź: 9,
            lis: 10,
            gru: 11
        };

        // Clean the date string and split
        const parts = stooqDate.trim().split(/\s+/);
        if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
            console.warn(`[StooqService] Invalid date format: "${stooqDate}"`);
            return null;
        }

        const day = parseInt(parts[0], 10);
        const monthName = parts[1].toLowerCase();
        const year = parseInt(parts[2], 10);

        const month = months[monthName];
        if (month === undefined) {
            console.warn(`[StooqService] Unknown month: "${monthName}"`);
            return null;
        }

        if (isNaN(day) || isNaN(year)) {
            console.warn(`[StooqService] Invalid day or year in: "${stooqDate}"`);
            return null;
        }

        return new Date(year, month, day);
    }

    /**
     * Normalize ticker format for Stooq (lowercase, .wa suffix)
     */
    private normalizeTickerForStooq(ticker: string): string {
        const normalized = ticker.toLowerCase();
        // If already has .wa suffix, return as is
        if (normalized.endsWith('.wa')) {
            return normalized;
        }
        // Remove .WA suffix if uppercase and re-add as lowercase
        const withoutSuffix = normalized.replace(/\.wa$/i, '');
        return `${withoutSuffix}.wa`;
    }

    /**
     * Fetch dividend history from Stooq via HTML scraping
     */
    async fetchDividends(ticker: string): Promise<StooqDividendRecord[]> {
        const normalizedTicker = this.normalizeTickerForStooq(ticker);
        const cacheKey = `stooq_dividends_${normalizedTicker}`;

        // Check cache
        const cached = cacheService.get<StooqDividendRecord[]>(cacheKey, this.cacheDuration);
        if (cached) {
            console.log(`[StooqService] Using cached dividends for ${normalizedTicker}`);
            return cached;
        }

        try {
            const url = `${this.baseUrl}?s=${normalizedTicker}`;
            console.log(`[StooqService] Fetching dividends for ${normalizedTicker} from ${url}`);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });

            if (!response.ok) {
                console.error(`[StooqService] HTTP error: ${response.status} for ${normalizedTicker}`);
                return [];
            }

            const html = await response.text();
            const $ = load(html);

            const dividends: StooqDividendRecord[] = [];

            // Find dividend table (#fth1 is the standard table ID on Stooq dividend pages)
            // If not found, try other common table selectors
            let tableRows = $('#fth1 tr');

            if (tableRows.length === 0) {
                // Fallback: look for tables with dividend-related content
                console.log(`[StooqService] Table #fth1 not found, trying alternative selectors...`);
                tableRows = $('table').find('tr:contains("Dywidenda")').parent().find('tr');
            }

            if (tableRows.length === 0) {
                console.log(`[StooqService] No dividend data found for ${normalizedTicker}`);
                return [];
            }

            // Parse each row (skip header)
            tableRows.each((index, row) => {
                if (index === 0) return; // Skip header row

                const cols = $(row).find('td');
                if (cols.length >= 3) {
                    const dateStr = $(cols[0]).text().trim();
                    const amountStr = $(cols[2]).text().trim();

                    // Parse date
                    const date = this.parseStooqDate(dateStr);

                    // Parse amount (replace comma with dot for decimal)
                    const amount = parseFloat(amountStr.replace(',', '.'));

                    if (date && !isNaN(amount) && amount > 0) {
                        const isoDate = date.toISOString().split('T')[0];
                        if (isoDate) {
                            dividends.push({
                                exDate: isoDate, // Format as YYYY-MM-DD
                                amount: amount,
                                currency: 'PLN' // Stooq primarily deals with PLN for Polish stocks
                            });
                        }
                    }
                }
            });

            // Sort by date (newest first)
            dividends.sort((a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime());

            // Cache the result
            cacheService.set(cacheKey, dividends, { ttl: this.cacheDuration });

            console.log(`[StooqService] Fetched ${dividends.length} dividends for ${normalizedTicker}`);
            return dividends;
        } catch (error) {
            console.error(`[StooqService] Failed to fetch dividends for ${ticker}:`, error);
            return [];
        }
    }

    /**
     * Clear all Stooq cache
     */
    clearCache(): void {
        cacheService.invalidate(/^stooq_/);
        console.log('[StooqService] Cleared all Stooq cache');
    }
}

// Export singleton instance
export const stooqService = new StooqService();
export default StooqService;
