import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, PlusCircle, Star, Search, BarChart3, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { usePortfolio } from '../hooks/usePortfolio';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { AddToWatchlistModal } from '../components/AddToWatchlistModal';
import { WebGPUChart } from '../components/WebGPUChart';
import { fetchHistory, getCachedPrice, fetchCurrentPrice } from '../lib/api';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatNumber } from '../utils/formatters';

export const Dashboard = () => {
    const { assets, portfolioSummary } = usePortfolio();
    const watchlist = useLiveQuery(() => db.watchlist.toArray()) || [];

    // State
    const [selectedTicker, setSelectedTicker] = useState(null);
    const [chartData, setChartData] = useState([]);
    const [chartCurrency, setChartCurrency] = useState('PLN');
    const [chartRange, setChartRange] = useState('1mo'); // 1d, 5d, 1mo, 1y
    const [isLoadingChart, setIsLoadingChart] = useState(false);

    // Modals
    const [showTxModal, setShowTxModal] = useState(false);
    const [showWatchlistModal, setShowWatchlistModal] = useState(false);

    // Initial Selection
    useEffect(() => {
        if (!selectedTicker && assets.length > 0) {
            setSelectedTicker(assets[0].ticker);
        } else if (!selectedTicker && watchlist.length > 0) {
            setSelectedTicker(watchlist[0].ticker);
        }
    }, [assets, watchlist]);

    // Fetch Chart Data Effect
    useEffect(() => {
        if (!selectedTicker) return;

        const loadChart = async () => {
            setIsLoadingChart(true);

            // Map ranges to API params
            // 1d -> range=1d, interval=5m
            // 5d -> range=5d, interval=15m
            // 1mo -> range=1mo, interval=1d
            // 1y -> range=1y, interval=1wk

            let interval = '1d';
            if (chartRange === '1d') interval = '5m';
            if (chartRange === '5d') interval = '15m';
            if (chartRange === '1mo') interval = '1d';
            if (chartRange === '1y') interval = '1d';
            if (chartRange === '5y') interval = '1wk';
            if (chartRange === 'max') interval = '1mo';

            const result = await fetchHistory(selectedTicker, chartRange, interval);

            // Handle new API response structure { data, currency } or old array [legacy fallback?]
            if (result && result.data) {
                setChartData(result.data);
                setChartCurrency(result.currency);
            } else if (Array.isArray(result)) {
                // Fallback for immediate safety if any old cache lingers
                setChartData(result);
                // Try to use known asset currency if available, else PLN
                const knownAsset = assets.find(a => a.ticker === selectedTicker) || watchlist.find(w => w.ticker === selectedTicker);
                setChartCurrency(knownAsset ? (knownAsset.currency || 'PLN') : 'PLN');
            } else {
                setChartData([]);
            }
            setIsLoadingChart(false);
        };

        loadChart();
    }, [selectedTicker, chartRange]);

    // Combined List for Sidebar
    const getAssetPrice = (ticker) => {
        const p = assets.find(a => a.ticker === ticker);
        if (p) return { price: p.price, currency: p.currency, pl: p.pl, isOwned: true };

        // If not owned, try to get cached price
        const cached = getCachedPrice(ticker);
        // Check if cached is object (new format)
        if (cached && typeof cached === 'object') {
            return { price: cached.price, currency: cached.currency, pl: null, isOwned: false };
        }
        // Fallback or legacy (should not happen with new api.js but safe to keep)
        return { price: cached || '---', currency: 'PLN', pl: null, isOwned: false };
    };

    // Ensure we trigger updates for watchlist items without transactions
    // In a real app we'd have a unified hook, but here we can just auto-fetch visible items
    useEffect(() => {
        watchlist.forEach(async (w) => {
            if (!getCachedPrice(w.ticker)) {
                await fetchCurrentPrice(w.ticker);
            }
        });
    }, [watchlist.length]);

    const ranges = [
        { label: '1D', val: '1d' },
        { label: '1T', val: '5d' },
        { label: '1M', val: '1mo' },
        { label: '1R', val: '1y' },
        { label: '5L', val: '5y' },
        { label: 'MAX', val: 'max' },
    ];

    const currentAssetInfo = getAssetPrice(selectedTicker);

    const getChartStats = () => {
        if (!chartData || chartData.length === 0) return null;
        const start = chartData[0].price;
        const end = chartData[chartData.length - 1].price;
        const change = end - start;
        const percent = (change / start) * 100;
        return { change, percent, end };
    };

    const chartStats = getChartStats();

    return (
        <div className="space-y-6 h-[calc(100vh-6rem)] flex flex-col animate-in fade-in zoom-in duration-500">
            {/* Header / Portfolio Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
                    <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Wartość Portfela</p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <h2 className="text-2xl font-bold">{portfolioSummary.totalValue}</h2>
                        <span className="text-sm text-slate-500">{portfolioSummary.baseCurrency || 'PLN'}</span>
                    </div>
                    <div className={cn("text-xs mt-1 flex items-center", portfolioSummary.totalPL.includes('-') ? "text-rose-400" : "text-emerald-400")}>
                        {portfolioSummary.totalPL.includes('-') ? <TrendingDown size={12} className="mr-1" /> : <TrendingUp size={12} className="mr-1" />}
                        {portfolioSummary.totalPL}
                    </div>
                </div>

                <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
                    <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Gotówka</p>
                    <h2 className="text-2xl font-bold mt-1">{portfolioSummary.cash} <span className="text-sm font-normal text-slate-500">{portfolioSummary.baseCurrency || 'PLN'}</span></h2>
                </div>

                <div
                    onClick={() => setShowTxModal(true)}
                    className="bg-blue-600/10 hover:bg-blue-600/20 p-5 rounded-2xl border border-blue-600/30 cursor-pointer transition-all group flex flex-col justify-center items-center"
                >
                    <PlusCircle className="text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-blue-200 font-bold text-sm">Dodaj Transakcję</span>
                </div>

                <div
                    onClick={() => setShowWatchlistModal(true)}
                    className="bg-slate-800/30 hover:bg-slate-800/60 p-5 rounded-2xl border border-slate-700 border-dashed cursor-pointer transition-all group flex flex-col justify-center items-center"
                >
                    <Star className="text-slate-400 mb-2 group-hover:text-yellow-400 transition-colors" />
                    <span className="text-slate-400 font-bold text-sm group-hover:text-slate-200">Dodaj do Obserwowanych</span>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 flex gap-6">

                {/* Left Sidebar: Assets List */}
                <div className="w-1/3 min-w-[300px] bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
                        <h3 className="font-bold text-slate-200 flex items-center gap-2">
                            <Search size={16} className="text-slate-500" />
                            Instrumenty
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {/* Portfolio Assets */}
                        {assets.length > 0 && (
                            <div className="mb-4">
                                <p className="text-[10px] uppercase font-bold text-slate-500 px-3 py-2">Twój Portfel</p>
                                {assets.map(a => (
                                    <AssetItem
                                        key={a.ticker}
                                        ticker={a.ticker}
                                        price={a.price}
                                        currency={a.currency || 'PLN'} // Fallback
                                        pl={a.pl}
                                        amount={a.amount}
                                        selected={selectedTicker === a.ticker}
                                        onClick={() => setSelectedTicker(a.ticker)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Watchlist */}
                        {watchlist.length > 0 && (
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-500 px-3 py-2 flex items-center gap-1">
                                    <Star size={10} className="text-yellow-500/50" /> Obserwowane
                                </p>
                                {watchlist.filter(w => !assets.some(a => a.ticker === w.ticker)).map(w => { // Filter out items already in portfolio
                                    const cached = getCachedPrice(w.ticker);
                                    return (
                                        <AssetItem
                                            key={w.ticker}
                                            ticker={w.ticker}
                                            price={cached ? cached.price : '...'}
                                            currency={cached ? (cached.currency || 'PLN') : 'PLN'}
                                            pl={null}
                                            isWatchlist
                                            selected={selectedTicker === w.ticker}
                                            onClick={() => setSelectedTicker(w.ticker)}
                                        />
                                    );
                                })}
                            </div>
                        )}

                        {assets.length === 0 && watchlist.length === 0 && (
                            <div className="text-center p-8 text-slate-500 text-sm">
                                Brak instrumentów. Dodaj coś!
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Area: Chart */}
                <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col overflow-hidden relative">
                    {selectedTicker ? (
                        <>
                            {/* Chart Header */}
                            <div className="p-6 border-b border-slate-800 flex justify-between items-start bg-gradient-to-r from-slate-900 to-slate-900/50">
                                <div>
                                    <h2 className="text-4xl font-black tracking-tight flex items-center gap-3">
                                        {selectedTicker}
                                        {!currentAssetInfo.isOwned && <Star size={24} className="text-yellow-500 fill-yellow-500/20" />}
                                    </h2>
                                    <div className="flex items-center gap-4 mt-2">
                                        <span className="text-2xl font-medium text-slate-200">
                                            {currentAssetInfo.price} <span className="text-sm text-slate-500">{currentAssetInfo.currency || 'PLN'}</span>
                                        </span>
                                        {chartStats && (
                                            <span className={cn("px-2 py-1 rounded text-sm font-bold", chartStats.change >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
                                                {chartStats.change > 0 && '+'}{formatNumber(chartStats.change)} {chartCurrency} ({formatNumber(chartStats.percent)}%)
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex bg-slate-800/50 p-1 rounded-xl gap-1">
                                    {ranges.map(r => (
                                        <button
                                            key={r.val}
                                            onClick={() => setChartRange(r.val)}
                                            className={cn(
                                                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                                                chartRange === r.val
                                                    ? "bg-blue-600 text-white shadow-lg"
                                                    : "text-slate-400 hover:text-white hover:bg-slate-700"
                                            )}
                                        >
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Chart Canvas */}
                            <div className="flex-1 relative w-full h-full bg-slate-950/30">
                                {isLoadingChart ? (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="flex flex-col items-center gap-3 animate-pulse">
                                            <BarChart3 className="text-blue-500" size={32} />
                                            <span className="text-sm text-blue-400 font-medium">Pobieranie danych historycznych...</span>
                                        </div>
                                    </div>
                                ) : (
                                    chartData.length > 0 ? (
                                        <WebGPUChart
                                            data={chartData}
                                            currency={chartCurrency}
                                            range={chartRange}
                                            color={currentAssetInfo.pl && currentAssetInfo.pl.startsWith('-') ? [0.9, 0.3, 0.3, 1.0] : [0.2, 0.8, 0.4, 1.0]}
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2">
                                            <Clock size={32} className="opacity-20" />
                                            <p>Brak danych historycznych dla tego okresu.</p>
                                        </div>
                                    )
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-4">
                            <BarChart3 size={48} className="opacity-20" />
                            <p className="text-lg">Wybierz instrument z listy, aby zobaczyć wykres.</p>
                        </div>
                    )}
                </div>

            </div>

            {showTxModal && <AddTransactionModal onClose={() => setShowTxModal(false)} />}
            {showWatchlistModal && <AddToWatchlistModal onClose={() => setShowWatchlistModal(false)} />}
        </div>
    );
};

const AssetItem = ({ ticker, price, currency, pl, amount, selected, onClick, isWatchlist }) => (
    <div
        onClick={onClick}
        className={cn(
            "p-3 rounded-xl cursor-pointer transition-all flex justify-between items-center group border",
            selected
                ? "bg-blue-600 border-blue-500 shadow-lg shadow-blue-900/20"
                : "bg-transparent border-transparent hover:bg-slate-800 hover:border-slate-700"
        )}
    >
        <div className="flex items-center gap-3">
            <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm",
                selected ? "bg-white/20 text-white" : "bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200"
            )}>
                {ticker[0]}
            </div>
            <div>
                <p className={cn("font-bold text-sm", selected ? "text-white" : "text-slate-200")}>{ticker}</p>
                {!isWatchlist && <p className={cn("text-xs", selected ? "text-blue-100" : "text-slate-500")}>{amount} szt.</p>}
                {isWatchlist && <p className={cn("text-[10px] uppercase tracking-wider", selected ? "text-blue-100" : "text-slate-600")}>Obs.</p>}
            </div>
        </div>
        <div className="text-right">
            <p className={cn("font-medium text-sm", selected ? "text-white" : "text-slate-200")}>
                {price !== null && price !== '...' ? formatNumber(price) : '---'} <span className="text-[10px] opacity-70">{currency}</span>
            </p>
            {pl && <p className={cn("text-xs font-bold", pl.startsWith('+') ? (selected ? "text-emerald-200" : "text-emerald-400") : (selected ? "text-rose-200" : "text-rose-400"))}>{pl}</p>}
        </div>
    </div>
);
