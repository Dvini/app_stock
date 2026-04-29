import { useState, useEffect } from 'react';
import { X, Star } from 'lucide-react';
import { db } from '../db/db';
import { searchTickers, Ticker } from '../lib/tickers';
import { apiService } from '../lib/api';

interface AddToWatchlistModalProps {
    onClose: () => void;
    onAdded?: () => void;
}

export const AddToWatchlistModal: React.FC<AddToWatchlistModalProps> = ({ onClose, onAdded }) => {
    const [ticker, setTicker] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [liveSuggestions, setLiveSuggestions] = useState<Ticker[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (ticker.length < 2) {
            setLiveSuggestions([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await apiService.search(ticker);
                setLiveSuggestions(results);
            } catch (error) {
                console.error('Search failed', error);
            } finally {
                setIsSearching(false);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [ticker]);

    const handleAdd = async (selectedTicker: string) => {
        try {
            // Check if already exists in Watchlist
            const exists = await db.watchlist.where('ticker').equals(selectedTicker).first();

            // Check if exists in Assets (Portfolio)
            const inPortfolio = await db.assets.where('ticker').equals(selectedTicker).first();

            if (!exists && !inPortfolio) {
                await db.watchlist.add({
                    ticker: selectedTicker,
                    dateAdded: new Date().toISOString()
                });
            } else {
                // Optional: Alert user it's already there
                console.log('Ticker already in watchlist or portfolio');
            }

            if (onAdded) onAdded();
            onClose();
        } catch (error) {
            console.error('Failed to add to watchlist', error);
        }
    };

    return (
        <div
            data-testid="add-watchlist-modal"
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
        >
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Star className="text-yellow-400 fill-yellow-400" size={24} />
                        Dodaj do Obserwowanych
                    </h2>
                    <button
                        data-testid="close-modal-button"
                        onClick={onClose}
                        className="bg-slate-800 p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="relative">
                        <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">
                            Znajdź instrument
                        </label>
                        <input
                            data-testid="watchlist-ticker-input"
                            type="text"
                            value={ticker}
                            onChange={e => {
                                setTicker(e.target.value.toUpperCase());
                                setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            placeholder="np. TSLA, KGH.WA"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors uppercase font-bold placeholder:font-normal"
                        />

                        {showSuggestions && ticker.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto left-0 custom-scrollbar">
                                {(() => {
                                    const local = searchTickers(ticker);
                                    const liveFiltered = liveSuggestions.filter(ls => !local.some(l => l.symbol === ls.symbol));
                                    const all = [...local, ...liveFiltered];

                                    if (all.length === 0 && !isSearching) {
                                        return <div className="px-4 py-3 text-xs text-slate-500 italic">Brak wyników.</div>;
                                    }

                                    return (
                                        <>
                                            {all.map(t => (
                                                <div
                                                    key={t.symbol}
                                                    onClick={() => handleAdd(t.symbol)}
                                                    className="px-4 py-3 hover:bg-blue-600/20 cursor-pointer border-b border-slate-700/50 last:border-0 group"
                                                >
                                                    <div className="flex justify-between items-center w-full">
                                                        <div>
                                                            <div className="flex items-center space-x-2">
                                                                <span className="font-bold text-white">{t.symbol}</span>
                                                                <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                                                                    {t.region}
                                                                </span>
                                                                {local.some(l => l.symbol === t.symbol) && (
                                                                    <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded uppercase">Popularny</span>
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-slate-400 group-hover:text-blue-200 block truncate max-w-[200px]">
                                                                {t.name}
                                                            </span>
                                                        </div>
                                                        <PlusButton />
                                                    </div>
                                                </div>
                                            ))}
                                            {isSearching && (
                                                <div className="px-4 py-2 bg-slate-800/50 border-t border-slate-700 flex items-center justify-center space-x-2">
                                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></div>
                                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider ml-2">Szukam dalej...</span>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                    </div>

                    <p className="text-xs text-slate-500 text-center pt-2">
                        Dodanie do obserwowanych pozwoli Ci śledzić wykres bez zakupu akcji.
                    </p>
                </div>
            </div>
        </div>
    );
};

const PlusButton = () => (
    <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-colors">
        <span className="font-bold text-lg leading-none mb-0.5">+</span>
    </div>
);
