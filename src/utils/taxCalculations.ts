import type { Transaction, PortfolioAccount, Dividend } from '../types/database';
import { isBuyTransaction, isSellTransaction } from '../types/database';
import { sortTransactions } from '../lib/ledger';
import { datePart, todayLocal } from './dates';
import {
    PL_DIVIDEND_TAX_RATE,
    dividendGrossPLN,
    dividendWithholdingRate,
    isForeignDividend,
    roundToZloty
} from './dividendTax';
import { logger } from './logger';

const BELKA_RATE = 0.19;

/**
 * PLN conversion rate for tax: the NBP rate from the business day before the transaction
 * (art. 11a). Older transactions without it fall back to the broker rate and are flagged.
 */
const taxRateOf = (tx: Transaction): { rate: number; fallback: boolean } => {
    if ((tx.currency || 'PLN') === 'PLN') return { rate: 1, fallback: false };
    if (tx.taxExchangeRate && tx.taxExchangeRate > 0) return { rate: tx.taxExchangeRate, fallback: false };
    return { rate: tx.exchangeRate || 1, fallback: true };
};

export interface ClosedTradeLot {
    buyDate: string;
    shares: number;
    buyPriceNative: number;
    buyExchangeRate: number;
    buyCostPLN: number;
    buyCommissionPLN: number;
}

export interface ClosedTrade {
    id: string;
    portfolioId: number;
    portfolioName?: string;
    isTaxExempt: boolean; // true for IKE/IKZE (0% Belka)
    taxRate: number;
    ticker: string;
    sellDate: string;
    sellYear: number;
    shares: number;
    sellPriceNative: number;
    sellCurrency: string;
    sellExchangeRate: number;
    sellCommissionPLN: number;
    revenuePLN: number; // Przychód ze sprzedaży (Art. 17 ust. 1 pkt 6)
    costBasisPLN: number; // Koszt zakupu partii FIFO (Art. 22 ust. 8)
    totalCommissionPLN: number; // Prowizje zakupu i sprzedaży wliczone w KUP
    totalCostPLN: number; // Koszty uzyskania przychodów łącznie (KUP)
    gainLossPLN: number; // Dochód / Strata
    taxLiabilityPLN: number; // Należny podatek 19%
    lots: ClosedTradeLot[];
    /** Shares sold without a matching earlier buy (cost basis unknown, counted as 0) */
    unmatchedShares: number;
    /** Some leg lacks the NBP tax rate and was converted at the broker rate instead */
    usesBrokerRate: boolean;
}

export interface PIT38Summary {
    year: number;
    portfolioId: number | 'TAXABLE_ALL';
    revenuePLN: number; // Przychód (poz. 20)
    costPLN: number; // Koszty uzyskania przychodów (poz. 21)
    incomePLN: number; // Dochód
    lossPLN: number; // Strata
    taxBasePLN: number; // Podstawa opodatkowania - dochód zaokrąglony do pełnych zł (art. 63 Ordynacji)
    taxDuePLN: number; // Podatek należny 19% od podstawy, zaokrąglony do pełnych zł
    tradeCount: number;
    brokerRateTradeCount: number; // Transakcje przeliczone kursem brokera zamiast NBP (do uzupełnienia)
    taxSavedIKEPLN: number; // Kwota podatku zaoszczędzona dzięki IKE/IKZE
}

/**
 * Calculate net profit/loss and estimated Belka tax reserve for an open position
 */
export const calculateNetProfitLoss = (grossPL: number, taxRate: number = 19): { netPL: number; taxAmount: number } => {
    if (taxRate <= 0 || grossPL <= 0) {
        return { netPL: grossPL, taxAmount: 0 };
    }
    const taxAmount = grossPL * (taxRate / 100);
    const netPL = grossPL - taxAmount;
    return { netPL, taxAmount };
};

interface BuyLot {
    id: number | string;
    date: string;
    remainingShares: number;
    price: number;
    currency: string;
    exchangeRate: number;
    rateFallback: boolean;
    commissionPerSharePLN: number;
}

