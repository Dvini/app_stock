import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { cn } from '../lib/utils';
import { formatNumber } from '../utils/formatters';

export const Transactions = () => {
    const transactions = useLiveQuery(() => db.transactions.reverse().toArray()) || [];

    return (
        <div className="space-y-8 animate-in fade-in zoom-in duration-500">
            <header className="flex justify-between items-center">
                <h1 className="text-3xl font-extrabold tracking-tight">Historia Transakcji</h1>
            </header>

            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Data</th>
                            <th className="px-6 py-4">Typ</th>
                            <th className="px-6 py-4">Ticker</th>
                            <th className="px-6 py-4 text-right">Ilość</th>
                            <th className="px-6 py-4 text-right">Cena</th>
                            <th className="px-6 py-4 text-right">Wartość</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {transactions.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="px-6 py-8 text-center text-slate-500 italic">
                                    Brak transakcji w historii.
                                </td>
                            </tr>
                        ) : (
                            transactions.map(tx => (
                                <tr key={tx.id} className="hover:bg-slate-800/50 transition-colors">
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
                                    <td className="px-6 py-4 text-right">{formatNumber(tx.amount)}</td>
                                    <td className="px-6 py-4 text-right">
                                        {formatNumber(tx.price)} <span className="text-xs text-slate-500">{tx.currency || 'PLN'}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold">
                                        {formatNumber(tx.total)} <span className="text-xs font-normal text-slate-500">{tx.currency || 'PLN'}</span>
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
