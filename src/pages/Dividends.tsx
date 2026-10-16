import React, { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from 'sonner';
import { Info, RefreshCw, Pencil } from 'lucide-react';
import { DividendEditModal } from '../components/DividendEditModal';
import { dividendNetPLN, dividendRate, dividendWithholdingRate } from '../utils/dividendTax';
import { cn } from '../lib/utils';
import { useDividends } from '../hooks/useDividends';
import { usePortfolioAccount } from '../context/PortfolioContext';
import { formatNumber } from '../utils/formatters';
import { ErrorBanner, SkeletonLoader } from '../components/UIComponents';
import type { Dividend, PortfolioAccount } from '../types/database';

interface Tooltip {
    title: string;
    description: string;
    formula?: string;
}

interface StatCardProps {
    label: string;
    value: string;
    sublabel: string;
    color: 'emerald' | 'blue' | 'purple' | 'amber';
    tooltip?: Tooltip;
    isLoading: boolean;
}

export const Dividends = () => {
    const {
        ytdTotal,
        upcoming60Days,
        yieldOnCost,
        monthlyAverage,
        calendar,
        received,
        syncDividendsManually,
        isLoading,
        error
    } = useDividends();
    const { portfolios, isAllPortfolios } = usePortfolioAccount();

    const [refreshing, setRefreshing] = useState(false);

    const handleManualRefresh = async () => {
        setRefreshing(true);
        try {
            const result = await syncDividendsManually();
            toast.success(`Zsynchronizowano: +${result.added} dywidend`);
        } catch {
            toast.error('Błąd synchronizacji dywidend');
        } finally {
            setRefreshing(false);
        }
    };

    // Net of tax withheld at source - what actually reached the account
    const totalReceivedPLN = useMemo(() => {
        return received.reduce((sum, div) => sum + (dividendNetPLN(div) ?? 0), 0);
    }, [received]);

    const previousYearTotal = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const previousYear = currentYear - 1;

        return received
            .filter(d => new Date(d.paymentDate).getFullYear() === previousYear)
            .reduce((sum, d) => sum + (d.valuePLN || 0), 0);
    }, [received]);

    const tooltips: { [key: string]: Tooltip } = {
        ytdTotal: {
            title: 'Wpływ YTD',
            description: `Bieżący rok (${new Date().getFullYear()}): ${formatNumber(ytdTotal)} PLN\nPoprzedni rok (${new Date().getFullYear() - 1}): ${formatNumber(previousYearTotal)} PLN`
        }
    };

    return (
        <div
            data-testid="dividends-page"
            className="space-y-8 animate-in fade-in zoom-in duration-500 h-full flex flex-col"
        >
            {error && !isLoading && <ErrorBanner error={error} onDismiss={() => {}} />}

            <header className="shrink-0 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Dywidendy</h1>
                    <p className="text-slate-400 text-sm mt-1">Kalendarz wypłat i przychody pasywne</p>
                </div>
                <button
                    data-testid="refresh-dividends-button"
                    onClick={handleManualRefresh}
                    disabled={refreshing || isLoading}
                    className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all',
                        refreshing || isLoading
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                    )}
                >
                    <RefreshCw size={16} className={refreshing || isLoading ? 'animate-spin' : ''} />
                    {refreshing ? 'Synchronizacja...' : 'Odśwież dywidendy'}
                </button>
            </header>

            <div
                data-testid="dividends-summary-cards"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0"
            >
                <StatCard
                    label="Wpływ Suma"
                    value={`${formatNumber(ytdTotal)} PLN`}
                    sublabel={`Rok ${new Date().getFullYear()} `}
                    color="emerald"
                    tooltip={tooltips.ytdTotal}
                    isLoading={isLoading}
                />
                <StatCard
                    label="Oczekiwane (60 dni)"
                    value={`${formatNumber(upcoming60Days)} PLN`}
                    sublabel="Najbliższe 2 miesiące"
                    color="blue"
                    isLoading={isLoading}
                />
                <StatCard
                    label="Yield on Cost"
                    value={`${formatNumber(yieldOnCost)}% `}
                    sublabel="Rentowność dywidendowa"
                    color="purple"
                    isLoading={isLoading}
                />
                <StatCard
                    label="Średnia Miesięczna"
                    value={`${formatNumber(monthlyAverage)} PLN`}
                    sublabel="Ostatnie 12 miesięcy"
                    color="amber"
                    isLoading={isLoading}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-hidden">
                <div
                    data-testid="calendar-section"
                    className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col"
                >
                    <div className="px-6 py-4 border-b border-slate-800 shrink-0">
                        <h2 className="text-xl font-bold">Kalendarz Rynkowy</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Nadchodzące dywidendy (następne 60 dni)</p>
                    </div>
                    <div className="overflow-auto flex-1 custom-scrollbar">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-950 text-slate-400 text-xs uppercase sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3">Ticker</th>
                                    <th className="px-4 py-3">Record Date</th>
                                    <th className="px-4 py-3">Payment Date</th>
                                    <th className="px-4 py-3 text-right">DPS</th>
                                    <th className="px-4 py-3 text-right">Szacowane</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {calendar.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">
                                            Brak nadchodzących dywidend w ciągu 60 dni.
                                        </td>
                                    </tr>
                                ) : (
                                    calendar.map((div, i) => (
                                        <tr
                                            key={i}
                                            data-testid={`calendar-dividend-${div.ticker}-${i}`}
                                            className="hover:bg-slate-800/50 transition-colors"
                                        >
                                            <td className="px-4 py-3 font-bold text-blue-400">{div.ticker}</td>
                                            <td className="px-4 py-3 text-slate-400 text-xs">{div.recordDate}</td>
                                            <td className="px-4 py-3 text-slate-400 text-xs">{div.paymentDate}</td>
                                            <td className="px-4 py-3 text-right">
                                                {formatNumber(div.amountPerShare)}{' '}
                                                <span className="text-xs text-slate-500">{div.currency}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-emerald-400">
                                                ~
                                                {formatNumber(
                                                    (div as Dividend & { estimatedPLN?: number }).estimatedPLN || 0
                                                )}{' '}
                                                PLN
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <VirtualizedDividendsTable
                    received={received}
                    isLoading={isLoading}
                    totalReceivedPLN={totalReceivedPLN}
                    portfolios={portfolios}
                    isAllPortfolios={isAllPortfolios}
                />
            </div>
        </div>
    );
};

// Virtualized table component for efficient rendering of large dividend lists
interface VirtualizedDividendsTableProps {
    received: Dividend[];
    isLoading: boolean;
    totalReceivedPLN: number;
    portfolios: PortfolioAccount[];
    isAllPortfolios: boolean;
}

const VirtualizedDividendsTable: React.FC<VirtualizedDividendsTableProps> = ({
    received,
    isLoading,
    totalReceivedPLN,
    portfolios,
    isAllPortfolios
}) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const [editing, setEditing] = useState<(Dividend & { id: number }) | null>(null);

    const portfolioMap = useMemo(() => {
        const map = new Map<number, PortfolioAccount>();
        portfolios.forEach(p => {
            if (p.id) map.set(p.id, p);
        });
        return map;
    }, [portfolios]);

    const showPortfolio = isAllPortfolios && portfolios.length > 1;

    const rowVirtualizer = useVirtualizer({
        count: received.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 58, // Estimated row height in pixels
        overscan: 5 // Number of items to render outside visible area
    });

    // Grid column template for full-width responsive columns
    const gridTemplate = showPortfolio
        ? 'minmax(90px, 1fr) minmax(100px, 1fr) minmax(70px, 0.7fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(80px, 0.8fr) minmax(110px, 1.1fr) minmax(50px, 0.5fr) 36px'
        : 'minmax(100px, 1fr) minmax(80px, 0.8fr) minmax(120px, 1.3fr) minmax(120px, 1.3fr) minmax(100px, 1fr) minmax(130px, 1.4fr) minmax(70px, 0.7fr) 36px';

    return (
        <div
            data-testid="received-dividends-section"
            className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col"
        >
            <div className="px-6 py-4 border-b border-slate-800 shrink-0 flex items-baseline justify-between">
                <div>
                    <h2 className="text-xl font-bold">Portfel: Otrzymane</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Historia wypłaconych dywidend</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-slate-500">Suma wypłat netto</p>
                    <p className="text-2xl font-bold text-emerald-400 font-mono">
                        {formatNumber(totalReceivedPLN)} PLN
                    </p>
                </div>
            </div>

            <div ref={parentRef} className="overflow-auto flex-1 custom-scrollbar">
                {isLoading ? (
                    <div className="px-4 py-4">
                        <SkeletonLoader rows={5} />
                    </div>
                ) : received.length === 0 ? (
                    <div className="px-6 py-8 text-center text-slate-500 italic">
                        Brak otrzymanych dywidend w historii.
                    </div>
                ) : (
                    <div>
                        {/* Header - fixed */}
                        <div
                            className="bg-slate-950 text-slate-400 text-xs uppercase sticky top-0 z-10 px-4 py-3"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: gridTemplate,
                                gap: '8px'
                            }}
                        >
                            <div>Data</div>
                            {showPortfolio && <div>Portfel</div>}
                            <div>Ticker</div>
                            <div className="text-right">DPS</div>
                            <div className="text-right">Kwota</div>
                            <div className="text-right">Kurs NBP</div>
                            <div className="text-right">Netto PLN</div>
                            <div className="text-center">Szt.</div>
                            <div />
                        </div>

                        {/* Virtualized rows */}
                        <div
                            style={{
                                height: `${rowVirtualizer.getTotalSize()}px`,
                                position: 'relative'
                            }}
                        >
                            {rowVirtualizer.getVirtualItems().map(virtualRow => {
                                const div = received[virtualRow.index];
                                if (!div) return null;
                                const p = portfolioMap.get(div.portfolioId ?? 1);
                                const rate = dividendRate(div);
                                const net = dividendNetPLN(div);
                                return (
                                    <div
                                        key={div.id}
                                        data-testid={`dividend-row-${div.ticker}-${div.paymentDate}`}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            height: `${virtualRow.size}px`,
                                            transform: `translateY(${virtualRow.start}px)`,
                                            display: 'grid',
                                            gridTemplateColumns: gridTemplate,
                                            gap: '8px',
                                            alignItems: 'center'
                                        }}
                                        className="hover:bg-slate-800/50 transition-colors px-4 py-3 border-b border-slate-800"
                                    >
                                        <div className="text-slate-400 text-sm">{div.paymentDate}</div>
                                        {showPortfolio && (
                                            <div>
                                                <span
                                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
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
                                                    <span className="truncate max-w-[80px]">{p?.name || 'Główny'}</span>
                                                </span>
                                            </div>
                                        )}
                                        <div className="font-bold text-blue-400">{div.ticker}</div>
                                        <div className="text-right text-slate-300 font-mono text-sm">
                                            {formatNumber(div.amountPerShare, 2, 4)}{' '}
                                            <span className="text-xs text-slate-500">{div.currency}</span>
                                        </div>
                                        <div className="text-right">
                                            {formatNumber(div.totalAmount)}{' '}
                                            <span className="text-xs text-slate-500">{div.currency}</span>
                                        </div>
                                        <div className="text-right text-slate-400 font-mono text-sm">
                                            {div.currency === 'PLN' ? (
                                                '-'
                                            ) : rate !== null ? (
                                                formatNumber(rate, 4, 4)
                                            ) : (
                                                <span className="text-amber-400" title="Brak kursu NBP">
                                                    brak
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-right font-mono">
                                            <div className="font-bold text-emerald-400">
                                                {net !== null ? `${formatNumber(net)} PLN` : '—'}
                                            </div>
                                            <div className="text-[10px] text-slate-500">
                                                podatek u źródła {dividendWithholdingRate(div)}%
                                            </div>
                                        </div>
                                        <div className="text-center text-sm text-slate-500">{div.sharesOwned}</div>
                                        <button
                                            data-testid={`edit-dividend-${div.id}`}
                                            onClick={() => setEditing(div as Dividend & { id: number })}
                                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-slate-800 transition"
                                            title="Edytuj datę wypłaty i podatek u źródła"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
            {editing && <DividendEditModal key={editing.id} dividend={editing} onClose={() => setEditing(null)} />}
        </div>
    );
};

const StatCard = React.memo<StatCardProps>(({ label, value, sublabel, color, tooltip, isLoading }) => {
    const colorClasses = {
        emerald: 'text-emerald-400',
        blue: 'text-blue-400',
        purple: 'text-purple-400',
        amber: 'text-amber-400'
    };

    return (
        <div
            className={cn(
                'bg-slate-900 rounded-2xl border border-slate-800 p-6 relative',
                tooltip && 'group cursor-help'
            )}
        >
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-slate-500 uppercase font-bold">{label}</span>
                {tooltip && <Info size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors" />}
            </div>

            {isLoading ? (
                <div className="h-9 bg-slate-800 animate-pulse rounded-lg mb-1" />
            ) : (
                <div className={cn('text-3xl font-bold mb-1', colorClasses[color])}>{value}</div>
            )}

            <span className="text-xs text-slate-600">{sublabel}</span>

            {tooltip && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-slate-800 border border-slate-700 rounded-xl shadow-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    <p className="text-xs text-slate-400 font-bold mb-2 uppercase">{tooltip.title}</p>
                    <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">{tooltip.description}</p>
                    {tooltip.formula && (
                        <div className="bg-slate-900 px-3 py-2 rounded-lg mt-3">
                            <code className="text-xs text-blue-300 font-mono">{tooltip.formula}</code>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});