/**
 * Match transactions using FIFO (First In, First Out) per portfolio and ticker
 */
export const matchFIFOClosedTrades = (
    transactions: Transaction[],
    portfolios: PortfolioAccount[] = []
): ClosedTrade[] => {
    const portfolioMap = new Map<number, PortfolioAccount>();
    portfolios.forEach(p => {
        if (p.id) portfolioMap.set(p.id, p);
    });

    // Filter only buy and sell transactions, and sort chronologically
    const relevantTxs = sortTransactions(
        transactions.filter(t => isBuyTransaction(t.type) || isSellTransaction(t.type))
    );

    // Buy inventory: Map key is `${portfolioId}-${ticker}`
    const buyInventory = new Map<string, BuyLot[]>();
    const closedTrades: ClosedTrade[] = [];

    for (const tx of relevantTxs) {
        const ticker = (tx.ticker || '').toUpperCase();
        if (!ticker) continue;

        const portId = tx.portfolioId ?? 1;
        const key = `${portId}-${ticker}`;
        const pAccount = portfolioMap.get(portId);
        const taxRate = pAccount?.taxRate ?? 19;
        const isTaxExempt = taxRate === 0;
        const { rate: exchangeRate, fallback: rateFallback } = taxRateOf(tx);
        const price = tx.price || 0;

        if (isBuyTransaction(tx.type)) {
            const queue = buyInventory.get(key) || [];
            const commPLN =
                (tx.commission || 0) * (tx.commissionCurrency && tx.commissionCurrency !== 'PLN' ? exchangeRate : 1);
            const commPerShare = tx.amount > 0 ? commPLN / tx.amount : 0;

            queue.push({
                id: tx.id || Math.random(),
                date: tx.date,
                remainingShares: tx.amount,
                price,
                currency: tx.currency || 'PLN',
                exchangeRate,
                rateFallback,
                commissionPerSharePLN: commPerShare
            });
            buyInventory.set(key, queue);
        } else {
            const queue = buyInventory.get(key) || [];
            let sharesToSell = tx.amount;
            const lots: ClosedTradeLot[] = [];
            let buyCostPLN = 0;
            let buyCommissionPLN = 0;
            let usesBrokerRate = rateFallback;

            while (sharesToSell > 0.000001 && queue.length > 0) {
                const oldestLot = queue[0];
                if (!oldestLot) break;
                const takenShares = Math.min(sharesToSell, oldestLot.remainingShares);

                const lotCost = takenShares * oldestLot.price * oldestLot.exchangeRate;
                if (oldestLot.rateFallback) usesBrokerRate = true;
                const lotComm = takenShares * oldestLot.commissionPerSharePLN;

                buyCostPLN += lotCost;
                buyCommissionPLN += lotComm;

                lots.push({
                    buyDate: oldestLot.date,
                    shares: takenShares,
                    buyPriceNative: oldestLot.price,
                    buyExchangeRate: oldestLot.exchangeRate,
                    buyCostPLN: lotCost,
                    buyCommissionPLN: lotComm
                });

                oldestLot.remainingShares -= takenShares;
                sharesToSell -= takenShares;

                if (oldestLot.remainingShares <= 0.000001) {
                    queue.shift();
                }
            }

            const sellCommPLN =
                (tx.commission || 0) * (tx.commissionCurrency && tx.commissionCurrency !== 'PLN' ? exchangeRate : 1);
            const revenuePLN = tx.amount * price * exchangeRate;
            const totalCostPLN = buyCostPLN + buyCommissionPLN + sellCommPLN;
            const gainLossPLN = revenuePLN - totalCostPLN;

            const taxLiabilityPLN = !isTaxExempt && gainLossPLN > 0 ? gainLossPLN * (taxRate / 100) : 0;

            const sellDateObj = new Date(tx.date);
            const sellYear = !isNaN(sellDateObj.getTime())
                ? sellDateObj.getFullYear()
                : parseInt(tx.date.substring(0, 4), 10) || new Date().getFullYear();

            closedTrades.push({
                id: `trade-${tx.id || Math.random()}`,
                portfolioId: portId,
                portfolioName: pAccount?.name || 'Główny',
                isTaxExempt,
                taxRate,
                ticker,
                sellDate: tx.date,
                sellYear,
                shares: tx.amount,
                sellPriceNative: price,
                sellCurrency: tx.currency || 'PLN',
                sellExchangeRate: exchangeRate,
                sellCommissionPLN: sellCommPLN,
                revenuePLN,
                costBasisPLN: buyCostPLN,
                totalCommissionPLN: buyCommissionPLN + sellCommPLN,
                totalCostPLN,
                gainLossPLN,
                taxLiabilityPLN,
                lots,
                unmatchedShares: sharesToSell > 0.000001 ? sharesToSell : 0,
                usesBrokerRate
            });
        }
    }

    return closedTrades;
};

