import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Plus, Star, Search, BarChart3, Clock, Trash2, Wallet } from 'lucide-react';
import { cn, plSign, plTextClass } from '../lib/utils';
import { MissingRatesNotice } from '../components/UIComponents';
import { usePortfolio } from '../hooks/usePortfolio';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { AddToWatchlistModal } from '../components/AddToWatchlistModal';
import { WebGPUChart } from '../components/WebGPUChart';
import { fetchHistory, getCachedPrice, fetchCurrentPrice } from '../lib/api';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatNumber, formatQuantity } from '../utils/formatters';
import type { WatchlistItem } from '../types/database';
import { logger } from '../utils/logger';

type ChartRange = '1d' | '5d' | '1mo' | '1y' | '5y' | 'max';

interface ChartDataPoint {
    time: number;
    price: number;
}

interface AssetItemProps {
    ticker: string;
    price: number | string | null;
    currency: string;
    pl: string | null;
    amount?: number;
    selected: boolean;
    onClick: () => void;
    isWatchlist?: boolean;
    onRemove?: (e: React.MouseEvent) => void;
}

const EMPTY_WATCHLIST: WatchlistItem[] = [];

export const Dashboard = () => {
    const { assets, portfolioSummary } = usePortfolio();
    const watchlist = useLiveQuery(() => db.watchlist.toArray()) ?? EMPTY_WATCHLIST;
    const assetsRef = React.useRef(assets);
    assetsRef.current = assets;

    const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
    const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
    const [chartCurrency, setChartCurrency] = useState('PLN');
    const [chartRange, setChartRange] = useState<ChartRange>('1mo');
    const [isLoadingChart, setIsLoadingChart] = useState(false);

    const [showTxModal, setShowTxModal] = useState(false);
    const [showWatchlistModal, setShowWatchlistModal] = useState(false);

    useEffect(() => {
        if (!selectedTicker && assets.length > 0) {
            setSelectedTicker(assets[0]?.ticker || null);
        } else if (!selectedTicker && watchlist.length > 0) {
            setSelectedTicker(watchlist[0]?.ticker || null);
        }
    }, [assets.length, watchlist.length, selectedTicker]);

    useEffect(() => {
        if (!selectedTicker) return;
        // Switching ticker or range quickly must not let an older response overwrite the newer one
        let cancelled = false;

        const loadChart = async () => {
            setIsLoadingChart(true);

            let interval = '1d';
            if (chartRange === '1d') interval = '5m';
            if (chartRange === '5d') interval = '15m';
            if (chartRange === '1mo') interval = '1d';
            if (chartRange === '1y') interval = '1d';
            if (chartRange === '5y') interval = '1wk';
            if (chartRange === 'max') interval = '1mo';

            const result = await fetchHistory(selectedTicker, chartRange, interval);
            if (cancelled) return;

            if (result && result.data) {
                setChartData(result.data.map(d => ({ time: d.timestamp, price: d.price })));
                setChartCurrency(result.currency);
            } else if (Array.isArray(result)) {
                setChartData(result);
                const knownAsset = assetsRef.current.find(a => a.ticker === selectedTicker);
                setChartCurrency(knownAsset?.currency || 'PLN');
            } else {
                setChartData([]);
            }
            setIsLoadingChart(false);
        };

        loadChart();
        return () => {
            cancelled = true;
        };
    }, [selectedTicker, chartRange]);

    const getAssetPrice = (ticker: string) => {
        const p = assets.find(a => a.ticker === ticker);
        if (p) return { price: p.price, currency: p.currency, pl: p.pl, isOwned: true };

        const cached = getCachedPrice(ticker);
        if (cached && typeof cached === 'object') {
            return { price: cached.price, currency: cached.currency, pl: null, isOwned: false };
        }
        return { price: cached || '---', currency: 'PLN', pl: null, isOwned: false };
    };

    useEffect(() => {
        watchlist.forEach(async w => {
            if (!getCachedPrice(w.ticker)) {
                await fetchCurrentPrice(w.ticker);
            }
        });
    }, [watchlist.length]);

    const removeFromWatchlist = async (ticker: string) => {
        try {
            await db.watchlist.where('ticker').equals(ticker).delete();
            if (selectedTicker === ticker) {
                setSelectedTicker(null);
            }
        } catch (error) {
            logger.error('Failed to remove from watchlist', error);
        }
    };

    const ranges: Array<{ label: string; val: ChartRange }> = [
        { label: '1D', val: '1d' },
        { label: '1T', val: '5d' },
        { label: '1M', val: '1mo' },
        { label: '1R', val: '1y' },
        { label: '5L', val: '5y' },
        { label: 'MAX', val: 'max' }
    ];

    const currentAssetInfo = selectedTicker
        ? getAssetPrice(selectedTicker)
        : { price: '---', currency: 'PLN', pl: null, isOwned: false };

    const getChartStats = () => {
        if (!chartData || chartData.length === 0) return null;
        const start = chartData[0]?.price || 0;
        const end = chartData[chartData.length - 1]?.price || 0;
        const change = end - start;
        const percent = (change / start) * 100;
        return { change, percent, end };
    };

    const chartStats = getChartStats();

    const todayLabel = new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <div
            data-testid="dashboard-page"
            className="flex-1 min-h-[680px] flex flex-col gap-5 animate-in fade-in duration-500"
        >
            <header className="flex flex-wrap items-end justify-between gap-4 shrink-0">
                <div>
                    <p className="text-sm text-slate-400 first-letter:uppercase">{todayLabel}</p>
                    <h1 className="text-3xl font-extrabold tracking-tight text-gradient">Przegląd portfela</h1>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        data-testid="add-watchlist-button"
                        onClick={() => setShowWatchlistModal(true)}
                        className="glass rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition flex items-center gap-2"
                    >
                        <Star size={16} className="text-amber-300" />
                        Obserwuj
                    </button>
                    <button
                        type="button"
                        data-testid="add-transaction-button"
                        onClick={() => setShowTxModal(true)}
                        className="bg-blue-600 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition flex items-center gap-2"
                    >
                        <Plus size={16} strokeWidth={2.5} />
                        Nowa transakcja
                    </button>
                </div>
            </header>

            <MissingRatesNotice currencies={portfolioSummary.missingRateCurrencies} />

            <div data-testid="dashboard-summary-cards" className="grid grid-cols-1 lg:grid-cols-3 gap-5 shrink-0">
                <div
                    data-testid="portfolio-value-card"
                    className="glass relative group lg:col-span-2 rounded-3xl p-6 cursor-help"
                >
                    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
                        <div className="absolute -top-24 -right-16 h-64 w-64 rounded-full bg-violet-500/25 blur-3xl" />
                        <div className="absolute -bottom-28 right-40 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
                    </div>
                    <div className="relative flex items-center gap-2 text-sm font-medium text-slate-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_2px] shadow-emerald-400/60" />
                        Wartość portfela
                    </div>
                    <div className="relative flex items-baseline gap-3 mt-3">
                        <h2 className="text-5xl font-bold tracking-tight text-white">{portfolioSummary.totalValue}</h2>
                        <span className="text-lg font-medium text-slate-400">
                            {portfolioSummary.baseCurrency || 'PLN'}
                        </span>
                    </div>
                    {portfolioSummary.breakdown && portfolioSummary.breakdown.length > 0 && (
                        <div className="absolute top-full left-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            <p className="text-xs text-slate-400 font-bold mb-2 uppercase">W oryginalnych walutach:</p>
                            <div className="space-y-2">
                                {portfolioSummary.breakdown.map(b => (
                                    <div
                                        key={b.currency}
                                        className="flex justify-between items-center text-sm border-b border-slate-700/50 pb-1 last:border-0 last:pb-0"
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-slate-300 font-medium">
                                                {formatNumber(b.value)}{' '}
                                                <span className="text-xs text-slate-500">{b.currency}</span>
                                            </span>
                                        </div>
                                        {b.pl !== 0 && (
                                            <span
                                                className={cn(
                                                    'text-xs font-bold',
                                                    b.pl > 0 ? 'text-emerald-400' : 'text-rose-400'
                                                )}
                                            >
                                                {b.pl > 0 ? '+' : ''}
                                                {formatNumber(b.pl)}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="relative mt-5 flex flex-wrap items-center gap-2">
                        <span
                            className={cn(
                                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset',
                                plSign(portfolioSummary.totalPL) < 0
                                    ? 'bg-rose-500/15 text-rose-300 ring-rose-400/20'
                                    : plSign(portfolioSummary.totalPL) > 0
                                      ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20'
                                      : 'bg-white/[0.05] text-slate-300 ring-white/10'
                            )}
                        >
                            {plSign(portfolioSummary.totalPL) < 0 ? (
                                <TrendingDown size={14} className="shrink-0" />
                            ) : plSign(portfolioSummary.totalPL) > 0 ? (
                                <TrendingUp size={14} className="shrink-0" />
                            ) : (
                                <Minus size={14} className="shrink-0" />
                            )}
                            Brutto: {portfolioSummary.totalPL} ({portfolioSummary.totalPLPercent})
                        </span>

                        {portfolioSummary.isTaxExempt ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/15">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                0% Belki (100% zysku netto)
                            </span>
                        ) : portfolioSummary.totalTaxReserveValue > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-3 py-1 text-xs font-medium text-slate-400 ring-1 ring-inset ring-white/10">
                                Netto: <span className="text-slate-100 font-bold">{portfolioSummary.totalNetPL}</span>
                                <span className="text-slate-500 ml-1">
                                    (-{portfolioSummary.totalTaxReserve} Belka 19%)
                                </span>
                            </span>
                        ) : null}
                    </div>
                </div>

                <div data-testid="cash-card" className="glass relative rounded-3xl p-6 overflow-hidden flex flex-col">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -bottom-20 -right-10 h-48 w-48 rounded-full bg-cyan-400/15 blur-3xl"
                    />
                    <div className="relative flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-500/30">
                            <Wallet size={18} />
                        </span>
                        <span className="text-sm font-medium text-slate-300">Gotówka</span>
                    </div>
                    <h2 className="relative mt-auto pt-6 text-4xl font-bold tracking-tight text-white">
                        {portfolioSummary.cash}{' '}
                        <span className="text-base font-medium text-slate-400">
                            {portfolioSummary.baseCurrency || 'PLN'}
                        </span>
                    </h2>
                    <p className="relative mt-1 text-xs text-slate-500">Wolne środki na rachunku</p>
                </div>
            </div>

            <div className="flex-1 min-h-0 flex gap-5">
                <div
                    data-testid="assets-sidebar"
                    className="w-1/3 min-w-[300px] glass rounded-3xl flex flex-col overflow-hidden"
                >
                    <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                        <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                            <Search size={16} className="text-slate-400" />
                            Instrumenty
                        </h3>
                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-slate-400">
                            {assets.length + watchlist.filter(w => !assets.some(a => a.ticker === w.ticker)).length}
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {assets.length > 0 && (
                            <div data-testid="portfolio-assets" className="mb-4">
                                <p className="text-xs uppercase font-bold text-slate-400 px-3 py-2">Twój Portfel</p>
                                {assets.map(a => (
                                    <AssetItem
                                        key={a.ticker}
                                        ticker={a.ticker}
                                        price={a.price}
                                        currency={a.currency || 'PLN'}
                                        pl={a.pl}
                                        amount={a.amount}
                                        selected={selectedTicker === a.ticker}
                                        onClick={() => setSelectedTicker(a.ticker)}
                                    />
                                ))}
                            </div>
                        )}

                        {watchlist.length > 0 && (
                            <div data-testid="watchlist-assets">
                                <p className="text-xs uppercase font-bold text-slate-400 px-3 py-2 flex items-center gap-1">
                                    <Star size={12} className="text-yellow-500/50" /> Obserwowane
                                </p>
                                {watchlist
                                    .filter(w => !assets.some(a => a.ticker === w.ticker))
                                    .map(w => {
                                        const cached = getCachedPrice(w.ticker);
                                        return (
                                            <AssetItem
                                                key={w.ticker}
                                                ticker={w.ticker}
                                                price={cached ? cached.price : '...'}
                                                currency={cached ? cached.currency || 'PLN' : 'PLN'}
                                                pl={null}
                                                isWatchlist
                                                selected={selectedTicker === w.ticker}
                                                onClick={() => setSelectedTicker(w.ticker)}
                                                onRemove={e => {
                                                    e.stopPropagation();
                                                    removeFromWatchlist(w.ticker);
                                                }}
                                            />
                                        );
                                    })}
                            </div>
                        )}

                        {assets.length === 0 && watchlist.length === 0 && (
                            <div className="text-center p-8 text-slate-500 text-sm">Brak instrumentów. Dodaj coś!</div>
                        )}
                    </div>
                </div>

                <div
                    data-testid="chart-container"
                    className="flex-1 glass rounded-3xl flex flex-col overflow-hidden relative"
                >
                    {selectedTicker ? (
                        <>
                            <div className="p-6 border-b border-white/[0.06] flex justify-between items-start">
                                <div>
                                    <h2 className="text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
                                        {selectedTicker}
                                        {!currentAssetInfo.isOwned && (
                                            <Star size={24} className="text-yellow-500 fill-yellow-500/20" />
                                        )}
                                    </h2>
                                    <div className="flex items-center gap-4 mt-2">
                                        <span className="text-2xl font-medium text-slate-200">
                                            {currentAssetInfo.price !== '---'
                                                ? formatNumber(currentAssetInfo.price as number)
                                                : '---'}{' '}
                                            <span className="text-sm text-slate-500">
                                                {currentAssetInfo.currency || 'PLN'}
                                            </span>
                                        </span>
                                        {chartStats && (
                                            <span
                                                className={cn(
                                                    'px-2 py-1 rounded text-sm font-bold',
                                                    plSign(chartStats.change) > 0
                                                        ? 'bg-emerald-500/10 text-emerald-400'
                                                        : plSign(chartStats.change) < 0
                                                          ? 'bg-rose-500/10 text-rose-400'
                                                          : 'bg-white/[0.05] text-slate-300'
                                                )}
                                            >
                                                {chartStats.change > 0 && '+'}
                                                {formatNumber(chartStats.change)} {chartCurrency} (
                                                {formatNumber(chartStats.percent)}%)
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div
                                    data-testid="chart-range-selector"
                                    className="flex bg-black/20 p-1 rounded-2xl gap-1 ring-1 ring-inset ring-white/[0.06]"
                                >
                                    {ranges.map(r => (
                                        <button
                                            key={r.val}
                                            data-testid={`chart-range-${r.val}`}
                                            onClick={() => setChartRange(r.val)}
                                            className={cn(
                                                'px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all',
                                                chartRange === r.val
                                                    ? 'bg-blue-600 text-white shadow-lg shadow-violet-600/30'
                                                    : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                                            )}
                                        >
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex-1 relative w-full h-full">
                                {isLoadingChart ? (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="flex flex-col items-center gap-3 animate-pulse">
                                            <BarChart3 className="text-blue-500" size={32} />
                                            <span className="text-sm text-blue-400 font-medium">
                                                Pobieranie danych historycznych...
                                            </span>
                                        </div>
                                    </div>
                                ) : chartData.length > 0 ? (
                                    <WebGPUChart
                                        data={chartData}
                                        currency={chartCurrency}
                                        range={chartRange}
                                        color={
                                            // Line follows the move over the selected range, like the badge above
                                            chartStats && chartStats.change < 0
                                                ? [0.9, 0.3, 0.3, 1.0]
                                                : [0.2, 0.8, 0.4, 1.0]
                                        }
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2">
                                        <Clock size={32} className="opacity-20" />
                                        <p>Brak danych historycznych dla tego okresu.</p>
                                    </div>
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

const AssetItem = React.memo<AssetItemProps>(
    ({ ticker, price, currency, pl, amount, selected, onClick, isWatchlist, onRemove }) => (
        <div
            data-testid={`asset-item-${ticker}`}
            onClick={onClick}
            className={cn(
                'relative p-3 rounded-xl cursor-pointer transition-all flex justify-between items-center group border',
                selected
                    ? 'bg-gradient-to-r from-violet-500/20 to-blue-500/5 border-white/10'
                    : 'bg-transparent border-transparent hover:bg-white/[0.04]'
            )}
        >
            <div className="flex items-center gap-3">
                <div
                    className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm',
                        selected
                            ? 'bg-blue-600 text-white shadow-md shadow-violet-600/30'
                            : 'bg-white/[0.06] text-slate-300 group-hover:bg-white/10 group-hover:text-white'
                    )}
                >
                    {ticker[0]}
                </div>
                <div>
                    <p className={cn('font-bold text-sm', selected ? 'text-white' : 'text-slate-200')}>{ticker}</p>
                    {!isWatchlist && (
                        <p className={cn('text-xs', selected ? 'text-blue-200' : 'text-slate-500')}>
                            {amount && formatQuantity(amount)} szt.
                        </p>
                    )}
                    {isWatchlist && (
                        <p
                            className={cn(
                                'text-[10px] uppercase tracking-wider',
                                selected ? 'text-blue-200' : 'text-slate-600'
                            )}
                        >
                            Obs.
                        </p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-3">
                <div className="text-right">
                    <p className={cn('font-medium text-sm', selected ? 'text-white' : 'text-slate-200')}>
                        {price !== null && price !== '...' ? formatNumber(price as number) : '---'}{' '}
                        <span className="text-[10px] opacity-70">{currency}</span>
                    </p>
                    {pl && <p className={cn('text-xs font-bold', plTextClass(pl))}>{pl}</p>}
                </div>
                {isWatchlist && onRemove && (
                    <button
                        data-testid={`remove-watchlist-${ticker}`}
                        onClick={onRemove}
                        className={cn(
                            'p-2 rounded-lg transition-all z-20',
                            selected
                                ? 'text-blue-200 hover:bg-white/20 hover:text-rose-400'
                                : 'text-slate-500 hover:text-rose-400 hover:bg-slate-700'
                        )}
                        title="Usuń z obserwowanych"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
            </div>
        </div>
    )
);
