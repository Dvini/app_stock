import { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { cn } from '../lib/utils';
import { formatNumber, formatQuantity } from '../utils/formatters';
import { usePortfolioAccount } from '../context/PortfolioContext';
import { Filter, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { deleteTransaction, LedgerError } from '../lib/ledgerStore';
import { dividendService } from '../lib/DividendService';
import type { Transaction } from '../types/database';

type StoredTransaction = Transaction & { id: number };

export const Transactions = () => {
    const { activePortfolioId, currentPortfolio, portfolios } = usePortfolioAccount();

    const [filterPortfolioId, setFilterPortfolioId] = useState<number | 'ALL'>(activePortfolioId);

    useEffect(() => {
        setFilterPortfolioId(activePortfolioId);
    }, [activePortfolioId]);

    const rawTransactions =
        useLiveQuery(() =>
            db.transactions
                .toArray()
                .then(txs => txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
        ) || [];

    const portfolioMap = useMemo(() => {
        const map = new Map<number, (typeof portfolios)[0]>();
        portfolios.forEach(p => {
            if (p.id) map.set(p.id, p);
        });
        return map;
    }, [portfolios]);

    const transactions: Transaction[] = useMemo(() => {
        if (filterPortfolioId === 'ALL') return rawTransactions;
        return rawTransactions.filter(tx => (tx.portfolioId ?? 1) === filterPortfolioId);
    }, [rawTransactions, filterPortfolioId]);

    const showPortfolioColumn = portfolios.length > 1;
    const [editingTx, setEditingTx] = useState<StoredTransaction | null>(null);

    const describe = (tx: Transaction) =>
        tx.ticker && tx.ticker !== 'CASH'
            ? `${tx.type} ${tx.ticker} ${tx.date} (${formatQuantity(tx.amount)} szt. × ${formatNumber(tx.price ?? 0)} ${tx.currency || 'PLN'})`
            : `${tx.type} ${tx.date} (${formatNumber(tx.total)} ${tx.currency || 'PLN'})`;

    const handleDelete = async (tx: StoredTransaction) => {
        if (!window.confirm(`Usunąć transakcję?\n\n${describe(tx)}`)) return;
        try {
            await deleteTransaction(tx);
        } catch (error) {
            if (error instanceof LedgerError) {
                toast.error('Nie można usunąć transakcji', { description: error.message, duration: 10000 });
            } else {
                console.error('Failed to delete transaction', error);
                toast.error('Błąd podczas usuwania transakcji');
            }
            return;
        }
        if (tx.ticker && tx.ticker !== 'CASH') {
            try {
                await dividendService.recalculateDividendsForTicker(tx.ticker);
            } catch (error) {
                console.error('Failed to recalculate dividends', error);
            }
        }
        toast.success('Transakcja usunięta');
    };

    return (
        <div
            data-testid="transactions-page"
            className="space-y-8 animate-in fade-in zoom-in duration-500 h-full flex flex-col"
        >
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Historia Transakcji</h1>
                    <p className="text-xs text-slate-400 mt-1">
                        {filterPortfolioId === 'ALL'
                            ? `Zbiorczo ze wszystkich kont (${portfolios.length}) • ${transactions.length} transakcji`
                            : `Rachunek: ${portfolioMap.get(filterPortfolioId as number)?.name || currentPortfolio?.name || 'Główny'} • ${transactions.length} transakcji`}
                    </p>
                </div>

                {portfolios.length > 1 && (
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl">
                        <Filter size={15} className="text-slate-400 ml-2" />
                        <span className="text-xs text-slate-400 font-semibold">Portfel:</span>
                        <select
                            value={filterPortfolioId}
                            onChange={e =>
                                setFilterPortfolioId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
                            }
                            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-blue-500 transition"
                        >
                            <option value="ALL">Wszystkie portfele</option>
                            {portfolios.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.name} ({p.type.toUpperCase()})
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </header>

            <div
                data-testid="transactions-table"
                className="bg-slate-900 rounded-2xl border border-slate-800 overflow-auto custom-scrollbar flex-1"
            >
                <table className="w-full text-left">
                    <thead className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wider sticky top-0 z-10">
                        <tr>
                            <th className="px-6 py-4">Data</th>
                            {showPortfolioColumn && <th className="px-6 py-4">Portfel</th>}
                            <th className="px-6 py-4">Typ</th>
                            <th className="px-6 py-4">Ticker</th>
                            <th className="px-6 py-4 text-right">Ilość</th>
                            <th className="px-6 py-4 text-right">Cena</th>
                            <th className="px-6 py-4 text-right">Wartość</th>
                            <th className="px-6 py-4 text-right">Kurs Waluty</th>
                            <th className="px-6 py-4 text-right">Prowizja</th>
                            <th className="px-6 py-4 text-right">Wartość (PLN)</th>
                            <th className="px-4 py-4">
                                <span className="sr-only">Akcje</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {transactions.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={showPortfolioColumn ? 11 : 10}
                                    className="px-6 py-8 text-center text-slate-500 italic"
                                >
                                    Brak transakcji w historii dla wybranego widoku.
                                </td>
                            </tr>
                        ) : (
                            transactions.map(tx => {
                                const p = portfolioMap.get(tx.portfolioId ?? 1);
                                return (
                                    <tr
                                        key={tx.id}
                                        data-testid={`transaction-row-${tx.id}`}
                                        className="hover:bg-slate-800/50 transition-colors"
                                    >
                                        <td className="px-6 py-4 text-slate-400">{tx.date}</td>

                                        {showPortfolioColumn && (
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

                                        <td className="px-6 py-4 font-medium">
                                            <span
                                                className={cn(
                                                    'px-2 py-1 rounded-md text-xs uppercase font-semibold',
                                                    tx.type === 'Kupno'
                                                        ? 'bg-emerald-500/10 text-emerald-400'
                                                        : tx.type === 'Sprzedaż'
                                                          ? 'bg-rose-500/10 text-rose-400'
                                                          : 'bg-blue-500/10 text-blue-400'
                                                )}
                                            >
                                                {tx.type}
                                            </span>
                                            {tx.note && (
                                                <div className="text-[11px] text-amber-400/80 mt-1 font-normal">
                                                    {tx.note}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-bold text-blue-400">{tx.ticker || '—'}</td>
                                        <td className="px-6 py-4 text-right">
                                            {['Kupno', 'Sprzedaż'].includes(tx.type) ? formatQuantity(tx.amount) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono">
                                            {tx.price !== undefined ? formatNumber(tx.price) : '—'}{' '}
                                            <span className="text-xs text-slate-500 font-normal">
                                                {tx.currency || 'PLN'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold font-mono">
                                            {formatNumber(tx.total)}{' '}
                                            <span className="text-xs font-normal text-slate-500">
                                                {tx.currency || 'PLN'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right text-slate-400 font-mono text-xs">
                                            {tx.currency && tx.currency !== 'PLN' && tx.exchangeRate
                                                ? formatNumber(tx.exchangeRate, 4, 4)
                                                : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-xs">
                                            {tx.commission && tx.commission > 0 ? (
                                                <span className="text-amber-400">
                                                    {formatNumber(tx.commission)}{' '}
                                                    <span className="text-slate-500">
                                                        {tx.commissionCurrency || 'PLN'}
                                                    </span>
                                                </span>
                                            ) : (
                                                <span className="text-slate-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono font-bold">
                                            {formatNumber(tx.total * (tx.exchangeRate || 1))}{' '}
                                            <span className="text-xs font-normal text-slate-500">PLN</span>
                                        </td>
                                        <td className="px-4 py-4">
                                            {tx.id !== undefined && (
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        data-testid={`edit-transaction-${tx.id}`}
                                                        onClick={() => setEditingTx(tx as StoredTransaction)}
                                                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-slate-800 transition"
                                                        title="Edytuj"
                                                    >
                                                        <Pencil size={15} />
                                                    </button>
                                                    <button
                                                        data-testid={`delete-transaction-${tx.id}`}
                                                        onClick={() => handleDelete(tx as StoredTransaction)}
                                                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                                                        title="Usuń"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
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

            {editingTx && (
                <AddTransactionModal
                    key={editingTx.id}
                    transactionToEdit={editingTx}
                    onClose={() => setEditingTx(null)}
                />
            )}
        </div>
    );
};