/**
 * Generate PIT-38 summary report for a given tax year and portfolio scope
 */
export const generatePIT38Report = (
    closedTrades: ClosedTrade[],
    year: number,
    portfolioId: number | 'TAXABLE_ALL' = 'TAXABLE_ALL'
): PIT38Summary => {
    // Filter by year
    let tradesForYear = closedTrades.filter(t => t.sellYear === year);

    // Filter by portfolio:
    // If TAXABLE_ALL: only consider non-tax-exempt portfolios for tax calculations,
    // but track taxSaved on exempt ones!
    let taxableTrades: ClosedTrade[] = [];
    let taxSavedIKEPLN = 0;

    if (portfolioId === 'TAXABLE_ALL') {
        taxableTrades = tradesForYear.filter(t => !t.isTaxExempt);
        const exemptTrades = tradesForYear.filter(t => t.isTaxExempt);
        taxSavedIKEPLN = exemptTrades.reduce((sum, t) => {
            return t.gainLossPLN > 0 ? sum + t.gainLossPLN * 0.19 : sum;
        }, 0);
    } else {
        const selectedTrades = tradesForYear.filter(t => t.portfolioId === portfolioId);
        const isSelectedExempt = selectedTrades.some(t => t.isTaxExempt);

        if (isSelectedExempt) {
            taxableTrades = []; // IKE/IKZE is legally exempt from PIT-38
            taxSavedIKEPLN = selectedTrades.reduce((sum, t) => {
                return t.gainLossPLN > 0 ? sum + t.gainLossPLN * 0.19 : sum;
            }, 0);
        } else {
            taxableTrades = selectedTrades;
        }
    }

    const revenuePLN = taxableTrades.reduce((sum, t) => sum + t.revenuePLN, 0);
    const costPLN = taxableTrades.reduce((sum, t) => sum + t.totalCostPLN, 0);
    const netGain = revenuePLN - costPLN;

    const incomePLN = netGain > 0 ? netGain : 0;
    const lossPLN = netGain < 0 ? Math.abs(netGain) : 0;

    // Art. 63 Ordynacji podatkowej: tax base and tax are rounded to full złoty
    const taxBasePLN = roundToZloty(incomePLN);
    const taxDuePLN = roundToZloty(taxBasePLN * BELKA_RATE);

    return {
        year,
        portfolioId,
        revenuePLN,
        costPLN,
        incomePLN,
        lossPLN,
        taxBasePLN,
        taxDuePLN,
        tradeCount: taxableTrades.length,
        brokerRateTradeCount: taxableTrades.filter(t => t.usesBrokerRate).length,
        taxSavedIKEPLN
    };
};

export interface ForeignDividendRow {
    id?: number;
    portfolioId: number;
    portfolioName?: string;
    ticker: string;
    paymentDate: string;
    currency: string;
    grossNative: number;
    /** NBP rate from the business day before payment; null when missing */
    exchangeRate: number | null;
    grossPLN: number | null;
    withholdingRate: number;
    foreignTaxPLN: number | null;
    /** Polish tax 19% minus creditable foreign tax (credit capped at 19%) */
    taxToPayPLN: number | null;
}

