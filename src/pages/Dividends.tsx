import { useState, useMemo } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { useDividends } from '../hooks/useDividends';
import { formatNumber } from '../utils/formatters';
import { ErrorBanner, SkeletonLoader } from '../components/UIComponents';

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

    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const handleManualRefresh = async () => {
        setRefreshing(true);
        try {
            const result = await syncDividendsManually();
            setToastMessage(`✓ Zsynchronizowano: +${result.added} dywidend`);
            setTimeout(() => setToastMessage(null), 3000);
        } catch (err) {
            setToastMessage('✗ Błąd synchronizacji');
            setTimeout(() => setToastMessage(null), 3000);
        } finally {
            setRefreshing(false);
        }
    };

    const totalReceivedPLN = useMemo(() => {
        return received.reduce((sum, div) => sum + (div.valuePLN || 0), 0);
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
        <div className="space-y-8 animate-in fade-in zoom-in duration-500 h-full flex flex-col">
            {toastMessage && (
                <div className="fixed top-4 right-4 bg-slate-800 border border-slate-700 px-4 py-3 rounded-lg shadow-lg z-50 animate-in slide-in-from-top-2 fade-in">
                    <p className="text-sm font-bold text-slate-200">{toastMessage}</p>
                </div>
            )}

            {error && !isLoading && (
                <ErrorBanner
                    error={error}
                    onDismiss={() => { }}
                />
            )}

            <header className="shrink-0 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Dywidendy</h1>
                    <p className="text-slate-400 text-sm mt-1">Kalendarz wypłat i przychody pasywne</p>
                </div>
                <button
                    onClick={handleManualRefresh}
                    disabled={refreshing || isLoading}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all",
                        refreshing || isLoading
                            ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                    )}
                >
                    <RefreshCw size={16} className={refreshing || isLoading ? "animate-spin" : ""} />
                    {refreshing ? "Synchronizacja..." : "Odśwież dywidendy"}
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
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
                <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
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
                                        <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                                            <td className="px-4 py-3 font-bold text-blue-400">{div.ticker}</td>
                                            <td className="px-4 py-3 text-slate-400 text-xs">{div.recordDate}</td>
                                            <td className="px-4 py-3 text-slate-400 text-xs">{div.paymentDate}</td>
                                            <td className="px-4 py-3 text-right">
                                                {formatNumber(div.amountPerShare)}{' '}
                                                <span className="text-xs text-slate-500">{div.currency}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-emerald-400">
                                                ~{formatNumber((div as any).estimatedPLN || 0)} PLN
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-800 shrink-0 flex items-baseline justify-between">
                        <div>
                            <h2 className="text-xl font-bold">Portfel: Otrzymane</h2>
                            <p className="text-xs text-slate-500 mt-0.5">Historia wypłaconych dywidend</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-500">Suma wszystkich wypłat</p>
                            <p className="text-2xl font-bold text-emerald-400 font-mono">
                                {formatNumber(totalReceivedPLN)} PLN
                            </p>
                        </div>
                    </div>
                    <div className="overflow-auto flex-1 custom-scrollbar">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-950 text-slate-400 text-xs uppercase sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3">Data</th>
                                    <th className="px-4 py-3">Ticker</th>
                                    <th className="px-4 py-3 text-right">DPS</th>
                                    <th className="px-4 py-3 text-right">Kwota</th>
                                    <th className="px-4 py-3 text-right">Kurs NBP</th>
                                    <th className="px-4 py-3 text-right">Wartość PLN</th>
                                    <th className="px-4 py-3 text-center">Akcje</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-4">
                                            <SkeletonLoader rows={5} />
                                        </td>
                                    </tr>
                                ) : received.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-8 text-center text-slate-500 italic">
                                            Brak otrzymanych dywidend w historii.
                                        </td>
                                    </tr>
                                ) : (
                                    received.map((div) => (
                                        <tr key={div.id} className="hover:bg-slate-800/50 transition-colors group">
                                            <td className="px-4 py-3 text-slate-400 text-sm">{div.paymentDate}</td>
                                            <td className="px-4 py-3 font-bold text-blue-400">{div.ticker}</td>
                                            <td className="px-4 py-3 text-right text-slate-300 font-mono text-sm">
                                                {formatNumber(div.amountPerShare, 2, 4)}{' '}
                                                <span className="text-xs text-slate-500">{div.currency}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {formatNumber(div.totalAmount)}{' '}
                                                <span className="text-xs text-slate-500">{div.currency}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-400 font-mono text-sm">
                                                {div.currency !== 'PLN' ? formatNumber(div.exchangeRate, 4, 4) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                                                {formatNumber(div.valuePLN)} PLN
                                            </td>
                                            <td className="px-4 py-3 text-center text-sm text-slate-500">
                                                {div.sharesOwned}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

const StatCard: React.FC<StatCardProps> = ({ label, value, sublabel, color, tooltip, isLoading }) => {
    const colorClasses = {
        emerald: 'text-emerald-400',
        blue: 'text-blue-400',
        purple: 'text-purple-400',
        amber: 'text-amber-400'
    };

    return (
        <div className={cn("bg-slate-900 rounded-2xl border border-slate-800 p-6 relative", tooltip && "group cursor-help")}>
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-slate-500 uppercase font-bold">{label}</span>
                {tooltip && <Info size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors" />}
            </div>

            {isLoading ? (
                <div className="h-9 bg-slate-800 animate-pulse rounded-lg mb-1" />
            ) : (
                <div className={cn("text-3xl font-bold mb-1", colorClasses[color])}>
                    {value}
                </div>
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
};
