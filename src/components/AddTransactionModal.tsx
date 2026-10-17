import { useState, useEffect, useRef } from 'react';
import { X, Calendar } from 'lucide-react';
import { db } from '../db/db';
import { searchTickers, Ticker } from '../lib/tickers';
import { apiService, fetchCurrentPrice, fetchHistoricalRate } from '../lib/api';
import { nbpService } from '../lib/NBPService';
import { dividendService } from '../lib/DividendService';
import { formatNumber } from '../utils/formatters';
import { addTransaction, updateTransaction, LedgerError } from '../lib/ledgerStore';
import { commissionToPLN } from '../lib/ledger';
import { toast } from 'sonner';
import { usePortfolioAccount } from '../context/PortfolioContext';
import type { Asset, CurrencyCode, Transaction, TransactionType as DbTransactionType } from '../types/database';
import { isDepositTransaction, isWithdrawTransaction } from '../types/database';
import { todayLocal } from '../utils/dates';
import { logger } from '../utils/logger';

interface AddTransactionModalProps {
    onClose: () => void;
    onTransactionAdded?: () => void;
    /** When set, the modal edits this transaction instead of adding a new one */
    transactionToEdit?: Transaction & { id: number };
}

const isCashType = (t: DbTransactionType) => isDepositTransaction(t) || isWithdrawTransaction(t);

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
    onClose,
    onTransactionAdded,
    transactionToEdit: editTx
}) => {
    const { activePortfolioId, portfolios } = usePortfolioAccount();
    const isEdit = !!editTx;
    const [selectedPortfolioId, setSelectedPortfolioId] = useState<number>(() => {
        if (editTx) return editTx.portfolioId ?? 1;
        if (activePortfolioId !== 'ALL') return activePortfolioId;
        return portfolios[0]?.id ?? 1;
    });

    const [ticker, setTicker] = useState(editTx && !isCashType(editTx.type) ? (editTx.ticker ?? '') : '');
    const [amount, setAmount] = useState(editTx && !isCashType(editTx.type) ? String(editTx.amount) : '');
    const [price, setPrice] = useState(editTx ? String(editTx.price ?? editTx.total) : '');
    const [currency, setCurrency] = useState<CurrencyCode>(editTx?.currency ?? 'PLN');
    const [exchangeRate, setExchangeRate] = useState(editTx?.exchangeRate ? String(editTx.exchangeRate) : '1.0');
    const [rateUnavailable, setRateUnavailable] = useState(false);
    // A rate typed by the user must not be overwritten by a fetch that resolves later
    const rateEditedByUser = useRef(false);
    const [type, setType] = useState<DbTransactionType>(editTx?.type ?? 'Kupno');
    const [date, setDate] = useState(editTx ? editTx.date.slice(0, 10) : todayLocal());
    // In edit mode keep the stored rate until currency or date is changed
    const storedRateKey = useRef(editTx ? `${editTx.currency ?? 'PLN'}|${editTx.date.slice(0, 10)}` : null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [ownedAssets, setOwnedAssets] = useState<Asset[]>([]);
    const [availableCash, setAvailableCash] = useState(0);
    const [commission, setCommission] = useState(editTx?.commission ? String(editTx.commission) : '');
    const [commissionCurrency, setCommissionCurrency] = useState<CurrencyCode>(editTx?.commissionCurrency ?? 'PLN');
    const [liveSuggestions, setLiveSuggestions] = useState<Ticker[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    // Currency the typed ticker is quoted in; a buy must be recorded in that currency
    const [quote, setQuote] = useState<{ ticker: string; currency: CurrencyCode } | null>(null);
    // A currency picked by hand is not replaced by detection until the ticker changes
    const currencyEditedByUser = useRef(false);

    useEffect(() => {
        const fetchData = async () => {
            const assets = await db.assets.where('portfolioId').equals(selectedPortfolioId).toArray();
            setOwnedAssets(assets.filter(a => a.amount > 0));

            const cashEntry = await db.cash
                .where('[portfolioId+currency]')
                .equals([selectedPortfolioId, 'PLN'])
                .first();
            setAvailableCash(cashEntry ? cashEntry.amount : 0);
        };
        fetchData();
    }, [selectedPortfolioId]);

    useEffect(() => {
        // Ignore results of a fetch superseded by a newer currency/date
        let cancelled = false;
        rateEditedByUser.current = false;
        const setRate = (value: string) => {
            if (!cancelled && !rateEditedByUser.current) setExchangeRate(value);
        };
        const fetchRate = async () => {
            if (storedRateKey.current === `${currency}|${date}`) return;
            storedRateKey.current = null;
            setRateUnavailable(false);

            if (currency === 'PLN') {
                setRate('1.0');
                return;
            }
            // Clear the previous currency's rate while fetching, so it can never be saved by mistake
            setRate('');

            try {
                const today = todayLocal();
                const isToday = date === today;

                if (isToday) {
                    const pair = `${currency}PLN=X`;
                    const rateData = await fetchCurrentPrice(pair);
                    if (rateData && rateData.price) {
                        setRate(rateData.price.toFixed(4));
                        return;
                    }
                } else {
                    logger.debug('[AddTransactionModal] Fetching historical rate from NBP...');
                    const nbpData = await nbpService.getHistoricalRate(currency, date || '');

                    if (nbpData && nbpData.rate) {
                        logger.debug('[AddTransactionModal] Using NBP rate:', nbpData.rate);
                        setRate(nbpData.rate.toFixed(4));
                        return;
                    }

                    logger.debug('[AddTransactionModal] NBP failed, falling back to Yahoo Finance...');
                    const historicalData = await fetchHistoricalRate(currency, date || '');
                    if (historicalData && historicalData.rate) {
                        logger.debug('[AddTransactionModal] Using Yahoo Finance rate:', historicalData.rate);
                        setRate(historicalData.rate.toFixed(4));
                        return;
                    }
                }

                if (!cancelled) setRateUnavailable(true);
            } catch (e) {
                logger.warn('Rate fetch failed', e);
                if (!cancelled) setRateUnavailable(true);
            }
        };
        fetchRate();
        return () => {
            cancelled = true;
        };
    }, [currency, date]);

    useEffect(() => {
        if (ticker.length < 2 || type === 'Sprzedaż') {
            setLiveSuggestions([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await apiService.search(ticker);
                setLiveSuggestions(results);
            } catch (error) {
                logger.error('Search failed', error);
            } finally {
                setIsSearching(false);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [ticker, type]);

    // Detect the quote currency of a typed ticker, so a ticker typed without picking a suggestion
    // (e.g. "AAPL") is not saved as PLN
    useEffect(() => {
        if (type !== 'Kupno' || !ticker) {
            setQuote(null);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            const detected = await resolveQuoteCurrency(ticker);
            if (cancelled) return;
            setQuote(detected ? { ticker, currency: detected } : null);
            // Editing keeps the stored currency until the ticker is changed
            const tickerChanged = !editTx || ticker !== (editTx.ticker ?? '').toUpperCase();
            if (detected && tickerChanged && !currencyEditedByUser.current) setCurrency(detected);
        }, 500);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [ticker, type]);

    const numAmount = parseFloat(amount) || 0;
    const numPrice = parseFloat(price) || 0;
    const numRate = currency === 'PLN' ? 1 : parseFloat(exchangeRate) || 0;
    const numCommission = parseFloat(commission) || 0;
    // Commission is charged either in PLN or in the transaction currency
    const effectiveCommissionCurrency: CurrencyCode = commissionCurrency === currency ? currency : 'PLN';
    const commissionCurrencyOptions: CurrencyCode[] = currency === 'PLN' ? ['PLN'] : ['PLN', currency];
    const commissionPLN = commissionToPLN({
        commission: numCommission,
        commissionCurrency: effectiveCommissionCurrency,
        exchangeRate: numRate
    });
    const totalCostPLN = numAmount * numPrice * numRate + (type === 'Kupno' ? commissionPLN : 0);
    const totalRevenuePLN = numAmount * numPrice * numRate - (type === 'Sprzedaż' ? commissionPLN : 0);
    const isDeposit = isDepositTransaction(type);
    const isWithdraw = isWithdrawTransaction(type);
    // Quick hint against current balance; the ledger does the authoritative per-date check.
    // Skipped when editing, because the current balance already includes the edited transaction.
    const isInsufficientFunds =
        !isEdit && ((type === 'Kupno' && totalCostPLN > availableCash) || (isWithdraw && numPrice > availableCash));

    const handleSubmit = async () => {
        if (!isDeposit && !isWithdraw && (!ticker || !amount || !price)) return;

        if (isInsufficientFunds) {
            return;
        }

        if (type === 'Sprzedaż' && !isEdit) {
            const asset = ownedAssets.find(a => a.ticker === ticker.toUpperCase());
            if (!asset) {
                toast.error(`Nie posiadasz akcji ${ticker}, aby je sprzedać.`);
                return;
            }
            if (asset.amount < parseFloat(amount)) {
                toast.error(`Nie masz wystarczającej liczby akcji ${ticker} (Posiadasz: ${asset.amount})`);
                return;
            }
        }

        if (isDeposit && !price) return;

        if (type === 'Kupno') {
            const symbol = ticker.toUpperCase();
            const quoteCurrency = quote?.ticker === symbol ? quote.currency : await resolveQuoteCurrency(symbol);
            if (quoteCurrency && quoteCurrency !== currency) {
                // Switch to the right currency; its exchange rate is fetched before the next save
                currencyEditedByUser.current = false;
                setCurrency(quoteCurrency);
                setQuote({ ticker: symbol, currency: quoteCurrency });
                toast.warning(`${symbol} jest notowany w ${quoteCurrency}`, {
                    description: `Zmieniono walutę z ${currency} na ${quoteCurrency}. Sprawdź cenę i kurs, potem zapisz ponownie.`,
                    duration: 8000
                });
                return;
            }
        }

        if (currency !== 'PLN' && !(numRate > 0)) {
            toast.error('Podaj kurs waluty', {
                description: `Nie udało się pobrać kursu ${currency}/PLN — wpisz kurs zastosowany przez brokera.`
            });
            return;
        }

        if (!isDeposit && !isWithdraw) {
            const valAmount = parseFloat(amount);
            const valPrice = parseFloat(price);

            if (valAmount <= 0) {
                toast.error('Ilość musi być większa od zera');
                return;
            }
            if (!Number.isInteger(valAmount)) {
                toast.error('Ilość musi być liczbą całkowitą');
                return;
            }
            if (valPrice < 0) {
                toast.error('Cena nie może być ujemna');
                return;
            }
        } else {
            if (parseFloat(price) <= 0) {
                toast.error('Kwota musi być większa od zera');
                return;
            }
        }

        const txTicker = isDeposit || isWithdraw ? 'CASH' : ticker.toUpperCase();
        const txAmount = isDeposit || isWithdraw ? 1 : parseFloat(amount);
        const txPrice = parseFloat(price);
        const txCommission = parseFloat(commission) || 0;

        // Tax rate (NBP, business day before the transaction) for foreign trades; kept on edit if unchanged
        let taxExchangeRate: number | undefined;
        if (currency !== 'PLN' && !isDeposit && !isWithdraw) {
            const unchanged = editTx && editTx.currency === currency && editTx.date.slice(0, 10) === date;
            taxExchangeRate = unchanged ? editTx.taxExchangeRate : undefined;
            taxExchangeRate ??= (await nbpService.getTaxRate(currency, date))?.rate;
        }

        const record: Transaction = {
            portfolioId: selectedPortfolioId,
            date,
            type,
            ticker: txTicker,
            amount: txAmount,
            price: txPrice,
            currency,
            total: txAmount * txPrice,
            exchangeRate: numRate,
            taxExchangeRate,
            commission: txCommission > 0 ? txCommission : undefined,
            commissionCurrency: txCommission > 0 ? effectiveCommissionCurrency : undefined
        };

        try {
            if (editTx) {
                await updateTransaction({ ...record, id: editTx.id, note: editTx.note });
            } else {
                await addTransaction(record);
            }
        } catch (error) {
            if (error instanceof LedgerError) {
                toast.error('Nie można zapisać transakcji', { description: error.message, duration: 10000 });
            } else {
                logger.error('Failed to save transaction', error);
                toast.error('Błąd podczas zapisywania transakcji');
            }
            return;
        }

        // Dividend share counts depend on holdings history; failure here must not undo the transaction
        const affectedTickers = new Set([txTicker, editTx?.ticker ?? 'CASH'].map(t => t.toUpperCase()));
        affectedTickers.delete('CASH');
        for (const t of affectedTickers) {
            try {
                await dividendService.recalculateDividendsForTicker(t);
            } catch (error) {
                logger.error('[AddTransactionModal] Failed to recalculate dividends:', error);
            }
        }

        if (isEdit) toast.success('Transakcja zaktualizowana');
        if (currency !== 'PLN' && !isDeposit && !isWithdraw && !taxExchangeRate) {
            toast.warning('Brak kursu NBP do rozliczenia podatku', {
                description: 'Transakcja zapisana. Kurs uzupełnisz na stronie Podatki (PIT-38).'
            });
        }

        if (onTransactionAdded) onTransactionAdded();
        onClose();
    };

    const commonCurrencies: CurrencyCode[] = ['PLN', 'USD', 'EUR', 'GBP', 'CHF'];

    /** Quote currency from live data; null when unknown or not one the app supports (e.g. GBp) */
    async function resolveQuoteCurrency(symbol: string): Promise<CurrencyCode | null> {
        try {
            const data = await fetchCurrentPrice(symbol);
            const detected = data?.currency;
            return detected && commonCurrencies.includes(detected) ? detected : null;
        } catch (e) {
            logger.warn('Quote currency lookup failed', symbol, e);
            return null;
        }
    }

    const handleTickerSelect = async (t: Ticker) => {
        setTicker(t.symbol);
        setShowSuggestions(false);
        if (t.region === 'US' || t.region === 'USA') setCurrency('USD');
        if (t.region === 'EU' || t.region === 'DE' || t.region === 'FR') setCurrency('EUR');
        if (t.region === 'WA' || t.region === 'PL' || t.symbol.endsWith('.WA')) setCurrency('PLN');

        try {
            const priceData = await fetchCurrentPrice(t.symbol);
            if (priceData && priceData.price) {
                setPrice(priceData.price.toString());
                if (priceData.currency) {
                    setCurrency(priceData.currency as CurrencyCode);
                }
            }
        } catch (e) {
            logger.error('Failed to fetch price for ticker', t.symbol, e);
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
                logger.error('Failed to fetch price for asset', selectedTicker, e);
            }
        }
    };

    return (
        <div
            data-testid="add-transaction-modal"
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
        >
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">{isEdit ? 'Edycja Operacji' : 'Nowa Operacja'}</h2>
                    <button
                        data-testid="close-modal-button"
                        onClick={onClose}
                        className="bg-slate-800 p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    {portfolios.length > 1 && (
                        <div>
                            <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">
                                Rachunek / Portfel
                            </label>
                            <select
                                data-testid="transaction-portfolio-select"
                                value={selectedPortfolioId}
                                disabled={isEdit}
                                title={isEdit ? 'Nie można przenieść transakcji do innego portfela' : undefined}
                                onChange={e => setSelectedPortfolioId(Number(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:border-blue-600 transition-colors text-white font-semibold text-sm"
                            >
                                {portfolios.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.name} ({p.type.toUpperCase()})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <div data-testid="transaction-type-selector" className="flex bg-slate-950 p-1 rounded-xl">
                            {(['Kupno', 'Sprzedaż', 'Wpłata', 'Wypłata'] as DbTransactionType[]).map(t => (
                                <button
                                    key={t}
                                    data-testid={`transaction-type-${t.toLowerCase()}`}
                                    onClick={() => {
                                        setType(t);
                                        if (isCashType(t)) {
                                            setCurrency('PLN');
                                            setExchangeRate('1.0');
                                        }
                                    }}
                                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                                        type === t
                                            ? 'bg-blue-600 text-white shadow-lg'
                                            : 'text-slate-500 hover:text-slate-300'
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
                                max={todayLocal()}
                                onChange={e => setDate(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors font-mono text-sm [color-scheme:dark]"
                            />
                            <Calendar
                                size={18}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                            />
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
                                        {isEdit && ticker && !ownedAssets.some(a => a.ticker === ticker) && (
                                            <option value={ticker}>{ticker}</option>
                                        )}
                                    </select>
                                    {ownedAssets.length === 0 && !isEdit && (
                                        <p className="text-xs text-red-400 mt-1 ml-1">
                                            Brak posiadanych aktywów do sprzedaży.
                                        </p>
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
                                            currencyEditedByUser.current = false;
                                        }}
                                        onFocus={() => setShowSuggestions(true)}
                                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                        placeholder="np. NVDA"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors uppercase font-bold placeholder:font-normal"
                                    />
                                    {showSuggestions && ticker.length > 0 && (
                                        <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto left-0 custom-scrollbar">
                                            {(() => {
                                                const local = searchTickers(ticker);
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
                                                                            {local.some(l => l.symbol === t.symbol) && (
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
                                </>
                            )}
                        </div>
                    )}

                    <div className="flex gap-4">
                        {!(isDeposit || isWithdraw) && (
                            <div className="flex-1">
                                <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">
                                    Ilość
                                </label>
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
                                <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">
                                    Waluta
                                </label>
                                <select
                                    data-testid="currency-selector"
                                    value={currency}
                                    onChange={e => {
                                        currencyEditedByUser.current = true;
                                        setCurrency(e.target.value as CurrencyCode);
                                    }}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors font-bold text-center appearance-none"
                                >
                                    {commonCurrencies.map(c => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                                {type === 'Kupno' && quote?.ticker === ticker && (
                                    <p
                                        data-testid="quote-currency-hint"
                                        className={`text-[11px] mt-1 text-center ${
                                            quote.currency === currency ? 'text-slate-500' : 'text-amber-400'
                                        }`}
                                    >
                                        Notowany w {quote.currency}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">
                                {isDeposit || isWithdraw ? 'Kwota (PLN)' : 'Cena za sztukę'}
                            </label>
                            <input
                                data-testid="price-input"
                                type="number"
                                min={isDeposit || isWithdraw ? '0.01' : '0'}
                                step="0.01"
                                value={price}
                                onChange={e => setPrice(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors font-mono"
                            />
                        </div>
                        {currency !== 'PLN' && (
                            <div className="w-1/3">
                                <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">
                                    Kurs PLN
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    data-testid="exchange-rate-input"
                                    value={exchangeRate}
                                    onChange={e => {
                                        rateEditedByUser.current = true;
                                        setExchangeRate(e.target.value);
                                    }}
                                    placeholder="kurs"
                                    className={`w-full bg-slate-950 border rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors font-mono ${rateUnavailable && !exchangeRate ? 'border-amber-500' : 'border-slate-800'}`}
                                />
                                {rateUnavailable && !exchangeRate && (
                                    <p className="text-[11px] text-amber-400 mt-1 ml-1">Brak kursu — wpisz ręcznie</p>
                                )}
                            </div>
                        )}
                    </div>

                    {!(isDeposit || isWithdraw) && (
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">
                                    Prowizja
                                </label>
                                <input
                                    data-testid="commission-input"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={commission}
                                    onChange={e => setCommission(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-amber-500 transition-colors font-mono"
                                />
                            </div>
                            <div className="w-1/3">
                                <label className="text-xs text-slate-500 uppercase font-bold ml-1 mb-1 block">
                                    Waluta
                                </label>
                                <select
                                    data-testid="commission-currency-selector"
                                    value={effectiveCommissionCurrency}
                                    onChange={e => setCommissionCurrency(e.target.value as CurrencyCode)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-amber-500 transition-colors font-bold text-center appearance-none"
                                >
                                    {commissionCurrencyOptions.map(c => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {!(isDeposit || isWithdraw) && amount && price && (
                        <div
                            className={`p-4 rounded-xl border ${isInsufficientFunds ? 'bg-red-500/10 border-red-500/50' : 'bg-slate-800/50 border-slate-700'}`}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-slate-400 text-sm">
                                    {type === 'Kupno' ? 'Szacowany koszt:' : 'Szacowany przychód:'}
                                </span>
                                <span className="text-white font-bold font-mono">
                                    {formatNumber(type === 'Kupno' ? totalCostPLN : totalRevenuePLN)} PLN
                                </span>
                            </div>
                            {numCommission > 0 && (
                                <div className="flex justify-between items-center text-xs mb-1">
                                    <span className="text-slate-500">w tym prowizja:</span>
                                    <span className="text-amber-400 font-mono">{formatNumber(commissionPLN)} PLN</span>
                                </div>
                            )}
                            {type === 'Kupno' && (
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Dostępne środki:</span>
                                    <span className={isInsufficientFunds ? 'text-red-400 font-bold' : 'text-slate-400'}>
                                        {formatNumber(availableCash)} PLN
                                    </span>
                                </div>
                            )}
                            {isInsufficientFunds && (
                                <div className="mt-2 text-xs text-red-500 font-bold flex items-center gap-1">
                                    <X size={12} /> Brak wystarczających środków
                                </div>
                            )}
                        </div>
                    )}

                    <div className="pt-4 flex space-x-3">
                        <button
                            data-testid="cancel-button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl border border-slate-800 text-slate-400 font-bold hover:bg-slate-800 transition-colors"
                        >
                            Anuluj
                        </button>
                        <button
                            data-testid="submit-transaction-button"
                            onClick={handleSubmit}
                            disabled={isInsufficientFunds}
                            className={`flex-1 py-3 rounded-xl font-bold shadow-lg transition-all ${
                                isInsufficientFunds
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
