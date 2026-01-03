/**
 * Tests for calculations utility functions
 * Tests profit/loss, ROI, CAGR, diversification, and other financial calculations
 */

import { describe, it, expect } from 'vitest';
import {
    calculateProfitLoss,
    calculateAveragePrice,
    calculateAllocation,
    calculateROI,
    calculateCAGR,
    calculateDiversification,
    calculateNewCostBasis,
    calculatePositionSize,
    calculateRiskMetrics
} from '../utils/calculations';

describe('Calculations', () => {
    describe('calculateProfitLoss', () => {
        it('should calculate profit correctly', () => {
            const result = calculateProfitLoss(100, 150, 10);

            expect(result.costBasis).toBe(1000);
            expect(result.currentValue).toBe(1500);
            expect(result.profitLoss).toBe(500);
            expect(result.profitLossPercent).toBe(0.5);
            expect(result.isProfit).toBe(true);
            expect(result.isLoss).toBe(false);
        });

        it('should calculate loss correctly', () => {
            const result = calculateProfitLoss(150, 100, 10);

            expect(result.profitLoss).toBe(-500);
            expect(result.profitLossPercent).toBe(-1 / 3);
            expect(result.isProfit).toBe(false);
            expect(result.isLoss).toBe(true);
        });

        it('should handle zero quantity', () => {
            const result = calculateProfitLoss(100, 150, 0);
            expect(result.costBasis).toBe(0);
            expect(result.currentValue).toBe(0);
        });
    });

    describe('calculateAveragePrice', () => {
        it('should calculate average buy price', () => {
            const transactions = [
                { type: 'buy', amount: 10, price: 100 },
                { type: 'buy', amount: 5, price: 120 }
            ];

            const avgPrice = calculateAveragePrice(transactions);
            expect(avgPrice).toBeCloseTo(106.67, 2);
        });

        it('should handle sells', () => {
            const transactions = [
                { type: 'buy', amount: 10, price: 100 },
                { type: 'sell', amount: 5, price: 120 }
            ];

            const avgPrice = calculateAveragePrice(transactions);
            expect(avgPrice).toBeCloseTo(200, 2); // 1000 cost / 5 remaining
        });

        it('should return 0 for empty transactions', () => {
            expect(calculateAveragePrice([])).toBe(0);
        });
    });

    describe('calculateAllocation', () => {
        it('should calculate allocation percentages', () => {
            const assets = [
                { ticker: 'AAPL', value: 1000 },
                { ticker: 'GOOGL', value: 1500 },
                { ticker: 'MSFT', value: 500 }
            ];

            const result = calculateAllocation(assets, 3000);

            expect(result[0].allocation).toBeCloseTo(1 / 3, 2);
            expect(result[0].allocationPercent).toBeCloseTo(33.33, 2);
            expect(result[1].allocation).toBeCloseTo(0.5, 2);
            expect(result[2].allocation).toBeCloseTo(1 / 6, 2);
        });
    });

    describe('calculateROI', () => {
        it('should calculate positive ROI', () => {
            const result = calculateROI(1000, 1500);

            expect(result.roi).toBe(0.5);
            expect(result.roiPercent).toBe(50);
            expect(result.gain).toBe(500);
            expect(result.isPositive).toBe(true);
        });

        it('should calculate negative ROI', () => {
            const result = calculateROI(1000, 800);

            expect(result.roi).toBe(-0.2);
            expect(result.roiPercent).toBe(-20);
            expect(result.isNegative).toBe(true);
        });

        it('should handle zero initial investment', () => {
            const result = calculateROI(0, 100);
            expect(result.roi).toBe(0);
        });
    });

    describe('calculateCAGR', () => {
        it('should calculate CAGR correctly', () => {
            const cagr = calculateCAGR(1000, 2000, 5);
            expect(cagr).toBeCloseTo(0.1487, 4); // ~14.87%
        });

        it('should handle edge cases', () => {
            expect(calculateCAGR(0, 1000, 5)).toBe(0);
            expect(calculateCAGR(1000, 2000, 0)).toBe(0);
        });
    });

    describe('calculateDiversification', () => {
        it('should return 1 for perfect diversification', () => {
            const allocations = [0.25, 0.25, 0.25, 0.25];
            const score = calculateDiversification(allocations);
            expect(score).toBeCloseTo(1, 1);
        });

        it('should return 0 for single asset', () => {
            const allocations = [1.0];
            const score = calculateDiversification(allocations);
            expect(score).toBe(0);
        });

        it('should return lower score for concentrated portfolio', () => {
            const allocations = [0.9, 0.05, 0.05];
            const score = calculateDiversification(allocations);
            expect(score).toBeLessThan(0.5);
        });
    });

    describe('calculateNewCostBasis', () => {
        it('should calculate averaging down', () => {
            const result = calculateNewCostBasis(100, 10, 80, 10);

            expect(result.newAvgPrice).toBe(90);
            expect(result.totalQuantity).toBe(20);
            expect(result.isAveragingDown).toBe(true);
            expect(result.isAveragingUp).toBe(false);
        });

        it('should calculate averaging up', () => {
            const result = calculateNewCostBasis(100, 10, 120, 10);

            expect(result.newAvgPrice).toBe(110);
            expect(result.isAveragingUp).toBe(true);
        });
    });

    describe('calculatePositionSize', () => {
        it('should calculate position size as percentage', () => {
            const size = calculatePositionSize(2500, 10000);
            expect(size).toBe(25);
        });

        it('should handle zero portfolio value', () => {
            const size = calculatePositionSize(1000, 0);
            expect(size).toBe(0);
        });
    });

    describe('calculateRiskMetrics', () => {
        it('should identify over-concentrated positions', () => {
            const metrics = calculateRiskMetrics(2500, 10000);

            expect(metrics.positionSize).toBe(25);
            expect(metrics.concentration).toBe(0.25);
            expect(metrics.isOverConcentrated).toBe(true);
        });

        it('should calculate estimated risk with volatility', () => {
            const metrics = calculateRiskMetrics(2000, 10000, 0.3);

            expect(metrics.estimatedRisk).toBeCloseTo(0.06, 2); // 20% * 30%
        });
    });
});
