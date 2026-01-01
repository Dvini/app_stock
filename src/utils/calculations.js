/**
 * Utility functions for portfolio and financial calculations
 */

/**
 * Calculate profit/loss for a position
 * @param {number} buyPrice - Average buy price
 * @param {number} currentPrice - Current market price
 * @param {number} quantity - Quantity of shares
 * @returns {Object} P/L details
 */
export const calculateProfitLoss = (buyPrice, currentPrice, quantity) => {
    const costBasis = buyPrice * quantity;
    const currentValue = currentPrice * quantity;
    const profitLoss = currentValue - costBasis;
    const profitLossPercent = costBasis > 0 ? (profitLoss / costBasis) : 0;

    return {
        costBasis,
        currentValue,
        profitLoss,
        profitLossPercent,
        isProfit: profitLoss > 0,
        isLoss: profitLoss < 0
    };
};

/**
 * Calculate average price from multiple transactions
 * @param {Array} transactions - Array of transactions with {amount, price}
 * @returns {number} Average price
 */
export const calculateAveragePrice = (transactions) => {
    if (!transactions || transactions.length === 0) return 0;

    let totalCost = 0;
    let totalQuantity = 0;

    transactions.forEach(tx => {
        if (tx.type === 'buy') {
            totalCost += tx.amount * tx.price;
            totalQuantity += tx.amount;
        } else if (tx.type === 'sell') {
            // Reduce quantity but don't change average
            totalQuantity -= tx.amount;
        }
    });

    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
};

/**
 * Calculate portfolio allocation percentages
 * @param {Array} assets - Array of assets with {ticker, value}
 * @param {number} totalValue - Total portfolio value
 * @returns {Array} Assets with allocation percentages
 */
export const calculateAllocation = (assets, totalValue) => {
    if (!assets || assets.length === 0 || totalValue === 0) {
        return assets;
    }

    return assets.map(asset => ({
        ...asset,
        allocation: (asset.value / totalValue),
        allocationPercent: (asset.value / totalValue) * 100
    }));
};

/**
 * Calculate total portfolio value with currency conversion
 * @param {Array} assets - Array of assets with {ticker, amount, currentPrice, currency}
 * @param {Object} exchangeRates - Exchange rates to target currency
 * @param {string} targetCurrency - Target currency (default: PLN)
 * @returns {Object} Portfolio value details
 */
export const calculatePortfolioValue = (assets, exchangeRates = {}, targetCurrency = 'PLN') => {
    if (!assets || assets.length === 0) {
        return {
            totalValue: 0,
            byCurrency: {},
            assets: []
        };
    }

    const byCurrency = {};
    let totalValue = 0;

    const enrichedAssets = assets.map(asset => {
        const value = asset.amount * asset.currentPrice;
        const currency = asset.currency || 'PLN';

        // Convert to target currency
        const rate = currency === targetCurrency ? 1 : (exchangeRates[currency] || 1);
        const valueInTarget = value * rate;

        // Track by currency
        if (!byCurrency[currency]) {
            byCurrency[currency] = 0;
        }
        byCurrency[currency] += value;

        totalValue += valueInTarget;

        return {
            ...asset,
            value,
            valueInTarget
        };
    });

    return {
        totalValue,
        byCurrency,
        assets: enrichedAssets,
        targetCurrency
    };
};

/**
 * Calculate return on investment (ROI)
 * @param {number} initialInvestment - Initial cost basis
 * @param {number} currentValue - Current value
 * @returns {Object} ROI details
 */
export const calculateROI = (initialInvestment, currentValue) => {
    if (initialInvestment === 0) {
        return {
            roi: 0,
            roiPercent: 0,
            gain: 0
        };
    }

    const gain = currentValue - initialInvestment;
    const roi = gain / initialInvestment;
    const roiPercent = roi * 100;

    return {
        roi,
        roiPercent,
        gain,
        isPositive: gain > 0,
        isNegative: gain < 0
    };
};

/**
 * Calculate compound annual growth rate (CAGR)
 * @param {number} beginningValue - Starting value
 * @param {number} endingValue - Ending value
 * @param {number} years - Number of years
 * @returns {number} CAGR as decimal (0.15 = 15%)
 */
export const calculateCAGR = (beginningValue, endingValue, years) => {
    if (beginningValue === 0 || years === 0) return 0;
    return Math.pow(endingValue / beginningValue, 1 / years) - 1;
};

/**
 * Calculate diversification score (0-1, higher is better)
 * Based on Herfindahl-Hirschman Index (HHI)
 * @param {Array} allocations - Array of allocation percentages (0-1)
 * @returns {number} Diversification score
 */
export const calculateDiversification = (allocations) => {
    if (!allocations || allocations.length === 0) return 0;
    if (allocations.length === 1) return 0; // Single asset = no diversification

    // Calculate HHI (sum of squared market shares)
    const hhi = allocations.reduce((sum, allocation) => {
        return sum + Math.pow(allocation, 2);
    }, 0);

    // Normalize HHI to 0-1 scale
    // HHI ranges from 1/n (perfect diversification) to 1 (single asset)
    const n = allocations.length;
    const minHHI = 1 / n;
    const maxHHI = 1;

    // Invert so higher score = better diversification
    const score = 1 - ((hhi - minHHI) / (maxHHI - minHHI));

    return Math.max(0, Math.min(1, score));
};

/**
 * Calculate cost basis after buying more shares (averaging down/up)
 * @param {number} currentAvgPrice - Current average price
 * @param {number} currentQuantity - Current quantity
 * @param {number} newPrice - New purchase price
 * @param {number} newQuantity - New purchase quantity
 * @returns {Object} New cost basis details
 */
export const calculateNewCostBasis = (currentAvgPrice, currentQuantity, newPrice, newQuantity) => {
    const currentCost = currentAvgPrice * currentQuantity;
    const newCost = newPrice * newQuantity;
    const totalCost = currentCost + newCost;
    const totalQuantity = currentQuantity + newQuantity;
    const newAvgPrice = totalQuantity > 0 ? totalCost / totalQuantity : 0;

    return {
        newAvgPrice,
        totalQuantity,
        totalCost,
        isAveragingDown: newPrice < currentAvgPrice,
        isAveragingUp: newPrice > currentAvgPrice
    };
};

/**
 * Calculate position size as percentage of portfolio
 * @param {number} positionValue - Value of the position
 * @param {number} totalPortfolioValue - Total portfolio value
 * @returns {number} Position size as percentage (0-100)
 */
export const calculatePositionSize = (positionValue, totalPortfolioValue) => {
    if (totalPortfolioValue === 0) return 0;
    return (positionValue / totalPortfolioValue) * 100;
};

/**
 * Calculate risk metrics for a position
 * @param {number} positionValue - Value of position
 * @param {number} portfolioValue - Total portfolio value
 * @param {number} volatility - Historical volatility (optional)
 * @returns {Object} Risk metrics
 */
export const calculateRiskMetrics = (positionValue, portfolioValue, volatility = 0) => {
    const positionSize = calculatePositionSize(positionValue, portfolioValue);
    const concentration = positionSize / 100; // As decimal

    return {
        positionSize,
        concentration,
        isOverConcentrated: positionSize > 20, // More than 20% in single position
        estimatedRisk: volatility > 0 ? concentration * volatility : null
    };
};
