/**
 * Ledger: derives holdings and cash of a single portfolio by replaying its transactions.
 *
 * Transactions are the only source of truth. The `assets` and `cash` tables are a
 * materialized snapshot of `replayLedger()` output (see ledgerStore.ts) and are never
 * edited directly.
 */

import type { CurrencyCode, Dividend, Transaction } from '../types/database';
import { isBuyTransaction, isSellTransaction, isDepositTransaction, isWithdrawTransaction } from '../types/database';
import { datePart, todayLocal } from '../utils/dates';
import { dividendNetPLN } from '../utils/dividendTax';

const EPS = 0.000001;
const CASH_EPS = 0.005; // half a grosz

export interface LedgerHolding {
    ticker: string;
    currency: CurrencyCode;
    amount: number;
    /** Average purchase price in the asset's currency, buy commissions included */
    avgPrice: number;
    /** Remaining purchase cost in PLN (at transaction exchange rates), buy commissions included */
    costPLN: number;
}

export type LedgerViolationKind = 'cash' | 'shares' | 'currency';

export interface LedgerViolation {
    kind: LedgerViolationKind;
    txId?: number;
    date: string;
    type: Transaction['type'];
    ticker?: string;
    /** PLN missing (cash) or shares missing (shares); 0 for currency */
    shortfall: number;
    message: string;
}

export interface LedgerResult {
    holdings: LedgerHolding[];
    cashPLN: number;
    violations: LedgerViolation[];
    /** Net dividends credited to cash, PLN */
    dividendsPLN: number;
    /** Paid dividends left out of cash because their exchange rate is missing */
    unpricedDividends: Dividend[];
}

/**
 * Order of operations within one day: deposits, buys, sells, withdrawals (then entry order).
 * Buys before sells lets a same-day buy+sell (day trade) work and matches FIFO lot order;
 * cash is checked at end of day, so a sell can still fund a same-day buy.
 */
const dayPriority = (type: Transaction['type']): number => {
    if (isDepositTransaction(type)) return 0;
    if (isBuyTransaction(type)) return 1;
    if (isSellTransaction(type)) return 2;
    if (isWithdrawTransaction(type)) return 3;
    return 4;
};

/**
 * Chronological order used everywhere a history is replayed (ledger, FIFO, dividends)
 */
