import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { usePortfolioAccount } from '../context/PortfolioContext';
import { matchFIFOClosedTrades, generatePIT38Report, exportPIT38ToCSV } from '../utils/taxCalculations';
import { formatNumber } from '../utils/formatters';
import { cn } from '../lib/utils';
import {
    FileText,
    Download,
    TrendingUp,
    TrendingDown,
    ShieldCheck,
    HelpCircle,
    ChevronDown,
    Calendar,
    AlertTriangle
} from 'lucide-react';

export const Taxes: React.FC = () => {
    const { portfolios } = usePortfolioAccount();
    const currentYear = new Date().getFullYear();

    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | 'TAXABLE_ALL'>('TAXABLE_ALL');
    const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);

    const allTransactions = useLiveQuery(() => db.transactions.toArray()) || [];

    // Match closed trades using FIFO
    const allClosedTrades = useMemo(() => {
        return matchFIFOClosedTrades(allTransactions, portfolios);
    }, [allTransactions, portfolios]);

    // Available years from closed trades (default to current year if none)
    const availableYears = useMemo(() => {
        const yearsSet = new Set<number>([currentYear]);
        allClosedTrades.forEach(t => yearsSet.add(t.sellYear));
        return Array.from(yearsSet).sort((a, b) => b - a);
    }, [allClosedTrades, currentYear]);

    // Generate PIT-38 summary report
    const summary = useMemo(() => {
        return generatePIT38Report(allClosedTrades, selectedYear, selectedPortfolioId);
    }, [allClosedTrades, selectedYear, selectedPortfolioId]);

    // Filter closed trades for the table
    const displayedTrades = useMemo(() => {
        return allClosedTrades
            .filter(t => t.sellYear === selectedYear)
            .filter(t => {
                if (selectedPortfolioId === 'TAXABLE_ALL') return true;
                return t.portfolioId === selectedPortfolioId;
            })
            .sort((a, b) => new Date(b.sellDate).getTime() - new Date(a.sellDate).getTime());
    }, [allClosedTrades, selectedYear, selectedPortfolioId]);

    const isSelectedExempt = useMemo(() => {
        if (selectedPortfolioId === 'TAXABLE_ALL') return false;
        const p = portfolios.find(port => port.id === selectedPortfolioId);
        return p?.taxRate === 0;
    }, [portfolios, selectedPortfolioId]);

    const unmatchedTrades = useMemo(() => displayedTrades.filter(t => t.unmatchedShares > 0), [displayedTrades]);

    const handleExport = () => {
        exportPIT38ToCSV(displayedTrades, summary, selectedYear);
    };

    return (
        <div data-testid="taxes-page" className="space-y-8 animate-in fade-in zoom-in duration-500 pb-20">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                            <FileText size={22} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight">Podatki (PIT-38)</h1>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Rozliczenie zysków kapitałowych ze sprzedaży papierów wartościowych metodą FIFO
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Year Selector */}
                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl">
                        <Calendar size={15} className="text-slate-400 ml-2" />
                        <select
                            value={selectedYear}
                            onChange={e => setSelectedYear(Number(e.target.value))}
                            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-blue-500 transition"
                        >
                            {availableYears.map(yr => (
                                <option key={yr} value={yr}>
                                    Rok {yr}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Portfolio Selector */}
                    {portfolios.length > 1 && (
                        <select
                            value={selectedPortfolioId}
                            onChange={e =>
                                setSelectedPortfolioId(
                                    e.target.value === 'TAXABLE_ALL' ? 'TAXABLE_ALL' : Number(e.target.value)
                                )
                            }
                            className="bg-slate-900 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-200 outline-none focus:border-blue-500 transition"
                        >
                            <option value="TAXABLE_ALL">Wszystkie rachunki opodatkowane</option>
                            {portfolios.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.name} ({p.type.toUpperCase()}
                                    {p.taxRate === 0 ? ' • 0%' : ' • 19%'})
                                </option>
                            ))}
                        </select>
                    )}

                    {/* Export Button */}
                    <button
                        onClick={handleExport}
                        disabled={displayedTrades.length === 0}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-2xl font-bold text-xs transition shadow-lg shadow-blue-600/30 flex items-center gap-2"
                    >
                        <Download size={15} /> Eksportuj Zestawienie (CSV)
                    </button>
                </div>
            </header>

            {/* Sells without a matching earlier buy: cost basis missing, gain overstated */}
            {unmatchedTrades.length > 0 && (
                <div
                    data-testid="unmatched-sells-warning"
                    className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3"
                >
                    <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-bold text-amber-400">Sprzedaż bez pasującego zakupu</h4>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                            Dla części sprzedanych akcji nie ma wcześniejszej transakcji kupna, więc ich koszt przyjęto
                            jako 0 zł i dochód jest zawyżony. Dodaj brakujące zakupy:
                        </p>
                        <ul className="text-xs text-slate-300 mt-2 list-disc pl-5 space-y-0.5">
                            {unmatchedTrades.map(t => (
                                <li key={t.id}>
                                    {t.ticker} — sprzedaż {t.sellDate}: brak zakupu dla {t.unmatchedShares} szt.
                                    {t.portfolioName ? ` (${t.portfolioName})` : ''}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* IKE / IKZE Exemption Alert */}
            {isSelectedExempt && (
                <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3">
                    <ShieldCheck size={20} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-bold text-emerald-400">Rachunek zwolniony z podatku</h4>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                            Wybrany portfel to rachunek emerytalny (IKE / IKZE). Zgodnie z art. 21 ust. 1 pkt 58a i 58b
                            ustawy o PIT, dochody ze zbycia papierów wartościowych na tym rachunku są{' '}
                            <strong>całkowicie zwolnione z podatku dochodowego</strong> i nie podlegają wykazaniu w
                            deklaracji PIT-38.
                        </p>
                    </div>
                </div>
            )}

            {/* PIT-38 Summary Cards (Część C PIT-38) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Przychód - poz. 20 */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 relative overflow-hidden">
                    <div className="flex justify-between items-center text-slate-400 mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider">Przychód</span>
                        <span className="text-[10px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                            poz. 20 PIT-38
                        </span>
                    </div>
                    <div className="text-2xl font-black text-white mt-1">
                        {formatNumber(summary.revenuePLN)}{' '}
                        <span className="text-xs font-normal text-slate-500">PLN</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Suma kwot uzyskanych ze sprzedaży</p>
                </div>

                {/* Koszty KUP - poz. 21 */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 relative overflow-hidden">
                    <div className="flex justify-between items-center text-slate-400 mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider">Koszty (KUP)</span>
                        <span className="text-[10px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                            poz. 21 PIT-38
                        </span>
                    </div>
                    <div className="text-2xl font-black text-white mt-1">
                        {formatNumber(summary.costPLN)} <span className="text-xs font-normal text-slate-500">PLN</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Koszt nabycia partii FIFO + prowizje</p>
                </div>

                {/* Dochód lub Strata - poz. 22 / 23 */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 relative overflow-hidden">
                    <div className="flex justify-between items-center text-slate-400 mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider">
                            {summary.lossPLN > 0 ? 'Strata' : 'Dochód'}
                        </span>
                        <span className="text-[10px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                            {summary.lossPLN > 0 ? 'poz. 23 PIT-38' : 'poz. 22 PIT-38'}
                        </span>
                    </div>
                    <div
                        className={cn(
                            'text-2xl font-black mt-1 flex items-center gap-1.5',
                            summary.incomePLN > 0
                                ? 'text-emerald-400'
                                : summary.lossPLN > 0
                                  ? 'text-rose-400'
                                  : 'text-slate-300'
                        )}
                    >
                        {summary.incomePLN > 0 ? (
                            <TrendingUp size={20} className="shrink-0" />
                        ) : summary.lossPLN > 0 ? (
                            <TrendingDown size={20} className="shrink-0" />
                        ) : null}
                        <span>
                            {summary.incomePLN > 0
                                ? `+${formatNumber(summary.incomePLN)}`
                                : summary.lossPLN > 0
                                  ? `-${formatNumber(summary.lossPLN)}`
                                  : '0,00'}
                        </span>
                        <span className="text-xs font-normal text-slate-500">PLN</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                        {summary.lossPLN > 0
                            ? 'Można odliczyć w kolejnych 5 latach'
                            : 'Przychody minus koszty uzyskania'}
                    </p>
                </div>

                {/* Należny podatek 19% - poz. 31 */}
                <div className="bg-gradient-to-br from-blue-950/40 to-slate-900 border border-blue-800/40 rounded-3xl p-5 relative overflow-hidden shadow-lg shadow-blue-950/20">
                    <div className="flex justify-between items-center text-blue-400 mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider">Podatek 19%</span>
                        <span className="text-[10px] font-mono bg-blue-900/60 px-1.5 py-0.5 rounded text-blue-300">
                            poz. 31 PIT-38
                        </span>
                    </div>
                    <div className="text-2xl font-black text-white mt-1">
                        {summary.taxDuePLN.toLocaleString('pl-PL')}{' '}
                        <span className="text-xs font-normal text-slate-400">PLN</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                        {summary.taxDuePLN > 0 ? 'Należny podatek do 30 kwietnia' : 'Brak podatku do zapłacenia'}
                    </p>

                    {summary.taxSavedIKEPLN > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                            <span className="text-emerald-400 font-semibold">Zaoszczędzono na IKE:</span>
                            <span className="font-bold text-emerald-400">
                                +{formatNumber(summary.taxSavedIKEPLN)} PLN
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Closed Trades Table (FIFO Breakdown) */}
            <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden flex flex-col shadow-xl">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-white">
                            Zrealizowane transakcje ({displayedTrades.length})
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Pozycje zamknięte w roku {selectedYear} z dopasowaniem partii zakupu metodą FIFO
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-4">Data sprzedaży</th>
                                <th className="px-6 py-4">Portfel</th>
                                <th className="px-6 py-4">Ticker</th>
                                <th className="px-6 py-4 text-right">Ilość</th>
                                <th className="px-6 py-4 text-right">Cena</th>
                                <th className="px-6 py-4 text-right">Przychód (PLN)</th>
                                <th className="px-6 py-4 text-right">Koszty KUP (PLN)</th>
                                <th className="px-6 py-4 text-right">Wynik (PLN)</th>
                                <th className="px-6 py-4 text-right">Podatek (19%)</th>
                                <th className="px-6 py-4 text-center">Partie FIFO</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-sm">
                            {displayedTrades.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-6 py-12 text-center text-slate-500 italic">
                                        Brak zrealizowanych sprzedaży w roku {selectedYear}.
                                    </td>
                                </tr>
                            ) : (
                                displayedTrades.map(t => {
                                    const isExpanded = expandedTradeId === t.id;
                                    return (
                                        <React.Fragment key={t.id}>
                                            <tr className="hover:bg-slate-800/40 transition-colors">
                                                <td className="px-6 py-4 font-mono text-slate-300">{t.sellDate}</td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                        {t.portfolioName || 'Główny'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 font-bold text-blue-400">{t.ticker}</td>
                                                <td className="px-6 py-4 text-right font-mono">{t.shares}</td>
                                                <td className="px-6 py-4 text-right font-mono">
                                                    {formatNumber(t.sellPriceNative)}{' '}
                                                    <span className="text-xs text-slate-500">{t.sellCurrency}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono font-bold text-white">
                                                    {formatNumber(t.revenuePLN)}
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono text-slate-400">
                                                    {formatNumber(t.totalCostPLN)}
                                                </td>
                                                <td
                                                    className={cn(
                                                        'px-6 py-4 text-right font-mono font-bold',
                                                        t.gainLossPLN > 0
                                                            ? 'text-emerald-400'
                                                            : t.gainLossPLN < 0
                                                              ? 'text-rose-400'
                                                              : 'text-slate-300'
                                                    )}
                                                >
                                                    {t.gainLossPLN > 0 ? '+' : ''}
                                                    {formatNumber(t.gainLossPLN)}
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono">
                                                    {t.isTaxExempt ? (
                                                        <span className="text-emerald-400 text-xs font-semibold">
                                                            0 zł (IKE)
                                                        </span>
                                                    ) : t.taxLiabilityPLN > 0 ? (
                                                        <span className="text-slate-300 font-bold">
                                                            {formatNumber(t.taxLiabilityPLN)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-600">—</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {t.lots.length > 0 && (
                                                        <button
                                                            onClick={() => setExpandedTradeId(isExpanded ? null : t.id)}
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                                                            title="Pokaż partie zakupu FIFO"
                                                        >
                                                            <ChevronDown
                                                                size={16}
                                                                className={cn(
                                                                    'transition-transform duration-200',
                                                                    isExpanded && 'rotate-180 text-blue-400'
                                                                )}
                                                            />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>

                                            {/* Expandable FIFO lots */}
                                            {isExpanded && (
                                                <tr className="bg-slate-950/60">
                                                    <td colSpan={10} className="px-8 py-3">
                                                        <div className="text-xs text-slate-400 space-y-1.5 pl-4 border-l-2 border-blue-500">
                                                            <p className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">
                                                                Dopasowane partie zakupu (FIFO):
                                                            </p>
                                                            {t.lots.map((lot, idx) => (
                                                                <div
                                                                    key={idx}
                                                                    className="flex items-center gap-4 font-mono text-slate-400"
                                                                >
                                                                    <span>Data zakupu: {lot.buyDate}</span>
                                                                    <span>Ilość: {lot.shares} szt.</span>
                                                                    <span>
                                                                        Cena zakupu: {formatNumber(lot.buyPriceNative)}{' '}
                                                                        {t.sellCurrency}
                                                                    </span>
                                                                    {lot.buyExchangeRate !== 1 && (
                                                                        <span>
                                                                            Kurs NBP:{' '}
                                                                            {formatNumber(lot.buyExchangeRate, 4, 4)}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-slate-300 font-bold">
                                                                        Koszt partii: {formatNumber(lot.buyCostPLN)} PLN
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Information & Legal notes */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 space-y-3">
                <div className="flex items-center gap-2 text-slate-300 font-bold text-sm">
                    <HelpCircle size={17} className="text-blue-400" />
                    <span>Zasady rozliczenia podatkowego (PIT-38 w Polsce)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400 leading-relaxed">
                    <div>
                        <strong className="text-slate-300">Zasada FIFO (First In, First Out):</strong> Kosztem
                        sprzedanych akcji jest cena najwcześniej kupionych partii danego waloru. Nasz system
                        automatycznie rozlicza każdą sprzedaż zgodnie z tą regułą.
                    </div>
                    <div>
                        <strong className="text-slate-300">Prowizje maklerskie:</strong> Zarówno prowizja od kupna, jak
                        i sprzedaży, stanowią koszty uzyskania przychodów (KUP) i obniżają podstawę opodatkowania.
                    </div>
                    <div>
                        <strong className="text-slate-300">Kompensacja strat:</strong> Stratę z danego roku można
                        odliczyć od dochodów z giełdy w najbliższych kolejno po sobie następujących 5 latach podatkowych
                        (do 50% kwoty straty w jednym roku).
                    </div>
                    <div>
                        <strong className="text-slate-300">Termin złożenia deklaracji:</strong> Zeznanie PIT-38 składa
                        się do właściwego urzędu skarbowego w terminie od 15 lutego do 30 kwietnia roku następującego po
                        roku podatkowym.
                    </div>
                </div>
            </div>
        </div>
    );
};