export interface ForeignDividendSummary {
    year: number;
    rows: ForeignDividendRow[];
    grossPLN: number;
    /** 19% of gross, rounded to full złoty */
    taxPLN: number;
    /** Foreign tax that can be credited (max 19% of gross), rounded to full złoty */
    creditPLN: number;
    /** Amount to pay in Poland (tax minus credit, not below zero) */
    toPayPLN: number;
    /** Dividends left out because their NBP rate is missing */
    missingRateCount: number;
}

/**
 * Foreign dividends for PIT-38 part G: taxable accounts only, paid in `year` (up to today).
 * Polish dividends are excluded - the paying broker settles them as the final 19% tax.
 */
export const generateForeignDividendReport = (
    dividends: Dividend[],
    portfolios: PortfolioAccount[],
    year: number,
    portfolioId: number | 'TAXABLE_ALL' = 'TAXABLE_ALL'
): ForeignDividendSummary => {
    const byId = new Map(portfolios.map(p => [p.id ?? 1, p]));
    const today = todayLocal();

    const rows: ForeignDividendRow[] = dividends
        .filter(d => {
            const pid = d.portfolioId ?? 1;
            const taxable = (byId.get(pid)?.taxRate ?? 19) > 0;
            const paid = datePart(d.paymentDate) <= today && datePart(d.paymentDate).startsWith(String(year));
            const inScope = portfolioId === 'TAXABLE_ALL' || pid === portfolioId;
            return isForeignDividend(d) && taxable && paid && inScope && (d.totalAmount || 0) > 0;
        })
        .map(d => {
            const grossPLN = dividendGrossPLN(d);
            const withholdingRate = dividendWithholdingRate(d);
            const foreignTaxPLN = grossPLN === null ? null : (grossPLN * withholdingRate) / 100;
            const creditable =
                grossPLN === null ? null : (grossPLN * Math.min(withholdingRate, PL_DIVIDEND_TAX_RATE)) / 100;
            return {
                id: d.id,
                portfolioId: d.portfolioId ?? 1,
                portfolioName: byId.get(d.portfolioId ?? 1)?.name,
                ticker: d.ticker,
                paymentDate: d.paymentDate,
                currency: d.currency,
                grossNative: d.totalAmount || 0,
                exchangeRate: grossPLN === null ? null : grossPLN / (d.totalAmount || 1),
                grossPLN,
                withholdingRate,
                foreignTaxPLN,
                taxToPayPLN: grossPLN === null ? null : grossPLN * BELKA_RATE - creditable!
            };
        })
        .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));

    const priced = rows.filter(r => r.grossPLN !== null);
    const grossPLN = priced.reduce((s, r) => s + r.grossPLN!, 0);
    const creditRaw = priced.reduce(
        (s, r) => s + (r.grossPLN! * Math.min(r.withholdingRate, PL_DIVIDEND_TAX_RATE)) / 100,
        0
    );
    const taxPLN = roundToZloty(grossPLN * BELKA_RATE);
    const creditPLN = roundToZloty(creditRaw);

    return {
        year,
        rows,
        grossPLN,
        taxPLN,
        creditPLN,
        toPayPLN: Math.max(0, taxPLN - creditPLN),
        missingRateCount: rows.length - priced.length
    };
};

