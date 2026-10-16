/**
 * Backfill of NBP tax rates (business day before the event, art. 11a ustawy o PIT)
 * for foreign-currency trades and dividends recorded without one.
 */

import { db } from '../db/db';
import { nbpService } from './NBPService';
import { dividendService } from './DividendService';
import { isBuyTransaction, isSellTransaction } from '../types/database';

export interface BackfillResult {
    filled: number;
    missing: number;
}

export const backfillTaxRates = async (): Promise<BackfillResult> => {
    const candidates = await db.transactions
        .filter(
            t =>
                (isBuyTransaction(t.type) || isSellTransaction(t.type)) &&
                (t.currency || 'PLN') !== 'PLN' &&
                !(t.taxExchangeRate && t.taxExchangeRate > 0)
        )
        .toArray();

    let filled = 0;
    for (const tx of candidates) {
        const rate = await nbpService.getTaxRate(tx.currency!, tx.date.slice(0, 10));
        if (!rate) continue;
        // taxExchangeRate does not affect cash or holdings, so no ledger replay is needed
        await db.transactions.update(tx.id!, { taxExchangeRate: rate.rate });
        filled++;
    }

    const dividends = await dividendService.backfillMissingRates();
    return {
        filled: filled + dividends.filled,
        missing: candidates.length - filled + dividends.missing
    };
};
