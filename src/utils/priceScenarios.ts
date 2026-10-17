/**
 * Price scenarios for the simulator: the result of the same operation at prices
 * above and below the simulated one, and the break-even price.
 */

import { calculateNetProfitLoss, type ClosedTrade } from './taxCalculations';
import { simulateSell, type SellSimulationParams } from './sellSimulation';

export const SCENARIO_STEPS = [-20, -10, -5, 0, 5, 10, 20];

export interface ScenarioRow {
    /** Price change vs the simulated price, % */
    changePercent: number;
    price: number;
    /** Sell: realized FIFO result in PLN. Buy: unrealized result of the whole position in its currency */
    pl: number;
    plPercent: number;
    tax: number;
    afterTax: number;
}

const priceAt = (basePrice: number, changePercent: number): number => basePrice * (1 + changePercent / 100);

/**
 * Lowest sell price (asset currency) at which the sale does not lose money after both commissions.
 * The PLN result is linear in the price at a fixed exchange rate.
 */
export const breakEvenSellPrice = (trade: ClosedTrade): number | null => {
    const revenuePerUnitPrice = trade.shares * trade.sellExchangeRate;
    return revenuePerUnitPrice > 0 ? trade.totalCostPLN / revenuePerUnitPrice : null;
};

export const sellScenarios = (params: SellSimulationParams, steps: number[] = SCENARIO_STEPS): ScenarioRow[] =>
    steps.flatMap(changePercent => {
        const price = priceAt(params.price, changePercent);
        const outcome = simulateSell({ ...params, price });
        if (!outcome.ok) return [];
        const { trade } = outcome.result;
        return [
            {
                changePercent,
                price,
                pl: trade.gainLossPLN,
                plPercent: outcome.result.gainPercent,
                tax: trade.taxLiabilityPLN,
                afterTax: outcome.result.afterTaxPLN
            }
        ];
    });

/**
 * Unrealized result of a whole position (after the simulated buy) at prices around `basePrice`
 */
export const positionScenarios = (
    shares: number,
    avgPrice: number,
    basePrice: number,
    taxRate: number,
    steps: number[] = SCENARIO_STEPS
): ScenarioRow[] => {
    const cost = shares * avgPrice;
    return steps.map(changePercent => {
        const price = priceAt(basePrice, changePercent);
        const pl = shares * price - cost;
        const { netPL, taxAmount } = calculateNetProfitLoss(pl, taxRate);
        return {
            changePercent,
            price,
            pl,
            plPercent: cost > 0 ? (pl / cost) * 100 : 0,
            tax: taxAmount,
            afterTax: netPL
        };
    });
};
