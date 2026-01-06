import { apiService } from './ApiService';
import { nbpService } from './NBPService';
import type { CurrencyCode } from '../types/database';

interface StockPrice {
    price: number;
    currency: CurrencyCode;
}

interface ExchangeRates {
    [currency: string]: number;
}

/**
 * Stock Data Service
 * Aggregates stock price and exchange rate data
 */
class StockDataService {
    /**
     * Get current prices for multiple tickers
     */
    async getPrices(tickers: string[]): Promise<Map<string, StockPrice>> {
        const prices = new Map<string, StockPrice>();

        const promises = tickers.map(async ticker => {
            try {
                const priceData = await apiService.getCurrentPrice(ticker);
                if (priceData) {
                    prices.set(ticker, priceData);
                }
            } catch (error) {
                console.error(`[StockDataService] Failed to fetch price for ${ticker}:`, error);
            }
        });

        await Promise.all(promises);
        return prices;
    }

    /**
     * Get exchange rates for multiple currencies to PLN
     */
    async getExchangeRates(currencies: CurrencyCode[]): Promise<ExchangeRates> {
        try {
            // Use NBP service for PLN-based rates
            const rates: ExchangeRates = {};

            for (const currency of currencies) {
                if (currency === 'PLN') {
                    rates[currency] = 1.0;
                    continue;
                }

                try {
                    const rateData = await nbpService.getCurrentRate(currency);
                    if (rateData) {
                        rates[currency] = rateData.rate;
                    } else {
                        // Fallback to Yahoo Finance if NBP fails
                        const yahooRates = await apiService.getExchangeRates([currency], 'PLN');
                        if (yahooRates[currency]) {
                            rates[currency] = yahooRates[currency];
                        } else {
                            console.warn(`[StockDataService] No rate found for ${currency}, using 1.0`);
                            rates[currency] = 1.0;
                        }
                    }
                } catch (error) {
                    console.error(`[StockDataService] Failed to fetch rate for ${currency}:`, error);
                    rates[currency] = 1.0;
                }
            }

            return rates;
        } catch (error) {
            console.error('[StockDataService] Failed to fetch exchange rates:', error);
            return {};
        }
    }

    /**
     * Get all data needed for portfolio calculations
     */
    async getPortfolioData(
        tickers: string[],
        currencies: CurrencyCode[]
    ): Promise<{
        prices: Map<string, StockPrice>;
        rates: ExchangeRates;
    }> {
        const [prices, rates] = await Promise.all([this.getPrices(tickers), this.getExchangeRates(currencies)]);

        return { prices, rates };
    }

    /**
     * Get historical data for charting
     */
    async getHistoricalData(
        ticker: string,
        range: string = '1mo',
        interval: string = '1d'
    ): Promise<{
        data: Array<{ timestamp: number; price: number; date: string }>;
        currency: CurrencyCode;
    } | null> {
        try {
            return await apiService.getHistory(ticker, range, interval);
        } catch (error) {
            console.error(`[StockDataService] Failed to fetch history for ${ticker}:`, error);
            return null;
        }
    }

    /**
     * Get historical exchange rate
     */
    async getHistoricalRate(currency: CurrencyCode, dateStr: string): Promise<number> {
        try {
            // Try NBP first
            const rateData = await nbpService.getHistoricalRate(currency, dateStr);
            if (rateData) {
                return rateData.rate;
            }

            // Fallback to Yahoo Finance
            const yahooRate = await apiService.getHistoricalRate(currency, dateStr);
            if (yahooRate) {
                return yahooRate.rate;
            }

            console.warn(`[StockDataService] No historical rate found for ${currency} on ${dateStr}, using 1.0`);
            return 1.0;
        } catch (error) {
            console.error(`[StockDataService] Failed to fetch historical rate for ${currency}:`, error);
            return 1.0;
        }
    }

    /**
     * Invalidate cache for a specific ticker
     */
    invalidateCache(ticker: string): void {
        apiService.invalidateTickerCache(ticker);
    }

    /**
     * Clear all caches
     */
    clearAllCaches(): void {
        apiService.clearCache();
        nbpService.clearCache();
    }
}

// Export singleton instance
export const stockDataService = new StockDataService();
export default StockDataService;
