import { useState } from 'react';
import { Save, Upload, Trash2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { exportData, exportTransactionsCSV, importData, clearData } from '../lib/dataManagement';
import { usePortfolioAccount } from '../context/PortfolioContext';

interface SectionProps {
    title: string;
    children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden mb-6">
        <div className="bg-slate-800/50 p-4 border-b border-slate-800">
            <h3 className="font-bold text-slate-200">{title}</h3>
        </div>
        <div className="p-6 space-y-6">{children}</div>
    </div>
);

interface SettingRowProps {
    icon: React.ElementType;
    label: string;
    description: string;
    children: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({ icon: Icon, label, description, children }) => (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex gap-4">
            <div className="bg-slate-800 p-2.5 rounded-xl h-fit">
                <Icon size={20} className="text-blue-400" />
            </div>
            <div>
                <p className="font-bold text-sm text-slate-200">{label}</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md">{description}</p>
            </div>
        </div>
        <div className="shrink-0">{children}</div>
    </div>
);

export const Settings = () => {
    const { portfolios } = usePortfolioAccount();
    const [exportScope, setExportScope] = useState<number | 'ALL'>('ALL');
    const [importStatus, setImportStatus] = useState('');

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (window.confirm('UWAGA: Importowanie nadpisze wszystkie obecne dane! Czy na pewno chcesz kontynuować?')) {
            try {
                await importData(file);
                setImportStatus('Sukces! Odśwież stronę.');
                setTimeout(() => window.location.reload(), 1500);
            } catch {
                setImportStatus('Błąd importu!');
            }
        }
    };

    const handleClear = async () => {
        if (
            window.confirm(
                'CZY NA PEWNO? Ta operacja usunie trwale wszystkie dane z portfela (transakcje, aktywa, historię).'
            )
        ) {
            await clearData();
            window.location.reload();
        }
    };

    return (
        <div
            data-testid="settings-page"
            className="space-y-8 animate-in fade-in zoom-in duration-500 max-w-4xl mx-auto pb-20"
        >
            <h1 className="text-3xl font-extrabold tracking-tight">Ustawienia</h1>

            <Section title="Zarządzanie Danymi">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex gap-4">
                        <div className="bg-slate-800 p-2.5 rounded-xl h-fit">
                            <Save size={20} className="text-blue-400" />
                        </div>
                        <div>
                            <p className="font-bold text-sm text-slate-200">Eksport Danych</p>
                            <p className="text-xs text-slate-500 mt-1 max-w-md">
                                Pobierz kopię zapasową JSON (wszystkie portfele lub wybrany) lub wyeksportuj transakcje
                                do pliku CSV dla programu Excel.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                        {portfolios.length > 1 && (
                            <select
                                value={exportScope}
                                onChange={e =>
                                    setExportScope(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
                                }
                                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 outline-none focus:border-blue-500 transition"
                            >
                                <option value="ALL">Wszystkie portfele (Zbiorczo)</option>
                                {portfolios.map(p => (
                                    <option key={p.id} value={p.id}>
                                        Tylko: {p.name} ({p.type.toUpperCase()})
                                    </option>
                                ))}
                            </select>
                        )}

                        <div className="flex items-center gap-2">
                            <button
                                data-testid="export-json-btn"
                                onClick={() => exportData(exportScope)}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-xs transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-1.5"
                                title="Pobierz kopię zapasową JSON"
                            >
                                <Save size={14} /> JSON
                            </button>
                            <button
                                data-testid="export-csv-btn"
                                onClick={() => exportTransactionsCSV(exportScope)}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5"
                                title="Pobierz transakcje do pliku CSV (Excel)"
                            >
                                <FileSpreadsheet size={14} className="text-emerald-400" /> CSV (Excel)
                            </button>
                        </div>
                    </div>
                </div>

                <div className="h-px bg-slate-800 my-2" />

                <SettingRow
                    icon={Upload}
                    label="Import Danych"
                    description="Przywróć dane z pliku kopii zapasowej. UWAGA: Nadpisuje obecne dane!"
                >
                    <div className="flex flex-col items-end gap-2">
                        <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg font-bold text-sm transition-colors cursor-pointer border border-slate-700">
                            Wybierz Plik
                            <input type="file" onChange={handleImport} accept=".json" className="hidden" />
                        </label>
                        {importStatus && <span className="text-xs font-bold text-emerald-400">{importStatus}</span>}
                    </div>
                </SettingRow>

                <div className="h-px bg-slate-800 my-2" />

                <SettingRow
                    icon={Trash2}
                    label="Reset Fabryczny"
                    description="Usuwa wszystkie dane z aplikacji. Tej operacji nie można cofnąć."
                >
                    <button
                        onClick={handleClear}
                        className="bg-rose-950/30 hover:bg-rose-900/50 text-rose-500 border border-rose-900/50 px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2"
                    >
                        <AlertTriangle size={14} /> Wyczyść Wszystko
                    </button>
                </SettingRow>
            </Section>

            {/* App Info */}
            <div className="text-center text-slate-600 text-xs">
                <p>StockTracker v1.0.0 • Local-First • Privacy Focused</p>
                <p className="mt-1">Built with React, Dexie & Tailwind</p>
            </div>
        </div>
    );
};