export const compareTransactions = (a: Transaction, b: Transaction): number => {
    const byDate = datePart(a.date).localeCompare(datePart(b.date));
    if (byDate !== 0) return byDate;
    const byType = dayPriority(a.type) - dayPriority(b.type);
    if (byType !== 0) return byType;
    return (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
};

export const sortTransactions = (transactions: Transaction[]): Transaction[] =>
    [...transactions].sort(compareTransactions);

/**
 * Commission converted to PLN. Commission is either in PLN or in the transaction currency.
 */
export const commissionToPLN = (
    tx: Pick<Transaction, 'commission' | 'commissionCurrency' | 'exchangeRate'>
): number => {
    const commission = tx.commission || 0;
    if (!commission) return 0;
    if (!tx.commissionCurrency || tx.commissionCurrency === 'PLN') return commission;
    return commission * (tx.exchangeRate || 1);
};

/**
 * Commission converted to the asset (transaction) currency
 */
const commissionToAssetCurrency = (tx: Transaction): number => {
    const commission = tx.commission || 0;
    if (!commission) return 0;
    const currency = tx.currency || 'PLN';
    if (!tx.commissionCurrency || tx.commissionCurrency === currency) return commission;
    if (tx.commissionCurrency === 'PLN') return commission / (tx.exchangeRate || 1);
    return commission;
};

/**
 * Cash effect of a transaction in PLN (positive = money in)
 */
export const cashImpactPLN = (tx: Transaction): number => {
    const rate = tx.exchangeRate || 1;
    if (isDepositTransaction(tx.type)) return tx.total * rate;
    if (isWithdrawTransaction(tx.type)) return -tx.total * rate;
    const gross = tx.amount * (tx.price || 0) * rate;
    if (isBuyTransaction(tx.type)) return -(gross + commissionToPLN(tx));
    if (isSellTransaction(tx.type)) return gross - commissionToPLN(tx);
    return 0;
};

const fmt = (n: number): string => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Replay transactions of ONE portfolio and return its holdings, cash and rule violations.
 * Dividends paid up to `today` add their net amount (after withholding tax) to cash on the payment date,
 * before that day's transactions.
 *
 * Violations (the replay continues past them so all problems are reported):
 * - cash: cash is below zero at the end of a day with outflows (attributed to the last outflow)
 * - shares: selling more shares than held on that date
 * - currency: buying/selling a ticker in a different currency than its first transaction
 */
export const replayLedger = (
    transactions: Transaction[],
    dividends: Dividend[] = [],
    today: string = todayLocal()
): LedgerResult => {
    const positions = new Map<string, LedgerHolding>();
    const tickerCurrency = new Map<string, CurrencyCode>();
    const violations: LedgerViolation[] = [];
    let cash = 0;

    // Cash coverage is checked at the end of each day, so a same-day sell can fund a buy.
    // A shortfall is attributed to the day's last cash outflow (buy or withdrawal).
    let currentDay = '';
    let dayOutflow = 0;
    let lastOutflow: Transaction | null = null;
    const closeDay = () => {
        if (lastOutflow && cash < -CASH_EPS) {
            const missing = Math.min(-cash, dayOutflow);
            const ticker = (lastOutflow.ticker || '').toUpperCase();
            const isTrade = isBuyTransaction(lastOutflow.type) || isSellTransaction(lastOutflow.type);
            const what = isTrade && ticker ? `${lastOutflow.type} ${ticker}` : lastOutflow.type;
            violations.push({
                kind: 'cash',
                txId: lastOutflow.id,
                date: currentDay,
                type: lastOutflow.type,
                ticker: isTrade ? ticker : undefined,
                shortfall: missing,
                message: `${what} ${currentDay}: brak pokrycia w gotówce (na koniec dnia brakuje ${fmt(missing)} zł)`
            });
        }
        dayOutflow = 0;
        lastOutflow = null;
    };

    const unpricedDividends: Dividend[] = [];
    const credits = dividends
        .filter(d => (d.totalAmount || 0) > 0 && d.paymentDate && datePart(d.paymentDate) <= today)
        .flatMap(d => {
            const net = dividendNetPLN(d);
            if (net === null) {
                unpricedDividends.push(d);
                return [];
            }
            return [{ date: datePart(d.paymentDate), net }];
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    let dividendsPLN = 0;
    let nextCredit = 0;
    const creditDividendsUpTo = (date: string) => {
        while (nextCredit < credits.length && credits[nextCredit]!.date <= date) {
            const credit = credits[nextCredit++]!;
            if (credit.date !== currentDay) {
                closeDay();
                currentDay = credit.date;
            }
            cash += credit.net;
            dividendsPLN += credit.net;
        }
    };

    for (const tx of sortTransactions(transactions)) {
        const date = datePart(tx.date);
        creditDividendsUpTo(date);
        const isTrade = isBuyTransaction(tx.type) || isSellTransaction(tx.type);
        const ticker = (tx.ticker || '').toUpperCase();

        if (isTrade && ticker) {
            const currency = (tx.currency || 'PLN') as CurrencyCode;
            const locked = tickerCurrency.get(ticker);
            if (!locked) {
                tickerCurrency.set(ticker, currency);
            } else if (locked !== currency) {
                violations.push({
                    kind: 'currency',
                    txId: tx.id,
                    date,
                    type: tx.type,
                    ticker,
                    shortfall: 0,
                    message: `${tx.type} ${ticker} ${date}: waluta ${currency} różni się od waluty pozycji (${locked})`
                });
            }

            const pos = positions.get(ticker) ?? {
                ticker,
                currency: locked ?? currency,
                amount: 0,
                avgPrice: 0,
                costPLN: 0
            };

            if (isBuyTransaction(tx.type)) {
                const costNative = tx.amount * (tx.price || 0) + commissionToAssetCurrency(tx);
                const costPLN = tx.amount * (tx.price || 0) * (tx.exchangeRate || 1) + commissionToPLN(tx);
                const newAmount = pos.amount + tx.amount;
                pos.avgPrice = newAmount > EPS ? (pos.amount * pos.avgPrice + costNative) / newAmount : 0;
                pos.costPLN += costPLN;
                pos.amount = newAmount;
            } else {
                if (tx.amount > pos.amount + EPS) {
                    const missing = tx.amount - pos.amount;
                    violations.push({
                        kind: 'shares',
                        txId: tx.id,
                        date,
                        type: tx.type,
                        ticker,
                        shortfall: missing,
                        message: `Sprzedaż ${ticker} ${date}: brakuje ${missing} szt. (posiadane: ${pos.amount})`
                    });
                }
                const sold = Math.min(tx.amount, pos.amount);
                pos.costPLN = pos.amount > EPS ? pos.costPLN * (1 - sold / pos.amount) : 0;
                pos.amount = Math.max(0, pos.amount - tx.amount);
                if (pos.amount <= EPS) {
                    pos.amount = 0;
                    pos.avgPrice = 0;
                    pos.costPLN = 0;
                }
            }
            positions.set(ticker, pos);
        }

        if (date !== currentDay) {
            closeDay();
            currentDay = date;
        }

        const impact = cashImpactPLN(tx);
        cash += impact;
        if (impact < 0) {
            dayOutflow += -impact;
            lastOutflow = tx;
        }
    }
    creditDividendsUpTo('9999-12-31');
    closeDay();

    const holdings = [...positions.values()].filter(p => p.amount > EPS);
    return { holdings, cashPLN: cash, violations, dividendsPLN, unpricedDividends };
};

const violationKey = (v: LedgerViolation): string => `${v.kind}:${v.txId ?? ''}:${v.date}:${v.ticker ?? ''}`;

/**
 * Violations present in `after` that were not already present in `before`.
 * Used to block a change only for problems it introduces (legacy problems are reported, not blocking).
 */
export const newViolations = (before: LedgerViolation[], after: LedgerViolation[]): LedgerViolation[] => {
    const known = new Set(before.map(violationKey));
    return after.filter(v => !known.has(violationKey(v)));
};
