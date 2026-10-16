import { describe, it, expect } from 'vitest';
import {
    calculateNetProfitLoss,
    matchFIFOClosedTrades,
    generatePIT38Report,
    generateForeignDividendReport
} from './taxCalculations';
import type { Transaction, PortfolioAccount, Dividend } from '../types/database';

describe('taxCalculations', () => {
    describe('calculateNetProfitLoss', () => {
        it('calculates 19% Belka tax correctly on profit', () => {
            const result = calculateNetProfitLoss(1000, 19);
            expect(result.taxAmount).toBe(190);
            expect(result.netPL).toBe(810);
        });

        it('returns zero tax and full profit for 0% tax rate (IKE/IKZE)', () => {
            const result = calculateNetProfitLoss(1000, 0);
            expect(result.taxAmount).toBe(0);
            expect(result.netPL).toBe(1000);
        });

        it('returns zero tax for losses even with 19% rate', () => {
            const result = calculateNetProfitLoss(-500, 19);
            expect(result.taxAmount).toBe(0);
            expect(result.netPL).toBe(-500);
        });
    });

    describe('matchFIFOClosedTrades', () => {
        const standardPortfolio: PortfolioAccount = {
            id: 1,
            name: 'Standard',
            type: 'standard',
            currency: 'PLN',
            taxRate: 19,
            createdAt: '2026-01-01T00:00:00.000Z'
        };

        const ikePortfolio: PortfolioAccount = {
            id: 2,
            name: 'IKE',
            type: 'ike',
            currency: 'PLN',
            taxRate: 0,
            createdAt: '2026-01-01T00:00:00.000Z'
        };

        it('flags shares sold without a matching earlier buy', () => {
            const txs: Transaction[] = [
                {
                    id: 1,
                    portfolioId: 1,
                    date: '2026-01-10',
                    type: 'Kupno',
                    ticker: 'PKN',
                    amount: 10,
                    price: 50,
                    total: 500
                },
                {
                    id: 2,
                    portfolioId: 1,
                    date: '2026-01-11',
                    type: 'Sprzedaż',
                    ticker: 'PKN',
                    amount: 15,
                    price: 60,
                    total: 900
                }
            ];

            const trades = matchFIFOClosedTrades(txs, [standardPortfolio]);
            expect(trades[0]!.unmatchedShares).toBe(5);
            expect(trades[0]!.costBasisPLN).toBe(500);
        });

        it('processes a same-day sell after a buy entered later (by type, not entry order)', () => {
            const txs: Transaction[] = [
                {
                    id: 1,
                    portfolioId: 1,
                    date: '2026-01-10',
                    type: 'Sprzedaż',
                    ticker: 'PKN',
                    amount: 10,
                    price: 60,
                    total: 600
                },
                {
                    id: 2,
                    portfolioId: 1,
                    date: '2026-01-09',
                    type: 'Kupno',
                    ticker: 'PKN',
                    amount: 10,
                    price: 50,
                    total: 500
                }
            ];

            const trades = matchFIFOClosedTrades(txs, [standardPortfolio]);
            expect(trades[0]!.unmatchedShares).toBe(0);
            expect(trades[0]!.gainLossPLN).toBe(100);
        });

        it('matches simple buy and sell with FIFO', () => {
            const txs: Transaction[] = [
                {
                    id: 1,
                    portfolioId: 1,
                    date: '2026-01-10',
                    type: 'Kupno',
                    ticker: 'PKN',
                    amount: 100,
                    price: 50,
                    total: 5000,
                    currency: 'PLN',
                    exchangeRate: 1
                },
                {
                    id: 2,
                    portfolioId: 1,
                    date: '2026-03-15',
                    type: 'Sprzedaż',
                    ticker: 'PKN',
                    amount: 100,
                    price: 70,
                    total: 7000,
                    currency: 'PLN',
                    exchangeRate: 1
                }
            ];

            const trades = matchFIFOClosedTrades(txs, [standardPortfolio]);
            expect(trades).toHaveLength(1);
            expect(trades[0]!.ticker).toBe('PKN');
            expect(trades[0]!.shares).toBe(100);
            expect(trades[0]!.revenuePLN).toBe(7000);
            expect(trades[0]!.costBasisPLN).toBe(5000);
            expect(trades[0]!.gainLossPLN).toBe(2000);
            expect(trades[0]!.taxLiabilityPLN).toBe(380); // 2000 * 19%
        });

        it('handles partial sells across multiple buy lots (FIFO)', () => {
            const txs: Transaction[] = [
                {
                    id: 1,
                    portfolioId: 1,
                    date: '2026-01-10',
                    type: 'Kupno',
                    ticker: 'AAPL',
                    amount: 10,
                    price: 100,
                    total: 1000,
                    currency: 'PLN',
                    exchangeRate: 1
                },
                {
                    id: 2,
                    portfolioId: 1,
                    date: '2026-02-10',
                    type: 'Kupno',
                    ticker: 'AAPL',
                    amount: 10,
                    price: 150,
                    total: 1500,
                    currency: 'PLN',
                    exchangeRate: 1
                },
                {
                    id: 3,
                    portfolioId: 1,
                    date: '2026-04-10',
                    type: 'Sprzedaż',
                    ticker: 'AAPL',
                    amount: 15, // Takes 10 from lot 1 (cost 1000) and 5 from lot 2 (cost 750)
                    price: 200,
                    total: 3000,
                    currency: 'PLN',
                    exchangeRate: 1
                }
            ];

            const trades = matchFIFOClosedTrades(txs, [standardPortfolio]);
            expect(trades).toHaveLength(1);
            expect(trades[0]!.shares).toBe(15);
            expect(trades[0]!.revenuePLN).toBe(3000); // 15 * 200
            expect(trades[0]!.costBasisPLN).toBe(1750); // (10*100) + (5*150)
            expect(trades[0]!.gainLossPLN).toBe(1250);
            expect(trades[0]!.lots).toHaveLength(2);
            expect(trades[0]!.lots[0]!.shares).toBe(10);
            expect(trades[0]!.lots[1]!.shares).toBe(5);
        });

        it('keeps portfolios strictly separated and respects IKE 0% tax', () => {
            const txs: Transaction[] = [
                {
                    id: 1,
                    portfolioId: 1,
                    date: '2026-01-01',
                    type: 'Kupno',
                    ticker: 'MSFT',
                    amount: 10,
                    price: 100,
                    total: 1000,
                    currency: 'PLN',
                    exchangeRate: 1
                },
                {
                    id: 2,
                    portfolioId: 2, // IKE
                    date: '2026-01-02',
                    type: 'Kupno',
                    ticker: 'MSFT',
                    amount: 5,
                    price: 200,
                    total: 1000,
                    currency: 'PLN',
                    exchangeRate: 1
                },
                {
                    id: 3,
                    portfolioId: 2, // Sell on IKE
                    date: '2026-05-01',
                    type: 'Sprzedaż',
                    ticker: 'MSFT',
                    amount: 5,
                    price: 300,
                    total: 1500,
                    currency: 'PLN',
                    exchangeRate: 1
                }
            ];

            const trades = matchFIFOClosedTrades(txs, [standardPortfolio, ikePortfolio]);
            expect(trades).toHaveLength(1);
            expect(trades[0]!.portfolioId).toBe(2);
            expect(trades[0]!.costBasisPLN).toBe(1000); // matched against IKE buy, NOT standard buy!
            expect(trades[0]!.revenuePLN).toBe(1500);
            expect(trades[0]!.gainLossPLN).toBe(500);
            expect(trades[0]!.isTaxExempt).toBe(true);
            expect(trades[0]!.taxLiabilityPLN).toBe(0); // 0% on IKE!
        });
    });

    describe('generatePIT38Report', () => {
        it('calculates PIT-38 summary with 19% tax rounded to full PLN', () => {
            const closedTrades = [
                {
                    id: '1',
                    portfolioId: 1,
                    isTaxExempt: false,
                    taxRate: 19,
                    ticker: 'XYZ',
                    sellDate: '2026-02-01',
                    sellYear: 2026,
                    shares: 10,
                    sellPriceNative: 100,
                    sellCurrency: 'PLN',
                    sellExchangeRate: 1,
                    sellCommissionPLN: 5,
                    revenuePLN: 1000,
                    costBasisPLN: 700,
                    totalCommissionPLN: 10,
                    totalCostPLN: 710,
                    gainLossPLN: 290,
                    taxLiabilityPLN: 55.1,
                    lots: [],
                    unmatchedShares: 0,
                    usesBrokerRate: false
                }
            ];

            const report = generatePIT38Report(closedTrades, 2026, 'TAXABLE_ALL');
            expect(report.year).toBe(2026);
            expect(report.revenuePLN).toBe(1000);
            expect(report.costPLN).toBe(710);
            expect(report.incomePLN).toBe(290);
            expect(report.lossPLN).toBe(0);
            expect(report.taxDuePLN).toBe(55); // 290 * 0.19 = 55.1 -> rounds to 55
        });

        it('exempts IKE from taxDue and counts saved Belka tax', () => {
            const closedTrades = [
                {
                    id: '1',
                    portfolioId: 2, // IKE
                    isTaxExempt: true,
                    taxRate: 0,
                    ticker: 'IKE_PROFIT',
                    sellDate: '2026-03-01',
                    sellYear: 2026,
                    shares: 10,
                    sellPriceNative: 200,
                    sellCurrency: 'PLN',
                    sellExchangeRate: 1,
                    sellCommissionPLN: 0,
                    revenuePLN: 2000,
                    costBasisPLN: 1000,
                    totalCommissionPLN: 0,
                    totalCostPLN: 1000,
                    gainLossPLN: 1000,
                    taxLiabilityPLN: 0,
                    lots: [],
                    unmatchedShares: 0,
                    usesBrokerRate: false
                }
            ];

            const report = generatePIT38Report(closedTrades, 2026, 'TAXABLE_ALL');
            expect(report.taxDuePLN).toBe(0); // Exempt!
            expect(report.taxSavedIKEPLN).toBe(190); // 1000 * 19%
        });
    });
});

