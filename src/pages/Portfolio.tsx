import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { MissingRatesNotice } from '../components/UIComponents';
import { cn } from '../lib/utils';
import { PlusCircle, PieChart as PieIcon, LineChart as LineIcon } from 'lucide-react';
import { usePortfolio } from '../hooks/usePortfolio';
import { usePortfolioAccount } from '../context/PortfolioContext';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { PieChart } from '../components/PieChart';
import { WebGPUChart } from '../components/WebGPUChart';
import { calculatePortfolioHistory } from '../lib/portfolioHistory';
import { formatNumber, formatQuantity } from '../utils/formatters';
import type { Dividend } from '../types/database';

type ViewMode = 'pie' | 'history';
type HistoryRange = '1d' | '5d' | '1mo' | '1y' | '5y' | 'max';

interface HistoryDataPoint {
    time: number;
    price: number;
    value: number;
}

const EMPTY_DIVIDENDS: Dividend[] = [];

export const Portfolio = () => {
    const { assets, portfolioSummary, transactions } = usePortfolio();
    const { portfolios, isAllPortfolios, activePortfolioId } = usePortfolioAccount();
    const [showAddModal, setShowAddModal] = useState(false);
    const dividends =
        useLiveQuery(
            () => db.dividends.filter(d => isAllPortfolios || (d.portfolioId ?? 1) === activePortfolioId).toArray(),
            [isAllPortfolios, activePortfolioId]
        ) ?? EMPTY_DIVIDENDS;

    const portfolioMap = useMemo(() => {
        const map = new Map<number, (typeof portfolios)[0]>();
        portfolios.forEach(p => {
            if (p.id) map.set(p.id, p);
        });
        return map;
    }, [portfolios]);

    const [viewMode, setViewMode] = useState<ViewMode>('history');
    const [historyData, setHistoryData] = useState<HistoryDataPoint[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyRange, setHistoryRange] = useState<HistoryRange>('max');
    const [selectedTicker, setSelectedTicker] = useState('PORTFOLIO');
    const [sessionDate, setSessionDate] = useState<string | undefined>(undefined);

    const pieData = assets
        .map(a => ({
            label: a.ticker,
            value: a.valueBase,
            pl: a.pl
        }))
        .sort((a, b) => b.value - a.value);

    useEffect(() => {
        if (viewMode !== 'history') return;

        const loadHistory = async () => {
            setHistoryLoading(true);
            try {
                let data;
                let newSessionDate: string | undefined;
                if (selectedTicker === 'PORTFOLIO') {
                    const result = await calculatePortfolioHistory(transactions, historyRange, false, false, dividends);
                    data = result.data;
                    newSessionDate = result.sessionDate;
                } else {
                    const tickerTx = transactions.filter(t => t.ticker === selectedTicker);
                    const result = await calculatePortfolioHistory(tickerTx, historyRange, true, true);
                    data = result.data;
                    newSessionDate = result.sessionDate;
                }

                setSessionDate(newSessionDate);

                const plData: HistoryDataPoint[] = data.map(d => ({
                    time: d.time,
                    price: d.pl,
                    value: d.price
                }));

                setHistoryData(plData);
            } catch (e) {
                console.error('History calc failed', e);
            }
            setHistoryLoading(false);
        };

        if (transactions.length > 0) {
            loadHistory();
        }
    }, [transactions, dividends, viewMode, historyRange, selectedTicker]);

    return (
        <div
            data-testid="portfolio-page"
            className="space-y-8 animate-in fade-in zoom-in duration-500 h-full flex flex-col"
        >
            <header className="flex justify-between items-center shrink-0">
                <h1 className="text-3xl font-extrabold tracking-tight">Twój Portfel</h1>
                <button
                    data-testid="add-transaction-button"
                    onClick={() => setShowAddModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
                >
                    <PlusCircle size={20} />
                    Nowa Transakcja
                </button>
            </header>

            <MissingRatesNotice currencies={portfolioSummary.missingRateCurrencies} />

            <div data-testid="portfolio-summary-cards" className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                <div
                    data-testid="total-value-card"
                    className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 relative group cursor-help"
                >
                    <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Wartość Całkowita</p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <h2 className="text-2xl font-bold">{portfolioSummary.totalValue}</h2>
                        <span className="text-sm text-slate-500">{portfolioSummary.baseCurrency}</span>
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
                </div>
                <div
                    data-testid="pl-card"
                    className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 relative group cursor-help"
                >
                    <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Wynik (P/L)</p>
                    <div
                        className={cn(
                            'text-2xl font-bold mt-1 flex items-center gap-2',
                            portfolioSummary.totalPL.includes('-') ? 'text-rose-400' : 'text-emerald-400'
                        )}
                    >
                        {portfolioSummary.totalPL}
                        <span className="text-sm font-normal text-slate-500">({portfolioSummary.totalPLPercent})</span>
                    </div>
                    {portfolioSummary.breakdown && portfolioSummary.breakdown.some(b => b.pl !== 0) && (
                        <div className="absolute top-full left-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            <p className="text-xs text-slate-400 font-bold mb-2 uppercase">Wynik wg walut:</p>
                            <div className="space-y-2">
                                {portfolioSummary.breakdown
                                    .filter(b => b.pl !== 0)
                                    .map(b => (
                                        <div
                                            key={b.currency}
                                            className="flex justify-between items-center text-sm border-b border-slate-700/50 pb-1 last:border-0 last:pb-0"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-slate-300 font-medium">{b.currency}</span>
                                            </div>
                                            <span
                                                className={cn(
                                                    'text-xs font-bold',
                                                    b.pl > 0 ? 'text-emerald-400' : 'text-rose-400'
                                                )}
                                            >
                                                {b.pl > 0 ? '+' : ''}
                                                {formatNumber(b.pl)}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>
                <div data-testid="cash-card" className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
                    <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Gotówka</p>
                    <h2 className="text-2xl font-bold mt-1">
                        {portfolioSummary.cash}{' '}
                        <span className="text-sm font-normal text-slate-500">{portfolioSummary.baseCurrency}</span>
                    </h2>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[450px] shrink-0">
                <div
                    data-testid="portfolio-chart-section"
                    className="lg:col-span-3 bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col relative overflow-hidden"
                >
                    <div className="flex justify-between items-center mb-4 z-10">
                        <div data-testid="view-mode-selector" className="flex bg-slate-800 p-1 rounded-lg">
                            <button
                                data-testid="view-history-button"
                                onClick={() => setViewMode('history')}
                                className={cn(
                                    'px-4 py-2 rounded-md flex items-center gap-2 text-sm font-bold transition-all',
                                    viewMode === 'history'
                                        ? 'bg-slate-700 text-white shadow'
                                        : 'text-slate-400 hover:text-slate-200'
                                )}
                            >
                                <LineIcon size={16} /> Historia
                            </button>
                            <button
                                data-testid="view-pie-button"
                                onClick={() => setViewMode('pie')}
                                className={cn(
                                    'px-4 py-2 rounded-md flex items-center gap-2 text-sm font-bold transition-all',
                                    viewMode === 'pie'
                                        ? 'bg-slate-700 text-white shadow'
                                        : 'text-slate-400 hover:text-slate-200'
                                )}
                            >
                                <PieIcon size={16} /> Alokacja %
                            </button>
                        </div>

                        {viewMode === 'history' && (
                            <div data-testid="history-controls" className="flex gap-2">
                                <select
                                    data-testid="ticker-selector"
                                    value={selectedTicker}
                                    onChange={e => setSelectedTicker(e.target.value)}
                                    className="bg-slate-800 text-slate-200 text-sm font-bold rounded-lg px-3 py-2 outline-none border border-slate-700"
                                >
                                    <option value="PORTFOLIO">Cały Portfel</option>
                                    {assets.map(a => (
                                        <option key={a.ticker} value={a.ticker}>
                                            {a.ticker}
                                        </option>
                                    ))}
                                </select>
                                <div data-testid="history-range-selector" className="flex bg-slate-800 rounded-lg p-1">
                                    {[
                                        { l: '1D', v: '1d' as HistoryRange },
                                        { l: '1T', v: '5d' as HistoryRange },
                                        { l: '1M', v: '1mo' as HistoryRange },
                                        { l: '1R', v: '1y' as HistoryRange },
                                        { l: '5L', v: '5y' as HistoryRange },
                                        { l: 'MAX', v: 'max' as HistoryRange }
                                    ].map(r => (
                                        <button
                                            key={r.v}
                                            data-testid={`history-range-${r.v}`}
                                            onClick={() => setHistoryRange(r.v)}
                                            className={cn(
                                                'px-3 py-1 rounded text-xs font-bold',
                                                historyRange === r.v ? 'bg-slate-600 text-white' : 'text-slate-400'
                                            )}
                                        >
                                            {r.l}
                                        </button>
                                    ))}
                                </div>
                                {historyRange === '1d' && sessionDate && (
                                    <span className="text-xs text-slate-400 ml-2 self-center">
                                        Sesja: {sessionDate}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-h-0 relative">
                        {viewMode === 'pie' ? (
                            <div className="w-full h-full flex items-center justify-center">
                                <div className="w-full h-full max-w-[400px]">
                                    <PieChart data={pieData} />
                                </div>
                                <div className="ml-8 hidden md:block space-y-2 max-h-full overflow-y-auto custom-scrollbar pr-2">
                                    {pieData.map((d, i) => (
                                        <div key={d.label} className="flex items-center gap-2 text-sm">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{
                                                    background: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][
                                                        i % 5
                                                    ]
                                                }}
                                            />
                                            <span className="font-bold text-slate-300 w-16">{d.label}</span>
                                            <span className="text-slate-500">
                                                {((d.value / pieData.reduce((a, b) => a + b.value, 0)) * 100).toFixed(
                                                    1
                                                )}
                                                %
                                            </span>
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
                                        range={historyRange}
                                        currency={
                                            selectedTicker === 'PORTFOLIO'
                                                ? portfolioSummary.baseCurrency || 'PLN'
                                                : assets.find(a => a.ticker === selectedTicker)?.currency || 'PLN'
                                        }
                                        color={
                                            (historyData[historyData.length - 1]?.price ?? 0) < 0
                                                ? [0.9, 0.3, 0.3, 1.0] // Red for loss
                                                : [0.2, 0.8, 0.4, 1.0] // Green for profit
                                        }
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div
                data-testid="portfolio-assets-table"
                className="bg-slate-900 rounded-2xl border border-slate-800 overflow-auto custom-scrollbar flex-1"
            >
                <table className="w-full text-left">
                    <thead className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wider sticky top-0 z-10">
                        <tr>
                            <th className="px-6 py-4">Ticker</th>
                            {isAllPortfolios && portfolios.length > 1 && <th className="px-6 py-4">Portfel</th>}
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
                                <td
                                    colSpan={isAllPortfolios && portfolios.length > 1 ? 7 : 6}
                                    className="px-6 py-8 text-center text-slate-500 italic"
                                >
                                    Twój portfel jest pusty. Kliknij "Nowa Operacja", aby dodać aktywa.
                                </td>
                            </tr>
                        ) : (
                            assets.map(asset => {
                                const p = portfolioMap.get(asset.portfolioId ?? 1);
                                return (
                                    <tr
                                        key={`${asset.ticker}-${asset.portfolioId ?? 1}`}
                                        data-testid={`asset-row-${asset.ticker}`}
                                        className="hover:bg-slate-800/50 transition-colors"
                                    >
                                        <td className="px-6 py-4 font-bold text-blue-400">{asset.ticker}</td>
                                        {isAllPortfolios && portfolios.length > 1 && (
                                            <td className="px-6 py-4">
                                                <span
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                                                    style={{
                                                        backgroundColor: `${p?.color || '#3b82f6'}20`,
                                                        border: `1px solid ${p?.color || '#3b82f6'}40`,
                                                        color: p?.color || '#93c5fd'
                                                    }}
                                                >
                                                    <span
                                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                                        style={{ backgroundColor: p?.color || '#3b82f6' }}
                                                    />
                                                    <span className="truncate max-w-[100px]">
                                                        {p?.name || 'Główny'}
                                                    </span>
                                                </span>
                                            </td>
                                        )}
                                        <td className="px-6 py-4 text-right">{formatQuantity(asset.amount)}</td>
                                        <td className="px-6 py-4 text-right font-medium text-slate-300">
                                            {asset.price !== null ? formatNumber(asset.price) : '---'}{' '}
                                            <span className="text-xs text-slate-500">{asset.currency}</span>
                                            {asset.isRealData && (
                                                <span className="text-[10px] text-emerald-500 ml-1">●</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right text-slate-500">
                                            {formatNumber(asset.avgPrice)}{' '}
                                            <span className="text-xs">{asset.currency}</span>
                                        </td>
                                        <td
                                            className={cn(
                                                'px-6 py-4 text-right font-medium',
                                                asset.pl.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'
                                            )}
                                        >
                                            {asset.pl}
                                            <div className="text-[10px] text-slate-500 font-normal">
                                                {formatNumber(asset.plValue * asset.rate)}{' '}
                                                {portfolioSummary.baseCurrency}
                                            </div>
                                            {asset.taxRate === 0 ? (
                                                <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                                                    0% Belki (ulga)
                                                </div>
                                            ) : asset.estimatedTax > 0 ? (
                                                <div
                                                    className="text-[10px] text-slate-400 font-medium mt-0.5"
                                                    title={`Podatek Belki (19%): -${formatNumber(asset.estimatedTax * asset.rate)} ${portfolioSummary.baseCurrency}`}
                                                >
                                                    netto: ~{formatNumber(asset.netPLValue * asset.rate)}{' '}
                                                    {portfolioSummary.baseCurrency}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold">
                                            <div>
                                                {asset.value}{' '}
                                                <span className="text-xs font-normal text-slate-500">
                                                    {asset.currency}
                                                </span>
                                            </div>
                                            {asset.currency !== portfolioSummary.baseCurrency && (
                                                <div className="text-[10px] text-slate-400">
                                                    ~
                                                    {asset.valueBase.toLocaleString('pl-PL', {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2
                                                    })}{' '}
                                                    {portfolioSummary.baseCurrency}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {showAddModal && <AddTransactionModal onClose={() => setShowAddModal(false)} />}
        </div>
    );
};
