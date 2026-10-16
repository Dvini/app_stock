/**
 * Ledger reconciliation helpers operating on Dexie tables passed in by the caller.
 * No dependency on the db singleton, so the DB migration (db.ts) can use them.
 */

import type { Table } from 'dexie';
import type { Asset, Cash, Dividend, Transaction } from '../types/database';
import { replayLedger, type LedgerResult } from './ledger';
import { datePart, todayLocal } from '../utils/dates';

export interface LedgerTables {
    transactions: Table<Transaction, number>;
    assets: Table<Asset, number>;
    cash: Table<Cash, number>;
    dividends: Table<Dividend, number>;
}

export const CORRECTION_NOTE = 'Korekta salda (uzgodnienie z historią)';

export const loadPortfolioTransactions = (tables: LedgerTables, portfolioId: number): Promise<Transaction[]> =>
    tables.transactions.filter(t => (t.portfolioId ?? 1) === portfolioId).toArray();

export const loadPortfolioDividends = (tables: LedgerTables, portfolioId: number): Promise<Dividend[]> =>
    tables.dividends.filter(d => (d.portfolioId ?? 1) === portfolioId).toArray();

/**
 * Replay one portfolio from the tables and refresh its snapshot (after dividend changes, day change)
 */
export const refreshPortfolio = async (tables: LedgerTables, portfolioId: number): Promise<LedgerResult> => {
    const result = replayLedger(
        await loadPortfolioTransactions(tables, portfolioId),
        await loadPortfolioDividends(tables, portfolioId)
    );
    await materializePortfolio(tables, portfolioId, result);
    return result;
};

/**
 * Overwrite the `assets` and `cash` rows of a portfolio with a ledger result.
 * Asset ids are preserved per ticker so UI keys stay stable.
 */
export const materializePortfolio = async (
    tables: LedgerTables,
    portfolioId: number,
    result: LedgerResult
): Promise<void> => {
    const existing = await tables.assets.filter(a => (a.portfolioId ?? 1) === portfolioId).toArray();
    const byTicker = new Map(existing.map(a => [a.ticker.toUpperCase(), a]));
    const kept = new Set<number>();

    const rows: Asset[] = result.holdings.map(h => {
        const prev = byTicker.get(h.ticker);
        if (prev?.id !== undefined) kept.add(prev.id);
        return {
            ...(prev?.id !== undefined ? { id: prev.id } : {}),
            portfolioId,
            ticker: h.ticker,
            type: prev?.type ?? 'stock',
            amount: h.amount,
            avgPrice: h.avgPrice,
            currency: h.currency
        };
    });

    const stale = existing.filter(a => a.id !== undefined && !kept.has(a.id)).map(a => a.id!);
    if (stale.length) await tables.assets.bulkDelete(stale);
    if (rows.length) await tables.assets.bulkPut(rows);

    const cashRows = await tables.cash.filter(c => (c.portfolioId ?? 1) === portfolioId).toArray();
    const plnRow = cashRows.find(c => c.currency === 'PLN');
    const extra = cashRows.filter(c => c !== plnRow && c.id !== undefined).map(c => c.id!);
    if (extra.length) await tables.cash.bulkDelete(extra);
    if (plnRow?.id !== undefined) {
        await tables.cash.update(plnRow.id, { amount: result.cashPLN });
    } else {
        await tables.cash.add({ portfolioId, currency: 'PLN', amount: result.cashPLN });
    }
};

const fmt = (n: number): string => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Align stored balances with the transaction history for the given portfolios.
 *
 * - PLN cash differences get a correction deposit (dated at the first transaction) or
 *   withdrawal (dated today), so the displayed cash does not change
 * - share differences and non-PLN cash are only reported; the history wins
 * - existing history problems (uncovered buys, oversold shares) are reported
 * - when stored cash predates dividend crediting (`storedCashIncludesDividends: false`), the
 *   comparison ignores dividends and the newly credited amount is reported
 *
 * Must run inside a rw transaction covering the tables. Returns report lines.
 */
