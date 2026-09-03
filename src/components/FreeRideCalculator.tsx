import React, { useState, useMemo } from 'react';
import { ShieldCheck, TrendingUp, Coins, Sparkles, AlertCircle, Info, Target, CheckCircle2 } from 'lucide-react';
import { usePortfolio } from '../hooks/usePortfolio';
import { usePortfolioAccount } from '../context/PortfolioContext';
import { formatNumber, formatCurrency } from '../utils/formatters';

export const FreeRideCalculator: React.FC = () => {
    const { assets } = usePortfolio();
    const { currentPortfolio } = usePortfolioAccount();

    // Selected asset from portfolio or custom
    const [selectedTicker, setSelectedTicker] = useState<string>('');

    // Mode: 'CALC_TARGET_PRICE' (give M -> get Cs) | 'CALC_SHARES_TO_SELL' (give Cs -> get M)
    const [calcMode, setCalcMode] = useState<'CALC_TARGET_PRICE' | 'CALC_SHARES_TO_SELL'>('CALC_TARGET_PRICE');

    // Form inputs
    const [totalShares, setTotalShares] = useState<string>('100');
    const [sellShares, setSellShares] = useState<string>('50');
    const [targetPriceInput, setTargetPriceInput] = useState<string>('');
    const [buyPrice, setBuyPrice] = useState<string>('10');
    const [currency, setCurrency] = useState<string>('PLN');
    const [currentMarketPrice, setCurrentMarketPrice] = useState<number | null>(null);

    // Tax settings
    const defaultTaxRate = currentPortfolio?.taxRate ?? 19;
    const [useTax, setUseTax] = useState<boolean>(defaultTaxRate > 0);
    const [taxRatePercent, setTaxRatePercent] = useState<string>(defaultTaxRate.toString());

    // When an asset from the portfolio is selected, populate inputs
    const handleSelectAsset = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const ticker = e.target.value;
        setSelectedTicker(ticker);

        if (!ticker) {
            setCurrentMarketPrice(null);
            return;
        }

        const found = assets.find(a => a.ticker === ticker);
        if (found) {
            setTotalShares(found.amount.toString());
            // Default sell shares to 50% rounded
            setSellShares(Math.max(1, Math.floor(found.amount / 2)).toString());
            setBuyPrice(found.avgPrice.toString());
            setCurrency(found.currency || 'PLN');
            setCurrentMarketPrice(found.price ?? null);

            // Portfolio tax rate
            const pTax = found.taxRate ?? currentPortfolio?.taxRate ?? 19;
            setTaxRatePercent(pTax.toString());
            setUseTax(pTax > 0);
        }
    };

    // Parse numeric values
    const N = parseFloat(totalShares) || 0;
    const C_k = parseFloat(buyPrice) || 0;
    const activeTaxRate = useTax ? (parseFloat(taxRatePercent) || 0) / 100 : 0;

    // Calculations based on mode
    const calculation = useMemo(() => {
        if (N <= 0 || C_k <= 0) {
            return {
                valid: false,
                error: 'Wprowadź poprawną liczbę akcji i cenę zakupu (większe od 0).'
            };
        }

        const initialCost = N * C_k;

        if (calcMode === 'CALC_TARGET_PRICE') {
            const M = parseFloat(sellShares) || 0;

            if (M <= 0) {
                return {
                    valid: false,
                    error: 'Liczba akcji do sprzedaży musi być większa od 0.'
                };
            }

            if (M >= N) {
                return {
                    valid: false,
                    error: 'Liczba akcji do sprzedaży (M) musi być mniejsza od liczby posiadanych akcji (N)!'
                };
            }

            // Formula: Cs = (Ck * (N - taxRate * M)) / ((1 - taxRate) * M)
            const denominator = (1 - activeTaxRate) * M;
            if (denominator <= 0) {
                return { valid: false, error: 'Nieprawidłowa stawka podatkowa lub liczba akcji.' };
            }

            const C_s = (C_k * (N - activeTaxRate * M)) / denominator;
            const requiredGrowth = ((C_s - C_k) / C_k) * 100;

            // Proof calculation
            const revenue = M * C_s;
            const costOfSold = M * C_k;
            const grossProfit = Math.max(0, revenue - costOfSold);
            const tax = grossProfit * activeTaxRate;
            const netAmount = revenue - tax;
            const freeShares = N - M;
            const freeSharesValue = freeShares * C_s;

            // Distance from current market price if available
            let distanceToMarket: number | null = null;
            if (currentMarketPrice && currentMarketPrice > 0) {
                distanceToMarket = ((C_s - currentMarketPrice) / currentMarketPrice) * 100;
            }

            return {
                valid: true,
                N,
                M,
                C_k,
                C_s,
                requiredGrowth,
                initialCost,
                revenue,
                costOfSold,
                grossProfit,
                tax,
                netAmount,
                freeShares,
                freeSharesValue,
                distanceToMarket
            };
        } else {
            // Mode: 'CALC_SHARES_TO_SELL' (user specifies target price Cs -> calculate required M)
            const C_s = parseFloat(targetPriceInput) || 0;

            if (C_s <= C_k) {
                return {
                    valid: false,
                    error: 'Docelowa cena sprzedaży musi być wyższa niż cena zakupu, aby odzyskać wkład ze sprzedaży części akcji.'
                };
            }

            // Formula: M = (N * C_k) / (C_s * (1 - taxRate) + taxRate * C_k)
            const denom = C_s * (1 - activeTaxRate) + activeTaxRate * C_k;
            if (denom <= 0) {
                return { valid: false, error: 'Nieprawidłowe parametry kalkulacji.' };
            }

            const rawM = (N * C_k) / denom;
            const roundedM = Math.ceil(rawM);

            if (roundedM >= N) {
                return {
                    valid: false,
                    error: 'Przy podanej cenie nawet sprzedaż prawie wszystkich akcji nie pokryje 100% wkładu po podatku.'
                };
            }

            // Calculations for exact and rounded M
            const M = roundedM;
            const revenue = M * C_s;
            const costOfSold = M * C_k;
            const grossProfit = Math.max(0, revenue - costOfSold);
            const tax = grossProfit * activeTaxRate;
            const netAmount = revenue - tax;
            const freeShares = N - M;
            const freeSharesValue = freeShares * C_s;
            const requiredGrowth = ((C_s - C_k) / C_k) * 100;

            let distanceToMarket: number | null = null;
            if (currentMarketPrice && currentMarketPrice > 0) {
                distanceToMarket = ((C_s - currentMarketPrice) / currentMarketPrice) * 100;
            }

            return {
                valid: true,
                N,
                M,
                rawM,
                C_k,
                C_s,
                requiredGrowth,
                initialCost,
                revenue,
                costOfSold,
                grossProfit,
                tax,
                netAmount,
                freeShares,
                freeSharesValue,
                distanceToMarket
            };
        }
    }, [N, C_k, sellShares, targetPriceInput, activeTaxRate, calcMode, currentMarketPrice]);

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Header Description */}
            <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900/60 to-blue-950/30 border border-emerald-500/20 rounded-3xl p-6 relative overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 shrink-0">
                            <ShieldCheck className="w-8 h-8" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-xl font-bold text-white">
                                    Strategia „Free Ride” (Pozycja Bez Ryzyka)
                                </h2>
                                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                    <Sparkles size={12} /> 100% Ochrony Kapitału
                                </span>
                            </div>
                            <p className="text-slate-400 text-xs md:text-sm mt-1 max-w-2xl">
                                Oblicz dokładną cenę lub liczbę akcji, przy której sprzedaż pokryje{' '}
                                <strong>100% Twojego pierwotnego wkładu</strong> (po odliczeniu podatku od zysków).
                                Reszta akcji zostaje w portfelu jako czysty zysk o zerowym ryzyku straty!
                            </p>
                        </div>
                    </div>

                    {/* Portfolio Auto-Select */}
                    {assets.length > 0 && (
                        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 shrink-0">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                                <Coins size={13} className="text-emerald-400" />
                                Wczytaj z portfela:
                            </label>
                            <select
                                value={selectedTicker}
                                onChange={handleSelectAsset}
                                className="bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-emerald-500 transition cursor-pointer min-w-[200px]"
                            >
                                <option value="">-- Wpisz dane ręcznie --</option>
                                {assets.map(a => (
                                    <option key={a.ticker} value={a.ticker}>
                                        {a.ticker} ({a.amount} szt. @ {formatNumber(a.avgPrice)} {a.currency})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Form & Results Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Inputs */}
                <div className="lg:col-span-6 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl">
                    {/* Calculation Mode Toggle */}
                    <div>
                        <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block flex items-center gap-1.5">
                            <Target size={14} className="text-blue-400" /> Tryb Kalkulacji
                        </label>
                        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
                            <button
                                type="button"
                                onClick={() => setCalcMode('CALC_TARGET_PRICE')}
                                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center gap-0.5 ${
                                    calcMode === 'CALC_TARGET_PRICE'
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                }`}
                            >
                                <span>Znam liczbę akcji (M)</span>
                                <span className="text-[10px] font-normal opacity-80">Wylicz cenę sprzedaży</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setCalcMode('CALC_SHARES_TO_SELL')}
                                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center gap-0.5 ${
                                    calcMode === 'CALC_SHARES_TO_SELL'
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                }`}
                            >
                                <span>Znam cenę docelową (Cs)</span>
                                <span className="text-[10px] font-normal opacity-80">Wylicz ile akcji sprzedać</span>
                            </button>
                        </div>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-4">
                        {/* Total shares (N) */}
                        <div>
                            <label className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 block flex justify-between">
                                <span>Całkowita liczba kupionych akcji (N):</span>
                                {selectedTicker && <span className="text-blue-400 font-normal">{selectedTicker}</span>}
                            </label>
                            <input
                                type="number"
                                min="1"
                                step="any"
                                value={totalShares}
                                onChange={e => setTotalShares(e.target.value)}
                                placeholder="np. 100"
                                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-mono text-sm transition"
                            />
                        </div>

                        {/* Buy price (Ck) & Currency */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <label className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 block">
                                    Cena zakupu jednej akcji (Ck):
                                </label>
                                <input
                                    type="number"
                                    min="0.0001"
                                    step="any"
                                    value={buyPrice}
                                    onChange={e => setBuyPrice(e.target.value)}
                                    placeholder="np. 25.50"
                                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-mono text-sm transition"
                                />
                            </div>
                            <div>
                                <label className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 block">
                                    Waluta:
                                </label>
                                <select
                                    value={currency}
                                    onChange={e => setCurrency(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-3 focus:outline-none focus:border-emerald-500 font-bold text-sm transition"
                                >
                                    <option value="PLN">PLN (zł)</option>
                                    <option value="USD">USD ($)</option>
                                    <option value="EUR">EUR (€)</option>
                                    <option value="GBP">GBP (£)</option>
                                </select>
                            </div>
                        </div>

                        {/* Dynamic Field based on mode */}
                        {calcMode === 'CALC_TARGET_PRICE' ? (
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="text-slate-300 text-xs font-bold uppercase tracking-wider">
                                        Liczba akcji do sprzedaży (M):
                                    </label>
                                    {N > 0 && (
                                        <span className="text-[11px] text-slate-400">
                                            Zostanie za darmo:{' '}
                                            <span className="text-emerald-400 font-bold font-mono">
                                                {Math.max(0, N - (parseFloat(sellShares) || 0))} szt.
                                            </span>
                                        </span>
                                    )}
                                </div>
                                <input
                                    type="number"
                                    min="1"
                                    max={N ? N - 1 : undefined}
                                    step="any"
                                    value={sellShares}
                                    onChange={e => setSellShares(e.target.value)}
                                    placeholder="np. 40"
                                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-mono text-sm transition"
                                />
                                {parseFloat(sellShares) >= N && N > 0 && (
                                    <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1">
                                        <AlertCircle size={13} /> Liczba akcji do sprzedaży musi być mniejsza niż łączna
                                        liczba akcji ({N})!
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="text-slate-300 text-xs font-bold uppercase tracking-wider">
                                        Oczekiwana cena docelowa (Cs):
                                    </label>
                                    {C_k > 0 && (
                                        <span className="text-[11px] text-slate-400">
                                            Musi być &gt; {formatNumber(C_k)} {currency}
                                        </span>
                                    )}
                                </div>
                                <input
                                    type="number"
                                    min={C_k ? C_k + 0.01 : 0.01}
                                    step="any"
                                    value={targetPriceInput}
                                    onChange={e => setTargetPriceInput(e.target.value)}
                                    placeholder={`np. ${C_k ? (C_k * 1.5).toFixed(2) : '35.00'}`}
                                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-mono text-sm transition"
                                />
                            </div>
                        )}

                        {/* Market Price helper if available */}
                        {currentMarketPrice && currentMarketPrice > 0 && (
                            <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs">
                                <span className="text-slate-400">Aktualny kurs rynkowy:</span>
                                <span className="font-mono font-bold text-slate-200">
                                    {formatNumber(currentMarketPrice)} {currency}
                                </span>
                            </div>
                        )}

                        {/* Tax Settings */}
                        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-200">
                                    <input
                                        type="checkbox"
                                        checked={useTax}
                                        onChange={e => setUseTax(e.target.checked)}
                                        className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-0 cursor-pointer"
                                    />
                                    <span>Uwzględniaj podatek od zysków kapitałowych</span>
                                </label>
                                {currentPortfolio?.type && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                                        Portfel: {currentPortfolio.name} ({currentPortfolio.type.toUpperCase()})
                                    </span>
                                )}
                            </div>

                            {useTax && (
                                <div className="flex items-center gap-3 pt-2 border-t border-slate-800/50">
                                    <span className="text-xs text-slate-400">Stawka podatku:</span>
                                    <div className="relative w-28">
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="1"
                                            value={taxRatePercent}
                                            onChange={e => setTaxRatePercent(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-1 text-xs font-mono font-bold pr-7 outline-none focus:border-emerald-500"
                                        />
                                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">
                                            %
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-slate-500">
                                        (Standardowo w PL: 19% podatek Belki)
                                    </span>
                                </div>
                            )}

                            {!useTax && (
                                <div className="text-[11px] text-emerald-400/90 flex items-center gap-1.5 pt-1">
                                    <Info size={13} />
                                    Brak podatku (np. konto IKE / IKZE lub rozliczenie z innych strat).
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Results & Mathematical Proof */}
                <div className="lg:col-span-6 space-y-6">
                    {!calculation.valid ? (
                        <div className="h-full min-h-[400px] bg-slate-900/40 border border-slate-800 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center text-slate-500">
                            <ShieldCheck className="w-16 h-16 opacity-30 text-emerald-500 mb-4" />
                            <h3 className="text-lg font-bold text-slate-400 mb-2">Wprowadź parametry symulacji</h3>
                            <p className="text-xs max-w-sm text-slate-500">
                                {calculation.error ||
                                    'Uzupełnij liczbę akcji oraz cenę zakupu, aby zobaczyć docelową cenę i liczbę darmowych akcji.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Primary Result Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Target Price Card */}
                                <div className="bg-gradient-to-br from-blue-950/40 to-slate-900 border border-blue-500/30 rounded-3xl p-5 shadow-xl relative overflow-hidden">
                                    <div className="text-blue-300 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                        <Target size={14} className="text-blue-400" />
                                        Docelowa Cena Sprzedaży (Cs)
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white mt-2">
                                        {formatCurrency(calculation.C_s, currency)}
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-blue-500/20 flex flex-wrap items-center justify-between text-xs gap-2">
                                        <span className="text-slate-400">Wymagany wzrost:</span>
                                        <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                                            <TrendingUp size={12} />+{formatNumber(calculation.requiredGrowth)}%
                                        </span>
                                    </div>

                                    {typeof calculation.distanceToMarket === 'number' && (
                                        <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                                            <span>Do obecnego kursu:</span>
                                            <span
                                                className={`font-mono font-bold ${
                                                    calculation.distanceToMarket <= 0
                                                        ? 'text-emerald-400'
                                                        : 'text-amber-400'
                                                }`}
                                            >
                                                {calculation.distanceToMarket <= 0
                                                    ? 'Cel osiągnięty! 🎯'
                                                    : `+${formatNumber(calculation.distanceToMarket)}%`}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Free Shares Card */}
                                <div className="bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-500/30 rounded-3xl p-5 shadow-xl relative overflow-hidden">
                                    <div className="text-emerald-300 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                        <Sparkles size={14} className="text-emerald-400" />
                                        Darmowe Akcje w Portfelu
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 mt-2">
                                        {formatNumber(calculation.freeShares, 0, 2)} szt.
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-emerald-500/20 flex flex-wrap items-center justify-between text-xs gap-2">
                                        <span className="text-slate-400">Wartość darmowych akcji:</span>
                                        <span className="font-mono font-bold text-slate-200">
                                            {formatCurrency(calculation.freeSharesValue, currency)}
                                        </span>
                                    </div>

                                    <div className="mt-2 text-[11px] text-emerald-400/80 font-medium">
                                        Pozycja bez ryzyka (100% czysty zysk)
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Proof & Summary Table */}
                            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                                        <Coins size={16} className="text-blue-400" />
                                        Sprawdzenie Matematyczne (Dowód Odzyskania Wkładu)
                                    </h3>
                                    <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded">
                                        Sprzedaż {formatNumber(calculation.M, 0, 2)} z {calculation.N} akcji
                                    </span>
                                </div>

                                <div className="space-y-2.5 text-xs">
                                    <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                                        <span className="text-slate-400">Początkowy koszt inwestycji (N × Ck):</span>
                                        <span className="font-mono font-bold text-slate-200">
                                            {formatCurrency(calculation.initialCost, currency)}
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                                        <span className="text-slate-400">Przychód brutto ze sprzedaży (M × Cs):</span>
                                        <span className="font-mono font-semibold text-slate-300">
                                            {formatCurrency(calculation.revenue, currency)}
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                                        <span className="text-slate-400">Koszty uzyskania przychodu (M × Ck):</span>
                                        <span className="font-mono text-slate-400">
                                            {formatCurrency(calculation.costOfSold, currency)}
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                                        <span className="text-slate-400">Zysk brutto do opodatkowania:</span>
                                        <span className="font-mono text-slate-300">
                                            {formatCurrency(calculation.grossProfit, currency)}
                                        </span>
                                    </div>

                                    {useTax && (
                                        <div className="flex justify-between items-center py-1 border-b border-slate-800/40 text-rose-300/90">
                                            <span>Należny podatek Belki ({taxRatePercent}%):</span>
                                            <span className="font-mono font-bold">
                                                -{formatCurrency(calculation.tax, currency)}
                                            </span>
                                        </div>
                                    )}

                                    {/* Final Cash Return Result */}
                                    <div className="flex justify-between items-center pt-2 text-sm bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-2xl mt-3">
                                        <div>
                                            <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                                                <CheckCircle2 size={16} className="text-emerald-400" />
                                                Kwota netto wracająca na konto:
                                            </div>
                                            <div className="text-[10px] text-slate-400 mt-0.5">
                                                Dokładnie 100% pierwotnie zainwestowanego kapitału
                                            </div>
                                        </div>
                                        <div className="text-right font-mono text-base font-extrabold text-emerald-400">
                                            {formatCurrency(calculation.netAmount, currency)}
                                        </div>
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