const csvDownload = (lines: string[], filename: string): void => {
    const csvContent = '﻿' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

/**
 * Export PIT-38 statement (share sales + foreign dividends) to CSV file
 */
export const exportPIT38ToCSV = (
    trades: ClosedTrade[],
    summary: PIT38Summary,
    year: number,
    dividends?: ForeignDividendSummary
): boolean => {
    try {
        const headers = [
            'Data sprzedaży',
            'Portfel',
            'Typ konta',
            'Ticker',
            'Ilość',
            'Cena sprzedaży',
            'Waluta',
            'Kurs NBP (D-1)',
            'Przychód (PLN)',
            'Koszt zakupu FIFO (PLN)',
            'Prowizje (PLN)',
            'Koszty łącznie KUP (PLN)',
            'Dochód / Strata (PLN)',
            'Szacowany podatek 19% (PLN)',
            'Uwagi'
        ];

        const rows = trades.map(t =>
            [
                `"${t.sellDate}"`,
                `"${t.portfolioName || 'Główny'}"`,
                `"${t.isTaxExempt ? 'IKE/IKZE (Zwolnione)' : 'Standard (19%)'}"`,
                `"${t.ticker}"`,
                t.shares,
                t.sellPriceNative,
                `"${t.sellCurrency}"`,
                t.sellExchangeRate,
                t.revenuePLN.toFixed(2),
                t.costBasisPLN.toFixed(2),
                t.totalCommissionPLN.toFixed(2),
                t.totalCostPLN.toFixed(2),
                t.gainLossPLN.toFixed(2),
                t.taxLiabilityPLN.toFixed(2),
                `"${[
                    t.usesBrokerRate ? 'kurs brokera zamiast NBP' : '',
                    t.unmatchedShares > 0 ? `brak zakupu dla ${t.unmatchedShares} szt.` : ''
                ]
                    .filter(Boolean)
                    .join(', ')}"`
            ].join(';')
        );

        const summaryRows = [
            '',
            `"PODSUMOWANIE PIT-38 ZA ROK ${year} - ODPŁATNE ZBYCIE PAPIERÓW WARTOŚCIOWYCH"`,
            `"Przychód";"${summary.revenuePLN.toFixed(2)} PLN"`,
            `"Koszty uzyskania przychodów";"${summary.costPLN.toFixed(2)} PLN"`,
            `"Dochód";"${summary.incomePLN.toFixed(2)} PLN"`,
            `"Strata";"${summary.lossPLN.toFixed(2)} PLN"`,
            `"Podstawa opodatkowania (zaokr. do zł)";"${summary.taxBasePLN} PLN"`,
            `"Należny podatek 19%";"${summary.taxDuePLN} PLN"`,
            `"Zaoszczędzona Belka na IKE/IKZE";"${summary.taxSavedIKEPLN.toFixed(2)} PLN"`
        ];

        const dividendRows = dividends
            ? [
                  '',
                  `"DYWIDENDY ZAGRANICZNE (PIT-38 część G) ZA ROK ${year}"`,
                  [
                      'Data wypłaty',
                      'Portfel',
                      'Ticker',
                      'Kwota brutto',
                      'Waluta',
                      'Kurs NBP (D-1)',
                      'Brutto (PLN)',
                      'Podatek u źródła %',
                      'Podatek zapłacony za granicą (PLN)',
                      'Do dopłaty w PL (PLN)'
                  ].join(';'),
                  ...dividends.rows.map(r =>
                      [
                          `"${r.paymentDate}"`,
                          `"${r.portfolioName || ''}"`,
                          `"${r.ticker}"`,
                          r.grossNative.toFixed(2),
                          `"${r.currency}"`,
                          r.exchangeRate ?? '"brak kursu"',
                          r.grossPLN?.toFixed(2) ?? '',
                          r.withholdingRate,
                          r.foreignTaxPLN?.toFixed(2) ?? '',
                          r.taxToPayPLN?.toFixed(2) ?? ''
                      ].join(';')
                  ),
                  `"Przychód brutto";"${dividends.grossPLN.toFixed(2)} PLN"`,
                  `"Zryczałtowany podatek 19%";"${dividends.taxPLN} PLN"`,
                  `"Podatek zapłacony za granicą (do odliczenia)";"${dividends.creditPLN} PLN"`,
                  `"Do zapłaty";"${dividends.toPayPLN} PLN"`
              ]
            : [];

        csvDownload([headers.join(';'), ...rows, ...summaryRows, ...dividendRows], `zestawienie_pit38_${year}.csv`);
        return true;
    } catch (error) {
        logger.error('Failed to export PIT-38 CSV:', error);
        return false;
    }
};
