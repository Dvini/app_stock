import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { cn } from '../lib/utils';
import { formatNumber, formatQuantity } from '../utils/formatters';

export const Transactions = () => {
    const transactions = useLiveQuery(() => db.transactions.reverse().toArray()) || [];

    return (
        <div data-testid="transactions-page" className="space-y-8 animate-in fade-in zoom-in duration-500 h-full flex flex-col">
            <header className="flex justify-between items-center shrink-0">
                <h1 className="text-3xl font-extrabold tracking-tight">Historia Transakcji</h1>
            </header>

            <div data-testid="transactions-table" className="bg-slate-900 rounded-2xl border border-slate-800 overflow-auto custom-scrollbar flex-1">
                <table className="w-full text-left">
                    <thead className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wider sticky top-0 z-10">
                        <tr>
                            <th className="px-6 py-4">Data</th>
                            <th className="px-6 py-4">Typ</th>
                            <th className="px-6 py-4">Ticker</th>
                            <th className="px-6 py-4 text-right">Ilość</th>
                            <th className="px-6 py-4 text-right">Cena</th>
                            <th className="px-6 py-4 text-right">Wartość</th>
                            <th className="px-6 py-4 text-right">Kurs Waluty</th>
                            <th className="px-6 py-4 text-right">Wartość (PLN)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {transactions.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-8 text-center text-slate-500 italic">
                                    Brak transakcji w historii.
                                </td>
                            </tr>
                        ) : (
                            transactions.map(tx => (
                                <tr key={tx.id} data-testid={`transaction-row-${tx.id}`} className="hover:bg-slate-800/50 transition-colors">
                                    <td className="px-6 py-4 text-slate-400">{tx.date}</td>
                                    <td className="px-6 py-4 font-medium">
                                        <span className={cn("px-2 py-1 rounded-md text-xs uppercase",
                                            tx.type === 'Kupno' ? 'bg-emerald-500/10 text-emerald-400' :
                                                tx.type === 'Sprzedaż' ? 'bg-rose-500/10 text-rose-400' : 'bg-blue-500/10 text-blue-400'
                                        )}>
                                            {tx.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-blue-400">{tx.ticker}</td>
                                    <td className="px-6 py-4 text-right">
                                        {['Kupno', 'Sprzedaż'].includes(tx.type) ? formatQuantity(tx.amount) : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {formatNumber(tx.price)} <span className="text-xs text-slate-500">{tx.currency || 'PLN'}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold">
                                        {formatNumber(tx.total)} <span className="text-xs font-normal text-slate-500">{tx.currency || 'PLN'}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-slate-400 font-mono text-xs">
                                        {tx.currency && tx.currency !== 'PLN' && tx.exchangeRate
                                            ? formatNumber(tx.exchangeRate, 4, 4)
                                            : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono font-bold">
                                        {formatNumber(tx.total * (tx.exchangeRate || 1))}{' '}
                                        <span className="text-xs font-normal text-slate-500">PLN</span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
