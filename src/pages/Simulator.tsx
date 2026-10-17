import { useState, useEffect, useRef } from 'react';
import { usePortfolio } from '../hooks/usePortfolio';
import { usePortfolioAccount } from '../context/PortfolioContext';
import { POPULAR_TICKERS, searchTickers, Ticker } from '../lib/tickers';
import { fetchExchangeRates, fetchCurrentPrice, apiService } from '../lib/api';
import { nbpService } from '../lib/NBPService';
import {
    Calculator,
    ArrowRight,
    TrendingUp,
    TrendingDown,
    ShieldCheck,
    Layers,
    AlertTriangle,
    Info
} from 'lucide-react';
import { FreeRideCalculator } from '../components/FreeRideCalculator';
import { formatNumber, formatDate } from '../utils/formatters';
import { plTextClass } from '../lib/utils';
import { todayLocal } from '../utils/dates';
import { simulateSell, type SellSimulation, type SellSimulationParams } from '../utils/sellSimulation';
import { breakEvenSellPrice, positionScenarios, sellScenarios, type ScenarioRow } from '../utils/priceScenarios';
import type { CurrencyCode, PortfolioAccount, Transaction } from '../types/database';
import { logger } from '../utils/logger';

interface SimulatorResult {
    mode: 'BUY' | 'SELL';
    ticker: string;
    oldQty: number;
    newQty: number;
    oldAvg: number;
    newAvg: number;
    diff: number;
    cashChange: number;
    /** Exact cash change in PLN when known (sell), otherwise estimated from the current rate */
    cashChangePLN: number | null;
    projectedValue: number;
    currency: string;
    sell: SellSimulation | null;
    /** NBP rate used for the simulated sale's tax, with its table date */
    nbpRate: { rate: number; date: string } | null;
    /** Price the scenarios are relative to */
    basePrice: number;
    /** Sell: price at which the sale breaks even. Buy: price at which the whole position breaks even */
    breakEven: number | null;
    scenarios: ScenarioRow[];
}

const signed = (value: number): string => `${value > 0 ? '+' : ''}${formatNumber(value)}`;

const holdingKey = (portfolioId: number | undefined, ticker: string): string => `${portfolioId ?? 1}:${ticker}`;

/** Delay after the last keystroke before the scenario is recalculated */
const RECALC_DELAY_MS = 300;

interface SimulationInput {
    mode: 'BUY' | 'SELL';
    ticker: string;
    portfolioId: number | null;
    amount: string;
    price: string;
    commission: string;
    commissionCurrency: CurrencyCode;
    currency: CurrencyCode;
    /** Current holding of the ticker (the selected one when selling) */
    holding: { amount: number; avgPrice: number; taxRate: number } | null;
    defaultTaxRate: number;
    transactions: Transaction[];
    portfolios: PortfolioAccount[];
}

/** `empty`: not enough input yet, nothing to show */
type SimulationOutcome =
    | { kind: 'empty' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; result: SimulatorResult };

