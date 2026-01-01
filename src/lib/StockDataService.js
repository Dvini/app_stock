import { apiService } from './ApiService.js';

/**
 * High-level service for stock data operations
 * Provides business logic layer over ApiService
 */
class StockDataService {
    constructor(apiServiceInstance = apiService) {
        this.api = apiServiceInstance;
    }

    /**
     * Get current price with currency for a ticker
     * @param {string} ticker - Stock ticker symbol
     * @returns {Promise<{price: number, currency: string}|null>}
     */
    async getTickerPrice(ticker) {
        return this.api.getCurrentPrice(ticker);
    }

    /**
     * Get current prices for multiple tickers
     * @param {string[]} tickers - Array of ticker symbols
     * @returns {Promise<Object>} Object mapping tickers to price data
     */
    async getMultiplePrices(tickers) {
        const promises = tickers.map(ticker =>
            this.getTickerPrice(ticker).then(data => ({ ticker, data }))
        );

        const results = await Promise.all(promises);
        const priceMap = {};

        results.forEach(({ ticker, data }) => {
            if (data) {
                priceMap[ticker] = data;
            }
        });

        return priceMap;
    }

    /**
     * Convert amount from one currency to target currency
     * @param {number} amount - Amount to convert
     * @param {string} fromCurrency - Source currency
     * @param {string} toCurrency - Target currency
     * @returns {Promise<number>} Converted amount
     */
    async convertCurrency(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) {
            return amount;
        }

        const rates = await this.api.getExchangeRates([fromCurrency], toCurrency);
        const rate = rates[fromCurrency];

        if (!rate) {
            console.warn(`[StockDataService] No exchange rate found for ${fromCurrency} -> ${toCurrency}`);
            return amount; // Return original amount if conversion fails
        }

        return amount * rate;
    }

    /**
     * Get portfolio value in target currency
     * @param {Array} assets - Array of assets with {ticker, amount, currency}
     * @param {string} targetCurrency - Target currency for total value
     * @returns {Promise<{totalValue: number, assets: Array}>}
     */
    async getPortfolioValue(assets, targetCurrency = 'PLN') {
        // Get all unique currencies needed
        const currencies = [...new Set(assets.map(a => a.currency).filter(c => c && c !== targetCurrency))];

        // Fetch exchange rates
        const rates = await this.api.getExchangeRates(currencies, targetCurrency);

        // Get current prices for all tickers
        const tickers = assets.map(a => a.ticker);
        const prices = await this.getMultiplePrices(tickers);

        // Calculate value for each asset
        const enrichedAssets = assets.map(asset => {
            const priceData = prices[asset.ticker];
            if (!priceData) {
                return { ...asset, currentPrice: null, value: 0, valueInTarget: 0 };
            }

            const currentPrice = priceData.price;
            const value = currentPrice * asset.amount;

            // Convert to target currency
            const rate = asset.currency === targetCurrency ? 1 : (rates[asset.currency] || 1);
            const valueInTarget = value * rate;

            return {
                ...asset,
                currentPrice,
                value,
                valueInTarget,
                currency: priceData.currency
            };
        });

        const totalValue = enrichedAssets.reduce((sum, asset) => sum + asset.valueInTarget, 0);

        return {
            totalValue,
            assets: enrichedAssets,
            targetCurrency
        };
    }

    /**
     * Get historical data for charting
     * @param {string} ticker - Stock ticker symbol
     * @param {string} range - Time range
     * @param {string} interval - Data interval
     * @returns {Promise<{data: Array, currency: string}|null>}
     */
    async getChartData(ticker, range = '1mo', interval = '1d') {
        return this.api.getHistory(ticker, range, interval);
    }

    /**
     * Invalidate cache for a ticker (useful after transactions)
     * @param {string} ticker - Stock ticker symbol
     */
    invalidateCache(ticker) {
        this.api.invalidateTickerCache(ticker);
    }

    /**
     * Clear all cache
     */
    clearAllCache() {
        this.api.clearCache();
    }
}

// Export singleton instance
export const stockDataService = new StockDataService();
export default StockDataService;
