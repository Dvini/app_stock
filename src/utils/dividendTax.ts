/**
 * Dividend tax helpers (Polish resident investor).
 *
 * - Polish dividends (PLN): the paying broker withholds 19% as the final tax; nothing to declare.
 *   On IKE/IKZE nothing is withheld.
 * - Foreign dividends: tax withheld at source abroad; in Poland 19% is due on the gross amount,
 *   reduced by the foreign tax (credit capped at 19%). Declared in PIT-38 part G.
 */

import type { CurrencyCode, Dividend } from '../types/database';

export const PL_DIVIDEND_TAX_RATE = 19;

/**
 * Typical withholding at source by dividend currency. Editable per dividend, these are only defaults:
 * USD assumes a filed W-8BEN; EUR varies by country (DE ~26%, FR 12.8–25%, NL 15%) - verify per broker statement.
 */
const DEFAULT_FOREIGN_WITHHOLDING: Partial<Record<CurrencyCode, number>> = {
    USD: 15,
    EUR: 15,
    GBP: 0,
    CHF: 35
};

export const defaultWithholdingRate = (currency: string, isTaxExemptAccount: boolean): number => {
    if (currency === 'PLN') return isTaxExemptAccount ? 0 : PL_DIVIDEND_TAX_RATE;
    return DEFAULT_FOREIGN_WITHHOLDING[currency as CurrencyCode] ?? 15;
};

export const isForeignDividend = (d: Pick<Dividend, 'currency'>): boolean => (d.currency || 'PLN') !== 'PLN';

/**
 * Exchange rate usable for the dividend, or null if missing.
 * A rate of exactly 1 for a foreign currency is a legacy placeholder from a failed NBP fetch.
 */
export const dividendRate = (d: Pick<Dividend, 'currency' | 'exchangeRate'>): number | null => {
    if (!isForeignDividend(d)) return 1;
    const rate = d.exchangeRate;
    return rate && rate > 0 && rate !== 1 ? rate : null;
};

export const dividendWithholdingRate = (d: Pick<Dividend, 'currency' | 'withholdingTaxRate'>): number =>
    d.withholdingTaxRate ?? defaultWithholdingRate(d.currency || 'PLN', false);

/**
 * Gross dividend in PLN, or null when the exchange rate is missing
 */
export const dividendGrossPLN = (d: Dividend): number | null => {
    const rate = dividendRate(d);
    return rate === null ? null : (d.totalAmount || 0) * rate;
};

/**
 * Net dividend credited to cash (gross minus tax withheld at source), in PLN
 */
export const dividendNetPLN = (d: Dividend): number | null => {
    const gross = dividendGrossPLN(d);
    return gross === null ? null : gross * (1 - dividendWithholdingRate(d) / 100);
};

/**
 * Round to full złoty per art. 63 Ordynacji podatkowej (below 50 gr down, from 50 gr up).
 * Rounds to grosze first to avoid floating-point artefacts like 12.4999999.
 */
export const roundToZloty = (value: number): number => Math.round(Math.round(value * 100) / 100);
