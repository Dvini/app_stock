/**
 * Free Ride / Capital Extraction strategy calculations
 * Calculates the required sell price or shares to sell to extract 100% initial capital after taxes.
 */

export interface FreeRideTargetPriceParams {
    totalShares: number; // N
    sellShares: number; // M
    buyPrice: number; // C_k
    taxRate?: number; // e.g. 0.19 (19%) or 0
}

export interface FreeRideTargetPriceResult {
    targetPrice: number; // C_s
    requiredGrowthPercent: number; // R%
    initialCost: number; // N * C_k
    revenue: number; // M * C_s
    costOfSold: number; // M * C_k
    grossProfit: number; // max(0, revenue - costOfSold)
    tax: number; // grossProfit * taxRate
    netAmount: number; // revenue - tax (= initialCost)
    freeShares: number; // N - M
    freeSharesValue: number; // (N - M) * C_s
}

export interface FreeRideSharesToSellParams {
    totalShares: number; // N
    targetPrice: number; // C_s
    buyPrice: number; // C_k
    taxRate?: number; // e.g. 0.19 or 0
}

export interface FreeRideSharesToSellResult extends FreeRideTargetPriceResult {
    rawSharesToSell: number;
    roundedSharesToSell: number;
}

/**
 * Given M shares to sell, calculate the target price C_s to extract 100% of initial capital.
 * Formula: C_s = (C_k * (N - taxRate * M)) / ((1 - taxRate) * M)
 */
export const calculateFreeRideTargetPrice = (params: FreeRideTargetPriceParams): FreeRideTargetPriceResult => {
    const { totalShares: N, sellShares: M, buyPrice: C_k, taxRate = 0 } = params;

    if (N <= 0 || M <= 0 || C_k <= 0) {
        throw new Error('Total shares, sell shares, and buy price must be greater than zero.');
    }
    if (M >= N) {
        throw new Error('Shares to sell (M) must be strictly less than total shares (N).');
    }
    if (taxRate < 0 || taxRate >= 1) {
        throw new Error('Tax rate must be between 0 and 1 (exclusive).');
    }

    const denominator = (1 - taxRate) * M;
    const targetPrice = (C_k * (N - taxRate * M)) / denominator;
    const requiredGrowthPercent = ((targetPrice - C_k) / C_k) * 100;

    const initialCost = N * C_k;
    const revenue = M * targetPrice;
    const costOfSold = M * C_k;
    const grossProfit = Math.max(0, revenue - costOfSold);
    const tax = grossProfit * taxRate;
    const netAmount = revenue - tax;
    const freeShares = N - M;
    const freeSharesValue = freeShares * targetPrice;

    return {
        targetPrice,
        requiredGrowthPercent,
        initialCost,
        revenue,
        costOfSold,
        grossProfit,
        tax,
        netAmount,
        freeShares,
        freeSharesValue
    };
};

/**
 * Given target price C_s, calculate how many shares M must be sold to extract 100% initial capital.
 * Formula: M = (N * C_k) / (C_s * (1 - taxRate) + taxRate * C_k)
 */
export const calculateFreeRideSharesToSell = (params: FreeRideSharesToSellParams): FreeRideSharesToSellResult => {
    const { totalShares: N, targetPrice: C_s, buyPrice: C_k, taxRate = 0 } = params;

    if (N <= 0 || C_s <= 0 || C_k <= 0) {
        throw new Error('Total shares, target price, and buy price must be greater than zero.');
    }
    if (C_s <= C_k) {
        throw new Error('Target price must be strictly greater than buy price.');
    }
    if (taxRate < 0 || taxRate >= 1) {
        throw new Error('Tax rate must be between 0 and 1 (exclusive).');
    }

    const denom = C_s * (1 - taxRate) + taxRate * C_k;
    const rawSharesToSell = (N * C_k) / denom;
    const roundedSharesToSell = Math.ceil(rawSharesToSell);

    if (roundedSharesToSell >= N) {
        throw new Error('Target price is too low to extract initial capital with fewer than N shares.');
    }

    const M = roundedSharesToSell;
    const initialCost = N * C_k;
    const revenue = M * C_s;
    const costOfSold = M * C_k;
    const grossProfit = Math.max(0, revenue - costOfSold);
    const tax = grossProfit * taxRate;
    const netAmount = revenue - tax;
    const freeShares = N - M;
    const freeSharesValue = freeShares * C_s;
    const requiredGrowthPercent = ((C_s - C_k) / C_k) * 100;

    return {
        targetPrice: C_s,
        requiredGrowthPercent,
        rawSharesToSell,
        roundedSharesToSell,
        initialCost,
        revenue,
        costOfSold,
        grossProfit,
        tax,
        netAmount,
        freeShares,
        freeSharesValue
    };
};
