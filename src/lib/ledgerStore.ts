/**
 * Transaction writes. Every change is validated by replaying the portfolio history and
 * refreshes the materialized `assets` / `cash` snapshot in the same DB transaction.
 */

import type { Table } from 'dexie';
import { db } from '../db/db';
import type { Asset, Cash, Dividend, Transaction } from '../types/database';
import { replayLedger, newViolations, type LedgerViolation } from './ledger';
import {
    loadPortfolioDividends,
    loadPortfolioTransactions,
    materializePortfolio,
    reconcileAll,
    refreshPortfolio,
    saveLedgerReport,
    type LedgerReport,
    type LedgerTables
} from './ledgerReconcile';

const dbTables = (): LedgerTables => ({
    transactions: db.transactions as Table<Transaction, number>,
    assets: db.assets as Table<Asset, number>,
    cash: db.portfolioCash as Table<Cash, number>,
    dividends: db.dividends as Table<Dividend, number>
});

const ledgerScope = () => [db.transactions, db.assets, db.portfolioCash, db.dividends];

/**
 * Thrown when a change would make cash or shares negative at some point in history
 */
export class LedgerError extends Error {
    constructor(public readonly violations: LedgerViolation[]) {
        super(violations.map(v => v.message).join('\n'));
        this.name = 'LedgerError';
    }
}

/**
 * Validate a change to one portfolio's history and persist it atomically.
 * `apply` receives the current transactions and returns the proposed ones.
 */
const commitChange = async (
    portfolioId: number,
    apply: (current: Transaction[]) => Transaction[],
    write: (tables: LedgerTables) => Promise<number | void>
): Promise<number | void> => {
    const tables = dbTables();
    return db.transaction('rw', ledgerScope(), async () => {
        const current = await loadPortfolioTransactions(tables, portfolioId);
        const dividends = await loadPortfolioDividends(tables, portfolioId);
        const before = replayLedger(current, dividends);
        const after = replayLedger(apply(current), dividends);
        const introduced = newViolations(before.violations, after.violations);
        if (introduced.length) throw new LedgerError(introduced);

        const result = await write(tables);
        await materializePortfolio(tables, portfolioId, after);
        return result;
    });
};

/**
 * Add a transaction. Throws LedgerError if it breaks cash/share coverage at any date.
 */
export const addTransaction = async (tx: Transaction): Promise<number> => {
    const portfolioId = tx.portfolioId ?? 1;
    const record: Transaction = { ...tx, portfolioId };
    const id = await commitChange(
        portfolioId,
        current => [...current, record],
        tables => tables.transactions.add(record)
    );
    return id as number;
};

/**
 * Replace an existing transaction (same id). Moving between portfolios is not supported.
 */
export const updateTransaction = async (tx: Transaction & { id: number }): Promise<void> => {
    const portfolioId = tx.portfolioId ?? 1;
    await commitChange(
        portfolioId,
        current => current.map(t => (t.id === tx.id ? tx : t)),
        async tables => {
            await tables.transactions.put(tx);
        }
    );
};

/**
 * Delete a transaction. Throws LedgerError if later transactions lose coverage.
 */
export const deleteTransaction = async (tx: Transaction & { id: number }): Promise<void> => {
    await commitChange(
        tx.portfolioId ?? 1,
        current => current.filter(t => t.id !== tx.id),
        tables => tables.transactions.delete(tx.id)
    );
};

/**
 * Current violations of a portfolio (legacy data problems), without changing anything
 */
export const getPortfolioViolations = async (portfolioId: number): Promise<LedgerViolation[]> => {
    const tables = dbTables();
    return replayLedger(
        await loadPortfolioTransactions(tables, portfolioId),
        await loadPortfolioDividends(tables, portfolioId)
    ).violations;
};

/**
 * Recompute snapshots after changes outside transactions (dividends added/edited/removed)
 * or when the date moves on (dividends become paid). All portfolios when no ids are given.
 */
export const refreshSnapshots = async (portfolioIds?: number[]): Promise<void> => {
    const tables = dbTables();
    await db.transaction('rw', [db.portfolios, ...ledgerScope()], async () => {
        const ids = portfolioIds ?? (await db.portfolios.toArray()).map(p => p.id ?? 1);
        for (const id of new Set(ids)) {
            await refreshPortfolio(tables, id);
        }
    });
};

/**
 * Reconcile the whole database (after JSON import)
 */
export const reconcileDatabase = async (
    source: LedgerReport['source'],
    options: { storedCashIncludesDividends: boolean }
): Promise<string[]> => {
    const items = await db.transaction('rw', [db.portfolios, ...ledgerScope()], async () =>
        reconcileAll(dbTables(), await db.portfolios.toArray(), options)
    );
    saveLedgerReport(source, items);
    return items;
};
