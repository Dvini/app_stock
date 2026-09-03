import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Settings2, Layers, Briefcase } from 'lucide-react';
import { usePortfolioAccount } from '../context/PortfolioContext';
import { PortfolioModal } from './PortfolioModal';
import type { PortfolioAccount } from '../types/database';

export const PortfolioSwitcher: React.FC = () => {
    const { activePortfolioId, isAllPortfolios, currentPortfolio, portfolios, setActivePortfolioId } =
        usePortfolioAccount();

    const [isOpen, setIsOpen] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingPortfolio, setEditingPortfolio] = useState<PortfolioAccount | null>(null);

    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (id: number | 'ALL') => {
        setActivePortfolioId(id);
        setIsOpen(false);
    };

    const handleOpenCreate = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingPortfolio(null);
        setShowModal(true);
        setIsOpen(false);
    };

    const handleOpenEdit = (e: React.MouseEvent, p: PortfolioAccount) => {
        e.stopPropagation();
        setEditingPortfolio(p);
        setShowModal(true);
        setIsOpen(false);
    };

    return (
        <div ref={dropdownRef} className="relative mb-6 px-2">
            {/* Main switcher button */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 rounded-2xl p-3 cursor-pointer transition-all flex items-center justify-between group shadow-sm"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-inner"
                        style={{
                            backgroundColor: isAllPortfolios ? '#6366f1' : currentPortfolio?.color || '#3b82f6'
                        }}
                    >
                        {isAllPortfolios ? <Layers size={16} /> : <Briefcase size={16} />}
                    </div>

                    <div className="min-w-0 text-left">
                        <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-white truncate block">
                                {isAllPortfolios ? 'Wszystkie Portfele' : currentPortfolio?.name || 'Wybierz portfel'}
                            </span>
                            {!isAllPortfolios && currentPortfolio?.taxRate === 0 && (
                                <span className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1 py-0.2 rounded font-mono font-bold shrink-0">
                                    0%
                                </span>
                            )}
                        </div>
                        <span className="text-[11px] text-slate-400 block truncate">
                            {isAllPortfolios
                                ? `${portfolios.length} portfele łącznie`
                                : `${currentPortfolio?.type.toUpperCase()} • ${currentPortfolio?.currency || 'PLN'}`}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {!isAllPortfolios && currentPortfolio && (
                        <button
                            type="button"
                            onClick={e => handleOpenEdit(e, currentPortfolio)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/80 transition"
                            title="Edytuj parametry tego portfela"
                        >
                            <Settings2 size={15} />
                        </button>
                    )}
                    <ChevronDown
                        size={16}
                        className={`text-slate-400 transition-transform duration-200 shrink-0 ${
                            isOpen ? 'rotate-180 text-white' : 'group-hover:text-slate-200'
                        }`}
                    />
                </div>
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute left-2 right-2 mt-2 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl z-50 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl">
                    <div className="px-3 py-2 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        Twoje Konta Inwestycyjne
                    </div>

                    {/* Option: Wszystkie Portfele (if > 1 portfolio) */}
                    {portfolios.length > 1 && (
                        <div
                            onClick={() => handleSelect('ALL')}
                            className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between group ${
                                isAllPortfolios
                                    ? 'bg-indigo-600/20 border border-indigo-500/40 text-white'
                                    : 'hover:bg-slate-800/80 text-slate-300'
                            }`}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className="w-6 h-6 rounded-lg bg-indigo-500/30 text-indigo-400 flex items-center justify-center">
                                    <Layers size={14} />
                                </div>
                                <div>
                                    <span className="font-semibold text-xs text-white block">Wszystkie Portfele</span>
                                    <span className="text-[10px] text-slate-400">Widok zagregowany majątku</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Individual portfolios */}
                    <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
                        {portfolios.map(p => {
                            const isSelected = !isAllPortfolios && activePortfolioId === p.id;
                            return (
                                <div
                                    key={p.id}
                                    onClick={() => p.id && handleSelect(p.id)}
                                    className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between group ${
                                        isSelected
                                            ? 'bg-blue-600/20 border border-blue-500/40 text-white'
                                            : 'hover:bg-slate-800/80 text-slate-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div
                                            className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0 text-xs font-bold"
                                            style={{ backgroundColor: p.color || '#3b82f6' }}
                                        >
                                            {p.name[0]}
                                        </div>
                                        <div className="min-w-0 text-left">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-semibold text-xs text-white truncate block">
                                                    {p.name}
                                                </span>
                                                {p.taxRate === 0 && (
                                                    <span className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1 py-0.2 rounded font-mono font-bold shrink-0">
                                                        0%
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-slate-400 block">
                                                {p.type.toUpperCase()} • {p.currency}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={e => handleOpenEdit(e, p)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/80 transition"
                                        title="Ustawienia tego portfela"
                                    >
                                        <Settings2 size={14} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    <div className="border-t border-slate-800 pt-1.5 mt-1">
                        <button
                            onClick={handleOpenCreate}
                            className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-blue-600/20 hover:text-blue-400 text-slate-300 text-xs font-bold transition-all flex items-center justify-center gap-2"
                        >
                            <Plus size={14} />
                            Dodaj nowy portfel
                        </button>
                    </div>
                </div>
            )}

            {/* Portfolio create / edit modal */}
            <PortfolioModal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    setEditingPortfolio(null);
                }}
                portfolioToEdit={editingPortfolio}
            />
        </div>
    );
};
