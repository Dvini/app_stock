/**
 * "What if I sold now" - runs a hypothetical sell through the same FIFO matching as PIT-38,
 * so the simulated result is exactly what the tax report would show for that sale.
 */

import type { CurrencyCode, PortfolioAccount, Transaction } from '../types/database';
import { isBuyTransaction, isSellTransaction } from '../types/database';
import { cashImpactPLN } from '../lib/ledger';
import { matchFIFOClosedTrades, type ClosedTrade, type ClosedTradeLot } from './taxCalculations';

/** Sorts after every real transaction of the same day */
const HYPOTHETICAL_TX_ID = Number.MAX_SAFE_INTEGER;

export interface SellSimulationParams {
    transactions: Transaction[];
    portfolios: PortfolioAccount[];
    portfolioId: number;
    ticker: string;
    shares: number;
    price: number;
    currency: CurrencyCode;
    date: string;
    /** Broker rate applied to cash */
    brokerRate: number;
    /** NBP rate from the business day before `date`; null falls back to the broker rate (flagged) */
    nbpTaxRate: number | null;
    commission?: number;
    commissionCurrency?: CurrencyCode;
}

export interface SimulatedLot extends ClosedTradeLot {
    revenuePLN: number;
    /** Gain from the share price change, valued at the purchase NBP rate */
    priceGainPLN: number;
    /** Gain from the exchange rate change between purchase and sale */
    fxGainPLN: number;
    /** Revenue minus cost and both commissions of this lot */
    gainPLN: number;
}

export interface SellSimulation {
    trade: ClosedTrade;
    lots: SimulatedLot[];
    /** Shares held in this portfolio before the sale */
    heldShares: number;
    /** Gain in the asset's currency, commissions excluded */
    gainNative: number;
    gainNativePercent: number;
    priceGainPLN: number;
    fxGainPLN: number;
    /** Dochód / strata as a % of the tax cost (KUP) */
    gainPercent: number;
    /** Gain left after the tax on this sale alone */
    afterTaxPLN: number;
    /** Cash credited to the account, PLN (broker rate, commission deducted) */
    netCashPLN: number;
}

export type SellSimulationOutcome = { ok: true; result: SellSimulation } | { ok: false; heldShares: number };

const isSameHolding = (tx: Transaction, portfolioId: number, ticker: string): boolean =>
    (tx.portfolioId ?? 1) === portfolioId &&
    (tx.ticker || '').toUpperCase() === ticker &&
    (isBuyTransaction(tx.type) || isSellTransaction(tx.type));

/**
 * Shares of `ticker` held in a portfolio after all its buys and sells
 */
export const heldSharesOf = (transactions: Transaction[], portfolioId: number, ticker: string): number => {
    const symbol = ticker.toUpperCase();
    return transactions
        .filter(tx => isSameHolding(tx, portfolioId, symbol))
        .reduce((sum, tx) => sum + (isBuyTransaction(tx.type) ? tx.amount : -tx.amount), 0);
};

export const simulateSell = (params: SellSimulationParams): SellSimulationOutcome => {
    const ticker = params.ticker.toUpperCase();
    const history = params.transactions.filter(tx => isSameHolding(tx, params.portfolioId, ticker));
    const heldShares = heldSharesOf(history, params.portfolioId, ticker);

    if (params.shares <= 0 || params.shares > heldShares + 0.000001) {
        return { ok: false, heldShares };
    }

    const isForeign = params.currency !== 'PLN';
    const commission = params.commission && params.commission > 0 ? params.commission : undefined;
    const hypothetical: Transaction = {
        id: HYPOTHETICAL_TX_ID,
        portfolioId: params.portfolioId,
        date: params.date,
        type: 'Sprzedaż',
        ticker,
        amount: params.shares,
        price: params.price,
        total: params.shares * params.price,
        currency: params.currency,
        exchangeRate: isForeign ? params.brokerRate : 1,
        taxExchangeRate: isForeign && params.nbpTaxRate ? params.nbpTaxRate : undefined,
        commission,
        commissionCurrency: commission ? (params.commissionCurrency ?? 'PLN') : undefined
    };

    const trade = matchFIFOClosedTrades([...history, hypothetical], params.portfolios).find(
        t => t.id === `trade-${HYPOTHETICAL_TX_ID}`
    );
    if (!trade) return { ok: false, heldShares };

    const sellRate = trade.sellExchangeRate;
    const sellCommPerShare = trade.shares > 0 ? trade.sellCommissionPLN / trade.shares : 0;
    const lots: SimulatedLot[] = trade.lots.map(lot => {
        const revenuePLN = lot.shares * trade.sellPriceNative * sellRate;
        const priceGainPLN = lot.shares * (trade.sellPriceNative - lot.buyPriceNative) * lot.buyExchangeRate;
        const fxGainPLN = lot.shares * trade.sellPriceNative * (sellRate - lot.buyExchangeRate);
        return {
            ...lot,
            revenuePLN,
            priceGainPLN,
            fxGainPLN,
            gainPLN: revenuePLN - lot.buyCostPLN - lot.buyCommissionPLN - lot.shares * sellCommPerShare
        };
    });

    const buyCostNative = trade.lots.reduce((sum, lot) => sum + lot.shares * lot.buyPriceNative, 0);
    const gainNative = trade.shares * trade.sellPriceNative - buyCostNative;

    return {
        ok: true,
        result: {
            trade,
            lots,
            heldShares,
            gainNative,
            gainNativePercent: buyCostNative > 0 ? (gainNative / buyCostNative) * 100 : 0,
            priceGainPLN: lots.reduce((sum, lot) => sum + lot.priceGainPLN, 0),
            fxGainPLN: lots.reduce((sum, lot) => sum + lot.fxGainPLN, 0),
            gainPercent: trade.totalCostPLN > 0 ? (trade.gainLossPLN / trade.totalCostPLN) * 100 : 0,
            afterTaxPLN: trade.gainLossPLN - trade.taxLiabilityPLN,
            netCashPLN: cashImpactPLN(hypothetical)
        }
    };
};