const runSimulation = async (input: SimulationInput): Promise<SimulationOutcome> => {
    const { mode, ticker, currency, holding } = input;
    if (!ticker || !input.amount || !input.price) return { kind: 'empty' };
    if (mode === 'SELL' && (!holding || input.portfolioId === null)) return { kind: 'empty' };

    const numAmount = parseFloat(input.amount);
    const numPrice = parseFloat(input.price);
    const numCommission = parseFloat(input.commission) || 0;

    if (isNaN(numAmount) || isNaN(numPrice)) return { kind: 'empty' };
    if (numAmount <= 0) return { kind: 'error', message: 'Ilość musi być większa od zera' };
    if (!Number.isInteger(numAmount)) return { kind: 'error', message: 'Ilość musi być liczbą całkowitą' };
    if (numPrice < 0) return { kind: 'error', message: 'Cena nie może być ujemna' };
    if (numCommission < 0) return { kind: 'error', message: 'Prowizja nie może być ujemna' };
    if (mode === 'SELL' && holding && numAmount > holding.amount) {
        return { kind: 'error', message: `Masz tylko ${holding.amount} szt. ${ticker}` };
    }

    let brokerRate: number | null = 1;
    if (currency !== 'PLN') {
        const rates = await fetchExchangeRates([currency], 'PLN').catch(() => ({}) as Record<string, number>);
        brokerRate = rates[currency] ?? null;
    }
    if (!brokerRate && (mode === 'SELL' || (numCommission > 0 && input.commissionCurrency === 'PLN'))) {
        return { kind: 'error', message: `Brak kursu ${currency}/PLN — spróbuj ponownie za chwilę` };
    }

    const commissionNative = input.commissionCurrency === currency ? numCommission : numCommission / (brokerRate || 1);
    const currentQty = holding?.amount ?? 0;
    const currentAvg = holding?.avgPrice ?? 0;

    if (mode === 'BUY') {
        const newQty = currentQty + numAmount;
        // Like the ledger, the average purchase price includes the buy commission
        const newAvg = (currentQty * currentAvg + numAmount * numPrice + commissionNative) / newQty;
        const cashChange = -(numAmount * numPrice + commissionNative);
        return {
            kind: 'ok',
            result: {
                mode,
                ticker,
                oldQty: currentQty,
                newQty,
                oldAvg: currentAvg,
                newAvg,
                diff: newAvg - currentAvg,
                cashChange,
                cashChangePLN: brokerRate ? cashChange * brokerRate : null,
                projectedValue: newQty * numPrice,
                currency,
                sell: null,
                nbpRate: null,
                basePrice: numPrice,
                breakEven: newAvg,
                scenarios: positionScenarios(newQty, newAvg, numPrice, holding?.taxRate ?? input.defaultTaxRate)
            }
        };
    }

    // Without the NBP rate the sale is converted at the broker rate and the result card flags it
    const today = todayLocal();
    const nbpRate = currency === 'PLN' ? null : await nbpService.getTaxRate(currency, today);

    const sellParams: SellSimulationParams = {
        transactions: input.transactions,
        portfolios: input.portfolios,
        portfolioId: input.portfolioId!,
        ticker,
        shares: numAmount,
        price: numPrice,
        currency,
        date: today,
        brokerRate: brokerRate!,
        nbpTaxRate: nbpRate?.rate ?? null,
        commission: numCommission,
        commissionCurrency: input.commissionCurrency
    };
    const outcome = simulateSell(sellParams);
    if (!outcome.ok) return { kind: 'error', message: `Masz tylko ${outcome.heldShares} szt. ${ticker}` };

    const newQty = currentQty - numAmount;
    return {
        kind: 'ok',
        result: {
            mode,
            ticker,
            oldQty: currentQty,
            newQty,
            oldAvg: currentAvg,
            newAvg: newQty > 0 ? currentAvg : 0,
            diff: 0,
            cashChange: numAmount * numPrice - commissionNative,
            cashChangePLN: outcome.result.netCashPLN,
            projectedValue: newQty * numPrice,
            currency,
            sell: outcome.result,
            nbpRate: nbpRate ?? null,
            basePrice: numPrice,
            breakEven: breakEvenSellPrice(outcome.result.trade),
            scenarios: sellScenarios(sellParams)
        }
    };
};

