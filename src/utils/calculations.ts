/**
 * Utility functions for portfolio and financial calculations
 */

/**
 * Profit/loss calculation result
 */
export interface ProfitLossResult {
    costBasis: number;
    currentValue: number;
    profitLoss: number;
    profitLossPercent: number;
    isProfit: boolean;
    isLoss: boolean;
}

/**
 * Calculate profitloss for a position
 */
export const calculateProfitLoss = (buyPrice: number, currentPrice: number, quantity: number): ProfitLossResult => {
    const costBasis = buyPrice * quantity;
    const currentValue = currentPrice * quantity;
    const profitLoss = currentValue - costBasis;
    const profitLossPercent = costBasis > 0 ? profitLoss / costBasis : 0;

    return {
        costBasis,
        currentValue,
        profitLoss,
        profitLossPercent,
        isProfit: profitLoss > 0,
        isLoss: profitLoss < 0
    };
};

interface TransactionForAverage {
    type: 'buy' | 'sell';
    amount: number;
    price: number;
}

/**
 * Calculate average price from multiple transactions
 */
export const calculateAveragePrice = (transactions: TransactionForAverage[]): number => {
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

interface AssetWithValue {
    ticker: string;
    value: number;
    [key: string]: unknown;
}

interface AssetWithAllocation extends AssetWithValue {
    allocation: number;
    allocationPercent: number;
}

/**
 * Calculate portfolio allocation percentages
 */
export const calculateAllocation = (assets: AssetWithValue[], totalValue: number): AssetWithAllocation[] => {
    if (!assets || assets.length === 0 || totalValue === 0) {
        return assets as AssetWithAllocation[];
    }

    return assets.map(asset => ({
        ...asset,
        allocation: asset.value / totalValue,
        allocationPercent: (asset.value / totalValue) * 100
    }));
};

interface AssetForPortfolioValue {
    amount: number;
    currentPrice: number;
    currency?: string;
    [key: string]: unknown;
}

interface PortfolioValueResult {
    totalValue: number;
    byCurrency: Record<string, number>;
    assets: Array<AssetForPortfolioValue & { value: number; valueInTarget: number }>;
    targetCurrency: string;
}

/**
 * Calculate total portfolio value with currency conversion
 */
export const calculatePortfolioValue = (
    assets: AssetForPortfolioValue[],
    exchangeRates: Record<string, number> = {},
    targetCurrency = 'PLN'
): PortfolioValueResult => {
    if (!assets || assets.length === 0) {
        return {
            totalValue: 0,
            byCurrency: {},
            assets: [],
            targetCurrency
        };
    }

    const byCurrency: Record<string, number> = {};
    let totalValue = 0;

    const enrichedAssets = assets.map(asset => {
        const value = asset.amount * asset.currentPrice;
        const currency = asset.currency || 'PLN';

        // Convert to target currency
        const rate = currency === targetCurrency ? 1 : exchangeRates[currency] || 1;
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

interface ROIResult {
    roi: number;
    roiPercent: number;
    gain: number;
    isPositive?: boolean;
    isNegative?: boolean;
}

/**
 * Calculate return on investment (ROI)
 */
export const calculateROI = (initialInvestment: number, currentValue: number): ROIResult => {
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
 */
export const calculateCAGR = (beginningValue: number, endingValue: number, years: number): number => {
    if (beginningValue === 0 || years === 0) return 0;
    return Math.pow(endingValue / beginningValue, 1 / years) - 1;
};

/**
 * Calculate diversification score (0-1, higher is better)
 * Based on Herfindahl-Hirschman Index (HHI)
 */
export const calculateDiversification = (allocations: number[]): number => {
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
    const score = 1 - (hhi - minHHI) / (maxHHI - minHHI);

    return Math.max(0, Math.min(1, score));
};

interface NewCostBasisResult {
    newAvgPrice: number;
    totalQuantity: number;
    totalCost: number;
    isAveragingDown: boolean;
    isAveragingUp: boolean;
}

/**
 * Calculate cost basis after buying more shares (averaging down/up)
 */
export const calculateNewCostBasis = (
    currentAvgPrice: number,
    currentQuantity: number,
    newPrice: number,
    newQuantity: number
): NewCostBasisResult => {
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
 */
export const calculatePositionSize = (positionValue: number, totalPortfolioValue: number): number => {
    if (totalPortfolioValue === 0) return 0;
    return (positionValue / totalPortfolioValue) * 100;
};

interface RiskMetrics {
    positionSize: number;
    concentration: number;
    isOverConcentrated: boolean;
    estimatedRisk: number | null;
}

/**
 * Calculate risk metrics for a position
 */
export const calculateRiskMetrics = (positionValue: number, portfolioValue: number, volatility = 0): RiskMetrics => {
    const positionSize = calculatePositionSize(positionValue, portfolioValue);
    const concentration = positionSize / 100; // As decimal

    return {
        positionSize,
        concentration,
        isOverConcentrated: positionSize > 20, // More than 20% in single position
        estimatedRisk: volatility > 0 ? concentration * volatility : null
    };
};
