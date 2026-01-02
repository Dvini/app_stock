import { useState, useEffect } from 'react';
import { usePortfolio } from '../hooks/usePortfolio';
import { POPULAR_TICKERS as tickers } from '../lib/tickers';
import { fetchExchangeRates } from '../lib/api';
import { Calculator, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';
import { formatNumber } from '../utils/formatters';
import type { CurrencyCode } from '../types/database';

interface SimulatorResult {
    mode: string;
    ticker: string;
    oldQty: number;
    newQty: number;
    oldAvg: number;
    newAvg: number;
    diff: number;
    cashChange: number;
    totalValueImpact: number;
    projectedValue: number;
    currency: string;
}

export const Simulator = () => {
    const { assets } = usePortfolio();
    const [mode, setMode] = useState<'BUY' | 'SELL'>('BUY');
    const [selectedTicker, setSelectedTicker] = useState('');
    const [amount, setAmount] = useState('');
    const [price, setPrice] = useState('');
    const [result, setResult] = useState<SimulatorResult | null>(null);
    const [plnRate, setPlnRate] = useState<number | null>(null);

    const getCurrency = (tickerSymbol: string): CurrencyCode => {
        const asset = assets.find(a => a.ticker === tickerSymbol);
        if (asset) return asset.currency;

        const tickerDef = tickers.find(t => t.symbol === tickerSymbol);
        if (tickerDef) {
            const region = tickerDef.region;
            if (region === 'USA' || region === 'US ETF' || region === 'CRYPTO') return 'USD';
            if (region === 'PL') return 'PLN';
            if (region === 'UK') return 'GBP';
            if (region === 'JP') return 'JPY';
            if (region === 'DE' || region === 'FR' || region === 'EU' || region === 'UCITS ETF') return 'EUR';
        }
        return 'PLN';
    };

    const currentCurrency = selectedTicker ? getCurrency(selectedTicker) : '';

    useEffect(() => {
        let active = true;
        const fetchRate = async () => {
            if (!currentCurrency || currentCurrency === 'PLN') {
                setPlnRate(1);
                return;
            }
            try {
                const rates = await fetchExchangeRates([currentCurrency], 'PLN');
                if (active && rates[currentCurrency]) {
                    setPlnRate(rates[currentCurrency]);
                }
            } catch (e) {
                console.warn("Failed to fetch simulator rate", e);
            }
        };
        fetchRate();
        return () => { active = false; };
    }, [currentCurrency]);

    const handleCalculate = () => {
        if (!selectedTicker || !amount || !price) return;

        const numAmount = parseFloat(amount);
        const numPrice = parseFloat(price);

        if (isNaN(numAmount) || isNaN(numPrice)) return;

        if (numAmount <= 0) {
            alert("Ilość musi być większa od zera");
            return;
        }
        if (!Number.isInteger(numAmount)) {
            alert("Ilość musi być liczbą całkowitą");
            return;
        }
        if (numPrice < 0) {
            alert("Cena nie może być ujemna");
            return;
        }

        const currentAsset = assets.find(a => a.ticker === selectedTicker);
        const currentQty = currentAsset ? currentAsset.amount : 0;
        const currentAvg = currentAsset ? currentAsset.avgPrice : 0;

        let newQty = 0;
        let newAvg = 0;
        let cashChange = 0;
        let diff = 0;

        if (mode === 'BUY') {
            newQty = currentQty + numAmount;
            const totalCost = (currentQty * currentAvg) + (numAmount * numPrice);
            newAvg = totalCost / newQty;
            cashChange = -(numAmount * numPrice);
            diff = newAvg - currentAvg;
        } else {
            newQty = currentQty - numAmount;
            newAvg = currentAvg;
            cashChange = (numAmount * numPrice);
            diff = 0;
        }

        setResult({
            mode,
            ticker: selectedTicker,
            oldQty: currentQty,
            newQty,
            oldAvg: currentAvg,
            newAvg,
            diff,
            cashChange,
            totalValueImpact: 0,
            projectedValue: (newQty * numPrice),
            currency: currentCurrency
        });
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
                <div className="p-3 bg-blue-500/10 rounded-xl">
                    <Calculator className="w-8 h-8 text-blue-500" />
                </div>
                Symulator Ruchów
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl">
                    <div className="mb-8">
                        <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">Rodzaj Operacji</label>
                        <div className="bg-slate-800 p-1 rounded-xl flex">
                            <button
                                onClick={() => setMode('BUY')}
                                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${mode === 'BUY' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                            >
                                KUPNO
                            </button>
                            <button
                                onClick={() => setMode('SELL')}
                                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${mode === 'SELL' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                            >
                                SPRZEDAŻ
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">Wybierz Ticker</label>
                            <select
                                value={selectedTicker}
                                onChange={(e) => setSelectedTicker(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                            >
                                <option value="">-- Wybierz Spółkę --</option>
                                <optgroup label="Twoje Aktywa">
                                    {assets.map(a => <option key={a.ticker} value={a.ticker}>{a.ticker} (Posiadasz: {a.amount})</option>)}
                                </optgroup>
                                <optgroup label="Wszystkie">
                                    {tickers.filter(t => !assets.find(a => a.ticker === t.symbol)).map(t => (
                                        <option key={t.symbol} value={t.symbol}>{t.symbol} - {t.name}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">Ilość</label>
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0"
                                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors font-mono"
                                />
                            </div>
                            <div>
                                <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">
                                    Cena Symulowana {currentCurrency && <span className="text-blue-400">({currentCurrency})</span>}
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="0"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:border-blue-500 transition-colors font-mono"
                                    />
                                    {currentCurrency && (
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">
                                            {currentCurrency}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleCalculate}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all transform active:scale-[0.98] mt-4"
                        >
                            PRZELICZ SCENARIUSZ
                        </button>
                    </div>
                </div>

                <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 border-dashed rounded-3xl p-8 flex items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-all duration-700"></div>

                    {!result ? (
                        <div className="text-center text-slate-500 italic relative z-10">
                            <Calculator className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>Podgląd wyników symulacji</p>
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col relative z-10">
                            <h2 className="text-xl font-bold text-white mb-6 border-b border-slate-800 pb-4">
                                Wynik Symulacji: <span className="text-blue-400">{result.ticker}</span>
                            </h2>

                            <div className="space-y-6 flex-1">
                                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                                    <div className="text-slate-400 text-xs uppercase mb-1">Średnia Cena Zakupu</div>
                                    <div className="flex items-end justify-between">
                                        <div>
                                            {Math.abs(result.diff) > 0.001 && (
                                                <>
                                                    <span className="text-2xl font-mono text-slate-500 line-through mr-2">{formatNumber(result.oldAvg)}</span>
                                                    <ArrowRight className="inline w-4 h-4 text-slate-600 mx-2" />
                                                </>
                                            )}
                                            <span className={`text-3xl font-mono font-bold ${Math.abs(result.diff) < 0.001 ? 'text-white' : (result.diff < 0 ? 'text-emerald-400' : 'text-rose-400')}`}>
                                                {formatNumber(result.newAvg)}
                                            </span>
                                        </div>
                                        {mode === 'BUY' && Math.abs(result.diff) > 0.001 && (
                                            <div className={`text-sm ${result.diff < 0 ? 'text-emerald-500' : 'text-rose-500'} flex items-center font-bold`}>
                                                {result.diff < 0 ? <TrendingDown className="w-4 h-4 mr-1" /> : <TrendingUp className="w-4 h-4 mr-1" />}
                                                {formatNumber(Math.abs(result.diff))} zmiana
                                            </div>
                                        )}
                                    </div>
                                    {mode === 'BUY' && result.oldQty > 0 && Math.abs(result.diff) > 0.001 && (
                                        <div className="text-xs text-slate-500 mt-2">Uśrednianie {result.diff < 0 ? 'w dół' : 'w górę'}</div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                                        <div className="text-slate-400 text-xs uppercase mb-1">Nowa Ilość</div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl font-mono text-white">{result.newQty}</span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${mode === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                {mode === 'BUY' ? '+' : '-'}{Math.abs(result.newQty - result.oldQty)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                                        <div className="text-slate-400 text-xs uppercase mb-1">Wpływ na Gotówkę</div>
                                        <div className={`text-xl font-mono font-bold ${result.cashChange > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {result.cashChange > 0 ? '+' : ''}{formatNumber(result.cashChange)}
                                            <span className="text-sm font-normal text-slate-500 ml-1">{result.currency}</span>
                                        </div>
                                        {result.currency !== 'PLN' && plnRate && Math.abs(result.cashChange) > 0 && (
                                            <div className="text-xs text-slate-500 mt-1">
                                                ≈ {formatNumber(result.cashChange * plnRate)} PLN
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-auto bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl">
                                    <div className="text-blue-300 text-xs uppercase mb-1">Nowa Wartość Pozycji (Estymacja)</div>
                                    <div className="text-2xl font-bold text-white font-mono">
                                        {formatNumber(result.projectedValue)}
                                        <span className="text-sm font-normal text-blue-400 ml-1">{result.currency}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
