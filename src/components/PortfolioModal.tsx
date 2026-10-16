import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Briefcase, Trash2, Check, ShieldCheck } from 'lucide-react';
import { usePortfolioAccount } from '../context/PortfolioContext';
import type { PortfolioAccount, PortfolioType } from '../types/database';

interface PortfolioModalProps {
    isOpen: boolean;
    onClose: () => void;
    portfolioToEdit?: PortfolioAccount | null;
}

const COLOR_OPTIONS = [
    { name: 'Niebieski', value: '#3b82f6' },
    { name: 'Szmaragdowy', value: '#10b981' },
    { name: 'Fioletowy', value: '#8b5cf6' },
    { name: 'Bursztynowy', value: '#f59e0b' },
    { name: 'Różowy', value: '#ec4899' },
    { name: 'Cyjan', value: '#06b6d4' }
];

const PORTFOLIO_TYPES: Array<{
    type: PortfolioType;
    label: string;
    description: string;
    defaultTax: number;
    defaultLimit?: number;
}> = [
    {
        type: 'standard',
        label: 'Rachunek Zwykły / Maklerski',
        description: 'Standardowe opodatkowanie zysków kapitałowych (podatek Belki 19%)',
        defaultTax: 19
    },
    {
        type: 'ike',
        label: 'IKE (Indywidualne Konto Emerytalne)',
        description: '0% podatku Belki, coroczny ustawowy limit wpłat (~26 000 PLN)',
        defaultTax: 0,
        defaultLimit: 26019
    },
    {
        type: 'ikze',
        label: 'IKZE (Indywidualne Konto Zabezpieczenia Emerytalnego)',
        description: 'Ulga podatkowa w PIT, 0% podatku Belki, limit roczny (~10 400 PLN)',
        defaultTax: 0,
        defaultLimit: 10407
    },
    {
        type: 'custom',
        label: 'Portfel Własny',
        description: 'Dowolne parametry i stawka podatku',
        defaultTax: 19
    }
];

