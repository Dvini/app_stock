import React, { useState, useMemo } from 'react';
import {
    Briefcase,
    TrendingUp,
    TrendingDown,
    PlusCircle,
    Settings2,
    ArrowRight,
    PieChart as PieIcon,
    Coins,
    PiggyBank
} from 'lucide-react';
import { usePortfolioAccount } from '../context/PortfolioContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { usePrices } from '../hooks/usePrices';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { PieChart } from '../components/PieChart';
import { PortfolioModal } from '../components/PortfolioModal';
import { MissingRatesNotice } from '../components/UIComponents';
import { formatNumber } from '../utils/formatters';
import type { PortfolioAccount, CurrencyCode } from '../types/database';
import { isDepositTransaction } from '../types/database';

export const AllPortfoliosOverview: React.FC = () => {
    const { portfolios, setActivePortfolioId } = usePortfolioAccount();

    const [showModal, setShowModal] = useState(false);
    const [editingPortfolio, setEditingPortfolio] = useState<PortfolioAccount | null>(null);

    // Load all raw data
    const allAssets = useLiveQuery(() => db.assets.toArray()) || [];
    const allCash = useLiveQuery(() => db.cash.toArray()) || [];
    const allTransactions = useLiveQuery(() => db.transactions.toArray()) || [];

    // Get all unique tickers
    const allTickers = useMemo(() => {
        return [...new Set(allAssets.filter(a => a.amount > 0.000001).map(a => a.ticker))];
    }, [allAssets]);

    // Fetch prices for all assets
    const { prices } = usePrices(allTickers);

    // Get all unique currencies
    const neededCurrencies = useMemo(() => {
        const set = new Set<CurrencyCode>(['USD', 'EUR', 'GBP']);
        allAssets.forEach(a => a.currency && set.add(a.currency));
        allCash.forEach(c => c.currency && set.add(c.currency));
        return Array.from(set);
    }, [allAssets, allCash]);

    // Exchange rates to PLN
    const { rates, isLoading: isLoadingRates } = useExchangeRates(neededCurrencies, { targetCurrency: 'PLN' });

    // Calculate metrics per portfolio
    // Positions in currencies without a live rate are left out of PLN totals (never counted 1:1)
    const missingRateCurrencies = useMemo(() => {
        if (isLoadingRates) return [];
        const missing = new Set<string>();
        allAssets
            .filter(a => a.amount > 0.000001)
            .forEach(a => {
                const currency = prices[a.ticker]?.currency || a.currency || 'PLN';
                if (currency !== 'PLN' && !(rates[currency as CurrencyCode]! > 0)) missing.add(currency);
            });
        return [...missing];
    }, [allAssets, prices, rates, isLoadingRates]);

    const portfolioMetrics = useMemo(() => {
        const currentYear = new Date().getFullYear().toString();

        return portfolios.map(p => {
            const pId = p.id ?? 1;
            const pAssets = allAssets.filter(a => (a.portfolioId ?? 1) === pId && a.amount > 0.000001);
            const pCash = allCash.filter(c => (c.portfolioId ?? 1) === pId);
            const pTx = allTransactions.filter(t => (t.portfolioId ?? 1) === pId);

            // Assets value in native currency & PLN
            let assetsValPLN = 0;
            let costBasisPLN = 0;

            pAssets.forEach(a => {
                const livePrice = prices[a.ticker]?.price ?? a.avgPrice;
                const assetCurrency = (prices[a.ticker]?.currency || a.currency || 'PLN') as CurrencyCode;
                const rateToPLN = assetCurrency === 'PLN' ? 1 : (rates[assetCurrency] ?? 0);

                const valPLN = a.amount * livePrice * rateToPLN;
                const costPLN = a.amount * a.avgPrice * rateToPLN;

                assetsValPLN += valPLN;
                costBasisPLN += costPLN;
            });

            // Cash value in native & PLN
            let cashValPLN = 0;
            let cashNative = 0;
            pCash.forEach(c => {
                const rateToPLN = c.currency === 'PLN' ? 1 : (rates[c.currency] ?? 0);
                cashValPLN += (c.amount || 0) * rateToPLN;
                if (c.currency === p.currency) {
                    cashNative += c.amount || 0;
                }
            });

            const totalValPLN = assetsValPLN + cashValPLN;
            const plValPLN = assetsValPLN - costBasisPLN;
            const plPercent = costBasisPLN > 0 ? (plValPLN / costBasisPLN) * 100 : 0;

            // Total in portfolio base currency
            // All accounts are PLN-denominated
            const totalValNative = totalValPLN;

            // Annual contributions for current year (for IKE/IKZE limits)
            const yearDepositsPLN = pTx
                .filter(t => {
                    const isDep = isDepositTransaction(t.type);
                    return isDep && t.date && t.date.startsWith(currentYear);
                })
                .reduce((sum, t) => {
                    const rate = t.exchangeRate || 1;
                    return sum + (t.total || t.amount || 0) * rate;
                }, 0);

            // Belka tax savings (if taxRate === 0 e.g. IKE/IKZE)
            const taxSavedPLN = p.taxRate === 0 && plValPLN > 0 ? plValPLN * 0.19 : 0;

            return {
                portfolio: p,
                assetsCount: pAssets.length,
                totalValPLN,
                totalValNative,
                cashValPLN,
                cashNative,
                plValPLN,
                plPercent,
                yearDepositsPLN,
                taxSavedPLN
            };
        });
    }, [portfolios, allAssets, allCash, allTransactions, prices, rates]);

    // Aggregate totals across all portfolios
    const grandTotals = useMemo(() => {
        const totalWealthPLN = portfolioMetrics.reduce((sum, m) => sum + m.totalValPLN, 0);
        const totalCashPLN = portfolioMetrics.reduce((sum, m) => sum + m.cashValPLN, 0);
        const totalPL_PLN = portfolioMetrics.reduce((sum, m) => sum + m.plValPLN, 0);
        const totalTaxSavedPLN = portfolioMetrics.reduce((sum, m) => sum + m.taxSavedPLN, 0);

        return {
            totalWealthPLN,
            totalCashPLN,
            totalPL_PLN,
            totalTaxSavedPLN
        };
    }, [portfolioMetrics]);

    // Data for Allocation Pie Chart
    const allocationData = useMemo(() => {
        return portfolioMetrics
            .filter(m => m.totalValPLN > 0)
            .map(m => ({
                label: m.portfolio.name,
                value: m.totalValPLN,
                color: m.portfolio.color || '#3b82f6'
            }))
            .sort((a, b) => b.value - a.value);
    }, [portfolioMetrics]);

    return (
        <div
            data-testid="all-portfolios-overview"
            className="flex-1 flex flex-col space-y-8 animate-in fade-in duration-300"
        >
            <MissingRatesNotice currencies={missingRateCurrencies} />

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                        Wszystkie Portfele
                        <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2.5 py-1 rounded-full font-mono font-bold">
                            Łącznie: {portfolios.length}
                        </span>
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">
                        Zbiorcze podsumowanie całego majątku, alokacji kont i oszczędności podatkowych
                    </p>
                </div>

                <button
                    onClick={() => {
                        setEditingPortfolio(null);
                        setShowModal(true);
                    }}
                    className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2 self-start sm:self-auto"
                >
                    <PlusCircle size={18} />
                    Nowy Portfel
                </button>
            </div>

            {/* Global KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Łączny majątek */}
                <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-3xl backdrop-blur-xl relative overflow-hidden group hover:border-slate-700 transition">
                    <div className="flex justify-between items-center text-slate-400 text-xs uppercase font-bold tracking-wider mb-2">
                        <span>Całkowity Majątek</span>
                        <Briefcase size={18} className="text-blue-400" />
                    </div>
                    <div className="text-3xl font-extrabold text-white tracking-tight">
                        {formatNumber(grandTotals.totalWealthPLN)}{' '}
                        <span className="text-sm font-normal text-slate-400">PLN</span>
                    </div>
                    <div
                        className={`text-xs mt-2 flex items-center font-bold ${
                            grandTotals.totalPL_PLN >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                    >
                        {grandTotals.totalPL_PLN >= 0 ? (
                            <TrendingUp size={14} className="mr-1" />
                        ) : (
                            <TrendingDown size={14} className="mr-1" />
                        )}
                        {grandTotals.totalPL_PLN >= 0 ? '+' : ''}
                        {formatNumber(grandTotals.totalPL_PLN)} PLN wynik łączny
                    </div>
                </div>

                {/* Łączna gotówka */}
                <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-3xl backdrop-blur-xl group hover:border-slate-700 transition">
                    <div className="flex justify-between items-center text-slate-400 text-xs uppercase font-bold tracking-wider mb-2">
                        <span>Łączna Gotówka</span>
                        <Coins size={18} className="text-amber-400" />
                    </div>
                    <div className="text-3xl font-extrabold text-white tracking-tight">
                        {formatNumber(grandTotals.totalCashPLN)}{' '}
                        <span className="text-sm font-normal text-slate-400">PLN</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Wolne środki we wszystkich portfelach</p>
                </div>

                {/* Zaoszczędzony podatek Belki */}
                <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-3xl backdrop-blur-xl group hover:border-slate-700 transition">
                    <div className="flex justify-between items-center text-slate-400 text-xs uppercase font-bold tracking-wider mb-2">
                        <span>Zaoszczędzona Belka</span>
                        <PiggyBank size={18} className="text-emerald-400" />
                    </div>
                    <div className="text-3xl font-extrabold text-emerald-400 tracking-tight">
                        +{formatNumber(grandTotals.totalTaxSavedPLN)}{' '}
                        <span className="text-sm font-normal text-emerald-300/70">PLN</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Dzięki uldze podatkowej IKE / IKZE (0%)</p>
                </div>

                {/* Liczba rachunków */}
                <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-3xl backdrop-blur-xl group hover:border-slate-700 transition">
                    <div className="flex justify-between items-center text-slate-400 text-xs uppercase font-bold tracking-wider mb-2">
                        <span>Konta Inwestycyjne</span>
                        <PieIcon size={18} className="text-indigo-400" />
                    </div>
                    <div className="text-3xl font-extrabold text-white tracking-tight">{portfolios.length}</div>
                    <p className="text-xs text-slate-500 mt-2">
                        {portfolios.filter(p => p.type === 'ike' || p.type === 'ikze').length} emerytalne,{' '}
                        {portfolios.filter(p => p.type !== 'ike' && p.type !== 'ikze').length} standardowe
                    </p>
                </div>
            </div>

            {/* Main Content: Portfolios Grid & Allocation Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Portfolios Cards List (2 cols) */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Briefcase size={18} className="text-blue-400" />
                        Twoje Portfele
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {portfolioMetrics.map(m => {
                            const p = m.portfolio;
                            const sharePercent =
                                grandTotals.totalWealthPLN > 0 ? (m.totalValPLN / grandTotals.totalWealthPLN) * 100 : 0;

                            const limitPercent =
                                p.annualLimit && p.annualLimit > 0
                                    ? Math.min(100, (m.yearDepositsPLN / p.annualLimit) * 100)
                                    : null;

                            return (
                                <div
                                    key={p.id}
                                    className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between hover:border-slate-700 transition group shadow-md relative overflow-hidden"
                                >
                                    {/* Top accent border */}
                                    <div
                                        className="absolute top-0 left-0 right-0 h-1.5"
                                        style={{ backgroundColor: p.color || '#3b82f6' }}
                                    />

                                    <div>
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors">
                                                        {p.name}
                                                    </h3>
                                                    {p.taxRate === 0 ? (
                                                        <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                                                            0% Belki
                                                        </span>
                                                    ) : (
                                                        <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded-full font-mono">
                                                            {p.taxRate}% Belki
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mt-0.5">
                                                    {p.type} • {p.currency}
                                                </p>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    setEditingPortfolio(p);
                                                    setShowModal(true);
                                                }}
                                                className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition"
                                                title="Ustawienia tego portfela"
                                            >
                                                <Settings2 size={16} />
                                            </button>
                                        </div>

                                        {/* Wartość portfela */}
                                        <div className="my-3">
                                            <div className="text-2xl font-black text-white">
                                                {formatNumber(m.totalValNative)}{' '}
                                                <span className="text-xs font-normal text-slate-400">{p.currency}</span>
                                            </div>
                                            {p.currency !== 'PLN' && (
                                                <p className="text-xs text-slate-500">
                                                    ≈ {formatNumber(m.totalValPLN)} PLN
                                                </p>
                                            )}

                                            <div className="flex items-center justify-between mt-2 text-xs">
                                                <span
                                                    className={`font-bold flex items-center ${
                                                        m.plValPLN >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                                    }`}
                                                >
                                                    {m.plValPLN >= 0 ? '+' : ''}
                                                    {formatNumber(m.plValPLN)} PLN ({formatNumber(m.plPercent)}%)
                                                </span>
                                                <span className="text-slate-400 font-mono">
                                                    {formatNumber(sharePercent)}% majątku
                                                </span>
                                            </div>
                                        </div>

                                        {/* Pasek limitu wpłat IKE / IKZE */}
                                        {p.annualLimit && p.annualLimit > 0 && limitPercent !== null && (
                                            <div className="mt-4 pt-4 border-t border-slate-800/80">
                                                <div className="flex justify-between text-[11px] mb-1 font-mono">
                                                    <span className="text-slate-400">
                                                        Limit wpłat {new Date().getFullYear()}:
                                                    </span>
                                                    <span className="text-white font-bold">
                                                        {formatNumber(m.yearDepositsPLN)} /{' '}
                                                        {formatNumber(p.annualLimit)} PLN
                                                    </span>
                                                </div>
                                                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-500"
                                                        style={{
                                                            width: `${limitPercent}%`,
                                                            backgroundColor: p.color || '#10b981'
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action button */}
                                    <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                                        <span className="text-xs text-slate-500">
                                            {m.assetsCount} {m.assetsCount === 1 ? 'pozycja' : 'pozycji'}
                                        </span>
                                        <button
                                            onClick={() => p.id && setActivePortfolioId(p.id)}
                                            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white font-bold text-xs transition-all flex items-center gap-1.5 group/btn"
                                        >
                                            Otwórz portfel
                                            <ArrowRight
                                                size={14}
                                                className="group-hover/btn:translate-x-0.5 transition-transform"
                                            />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Allocation Chart Sidebar (1 col) */}
                <div className="space-y-6">
                    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-md flex flex-col">
                        <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                            <PieIcon size={18} className="text-indigo-400" />
                            Alokacja Portfeli
                        </h2>
                        <p className="text-xs text-slate-400 mb-6">Rozkład łącznego kapitału pomiędzy rachunkami</p>

                        {allocationData.length > 0 ? (
                            <div className="h-64 relative flex items-center justify-center">
                                <PieChart data={allocationData} colors={allocationData.map(d => d.color)} />
                            </div>
                        ) : (
                            <div className="h-48 flex items-center justify-center text-xs text-slate-500 italic">
                                Brak wycenionych aktywów do wykresu
                            </div>
                        )}

                        <div className="mt-6 space-y-2">
                            {portfolioMetrics.map(m => {
                                const p = m.portfolio;
                                const share =
                                    grandTotals.totalWealthPLN > 0
                                        ? (m.totalValPLN / grandTotals.totalWealthPLN) * 100
                                        : 0;

                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => p.id && setActivePortfolioId(p.id)}
                                        className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/50 cursor-pointer transition"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div
                                                className="w-3 h-3 rounded-full shrink-0"
                                                style={{ backgroundColor: p.color || '#3b82f6' }}
                                            />
                                            <span className="text-xs font-semibold text-slate-300 truncate">
                                                {p.name}
                                            </span>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-white">
                                            {formatNumber(share)}%
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal */}
            <PortfolioModal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    setEditingPortfolio(null);
                }}
                portfolioToEdit={editingPortfolio}
            />
        </div>
    );
};
