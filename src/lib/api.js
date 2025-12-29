// Simple API service to fetch stock data via CORS Proxy
// Implements 15-minute caching to minimize requests.

const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 Minutes
const PROXY_URL = "https://corsproxy.io/?";
const BACKUP_PROXY_URL = "https://api.allorigins.win/raw?url=";
const YAHOO_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";

const fetchWithBackup = async (url) => {
    try {
        const response = await fetch(`${PROXY_URL}${encodeURIComponent(url)}`);
        if (response.ok) return response;
        throw new Error('Primary proxy failed');
    } catch (e) {
        console.warn("Primary proxy error, trying backup...", e);
        return fetch(`${BACKUP_PROXY_URL}${encodeURIComponent(url)}`);
    }
};

export const getCachedPrice = (ticker) => {
    try {
        const cacheRaw = localStorage.getItem(`price_cache_v2_${ticker}`);
        if (!cacheRaw) return null;

        const cache = JSON.parse(cacheRaw);
        if (Date.now() - cache.timestamp < CACHE_DURATION_MS) {
            // Support both old (number) and new ({price, currency}) cache formats
            if (typeof cache.price === 'number') {
                return {
                    price: cache.price,
                    currency: cache.currency || 'PLN'
                };
            }
            // Fallback for very old cache if any
            return { price: Number(cache.price) || 0, currency: 'PLN' };
        }
    } catch (e) {
        console.warn("Cache parse error", e);
    }
    return null;
};

export const fetchCurrentPrice = async (ticker) => {
    // 1. Check Cache
    const cached = getCachedPrice(ticker);
    if (cached) return cached;

    // 2. Fetch from Network
    try {
        const targetUrl = `${YAHOO_BASE_URL}${ticker}?range=1d&interval=1d`;
        const response = await fetchWithBackup(targetUrl);

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const data = await response.json();
        const result = data.chart.result[0];

        let price = result.meta.regularMarketPrice;
        let currency = result.meta.currency || 'PLN';

        if (!price && result.indicators.quote[0].close) {
            const closes = result.indicators.quote[0].close;
            for (let i = closes.length - 1; i >= 0; i--) {
                if (closes[i]) {
                    price = closes[i];
                    break;
                }
            }
        }

        if (price) {
            console.log(`[API] Fetched price for ${ticker}: ${price} ${currency}`);
            localStorage.setItem(`price_cache_v2_${ticker}`, JSON.stringify({
                timestamp: Date.now(),
                price: price,
                currency: currency
            }));
            return { price, currency };
        }

    } catch (error) {
        console.error(`Failed to fetch price for ${ticker}:`, error);
    }

    return null;
};

// NEW: Fetch exchange rates for converting foreign assets to Target Currency (default PLN)
export const fetchExchangeRates = async (currencies, targetCurrency = 'PLN') => {
    // Currencies is array e.g. ['USD', 'EUR']
    // We need pairs like USDPLN=X, or if target is USD: EURUSD=X
    const uniqueCurrencies = currencies.filter(c => c && c !== targetCurrency);
    if (uniqueCurrencies.length === 0) return {};

    const rates = {};
    const missingPairs = [];

    // 1. Check Cache
    uniqueCurrencies.forEach(c => {
        const pair = `${c}${targetCurrency}=X`;
        try {
            const cacheRaw = localStorage.getItem(`rate_cache_${pair}`);
            if (cacheRaw) {
                const cache = JSON.parse(cacheRaw);
                if (Date.now() - cache.timestamp < CACHE_DURATION_MS && cache.rate) {
                    rates[c] = cache.rate;
                    return;
                }
            }
        } catch (e) {
            console.warn(`Rate cache parse error ${pair}`, e);
        }
        missingPairs.push(pair);
    });

    if (missingPairs.length === 0) return rates;

    // 2. Fetch Missing
    try {
        const promises = missingPairs.map(async pair => {
            const targetUrl = `${YAHOO_BASE_URL}${pair}?range=1d&interval=1d`;
            try {
                const response = await fetchWithBackup(targetUrl);
                if (!response.ok) return null;
                const data = await response.json();
                const result = data.chart.result[0];
                const rate = result.meta.regularMarketPrice;
                // Extract base currency from pair e.g. USD from USDPLN=X
                // Assumption: Pair is always 3 chars Base + 3 chars Target + =X. 
                // We constructed it as `${c}${targetCurrency}=X`.
                // So cache key matches what we need.
                const base = pair.substring(0, 3);
                return { currency: base, rate, pair };
            } catch (e) {
                console.warn(`Failed to fetch rate for ${pair}`, e);
                return null;
            }
        });

        const results = await Promise.all(promises);
        results.forEach(r => {
            if (r && r.rate) {
                rates[r.currency] = r.rate;
                // 3. Save to Cache
                localStorage.setItem(`rate_cache_${r.pair}`, JSON.stringify({
                    timestamp: Date.now(),
                    rate: r.rate
                }));
            }
        });

    } catch (e) {
        console.error("Failed to fetch FX rates", e);
    }

    return rates;
};

// Fetch history for charts
export const fetchHistory = async (ticker, range = '1mo', interval = '1d') => {
    const CACHE_KEY = `history_${ticker}_${range}_${interval}`;

    // 1. Check Cache
    try {
        const cacheRaw = localStorage.getItem(CACHE_KEY);
        if (cacheRaw) {
            const cache = JSON.parse(cacheRaw);
            const limit = range === '1d' ? 5 * 60 * 1000 : 15 * 60 * 1000;
            if (Date.now() - cache.timestamp < limit) {
                return { data: cache.data, currency: cache.currency || 'PLN' };
            }
        }
    } catch (e) {
        console.warn("History cache parse error", e);
    }

    // 2. Fetch
    try {
        const targetUrl = `${YAHOO_BASE_URL}${ticker}?range=${range}&interval=${interval}`;
        const response = await fetchWithBackup(targetUrl);

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const data = await response.json();
        const result = data.chart.result[0];

        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];

        if (!timestamps || !quotes || !quotes.close) return null;

        const cleanData = timestamps.map((t, i) => ({
            time: t,
            price: quotes.close[i]
        })).filter(item => item.price !== null && item.price !== undefined);

        const pricesAndTimes = cleanData.map(d => ({ time: d.time, price: d.price }));
        const currency = result.meta.currency || 'PLN';

        // 3. Cache
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: pricesAndTimes,
            currency: currency
        }));

        return { data: pricesAndTimes, currency };

    } catch (error) {
        console.error(`Failed to fetch history for ${ticker}:`, error);
        return null;
    }
};