export const Simulator = () => {
    const { assets, transactions, isAllPortfolios, currentPortfolio } = usePortfolio();
    const { portfolios } = usePortfolioAccount();
    const [activeTab, setActiveTab] = useState<'AVERAGING' | 'FREE_RIDE'>('AVERAGING');
    const [mode, setMode] = useState<'BUY' | 'SELL'>('BUY');
    const [selectedTicker, setSelectedTicker] = useState('');
    const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
    const [amount, setAmount] = useState('');
    const [price, setPrice] = useState('');
    const selectionRef = useRef(0);
    const priceEditedRef = useRef(false);
    const [commission, setCommission] = useState('');
    const [commissionCurrency, setCommissionCurrency] = useState<CurrencyCode>('PLN');
    const [isCalculating, setIsCalculating] = useState(false);
    const [result, setResult] = useState<SimulatorResult | null>(null);
    const [calcError, setCalcError] = useState<string | null>(null);

    // Live search states
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [liveSuggestions, setLiveSuggestions] = useState<Ticker[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [liveCurrency, setLiveCurrency] = useState<CurrencyCode | null>(null);

    useEffect(() => {
        if (selectedTicker.length < 2 || mode === 'SELL') {
            setLiveSuggestions([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await apiService.search(selectedTicker);
                setLiveSuggestions(results);
            } catch (error) {
                logger.error('Search failed', error);
            } finally {
                setIsSearching(false);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [selectedTicker, mode]);

    const sellAsset =
        mode === 'SELL' && selectedTicker && selectedPortfolioId !== null
            ? assets.find(a => holdingKey(a.portfolioId, a.ticker) === holdingKey(selectedPortfolioId, selectedTicker))
            : undefined;

    const getCurrency = (tickerSymbol: string): CurrencyCode => {
        if (liveCurrency) return liveCurrency;
        if (sellAsset) return sellAsset.currency;

        const asset = assets.find(a => a.ticker === tickerSymbol);
        if (asset) return asset.currency;

        const tickerDef = POPULAR_TICKERS.find(t => t.symbol === tickerSymbol);
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
    const commissionCurrencyOptions: CurrencyCode[] =
        !currentCurrency || currentCurrency === 'PLN' ? ['PLN'] : ['PLN', currentCurrency];
    const effectiveCommissionCurrency: CurrencyCode =
        currentCurrency && commissionCurrency === currentCurrency ? currentCurrency : 'PLN';

    /**
     * Fetch the current quote of a newly picked ticker. Ignored once another ticker is picked, and the
     * price is not filled in when the user has already typed one (the result is recalculated live).
     */
    const fetchQuote = async (symbol: string) => {
        const selection = ++selectionRef.current;
        priceEditedRef.current = false;
        try {
            const priceData = await fetchCurrentPrice(symbol);
            if (selection !== selectionRef.current || !priceData) return null;
            if (priceData.price && !priceEditedRef.current) {
                setPrice(priceData.price.toString());
            }
            return priceData;
        } catch (e) {
            logger.error('Failed to fetch price for simulation', e);
            return null;
        }
    };

    const handleTickerSelect = async (t: Ticker) => {
        setSelectedTicker(t.symbol);
        setShowSuggestions(false);
        const priceData = await fetchQuote(t.symbol);
        if (priceData?.currency) {
            setLiveCurrency(priceData.currency);
        }
    };

    const handleModeChange = (next: 'BUY' | 'SELL') => {
        if (next === mode) return;
        setMode(next);
        setResult(null);
        setLiveCurrency(null);
        if (next === 'SELL') {
            // Keep the typed ticker when it is held, otherwise make the user pick a holding
            const owned = assets.find(a => a.ticker === selectedTicker);
            setSelectedPortfolioId(owned ? (owned.portfolioId ?? 1) : null);
            if (!owned) setSelectedTicker('');
        }
    };

    const handleAssetSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const [portfolioPart, ...tickerParts] = e.target.value.split(':');
        const t = tickerParts.join(':');
        setSelectedTicker(t);
        setSelectedPortfolioId(t ? Number(portfolioPart) : null);
        setLiveCurrency(null);
        setResult(null);
        if (t) {
            await fetchQuote(t);
        }
    };

    const holding = mode === 'SELL' ? sellAsset : assets.find(a => a.ticker === selectedTicker);
    const holdingAmount = holding?.amount;
    const holdingAvgPrice = holding?.avgPrice;
    const holdingTaxRate = holding?.taxRate;
    const defaultTaxRate = currentPortfolio?.taxRate ?? 19;

    // Recalculate whenever an input changes; a newer run cancels the pending or in-flight one
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(async () => {
            setIsCalculating(true);
            let outcome: SimulationOutcome;
            try {
                outcome = await runSimulation({
                    mode,
                    ticker: selectedTicker,
                    portfolioId: selectedPortfolioId,
                    amount,
                    price,
                    commission,
                    commissionCurrency: effectiveCommissionCurrency,
                    currency: (currentCurrency || 'PLN') as CurrencyCode,
                    holding:
                        holdingAmount !== undefined
                            ? { amount: holdingAmount, avgPrice: holdingAvgPrice ?? 0, taxRate: holdingTaxRate ?? 19 }
                            : null,
                    defaultTaxRate,
                    transactions,
                    portfolios
                });
            } catch (e) {
                logger.error('Simulation failed', e);
                outcome = { kind: 'error', message: 'Nie udało się przeliczyć scenariusza' };
            }
            if (cancelled) return;
            setIsCalculating(false);
            setResult(outcome.kind === 'ok' ? outcome.result : null);
            setCalcError(outcome.kind === 'error' ? outcome.message : null);
        }, RECALC_DELAY_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [
        mode,
        selectedTicker,
        selectedPortfolioId,
        amount,
        price,
        commission,
        effectiveCommissionCurrency,
        currentCurrency,
        holdingAmount,
        holdingAvgPrice,
        holdingTaxRate,
        defaultTaxRate,
        transactions,
        portfolios
    ]);

    return (
        <div data-testid="simulator-page" className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    <div className="p-3 bg-blue-500/10 rounded-xl">
                        <Calculator className="w-8 h-8 text-blue-500" />
                    </div>
                    Symulator & Kalkulatory
                </h1>

                {/* Tab Switcher */}
                <div className="bg-slate-900 border border-slate-800 p-1 rounded-2xl flex items-center gap-1 shadow-lg">
                    <button
                        onClick={() => setActiveTab('AVERAGING')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            activeTab === 'AVERAGING'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`}
                    >
                        <Layers size={15} />
                        <span>Uśrednianie Pozycji</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('FREE_RIDE')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            activeTab === 'FREE_RIDE'
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`}
                    >
                        <ShieldCheck size={15} />
                        <span>Odzyskanie Wkładu (Free Ride)</span>
                    </button>
                </div>
            </div>

            {activeTab === 'FREE_RIDE' ? (
                <FreeRideCalculator />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl">
                        <div className="mb-8">
                            <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">
                                Rodzaj Operacji
                            </label>
                            <div className="bg-slate-800 p-1 rounded-xl flex">
                                <button
                                    onClick={() => handleModeChange('BUY')}
                                    className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${mode === 'BUY' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                >
                                    KUPNO
                                </button>
                                <button
                                    onClick={() => handleModeChange('SELL')}
                                    className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${mode === 'SELL' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                >
                                    SPRZEDAŻ
                                </button>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">
                                    Wybierz Ticker
                                </label>
                                {mode === 'SELL' ? (
                                    <select
                                        data-testid="sim-sell-asset-select"
                                        value={sellAsset ? holdingKey(sellAsset.portfolioId, sellAsset.ticker) : ''}
                                        onChange={handleAssetSelect}
                                        className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                                    >
                                        <option value="">-- Wybierz Aktywo do Sprzedaży --</option>
                                        {assets.map(a => (
                                            <option
                                                key={holdingKey(a.portfolioId, a.ticker)}
                                                value={holdingKey(a.portfolioId, a.ticker)}
                                            >
                                                {a.ticker}
                                                {isAllPortfolios &&
                                                    ` — ${portfolios.find(p => p.id === (a.portfolioId ?? 1))?.name ?? 'Główny'}`}{' '}
                                                (Posiadasz: {a.amount})
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={selectedTicker}
                                            onChange={e => {
                                                setSelectedTicker(e.target.value.toUpperCase());
                                                setShowSuggestions(true);
                                                setLiveCurrency(null);
                                            }}
                                            onFocus={() => setShowSuggestions(true)}
                                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                            placeholder="np. NVDA, KGH.WA"
                                            className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors uppercase font-bold placeholder:font-normal"
                                        />
                                        {showSuggestions && selectedTicker.length > 0 && (
                                            <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto left-0 custom-scrollbar">
                                                {(() => {
                                                    const local = searchTickers(selectedTicker);
                                                    const liveFiltered = liveSuggestions.filter(
                                                        ls => !local.some(l => l.symbol === ls.symbol)
                                                    );
                                                    const all = [...local, ...liveFiltered];

                                                    if (all.length === 0 && !isSearching) {
                                                        return (
                                                            <div className="px-4 py-3 text-xs text-slate-500 italic">
                                                                Brak wyników.
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <>
                                                            {all.map(t => (
                                                                <div
                                                                    key={t.symbol}
                                                                    onClick={() => handleTickerSelect(t)}
                                                                    className="px-4 py-3 hover:bg-blue-600/20 cursor-pointer border-b border-slate-700/50 last:border-0 group"
                                                                >
                                                                    <div className="flex justify-between items-center w-full">
                                                                        <div>
                                                                            <div className="flex items-center space-x-2">
                                                                                <span className="font-bold text-white">
                                                                                    {t.symbol}
                                                                                </span>
                                                                                <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                                                                                    {t.region}
                                                                                </span>
                                                                                {local.some(
                                                                                    l => l.symbol === t.symbol
                                                                                ) && (
                                                                                    <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded uppercase">
                                                                                        Popularny
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <span className="text-xs text-slate-400 group-hover:text-blue-200 block truncate max-w-[200px]">
                                                                                {t.name}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {isSearching && (
                                                                <div className="px-4 py-2 bg-slate-800/50 border-t border-slate-700 flex items-center justify-center space-x-2">
                                                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></div>
                                                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider ml-2">
                                                                        Szukam dalej...
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-slate-400 text-xs font-bold uppercase tracking-wider block">
                                            Ilość
                                        </label>
                                        {sellAsset && (
                                            <button
                                                type="button"
                                                data-testid="sim-sell-all"
                                                onClick={() => setAmount(String(sellAsset.amount))}
                                                className="text-[11px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-wider"
                                            >
                                                Wszystkie
                                            </button>
                                        )}
                                    </div>
                                    <input
                                        data-testid="sim-amount-input"
                                        type="number"
                                        min="1"
                                        step="1"
                                        max={sellAsset ? sellAsset.amount : undefined}
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        placeholder="0"
                                        className={`w-full bg-slate-950 border text-white rounded-xl px-4 py-3 focus:outline-none transition-colors font-mono ${
                                            sellAsset && parseFloat(amount) > sellAsset.amount
                                                ? 'border-rose-500 focus:border-rose-500'
                                                : 'border-slate-700 focus:border-blue-500'
                                        }`}
                                    />
                                    {sellAsset && (
                                        <p
                                            className={`text-[11px] mt-1 ml-1 ${parseFloat(amount) > sellAsset.amount ? 'text-rose-400' : 'text-slate-500'}`}
                                        >
                                            Posiadasz: {sellAsset.amount} szt.
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">
                                        Cena Symulowana{' '}
                                        {currentCurrency && <span className="text-blue-400">({currentCurrency})</span>}
                                    </label>
                                    <div className="relative">
                                        <input
                                            data-testid="sim-price-input"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={price}
                                            onChange={e => {
                                                priceEditedRef.current = true;
                                                setPrice(e.target.value);
                                            }}
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

                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">
                                        Prowizja
                                    </label>
                                    <input
                                        data-testid="sim-commission-input"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={commission}
                                        onChange={e => setCommission(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">
                                        Waluta
                                    </label>
                                    <select
                                        data-testid="sim-commission-currency"
                                        value={effectiveCommissionCurrency}
                                        onChange={e => setCommissionCurrency(e.target.value as CurrencyCode)}
                                        className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors font-bold text-center appearance-none"
                                    >
                                        {commissionCurrencyOptions.map(c => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <p data-testid="sim-status" className="text-xs text-slate-500 flex items-center gap-2">
                                <span
                                    className={`w-1.5 h-1.5 rounded-full ${isCalculating ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`}
                                />
                                {isCalculating ? 'Przeliczam…' : 'Wynik przelicza się automatycznie po zmianie danych'}
                            </p>
                        </div>
                    </div>

                    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 border-dashed rounded-3xl p-8 flex items-center justify-center relative overflow-hidden group">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-all duration-700"></div>

                        {calcError ? (
                            <div
                                data-testid="sim-calc-error"
                                className="text-center relative z-10 max-w-xs flex flex-col items-center gap-3"
                            >
                                <AlertTriangle className="w-10 h-10 text-amber-400 opacity-80" />
                                <p className="text-amber-300 font-medium">{calcError}</p>
                            </div>
                        ) : !result ? (
                            <div className="text-center text-slate-500 italic relative z-10">
                                <Calculator className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <p>Wpisz ilość i cenę — wynik pojawi się tutaj</p>
                            </div>
                        ) : (
                            <div
                                className={`w-full h-full flex flex-col relative z-10 transition-opacity ${isCalculating ? 'opacity-60' : ''}`}
                            >
                                <h2 className="text-xl font-bold text-white mb-6 border-b border-slate-800 pb-4">
                                    Wynik Symulacji: <span className="text-blue-400">{result.ticker}</span>
                                </h2>

                                <div className="space-y-6 flex-1">
                                    {result.sell ? (
                                        <SellResultCard
                                            sell={result.sell}
                                            currency={result.currency}
                                            nbpRate={result.nbpRate}
                                        />
                                    ) : (
                                        <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                                            <div className="text-slate-400 text-xs uppercase mb-1">
                                                Średnia Cena Zakupu
                                            </div>
                                            <div className="flex items-end justify-between">
                                                <div>
                                                    {Math.abs(result.diff) > 0.001 && (
                                                        <>
                                                            <span className="text-2xl font-mono text-slate-500 line-through mr-2">
                                                                {formatNumber(result.oldAvg)}
                                                            </span>
                                                            <ArrowRight className="inline w-4 h-4 text-slate-600 mx-2" />
                                                        </>
                                                    )}
                                                    <span
                                                        className={`text-3xl font-mono font-bold ${Math.abs(result.diff) < 0.001 ? 'text-white' : result.diff < 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                                                    >
                                                        {formatNumber(result.newAvg)}
                                                    </span>
                                                </div>
                                                {result.mode === 'BUY' && Math.abs(result.diff) > 0.001 && (
                                                    <div
                                                        className={`text-sm ${result.diff < 0 ? 'text-emerald-500' : 'text-rose-500'} flex items-center font-bold`}
                                                    >
                                                        {result.diff < 0 ? (
                                                            <TrendingDown className="w-4 h-4 mr-1" />
                                                        ) : (
                                                            <TrendingUp className="w-4 h-4 mr-1" />
                                                        )}
                                                        {formatNumber(Math.abs(result.diff))} zmiana
                                                    </div>
                                                )}
                                            </div>
                                            {result.mode === 'BUY' &&
                                                result.oldQty > 0 &&
                                                Math.abs(result.diff) > 0.001 && (
                                                    <div className="text-xs text-slate-500 mt-2">
                                                        Uśrednianie {result.diff < 0 ? 'w dół' : 'w górę'}
                                                    </div>
                                                )}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                                            <div className="text-slate-400 text-xs uppercase mb-1">Nowa Ilość</div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xl font-mono text-white">{result.newQty}</span>
                                                <span
                                                    className={`text-xs px-1.5 py-0.5 rounded ${result.mode === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}
                                                >
                                                    {result.mode === 'BUY' ? '+' : '-'}
                                                    {Math.abs(result.newQty - result.oldQty)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                                            <div className="text-slate-400 text-xs uppercase mb-1">
                                                Wpływ na Gotówkę
                                            </div>
                                            <div
                                                className={`text-xl font-mono font-bold ${plTextClass(result.cashChange)}`}
                                            >
                                                {result.cashChange > 0 ? '+' : ''}
                                                {formatNumber(result.cashChange)}
                                                <span className="text-sm font-normal text-slate-500 ml-1">
                                                    {result.currency}
                                                </span>
                                            </div>
                                            {result.currency !== 'PLN' &&
                                                result.cashChangePLN !== null &&
                                                Math.abs(result.cashChange) > 0 && (
                                                    <div className="text-xs text-slate-500 mt-1">
                                                        ≈ {formatNumber(result.cashChangePLN)} PLN
                                                    </div>
                                                )}
                                        </div>
                                    </div>

                                    <div className="mt-auto bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl">
                                        <div className="text-blue-300 text-xs uppercase mb-1">
                                            Nowa Wartość Pozycji (Estymacja)
                                        </div>
                                        <div className="text-2xl font-bold text-white font-mono">
                                            {formatNumber(result.projectedValue)}
                                            <span className="text-sm font-normal text-blue-400 ml-1">
                                                {result.currency}
                                            </span>
                                        </div>
                                    </div>

                                    <ScenarioCard result={result} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const ScenarioCard = ({ result }: { result: SimulatorResult }) => {
    const isSell = result.mode === 'SELL';
    const plCurrency = isSell ? 'PLN' : result.currency;
    const breakEvenChange =
        result.breakEven !== null && result.basePrice > 0 ? (result.breakEven / result.basePrice - 1) * 100 : null;

    return (
        <div data-testid="sim-scenarios" className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
            <div className="text-slate-400 text-xs uppercase mb-1">Scenariusze cen</div>
            <div className="text-[11px] text-slate-500 mb-3">
                {isSell
                    ? 'Wynik tej sprzedaży (FIFO, PLN) przy innej cenie'
                    : `Niezrealizowany wynik całej pozycji (${result.newQty} szt.) w ${result.currency}`}
            </div>

            {result.breakEven !== null && (
                <div
                    data-testid="sim-break-even"
                    className="flex items-start gap-2 mb-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm"
                >
                    <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                        <span className="text-slate-300">
                            {isSell ? 'Na zero wychodzisz przy cenie ' : 'Cała pozycja wychodzi na zero przy cenie '}
                        </span>
                        <span className="font-mono font-bold text-white">
                            {formatNumber(result.breakEven)} {result.currency}
                        </span>
                        {breakEvenChange !== null && (
                            <span className="text-slate-400">
                                {' '}
                                ({signed(breakEvenChange)}% względem ceny {isSell ? 'symulowanej' : 'zakupu'})
                            </span>
                        )}
                        <div className="text-[11px] text-slate-500 mt-0.5">
                            {isSell
                                ? 'Po prowizjach kupna i sprzedaży; przy obecnym kursie waluty.'
                                : 'Średnia cena zakupu z prowizjami; bez prowizji sprzedaży i zmian kursu waluty.'}
                        </div>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-slate-500 text-left">
                            <th className="font-normal pb-1.5">Zmiana</th>
                            <th className="font-normal pb-1.5 text-right">Cena</th>
                            <th className="font-normal pb-1.5 text-right">Wynik {plCurrency}</th>
                            <th className="font-normal pb-1.5 text-right">Po podatku</th>
                        </tr>
                    </thead>
                    <tbody className="font-mono">
                        {result.scenarios.map(row => (
                            <tr
                                key={row.changePercent}
                                className={`border-t border-slate-800/60 ${row.changePercent === 0 ? 'bg-blue-500/10' : ''}`}
                            >
                                <td className="py-1.5 pl-1 text-slate-400">
                                    {row.changePercent === 0
                                        ? 'cena'
                                        : `${row.changePercent > 0 ? '+' : ''}${row.changePercent}%`}
                                </td>
                                <td className="py-1.5 text-right text-slate-300">{formatNumber(row.price)}</td>
                                <td className={`py-1.5 text-right font-bold ${plTextClass(row.pl)}`}>
                                    {signed(row.pl)}
                                    <span className="font-normal text-slate-500 ml-1">({signed(row.plPercent)}%)</span>
                                </td>
                                <td className={`py-1.5 pr-1 text-right ${plTextClass(row.afterTax)}`}>
                                    {signed(row.afterTax)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ResultRow = ({
    label,
    value,
    className = 'text-slate-200'
}: {
    label: string;
    value: string;
    className?: string;
}) => (
    <div className="flex justify-between items-baseline gap-4 text-sm">
        <span className="text-slate-400">{label}</span>
        <span className={`font-mono ${className}`}>{value}</span>
    </div>
);

const SellResultCard = ({
    sell,
    currency,
    nbpRate
}: {
    sell: SellSimulation;
    currency: string;
    nbpRate: { rate: number; date: string } | null;
}) => {
    const { trade } = sell;
    const gain = trade.gainLossPLN;
    const isForeign = currency !== 'PLN';
    const tone =
        gain > 0.005
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : gain < -0.005
              ? 'bg-rose-500/10 border-rose-500/20'
              : 'bg-slate-950/50 border-slate-800/50';

    return (
        <div data-testid="sim-sell-result" className="space-y-4">
            <div className={`p-4 rounded-xl border ${tone}`}>
                <div className="text-slate-400 text-xs uppercase mb-1">Wynik sprzedaży (FIFO, PLN)</div>
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div className={`text-3xl font-mono font-bold ${plTextClass(gain)}`}>
                        {signed(gain)}
                        <span className="text-sm font-normal text-slate-400 ml-1">PLN</span>
                    </div>
                    <div className={`text-sm font-bold flex items-center ${plTextClass(gain)}`}>
                        {gain >= 0 ? (
                            <TrendingUp className="w-4 h-4 mr-1" />
                        ) : (
                            <TrendingDown className="w-4 h-4 mr-1" />
                        )}
                        {signed(sell.gainPercent)}%
                    </div>
                </div>
                {isForeign && (
                    <div className="text-xs text-slate-400 mt-1">
                        W {currency}:{' '}
                        <span className={`font-mono ${plTextClass(sell.gainNative)}`}>
                            {signed(sell.gainNative)} {currency} ({signed(sell.gainNativePercent)}%)
                        </span>{' '}
                        bez prowizji
                    </div>
                )}

                <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5">
                    <ResultRow label="Przychód" value={`${formatNumber(trade.revenuePLN)} PLN`} />
                    <ResultRow label="Koszt zakupu (FIFO)" value={`−${formatNumber(trade.costBasisPLN)} PLN`} />
                    {trade.totalCommissionPLN > 0 && (
                        <ResultRow
                            label="Prowizje (kupno + sprzedaż)"
                            value={`−${formatNumber(trade.totalCommissionPLN)} PLN`}
                        />
                    )}
                    {isForeign && (
                        <>
                            <ResultRow
                                label="w tym: zmiana ceny akcji"
                                value={`${signed(sell.priceGainPLN)} PLN`}
                                className={plTextClass(sell.priceGainPLN)}
                            />
                            <ResultRow
                                label="w tym: zmiana kursu waluty"
                                value={`${signed(sell.fxGainPLN)} PLN`}
                                className={plTextClass(sell.fxGainPLN)}
                            />
                        </>
                    )}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5">
                    {trade.isTaxExempt ? (
                        <ResultRow label="Podatek Belki" value="0,00 PLN (IKE/IKZE)" className="text-emerald-400" />
                    ) : (
                        <ResultRow
                            label={`Podatek ${trade.taxRate}% od tej sprzedaży`}
                            value={`−${formatNumber(trade.taxLiabilityPLN)} PLN`}
                            className={trade.taxLiabilityPLN > 0 ? 'text-amber-400' : 'text-slate-400'}
                        />
                    )}
                    <ResultRow
                        label="Zostaje po podatku"
                        value={`${signed(sell.afterTaxPLN)} PLN`}
                        className={`font-bold ${plTextClass(sell.afterTaxPLN)}`}
                    />
                </div>

                <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                    {!trade.isTaxExempt && gain < 0 && (
                        <p className="flex gap-1.5">
                            <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                            Strata pomniejszy dochód z innych sprzedaży w tym roku w PIT-38.
                        </p>
                    )}
                    {!trade.isTaxExempt && gain > 0 && (
                        <p className="flex gap-1.5">
                            <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                            Podatek liczony tylko od tej transakcji — w PIT-38 sumuje się z pozostałymi sprzedażami
                            roku.
                        </p>
                    )}
                    {isForeign && nbpRate && (
                        <p>
                            Kurs NBP {currency} z {formatDate(nbpRate.date, 'short')}:{' '}
                            {formatNumber(nbpRate.rate, 4, 4)}
                        </p>
                    )}
                    {trade.usesBrokerRate && (
                        <p className="flex gap-1.5 text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                            Część kursów to kursy brokera zamiast NBP — wynik podatkowy jest przybliżony.
                        </p>
                    )}
                </div>
            </div>

            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                <div className="text-slate-400 text-xs uppercase mb-2">Sprzedawane partie (FIFO)</div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-slate-500 text-left">
                                <th className="font-normal pb-1.5">Data zakupu</th>
                                <th className="font-normal pb-1.5 text-right">Szt.</th>
                                <th className="font-normal pb-1.5 text-right">Cena zakupu</th>
                                <th className="font-normal pb-1.5 text-right">Wynik PLN</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono">
                            {sell.lots.map((lot, i) => (
                                <tr key={`${lot.buyDate}-${i}`} className="border-t border-slate-800/60">
                                    <td className="py-1.5 text-slate-300">{formatDate(lot.buyDate, 'short')}</td>
                                    <td className="py-1.5 text-right text-slate-300">{lot.shares}</td>
                                    <td className="py-1.5 text-right text-slate-300">
                                        {formatNumber(lot.buyPriceNative)} {currency}
                                    </td>
                                    <td className={`py-1.5 text-right font-bold ${plTextClass(lot.gainPLN)}`}>
                                        {signed(lot.gainPLN)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
