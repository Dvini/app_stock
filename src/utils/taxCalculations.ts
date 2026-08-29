import type { Transaction, PortfolioAccount } from '../types/database';

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
}

export interface PIT38Summary {
    year: number;
    portfolioId: number | 'TAXABLE_ALL';
    revenuePLN: number; // Przychód (poz. 20)
    costPLN: number; // Koszty uzyskania przychodów (poz. 21)
    incomePLN: number; // Dochód (poz. 22)
    lossPLN: number; // Strata (poz. 23)
    taxDuePLN: number; // Podatek należny 19% (poz. 31, zaokrąglony do 1 zł)
    tradeCount: number;
    taxSavedIKEPLN: number; // Kwota podatku zaoszczędzona dzięki IKE/IKZE
}

/**
 * Calculate net profit/loss and estimated Belka tax reserve for an open position
 */
export const calculateNetProfitLoss = (
    grossPL: number,
    taxRate: number = 19
): { netPL: number; taxAmount: number } => {
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
    const relevantTxs = transactions
        .filter(t => t.type === 'Kupno' || t.type === 'Sprzedaż')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
        const exchangeRate = tx.exchangeRate || 1;
        const price = tx.price || 0;

        if (tx.type === 'Kupno') {
            const queue = buyInventory.get(key) || [];
            const commPLN = (tx.commission || 0) * (tx.commissionCurrency && tx.commissionCurrency !== 'PLN' ? exchangeRate : 1);
            const commPerShare = tx.amount > 0 ? commPLN / tx.amount : 0;

            queue.push({
                id: tx.id || Math.random(),
                date: tx.date,
                remainingShares: tx.amount,
                price,
                currency: tx.currency || 'PLN',
                exchangeRate,
                commissionPerSharePLN: commPerShare
            });
            buyInventory.set(key, queue);
        } else if (tx.type === 'Sprzedaż') {
            const queue = buyInventory.get(key) || [];
            let sharesToSell = tx.amount;
            const lots: ClosedTradeLot[] = [];
            let buyCostPLN = 0;
            let buyCommissionPLN = 0;

            while (sharesToSell > 0.000001 && queue.length > 0) {
                const oldestLot = queue[0];
                if (!oldestLot) break;
                const takenShares = Math.min(sharesToSell, oldestLot.remainingShares);

                const lotCost = takenShares * oldestLot.price * oldestLot.exchangeRate;
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

            const sellCommPLN = (tx.commission || 0) * (tx.commissionCurrency && tx.commissionCurrency !== 'PLN' ? exchangeRate : 1);
            const revenuePLN = tx.amount * price * exchangeRate;
            const totalCostPLN = buyCostPLN + buyCommissionPLN + sellCommPLN;
            const gainLossPLN = revenuePLN - totalCostPLN;

            const taxLiabilityPLN =
                !isTaxExempt && gainLossPLN > 0 ? gainLossPLN * (taxRate / 100) : 0;

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
                lots
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

    // Polish tax ordinance: capital gains tax is 19% rounded to nearest full PLN
    const taxDuePLN = incomePLN > 0 ? Math.round(incomePLN * 0.19) : 0;

    return {
        year,
        portfolioId,
        revenuePLN,
        costPLN,
        incomePLN,
        lossPLN,
        taxDuePLN,
        tradeCount: taxableTrades.length,
        taxSavedIKEPLN
    };
};

/**
 * Export PIT-38 statement to CSV file
 */
export const exportPIT38ToCSV = (
    trades: ClosedTrade[],
    summary: PIT38Summary,
    year: number
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
            'Kurs NBP',
            'Przychód (PLN)',
            'Koszt zakupu FIFO (PLN)',
            'Prowizje (PLN)',
            'Koszty łącznie KUP (PLN)',
            'Dochód / Strata (PLN)',
            'Szacowany podatek 19% (PLN)'
        ];

        const rows = trades.map(t => [
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
            t.taxLiabilityPLN.toFixed(2)
        ].join(';'));

        const summaryRows = [
            '',
            `"PODSUMOWANIE PIT-38 ZA ROK ${year}"`,
            `"Przychód (poz. 20)";"${summary.revenuePLN.toFixed(2)} PLN"`,
            `"Koszty uzyskania przychodów (poz. 21)";"${summary.costPLN.toFixed(2)} PLN"`,
            `"Dochód (poz. 22)";"${summary.incomePLN.toFixed(2)} PLN"`,
            `"Strata (poz. 23)";"${summary.lossPLN.toFixed(2)} PLN"`,
            `"Należny podatek 19% (poz. 31)";"${summary.taxDuePLN} PLN"`,
            `"Zaoszczędzona Belka na IKE/IKZE";"${summary.taxSavedIKEPLN.toFixed(2)} PLN"`
        ];

        const csvContent = '\uFEFF' + [headers.join(';'), ...rows, ...summaryRows].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `zestawienie_pit38_${year}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return true;
    } catch (error) {
        console.error('Failed to export PIT-38 CSV:', error);
        return false;
    }
};
