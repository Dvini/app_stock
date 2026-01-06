import { useState, useEffect } from 'react';
import { X, Calendar } from 'lucide-react';
import { db } from '../db/db';
import { searchTickers } from '../lib/tickers';
import { fetchCurrentPrice, fetchHistoricalRate } from '../lib/api';
import { nbpService } from '../lib/NBPService';
import { dividendService } from '../lib/DividendService';
import { formatNumber } from '../utils/formatters';
import type { Asset, CurrencyCode, TransactionType as DbTransactionType } from '../types/database';

interface AddTransactionModalProps {
    onClose: () => void;
    onTransactionAdded?: () => void;
}


export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ onClose, onTransactionAdded }) => {
    const [ticker, setTicker] = useState('');
    const [amount, setAmount] = useState('');
    const [price, setPrice] = useState('');
    const [currency, setCurrency] = useState<CurrencyCode>('PLN');
    const [exchangeRate, setExchangeRate] = useState('1.0');
    const [type, setType] = useState<DbTransactionType>('Kupno');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [ownedAssets, setOwnedAssets] = useState<Asset[]>([]);
    const [availableCash, setAvailableCash] = useState(0);

    useEffect(() => {
        const fetchData = async () => {
            const assets = await db.assets.toArray();
            setOwnedAssets(assets.filter(a => a.amount > 0));

            const cashEntry = await db.cash.get('PLN');
            setAvailableCash(cashEntry ? cashEntry.amount : 0);
        };
        fetchData();
    }, []);

    useEffect(() => {
        const fetchRate = async () => {
            if (currency === 'PLN') {
                setExchangeRate('1.0');
                return;
            }

            try {
                const today = new Date().toISOString().split('T')[0];
                const isToday = date === today;

                if (isToday) {
                    const pair = `${currency}PLN=X`;
                    const rateData = await fetchCurrentPrice(pair);
                    if (rateData && rateData.price) {
                        setExchangeRate(rateData.price.toFixed(4));
                        return;
                    }
                } else {
                    console.log('[AddTransactionModal] Fetching historical rate from NBP...');
                    const nbpData = await nbpService.getHistoricalRate(currency, date || '');

                    if (nbpData && nbpData.rate) {
                        console.log('[AddTransactionModal] Using NBP rate:', nbpData.rate);
                        setExchangeRate(nbpData.rate.toFixed(4));
                        return;
                    }

                    console.log('[AddTransactionModal] NBP failed, falling back to Yahoo Finance...');
                    const historicalData = await fetchHistoricalRate(currency, date || '');
                    if (historicalData && historicalData.rate) {
                        console.log('[AddTransactionModal] Using Yahoo Finance rate:', historicalData.rate);
                        setExchangeRate(historicalData.rate.toFixed(4));
                        return;
                    }
                }

                if (currency === 'USD') setExchangeRate('4.00');
                else if (currency === 'EUR') setExchangeRate('4.30');
                else setExchangeRate('1.0');

            } catch (e) {
                console.warn("Rate fetch failed", e);
            }
        };
        fetchRate();
    }, [currency, date]);

    const numAmount = parseFloat(amount) || 0;
    const numPrice = parseFloat(price) || 0;
    const numRate = parseFloat(exchangeRate) || 1.0;
    const totalCostPLN = numAmount * numPrice * numRate;
    const isDeposit = (type as string) === 'Wpłata' || type === 'deposit' || type === 'Depozyt';
    const isWithdraw = (type as string) === 'Wypłata' || type === 'withdraw';
    const isInsufficientFunds = (type === 'Kupno' && totalCostPLN > availableCash) || (isWithdraw && numPrice > availableCash);

    const handleSubmit = async () => {
        if (!isDeposit && !isWithdraw && (!ticker || !amount || !price)) return;

        if (isInsufficientFunds) {
            return;
        }

        if (type === 'Sprzedaż') {
            const asset = ownedAssets.find(a => a.ticker === ticker.toUpperCase());
            if (!asset) {
                alert(`Nie posiadasz akcji ${ticker}, aby je sprzedać.`);
                return;
            }
            if (asset.amount < parseFloat(amount)) {
                alert(`Nie masz wystarczającej liczby akcji ${ticker} (Posiadasz: ${asset.amount})`);
                return;
            }
        }

        if (isDeposit && !price) return;

        if (!isDeposit && !isWithdraw) {
            const valAmount = parseFloat(amount);
            const valPrice = parseFloat(price);

            if (valAmount <= 0) {
                alert("Ilość musi być większa od zera");
                return;
            }
            if (!Number.isInteger(valAmount)) {
                alert("Ilość musi być liczbą całkowitą");
                return;
            }
            if (valPrice < 0) {
                alert("Cena nie może być ujemna");
                return;
            }
        } else {
            if (parseFloat(price) <= 0) {
                alert("Kwota musi być większa od zera");
                return;
            }
        }

        try {
            const txTicker = (isDeposit || isWithdraw) ? 'CASH' : ticker.toUpperCase();
            const txAmount = (isDeposit || isWithdraw) ? 1 : parseFloat(amount);
            const txPrice = parseFloat(price);
            const txTotal = txAmount * txPrice;
            const rate = parseFloat(exchangeRate) || 1.0;

            await db.transactions.add({
                date: date as string,
                type: type,
                ticker: txTicker,
                amount: txAmount,
                price: txPrice,
                currency: currency,
                total: txTotal,
                exchangeRate: rate
            });

            if (!isDeposit && !isWithdraw) {
                const asset = await db.assets.where('ticker').equals(txTicker).first();
                if (asset) {
                    let newAmount = asset.amount;
                    let newAvgPrice = asset.avgPrice;

                    if (type === 'Kupno') {
                        const totalCostOld = asset.amount * asset.avgPrice;
                        const totalCostNew = parseFloat(amount) * parseFloat(price);
                        const totalAmount = asset.amount + parseFloat(amount);
                        newAvgPrice = (totalCostOld + totalCostNew) / totalAmount;
                        newAmount = totalAmount;
                    }

                    if (type === 'Sprzedaż') {
                        newAmount -= parseFloat(amount);
                    }

                    await db.assets.update(asset.id!, {
                        amount: newAmount,
                        avgPrice: newAvgPrice,
                        currency: currency
                    });

                } else if (type === 'Kupno') {
                    await db.assets.add({
                        ticker: txTicker,
                        amount: parseFloat(amount),
                        avgPrice: parseFloat(price),
                        currency: currency,
                        type: 'stock'
                    });
                }

                // Recalculate dividends after buy/sell transaction
                try {
                    console.log(`[AddTransactionModal] Recalculating dividends for ${txTicker}...`);
                    await dividendService.recalculateDividendsForTicker(txTicker);
                    console.log(`[AddTransactionModal] Dividend recalculation complete for ${txTicker}`);
                } catch (error) {
                    console.error('[AddTransactionModal] Failed to recalculate dividends:', error);
                    // Don't fail the transaction if dividend recalculation fails
                }
            }

            const cashEntry = await db.cash.get('PLN');
            let currentCash = cashEntry ? cashEntry.amount : 0;

            let cashImpactPLN = txTotal * rate;

            if (type === 'Kupno') currentCash -= cashImpactPLN;
            if (type === 'Sprzedaż') currentCash += cashImpactPLN;
            if (isDeposit) {
                currentCash += cashImpactPLN;
            }
            if (type === 'Wypłata') {
                currentCash -= cashImpactPLN;
            }

            await db.cash.put({ currency: 'PLN', amount: currentCash });

            if (onTransactionAdded) onTransactionAdded();
            onClose();
        } catch (error) {
            console.error("Failed to add transaction", error);
            alert("Błąd podczas dodawania transakcji");
        }
    };

    const commonCurrencies: CurrencyCode[] = ['PLN', 'USD', 'EUR', 'GBP', 'CHF'];

    const handleTickerSelect = async (t: any) => {
        setTicker(t.symbol);
        setShowSuggestions(false);
        if (t.region === 'US') setCurrency('USD');
        if (t.region === 'EU' || t.exchange?.includes('Paris')) setCurrency('EUR');
        if (t.region === 'WA' || t.symbol.endsWith('.WA')) setCurrency('PLN');

        try {
            const priceData = await fetchCurrentPrice(t.symbol);
            if (priceData && priceData.price) {
                setPrice(priceData.price.toString());
                if (priceData.currency) {
                    setCurrency(priceData.currency as CurrencyCode);
                }
            }
        } catch (e) {
            console.error("Failed to fetch price for ticker", t.symbol, e);
        }
    };

    const handleAssetSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedTicker = e.target.value;
        setTicker(selectedTicker);

        if (selectedTicker) {
            const asset = ownedAssets.find(a => a.ticker === selectedTicker);
            if (asset && asset.currency) {
                setCurrency(asset.currency);
            }

            try {
                const priceData = await fetchCurrentPrice(selectedTicker);
                if (priceData && priceData.price) {
                    setPrice(priceData.price.toString());
                }
            } catch (e) {
                console.error("Failed to fetch price for asset", selectedTicker, e);
            }
        }
    };

    return (
        <div data-testid="add-transaction-modal" className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">Nowa Operacja</h2>
                    <button data-testid="close-modal-button" onClick={onClose} className="bg-slate-800 p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <div data-testid="transaction-type-selector" className="flex bg-slate-950 p-1 rounded-xl">
                            {(['Kupno', 'Sprzedaż', 'Wpłata', 'Wypłata'] as DbTransactionType[]).map(t => (
                                <button
                                    key={t}
                                    data-testid={`transaction-type-${t.toLowerCase()}`}
                                    onClick={() => {
                                        setType(t);
                                        if (isDeposit || isWithdraw) {
                                            setCurrency('PLN');
                                            setExchangeRate('1.0');
                                        }
                                    }}
                                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${type === t ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="relative">
                        <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">Data</label>
                        <div className="relative">
                            <input
                                data-testid="transaction-date-input"
                                type="date"
                                value={date}
                                max={new Date().toISOString().split('T')[0]}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors font-mono text-sm [color-scheme:dark]"
                            />
                            <Calendar size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        </div>
                    </div>

                    {!(isDeposit || isWithdraw) && (
                        <div className="relative">
                            <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">Ticker</label>

                            {type === 'Sprzedaż' ? (
                                <div className="relative">
                                    <select
                                        data-testid="asset-selector"
                                        value={ticker}
                                        onChange={handleAssetSelect}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors font-bold appearance-none"
                                    >
                                        <option value="">-- Wybierz aktywo --</option>
                                        {ownedAssets.map(asset => (
                                            <option key={asset.id} value={asset.ticker}>
                                                {asset.ticker} ({asset.amount} szt.)
                                            </option>
                                        ))}
                                    </select>
                                    {ownedAssets.length === 0 && (
                                        <p className="text-xs text-red-400 mt-1 ml-1">Brak posiadanych aktywów do sprzedaży.</p>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <input
                                        data-testid="ticker-input"
                                        type="text"
                                        value={ticker}
                                        onChange={e => {
                                            setTicker(e.target.value.toUpperCase());
                                            setShowSuggestions(true);
                                        }}
                                        onFocus={() => setShowSuggestions(true)}
                                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                        placeholder="np. NVDA"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors uppercase font-bold placeholder:font-normal"
                                    />
                                    {showSuggestions && ticker.length > 0 && (
                                        <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto left-0">
                                            {searchTickers(ticker).map((t) => (
                                                <div
                                                    key={t.symbol}
                                                    onClick={() => handleTickerSelect(t)}
                                                    className="px-4 py-3 hover:bg-blue-600/20 cursor-pointer border-b border-slate-700/50 last:border-0 group"
                                                >
                                                    <div className="flex justify-between items-center w-full">
                                                        <div>
                                                            <div className="flex items-center space-x-2">
                                                                <span className="font-bold text-white">{t.symbol}</span>
                                                                <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono">{t.region}</span>
                                                            </div>
                                                            <span className="text-xs text-slate-400 group-hover:text-blue-200 block truncate max-w-[200px]">{t.name}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    <div className="flex gap-4">
                        {!(isDeposit || isWithdraw) && (
                            <div className="flex-1">
                                <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">Ilość</label>
                                <input
                                    data-testid="amount-input"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    placeholder="0"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors font-mono"
                                />
                            </div>
                        )}

                        {!(isDeposit || isWithdraw) && (
                            <div className="w-1/3">
                                <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">Waluta</label>
                                <select
                                    data-testid="currency-selector"
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors font-bold text-center appearance-none"
                                >
                                    {commonCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">{isDeposit || isWithdraw ? 'Kwota (PLN)' : 'Cena za sztukę'}</label>
                            <input
                                data-testid="price-input"
                                type="number"
                                min={isDeposit || isWithdraw ? "0.01" : "0"}
                                step="0.01"
                                value={price}
                                onChange={e => setPrice(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors font-mono"
                            />
                        </div>
                        {currency !== 'PLN' && (
                            <div className="w-1/3">
                                <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">Kurs PLN</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={exchangeRate}
                                    onChange={e => setExchangeRate(e.target.value)}
                                    placeholder="4.00"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors font-mono"
                                />
                            </div>
                        )}
                    </div>

                    {type === 'Kupno' && amount && price && (
                        <div className={`p-4 rounded-xl border ${isInsufficientFunds ? 'bg-red-500/10 border-red-500/50' : 'bg-slate-800/50 border-slate-700'}`}>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-slate-400 text-sm">Szacowany koszt:</span>
                                <span className="text-white font-bold font-mono">{formatNumber(totalCostPLN)} PLN</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Dostępne środki:</span>
                                <span className={isInsufficientFunds ? 'text-red-400 font-bold' : 'text-slate-400'}>
                                    {formatNumber(availableCash)} PLN
                                </span>
                            </div>
                            {isInsufficientFunds && (
                                <div className="mt-2 text-xs text-red-500 font-bold flex items-center gap-1">
                                    <X size={12} /> Brak wystarczających środków
                                </div>
                            )}
                        </div>
                    )}

                    <div className="pt-4 flex space-x-3">
                        <button data-testid="cancel-button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-800 text-slate-400 font-bold hover:bg-slate-800 transition-colors">Anuluj</button>
                        <button
                            data-testid="submit-transaction-button"
                            onClick={handleSubmit}
                            disabled={isInsufficientFunds}
                            className={`flex-1 py-3 rounded-xl font-bold shadow-lg transition-all ${isInsufficientFunds
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/40'
                                }`}
                        >
                            Zapisz
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
