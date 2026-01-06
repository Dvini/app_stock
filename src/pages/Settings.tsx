import { useState } from 'react';
import { Save, Upload, Trash2, Cpu, AlertTriangle } from 'lucide-react';
import { exportData, importData, clearData } from '../lib/dataManagement';
import { useAI } from '../context/AIContext';

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
    const { currentModel, changeModel } = useAI();
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

    const availableModels = [
        'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
        'Qwen2.5-3B-Instruct-q4f16_1-MLC',
        'Qwen2.5-7B-Instruct-q4f16_1-MLC',
        'Qwen3-0.6B-q4f16_1-MLC',
        'Qwen3-1.7B-q4f16_1-MLC',
        'Qwen3-4B-q4f16_1-MLC',
        'Qwen3-8B-q4f16_1-MLC',
        'gemma-3-1b-it-q4f32_1-MLC',
        'gemma-3-4b-it-q4f16_1-MLC',
        'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        'Llama-3.2-3B-Instruct-q4f16_1-MLC',
        'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
        'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC',
        'gemma-2-2b-it-q4f16_1-MLC',
        'Phi-3.5-mini-instruct-q4f16_1-MLC'
    ];

    const getModelLabel = (id: string): string => {
        if (id.includes('Qwen2.5-1.5B')) return 'Qwen 2.5 (1.5B) - Lightweight';
        if (id.includes('Qwen2.5-3B')) return 'Qwen 2.5 (3B)';
        if (id.includes('Qwen2.5-7B')) return 'Qwen 2.5 (7B) - High Performance';
        if (id.includes('Qwen3-0.6B')) return 'Qwen 3 (0.6B) - High Speed';
        if (id.includes('Qwen3-1.7B')) return 'Qwen 3 (1.7B) - Default (Balanced)';
        if (id.includes('Qwen3-4B')) return 'Qwen 3 (4B) - Strong Instruct';
        if (id.includes('Qwen3-8B')) return 'Qwen 3 (8B) - Maximum Power';
        if (id.includes('gemma-3-1b')) return 'Gemma 3 (1B) - Mobile';
        if (id.includes('gemma-3-4b')) return 'Gemma 3 (4B) - Balanced';
        if (id.includes('Llama-3.2-1B')) return 'Llama 3.2 (1B) - Mobile';
        if (id.includes('Llama-3.2-3B')) return 'Llama 3.2 (3B)';
        if (id.includes('Mistral-7B')) return 'Mistral 7B v0.3 - Strong Reasoning';
        if (id.includes('Hermes-2-Pro')) return 'Hermes 2 Pro (8B)';
        if (id.includes('gemma-2-2b')) return 'Gemma 2 (2B) - Fast';
        if (id.includes('Phi-3.5-mini')) return 'Phi 3.5 Mini (3.8B)';
        return id.split('-').slice(0, 3).join(' ');
    };

    return (
        <div
            data-testid="settings-page"
            className="space-y-8 animate-in fade-in zoom-in duration-500 max-w-4xl mx-auto pb-20"
        >
            <h1 className="text-3xl font-extrabold tracking-tight">Ustawienia</h1>

            {/* AI Settings */}
            {(import.meta.env.VITE_DISABLE_AI as string) !== 'true' && (
                <Section title="Sztuczna Inteligencja">
                    <SettingRow
                        icon={Cpu}
                        label="Model AI"
                        description="Wybierz model językowy. Parametr 'B' (Miliardy) oznacza rozmiar modelu - większy jest zazwyczaj mądrzejszy, ale wolniejszy."
                    >
                        <select
                            value={currentModel}
                            onChange={e => changeModel(e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-slate-200 outline-none focus:border-blue-600 max-w-[250px] md:max-w-xs"
                        >
                            {availableModels.map(m => (
                                <option key={m} value={m}>
                                    {getModelLabel(m)}
                                </option>
                            ))}
                        </select>
                    </SettingRow>
                </Section>
            )}

            <Section title="Zarządzanie Danymi">
                <SettingRow
                    icon={Save}
                    label="Eksport Danych"
                    description="Pobierz kopię zapasową (v2.0): transakcje, dywidendy, kursy walut, cache cen."
                >
                    <button
                        onClick={exportData}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                    >
                        Pobierz Kopię
                    </button>
                </SettingRow>

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
                <p className="mt-1">Built with React, Dexie, WebLLM & Tailwind</p>
            </div>
        </div>
    );
};
