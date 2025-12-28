import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { PlusCircle, PieChart as PieIcon, LineChart as LineIcon } from 'lucide-react';
import { usePortfolio } from '../hooks/usePortfolio';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { PieChart } from '../components/PieChart';
import { WebGPUChart } from '../components/WebGPUChart'; // Reusing Line Chart
import { calculatePortfolioHistory } from '../lib/portfolioHistory';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatNumber } from '../utils/formatters';

export const Portfolio = () => {
    const { assets, portfolioSummary } = usePortfolio();
    const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
    const [showAddModal, setShowAddModal] = useState(false);

    // Visualization State
    const [viewMode, setViewMode] = useState('history'); // 'pie' or 'history'
    const [historyData, setHistoryData] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyRange, setHistoryRange] = useState('max');
    const [selectedTicker, setSelectedTicker] = useState('PORTFOLIO'); // 'PORTFOLIO' or specific ticker

    // Prepare Pie Data
    const pieData = assets.map(a => ({
        label: a.ticker,
        value: a.valueBase, // Allocations based on Base Currency
        pl: a.pl
    })).sort((a, b) => b.value - a.value);

    // Calculate History Effect
    useEffect(() => {
        if (viewMode !== 'history') return;

        const loadHistory = async () => {
            setHistoryLoading(true);
            try {
                // If specific ticker selected, just fetch that ticker's history
                // If PORTFOLIO selected, use reconstruction algo

                let data;
                if (selectedTicker === 'PORTFOLIO') {
                    data = await calculatePortfolioHistory(transactions, historyRange, false, false);
                } else {
                    const tickerTx = transactions.filter(t => t.ticker === selectedTicker);
                    // returnNative=true ensures we calculate PL in native currency
                    data = await calculatePortfolioHistory(tickerTx, historyRange, true, true);
                }

                // Map P/L to "price" for the chart component, but keep original if needed
                // The user wants the CHART to show P/L. 
                const plData = data.map(d => ({
                    time: d.time,
                    price: d.pl, // ! SHOW P/L ON CHART
                    value: d.price // Store total value in 'value' just in case
                }));

                setHistoryData(plData);
            } catch (e) {
                console.error("History calc failed", e);
            }
            setHistoryLoading(false);
        };

        if (transactions.length > 0) {
            loadHistory();
        }
    }, [transactions.length, viewMode, historyRange, selectedTicker]);

    // Determine Chart Color (Green for Profit, Red for Loss)
    const getChartColor = () => {
        if (!historyData || historyData.length === 0) return [0.2, 0.8, 0.4, 1.0];
        const lastPoint = historyData[historyData.length - 1];
        const isProfit = lastPoint.price >= 0; // price is now mapped to PL
        return isProfit ? [0.2, 0.8, 0.4, 1.0] : [0.9, 0.3, 0.3, 1.0];
    };

    return (
        <div className="space-y-8 animate-in fade-in zoom-in duration-500 h-full flex flex-col">
            <header className="flex justify-between items-center shrink-0">
                <h1 className="text-3xl font-extrabold tracking-tight">Twój Portfel</h1>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
                >
                    <PlusCircle size={20} />
                    Nowa Operacja
                </button>
            </header>

            {/* Portfolio Summary Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
                    <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Wartość Całkowita</p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <h2 className="text-2xl font-bold">{portfolioSummary.totalValue}</h2>
                        <span className="text-sm text-slate-500">{portfolioSummary.baseCurrency}</span>
                    </div>
                </div>
                <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
                    <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Wynik (P/L)</p>
                    <div className={cn("text-2xl font-bold mt-1 flex items-center gap-2", portfolioSummary.totalPL.includes('-') ? "text-rose-400" : "text-emerald-400")}>
                        {portfolioSummary.totalPL}
                        <span className="text-sm font-normal text-slate-500">
                            ({portfolioSummary.totalPLPercent})
                        </span>
                    </div>
                </div>
                <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
                    <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Gotówka</p>
                    <h2 className="text-2xl font-bold mt-1">{portfolioSummary.cash} <span className="text-sm font-normal text-slate-500">{portfolioSummary.baseCurrency}</span></h2>
                </div>
            </div>

            {/* Visualizations Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[450px] shrink-0">
                {/* Controls & KPIs */}
                <div className="lg:col-span-3 bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col relative overflow-hidden">
                    <div className="flex justify-between items-center mb-4 z-10">
                        <div className="flex bg-slate-800 p-1 rounded-lg">
                            <button
                                onClick={() => setViewMode('history')}
                                className={cn("px-4 py-2 rounded-md flex items-center gap-2 text-sm font-bold transition-all", viewMode === 'history' ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200")}
                            >
                                <LineIcon size={16} /> Historia
                            </button>
                            <button
                                onClick={() => setViewMode('pie')}
                                className={cn("px-4 py-2 rounded-md flex items-center gap-2 text-sm font-bold transition-all", viewMode === 'pie' ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200")}
                            >
                                <PieIcon size={16} /> Alokacja %
                            </button>
                        </div>

                        {viewMode === 'history' && (
                            <div className="flex gap-2">
                                <select
                                    value={selectedTicker}
                                    onChange={e => setSelectedTicker(e.target.value)}
                                    className="bg-slate-800 text-slate-200 text-sm font-bold rounded-lg px-3 py-2 outline-none border border-slate-700"
                                >
                                    <option value="PORTFOLIO">Cały Portfel</option>
                                    {assets.map(a => <option key={a.ticker} value={a.ticker}>{a.ticker}</option>)}
                                </select>
                                <div className="flex bg-slate-800 rounded-lg p-1">
                                    {[
                                        { l: '1D', v: '1d' },
                                        { l: '1T', v: '5d' },
                                        { l: '1M', v: '1mo' },
                                        { l: '1R', v: '1y' },
                                        { l: '5L', v: '5y' },
                                        { l: 'MAX', v: 'max' }
                                    ].map(r => (
                                        <button
                                            key={r.v}
                                            onClick={() => setHistoryRange(r.v)}
                                            className={cn("px-3 py-1 rounded text-xs font-bold", historyRange === r.v ? "bg-slate-600 text-white" : "text-slate-400")}
                                        >
                                            {r.l}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-h-0 relative">
                        {viewMode === 'pie' ? (
                            <div className="w-full h-full flex items-center justify-center">
                                <div className="w-full h-full max-w-[400px]">
                                    <PieChart data={pieData} />
                                </div>
                                {/* Legend */}
                                <div className="ml-8 hidden md:block space-y-2 max-h-full overflow-y-auto custom-scrollbar pr-2">
                                    {pieData.map((d, i) => (
                                        <div key={d.label} className="flex items-center gap-2 text-sm">
                                            <div className="w-3 h-3 rounded-full" style={{ background: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5] }} />
                                            <span className="font-bold text-slate-300 w-16">{d.label}</span>
                                            <span className="text-slate-500">{(d.value / pieData.reduce((a, b) => a + b.value, 0) * 100).toFixed(1)}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full">
                                {historyLoading ? (
                                    <div className="w-full h-full flex items-center justify-center text-slate-500 animate-pulse">
                                        Rekonstrukcja historii...
                                    </div>
                                ) : (
                                    <WebGPUChart
                                        data={historyData}
                                        currency={selectedTicker === 'PORTFOLIO' ? (portfolioSummary.baseCurrency || 'PLN') : (assets.find(a => a.ticker === selectedTicker)?.currency || 'PLN')}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Assets Table */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex-1">
                <table className="w-full text-left">
                    <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Ticker</th>
                            <th className="px-6 py-4 text-right">Ilość</th>
                            <th className="px-6 py-4 text-right">Cena Akt.</th>
                            <th className="px-6 py-4 text-right">Śr. Kupna</th>
                            <th className="px-6 py-4 text-right">Zysk/Strata</th>
                            <th className="px-6 py-4 text-right">Wartość</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {assets.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="px-6 py-8 text-center text-slate-500 italic">
                                    Twój portfel jest pusty. Kliknij "Nowa Operacja", aby dodać aktywa.
                                </td>
                            </tr>
                        ) : (
                            assets.map(asset => (
                                <tr key={asset.ticker} className="hover:bg-slate-800/50 transition-colors">
                                    <td className="px-6 py-4 font-bold text-blue-400">{asset.ticker}</td>
                                    <td className="px-6 py-4 text-right">{formatNumber(asset.amount)}</td>
                                    <td className="px-6 py-4 text-right font-medium text-slate-300">
                                        {formatNumber(asset.price)} <span className="text-xs text-slate-500">{asset.currency}</span>
                                        {asset.isRealData && <span className="text-[10px] text-emerald-500 ml-1">●</span>}
                                    </td>
                                    <td className="px-6 py-4 text-right text-slate-500">
                                        {formatNumber(asset.avgPrice)} <span className="text-xs">{asset.currency}</span>
                                    </td>
                                    <td className={cn("px-6 py-4 text-right font-medium", asset.pl.startsWith('+') ? 'text-emerald-400' : 'text-rose-400')}>
                                        {asset.pl}
                                        <div className="text-[10px] text-slate-500 font-normal">
                                            {formatNumber(asset.plValue * asset.rate)} {portfolioSummary.baseCurrency}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold">
                                        <div>{asset.value} <span className="text-xs font-normal text-slate-500">{asset.currency}</span></div>
                                        {asset.currency !== portfolioSummary.baseCurrency && (
                                            <div className="text-[10px] text-slate-400">
                                                ~{asset.valueBase.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {portfolioSummary.baseCurrency}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {showAddModal && (
                <AddTransactionModal onClose={() => setShowAddModal(false)} />
            )}
        </div>
    );
};