describe('tax exchange rates and rounding', () => {
    const portfolio: PortfolioAccount = {
        id: 1,
        name: 'Standard',
        type: 'standard',
        currency: 'PLN',
        taxRate: 19,
        createdAt: ''
    };
    const usdTrade = (
        id: number,
        type: 'Kupno' | 'Sprzedaż',
        date: string,
        price: number,
        extra: Partial<Transaction> = {}
    ): Transaction => ({
        id,
        portfolioId: 1,
        date,
        type,
        ticker: 'AAPL',
        amount: 10,
        price,
        total: 10 * price,
        currency: 'USD',
        exchangeRate: 4.2,
        ...extra
    });

    it('uses the NBP tax rate (D-1) instead of the broker rate', () => {
        const trades = matchFIFOClosedTrades(
            [
                usdTrade(1, 'Kupno', '2025-01-10', 100, { taxExchangeRate: 4.0 }),
                usdTrade(2, 'Sprzedaż', '2025-02-10', 120, { taxExchangeRate: 4.1 })
            ],
            [portfolio]
        );
        expect(trades[0]!.revenuePLN).toBeCloseTo(10 * 120 * 4.1);
        expect(trades[0]!.costBasisPLN).toBeCloseTo(10 * 100 * 4.0);
        expect(trades[0]!.usesBrokerRate).toBe(false);
    });

    it('flags trades converted at the broker rate when the NBP rate is missing', () => {
        const trades = matchFIFOClosedTrades(
            [
                usdTrade(1, 'Kupno', '2025-01-10', 100),
                usdTrade(2, 'Sprzedaż', '2025-02-10', 120, { taxExchangeRate: 4.1 })
            ],
            [portfolio]
        );
        expect(trades[0]!.usesBrokerRate).toBe(true);
        expect(generatePIT38Report(trades, 2025).brokerRateTradeCount).toBe(1);
    });

    it('rounds the tax base and the tax to full złoty (art. 63)', () => {
        const pln = (id: number, type: 'Kupno' | 'Sprzedaż', price: number): Transaction => ({
            id,
            portfolioId: 1,
            date: type === 'Kupno' ? '2025-01-10' : '2025-02-10',
            type,
            ticker: 'CDR',
            amount: 1,
            price,
            total: price,
            currency: 'PLN',
            exchangeRate: 1
        });
        // income 102.49 -> base 102 -> tax 19.38 -> 19
        const r1 = generatePIT38Report(
            matchFIFOClosedTrades([pln(1, 'Kupno', 100), pln(2, 'Sprzedaż', 202.49)], [portfolio]),
            2025
        );
        expect(r1.taxBasePLN).toBe(102);
        expect(r1.taxDuePLN).toBe(19);
        // income 102.50 -> base 103 -> tax 19.57 -> 20
        const r2 = generatePIT38Report(
            matchFIFOClosedTrades([pln(1, 'Kupno', 100), pln(2, 'Sprzedaż', 202.5)], [portfolio]),
            2025
        );
        expect(r2.taxBasePLN).toBe(103);
        expect(r2.taxDuePLN).toBe(20);
    });
});