export const reconcileAll = async (
    tables: LedgerTables,
    portfolios: Array<{ id?: number; name: string }>,
    { storedCashIncludesDividends }: { storedCashIncludesDividends: boolean }
): Promise<string[]> => {
    const report: string[] = [];

    for (const p of portfolios) {
        const portfolioId = p.id ?? 1;
        const label = `[${p.name}]`;
        const txs = await loadPortfolioTransactions(tables, portfolioId);
        const dividends = await loadPortfolioDividends(tables, portfolioId);
        let result = replayLedger(txs, dividends);

        const storedCash = await tables.cash.filter(c => (c.portfolioId ?? 1) === portfolioId).toArray();
        const storedPLN = storedCash.filter(c => c.currency === 'PLN').reduce((s, c) => s + (c.amount || 0), 0);
        storedCash
            .filter(c => c.currency !== 'PLN' && Math.abs(c.amount || 0) > 0.005)
            .forEach(c =>
                report.push(
                    `${label} Gotówka w ${c.currency} (${fmt(c.amount)}) nie jest obsługiwana i została pominięta — dodaj ją jako wpłatę w PLN.`
                )
            );

        const expectedStored = storedCashIncludesDividends ? result.cashPLN : result.cashPLN - result.dividendsPLN;
        const diff = storedPLN - expectedStored;
        if (Math.abs(diff) > 0.005) {
            const amount = Math.round(Math.abs(diff) * 100) / 100;
            const firstDate = txs.map(t => datePart(t.date)).sort()[0];
            const correction: Transaction = {
                portfolioId,
                date: diff > 0 ? (firstDate ?? todayLocal()) : todayLocal(),
                type: diff > 0 ? 'Wpłata' : 'Wypłata',
                ticker: 'CASH',
                amount: 1,
                price: amount,
                total: amount,
                currency: 'PLN',
                exchangeRate: 1,
                note: CORRECTION_NOTE
            };
            await tables.transactions.add(correction);
            report.push(
                `${label} Saldo gotówki różniło się od historii o ${fmt(diff)} zł — dodano transakcję korygującą „${correction.type}” z dnia ${correction.date}.`
            );
            result = replayLedger([...txs, correction], dividends);
        }

        if (!storedCashIncludesDividends && result.dividendsPLN > 0.005) {
            report.push(
                `${label} Do gotówki doliczono ${fmt(result.dividendsPLN)} zł otrzymanych dywidend (netto). Jeśli wpisywałeś je wcześniej ręcznie jako wpłaty, usuń te wpłaty, żeby nie liczyć ich podwójnie.`
            );
        }
        if (result.unpricedDividends.length > 0) {
            report.push(
                `${label} ${result.unpricedDividends.length} dywidend bez kursu NBP nie zostało doliczonych do gotówki — uzupełnij kursy na stronie Podatki.`
            );
        }

        const storedAssets = await tables.assets.filter(a => (a.portfolioId ?? 1) === portfolioId).toArray();
        const storedByTicker = new Map<string, number>();
        storedAssets.forEach(a => {
            const t = a.ticker.toUpperCase();
            storedByTicker.set(t, (storedByTicker.get(t) ?? 0) + (a.amount || 0));
        });
        const ledgerByTicker = new Map(result.holdings.map(h => [h.ticker, h.amount]));
        const tickers = new Set([...storedByTicker.keys(), ...ledgerByTicker.keys()]);
        tickers.forEach(t => {
            const stored = storedByTicker.get(t) ?? 0;
            const derived = ledgerByTicker.get(t) ?? 0;
            if (Math.abs(stored - derived) > 0.000001) {
                report.push(
                    `${label} ${t}: zapisane ${stored} szt., z historii transakcji wynika ${derived} szt. Obowiązuje historia — dodaj brakującą transakcję, jeśli trzeba.`
                );
            }
        });

        result.violations.forEach(v => report.push(`${label} ${v.message}`));

        await materializePortfolio(tables, portfolioId, result);
    }

    return report;
};

export interface LedgerReport {
    createdAt: string;
    source: 'migration' | 'import';
    items: string[];
}

const REPORT_KEY = 'ledger_report';

export const saveLedgerReport = (source: LedgerReport['source'], items: string[]): void => {
    try {
        if (items.length === 0) return;
        const report: LedgerReport = { createdAt: new Date().toISOString(), source, items };
        localStorage.setItem(REPORT_KEY, JSON.stringify(report));
    } catch {
        // storage unavailable - report is informational only
    }
};

export const loadLedgerReport = (): LedgerReport | null => {
    try {
        const raw = localStorage.getItem(REPORT_KEY);
        return raw ? (JSON.parse(raw) as LedgerReport) : null;
    } catch {
        return null;
    }
};

export const clearLedgerReport = (): void => {
    try {
        localStorage.removeItem(REPORT_KEY);
    } catch {
        // ignore
    }
};
