import { describe, it, expect } from 'vitest';
import {
    calculateFreeRideTargetPrice,
    calculateFreeRideSharesToSell
} from './freeRideCalculations';

describe('Free Ride Calculations', () => {
    describe('calculateFreeRideTargetPrice', () => {
        it('matches test case from user HTML (N=2, M=1, Ck=1.00, tax=19%)', () => {
            const result = calculateFreeRideTargetPrice({
                totalShares: 2,
                sellShares: 1,
                buyPrice: 1,
                taxRate: 0.19
            });

            // Cs = 1 * (2 - 0.19*1) / ((1 - 0.19) * 1) = 1.81 / 0.81 ≈ 2.2345679
            expect(result.targetPrice).toBeCloseTo(2.2346, 3);
            expect(result.requiredGrowthPercent).toBeCloseTo(123.456, 2);
            expect(result.initialCost).toBe(2);
            expect(result.netAmount).toBeCloseTo(2, 5); // Exactly 100% capital returned
            expect(result.freeShares).toBe(1);
            expect(result.tax).toBeCloseTo(0.2346, 3);
        });

        it('calculates correctly without tax (taxRate = 0, e.g. IKE/IKZE)', () => {
            const result = calculateFreeRideTargetPrice({
                totalShares: 100,
                sellShares: 50,
                buyPrice: 10,
                taxRate: 0
            });

            // Cs = (100 * 10) / 50 = 20
            expect(result.targetPrice).toBe(20);
            expect(result.requiredGrowthPercent).toBe(100);
            expect(result.initialCost).toBe(1000);
            expect(result.revenue).toBe(1000);
            expect(result.tax).toBe(0);
            expect(result.netAmount).toBe(1000);
            expect(result.freeShares).toBe(50);
            expect(result.freeSharesValue).toBe(1000);
        });

        it('throws error when M >= N', () => {
            expect(() =>
                calculateFreeRideTargetPrice({
                    totalShares: 10,
                    sellShares: 10,
                    buyPrice: 50
                })
            ).toThrow('Shares to sell (M) must be strictly less than total shares (N).');
        });

        it('throws error when inputs are non-positive', () => {
            expect(() =>
                calculateFreeRideTargetPrice({
                    totalShares: 0,
                    sellShares: 5,
                    buyPrice: 10
                })
            ).toThrow('Total shares, sell shares, and buy price must be greater than zero.');
        });
    });

    describe('calculateFreeRideSharesToSell', () => {
        it('calculates required shares to sell given target price with 19% tax', () => {
            // If N=2, Ck=1, and target price Cs=2.2346, M should be ~1
            const result = calculateFreeRideSharesToSell({
                totalShares: 2,
                targetPrice: 2.2346,
                buyPrice: 1,
                taxRate: 0.19
            });

            expect(result.rawSharesToSell).toBeCloseTo(1, 2);
            expect(result.roundedSharesToSell).toBe(1);
            expect(result.freeShares).toBe(1);
            expect(result.netAmount).toBeGreaterThanOrEqual(result.initialCost * 0.999);
        });

        it('calculates required shares to sell without tax', () => {
            const result = calculateFreeRideSharesToSell({
                totalShares: 100,
                targetPrice: 25,
                buyPrice: 10,
                taxRate: 0
            });

            // Initial cost = 1000. At 25/share, need 1000/25 = 40 shares.
            expect(result.rawSharesToSell).toBe(40);
            expect(result.roundedSharesToSell).toBe(40);
            expect(result.freeShares).toBe(60);
            expect(result.netAmount).toBe(1000);
        });

        it('throws error if target price is not greater than buy price', () => {
            expect(() =>
                calculateFreeRideSharesToSell({
                    totalShares: 100,
                    targetPrice: 10,
                    buyPrice: 10
                })
            ).toThrow('Target price must be strictly greater than buy price.');
        });
    });
});