describe('generateForeignDividendReport', () => {
    const portfolios: PortfolioAccount[] = [
        { id: 1, name: 'Standard', type: 'standard', currency: 'PLN', taxRate: 19, createdAt: '' },
        { id: 2, name: 'IKE', type: 'ike', currency: 'PLN', taxRate: 0, createdAt: '' }
    ];
    const div = (extra: Partial<Dividend>): Dividend => ({
        portfolioId: 1,
        ticker: 'AAPL',
        recordDate: '2025-05-10',
        paymentDate: '2025-05-15',
        amountPerShare: 1,
        totalAmount: 100,
        currency: 'USD',
        exchangeRate: 4,
        withholdingTaxRate: 15,
        status: 'received',
        ...extra
    });

    it('computes 19% tax minus foreign withholding, capped at 19%', () => {
        const report = generateForeignDividendReport(
            [div({}), div({ ticker: 'NESN', currency: 'CHF', exchangeRate: 4.5, withholdingTaxRate: 35 })],
            portfolios,
            2025
        );
        // USD: gross 400, tax 76, credit 60 -> 16; CHF: gross 450, tax 85.5, credit capped 85.5 -> 0
        expect(report.grossPLN).toBeCloseTo(850);
        expect(report.taxPLN).toBe(162); // 161.5 -> 162
        expect(report.creditPLN).toBe(146); // 60 + 85.5 = 145.5 -> 146
        expect(report.toPayPLN).toBe(16);
        expect(report.rows[0]!.taxToPayPLN).toBeCloseTo(16);
    });

    it('excludes Polish dividends, IKE accounts, other years and reports missing rates', () => {
        const report = generateForeignDividendReport(
            [
                div({ currency: 'PLN', exchangeRate: 1 }),
                div({ portfolioId: 2 }),
                div({ paymentDate: '2024-12-20' }),
                div({ exchangeRate: undefined })
            ],
            portfolios,
            2025
        );
        expect(report.rows).toHaveLength(1);
        expect(report.missingRateCount).toBe(1);
        expect(report.toPayPLN).toBe(0);
    });
});