export const PortfolioModal: React.FC<PortfolioModalProps> = ({ isOpen, onClose, portfolioToEdit }) => {
    const { createPortfolio, updatePortfolio, deletePortfolio, portfolios } = usePortfolioAccount();

    const isEdit = !!portfolioToEdit;

    const [name, setName] = useState('');
    const [type, setType] = useState<PortfolioType>('standard');
    const [taxRate, setTaxRate] = useState<number>(19);
    const [annualLimit, setAnnualLimit] = useState<string>('');
    const [color, setColor] = useState<string>('#3b82f6');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (portfolioToEdit) {
            setName(portfolioToEdit.name);
            setType(portfolioToEdit.type);
            setTaxRate(portfolioToEdit.taxRate ?? 19);
            setAnnualLimit(portfolioToEdit.annualLimit ? portfolioToEdit.annualLimit.toString() : '');
            setColor(portfolioToEdit.color || '#3b82f6');
        } else {
            setName('');
            setType('standard');
            setTaxRate(19);
            setAnnualLimit('');
            setColor('#3b82f6');
        }
        setError(null);
    }, [portfolioToEdit, isOpen]);

    if (!isOpen) return null;

    const handleTypeChange = (newType: PortfolioType) => {
        setType(newType);
        const config = PORTFOLIO_TYPES.find(p => p.type === newType);
        if (config) {
            setTaxRate(config.defaultTax);
            if (config.defaultLimit && !annualLimit) {
                setAnnualLimit(config.defaultLimit.toString());
            } else if (!config.defaultLimit && newType === 'standard') {
                setAnnualLimit('');
            }
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Podaj nazwę portfela.');
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const limitNum = annualLimit.trim() ? parseFloat(annualLimit) : undefined;

            if (isEdit && portfolioToEdit?.id) {
                await updatePortfolio(portfolioToEdit.id, {
                    name: name.trim(),
                    type,
                    taxRate,
                    annualLimit: limitNum,
                    color
                });
            } else {
                await createPortfolio({
                    name: name.trim(),
                    type,
                    taxRate,
                    annualLimit: limitNum,
                    color
                });
            }
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił błąd podczas zapisywania.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!portfolioToEdit?.id) return;

        const confirmMsg = `Czy na pewno chcesz usunąć portfel "${portfolioToEdit.name}" wraz ze wszystkimi jego transakcjami i historią? Tej operacji nie można cofnąć!`;
        if (!window.confirm(confirmMsg)) return;

        try {
            await deletePortfolio(portfolioToEdit.id);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie można usunąć portfela.');
        }
    };

    return createPortal(
        <div
            data-testid="portfolio-modal"
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
        >
            <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-6 shrink-0">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                            style={{ backgroundColor: color }}
                        >
                            <Briefcase size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                {isEdit ? 'Ustawienia Portfela' : 'Nowy Portfel'}
                            </h2>
                            <p className="text-xs text-slate-400">
                                {isEdit ? 'Edytuj parametry konta' : 'Dodaj niezależny portfel inwestycyjny'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="bg-slate-800 p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSave} className="flex-1 overflow-y-auto space-y-5 pr-1 custom-scrollbar">
                    {error && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Nazwa portfela */}
                    <div>
                        <label className="text-xs text-slate-400 uppercase font-bold ml-1 mb-1 block">
                            Nazwa portfela
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="np. IKE mBank, Rachunek Główny"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors text-white font-medium placeholder:text-slate-600"
                            autoFocus
                        />
                    </div>

                    {/* Typ konta */}
                    <div>
                        <label className="text-xs text-slate-400 uppercase font-bold ml-1 mb-1 block">Typ konta</label>
                        <div className="grid grid-cols-1 gap-2">
                            {PORTFOLIO_TYPES.map(pt => (
                                <div
                                    key={pt.type}
                                    onClick={() => handleTypeChange(pt.type)}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start justify-between ${
                                        type === pt.type
                                            ? 'bg-blue-600/10 border-blue-500 text-white'
                                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm text-slate-200">{pt.label}</span>
                                            {pt.defaultTax === 0 && (
                                                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">
                                                    0% Belki
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5">{pt.description}</p>
                                    </div>
                                    {type === pt.type && (
                                        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 mt-0.5">
                                            <Check size={12} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        {/* Stawka podatku Belki */}
                        <div>
                            <label className="text-xs text-slate-400 uppercase font-bold ml-1 mb-1 block flex items-center gap-1">
                                <ShieldCheck size={14} className="text-blue-400" />
                                Podatek Belki (%)
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={taxRate}
                                onChange={e => setTaxRate(Math.max(0, parseFloat(e.target.value) || 0))}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors text-white font-mono"
                            />
                        </div>
                    </div>

                    {/* Roczny limit wpłat (IKE/IKZE) */}
                    {(type === 'ike' || type === 'ikze' || annualLimit) && (
                        <div>
                            <div className="flex justify-between items-center ml-1 mb-1">
                                <label className="text-xs text-slate-400 uppercase font-bold block">
                                    Roczny limit wpłat (PLN)
                                </label>
                                <span className="text-[10px] text-slate-500">Opcjonalnie</span>
                            </div>
                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={annualLimit}
                                onChange={e => setAnnualLimit(e.target.value)}
                                placeholder="np. 26019"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors text-white font-mono placeholder:text-slate-700"
                            />
                            <p className="text-[11px] text-slate-500 mt-1 ml-1">
                                Pozwala śledzić wykorzystanie corocznego limitu wpłat na pasku postępu.
                            </p>
                        </div>
                    )}

                    {/* Kolor akcentu */}
                    <div>
                        <label className="text-xs text-slate-400 uppercase font-bold ml-1 mb-2 block">
                            Kolor identyfikatora
                        </label>
                        <div className="flex items-center gap-3">
                            {COLOR_OPTIONS.map(c => (
                                <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setColor(c.value)}
                                    className={`w-8 h-8 rounded-full transition-transform flex items-center justify-center text-white ${
                                        color === c.value
                                            ? 'scale-125 ring-2 ring-white shadow-lg'
                                            : 'hover:scale-110 opacity-70 hover:opacity-100'
                                    }`}
                                    style={{ backgroundColor: c.value }}
                                    title={c.name}
                                >
                                    {color === c.value && <Check size={14} />}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                        {isEdit && portfolios.length > 1 ? (
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2 text-sm font-semibold"
                            >
                                <Trash2 size={16} />
                                Usuń portfel
                            </button>
                        ) : (
                            <div />
                        )}

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition font-medium text-sm"
                            >
                                Anuluj
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition shadow-lg shadow-blue-600/30 text-sm disabled:opacity-50"
                            >
                                {isSaving ? 'Zapisywanie...' : isEdit ? 'Zapisz zmiany' : 'Utwórz portfel'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};
