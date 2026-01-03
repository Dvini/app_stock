/**
 * Portfolio-specific helper functions
 * Centralized utilities for profit/loss calculations and formatting
 */

import { formatNumber } from './formatters';

/**
 * Format profit/loss value with percentage
 * @param value - Raw P/L value
 * @param percent - Percentage change
 * @param currency - Currency code (default: PLN)
 * @returns Formatted string like "+123.45 PLN (5.67%)"
 */
export const formatProfitLoss = (
    value: number,
    percent: number,
    currency: string = 'PLN'
): string => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${formatNumber(value)} ${currency} (${formatNumber(percent)}%)`;
};

/**
 * Calculate percentage change
 * @param current - Current value
 * @param original - Original value
 * @returns Percentage change (handles division by zero)
 */
export const calculatePercentChange = (current: number, original: number): number => {
    if (original === 0) return 0;
    return ((current - original) / original) * 100;
};

/**
 * Format currency value with symbol
 * @param value - Numeric value
 * @param currency - Currency code
 * @param includeSymbol - Whether to include currency symbol (default: true)
 * @returns Formatted string
 */
export const formatCurrencyValue = (
    value: number,
    currency: string = 'PLN',
    includeSymbol: boolean = true
): string => {
    const formatted = formatNumber(value);
    return includeSymbol ? `${formatted} ${currency}` : formatted;
};

/**
 * Determine if a value represents a gain or loss
 * @param value - Value to check
 * @returns Object with isGain, isLoss, colorClass
 */
export const getProfitLossState = (value: number) => {
    const isGain = value > 0;
    const isLoss = value < 0;
    const colorClass = isGain ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-400';
    
    return {
        isGain,
        isLoss,
        isNeutral: value === 0,
        colorClass,
        bgClass: isGain ? 'bg-emerald-500/10' : isLoss ? 'bg-rose-500/10' : 'bg-slate-500/10'
    };
};
