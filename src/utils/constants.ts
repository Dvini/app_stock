/**
 * Application constants
 * Centralized configuration values
 */

// API Configuration
export const API_CONFIG = {
    CACHE_DURATION_MS: 15 * 60 * 1000, // 15 minutes
    HISTORY_CACHE_DURATION_MS: 15 * 60 * 1000, // 15 minutes
    INTRADAY_CACHE_DURATION_MS: 5 * 60 * 1000, // 5 minutes for 1d data
    MAX_RETRIES: 2,
    RETRY_DELAY_MS: 1000
};

// Time-related constants (for general use)
export const TIME_CONSTANTS = {
    ONE_DAY_MS: 24 * 60 * 60 * 1000,
    FIVE_DAYS_MS: 5 * 24 * 60 * 60 * 1000,
    THIRTY_DAYS_MS: 30 * 24 * 60 * 60 * 1000,
    SIXTY_DAYS_MS: 60 * 24 * 60 * 60 * 1000,
    ONE_YEAR_MS: 365 * 24 * 60 * 60 * 1000,
    MONTHS_PER_YEAR: 12
};

// Dividend-specific constants
export const DIVIDEND_CONSTANTS = {
    UPCOMING_DAYS_RANGE: 60,
    DAILY_SYNC_INTERVAL_MS: TIME_CONSTANTS.ONE_DAY_MS,
    WEEKLY_SYNC_INTERVAL_MS: 7 * TIME_CONSTANTS.ONE_DAY_MS
};

// Yahoo Finance API
export const YAHOO_API = {
    BASE_URL: 'https://query1.finance.yahoo.com/v8/finance/chart/',
    PROXY_URLS: ['https://corsproxy.io/?', 'https://api.allorigins.win/raw?url=']
};

// Supported currencies
export const CURRENCIES = {
    PLN: {
        code: 'PLN',
        symbol: 'zł',
        name: 'Polski Złoty',
        position: 'after' // Symbol position (before/after number)
    },
    USD: {
        code: 'USD',
        symbol: '$',
        name: 'US Dollar',
        position: 'before'
    },
    EUR: {
        code: 'EUR',
        symbol: '€',
        name: 'Euro',
        position: 'before'
    },
    GBP: {
        code: 'GBP',
        symbol: '£',
        name: 'British Pound',
        position: 'before'
    },
    JPY: {
        code: 'JPY',
        symbol: '¥',
        name: 'Japanese Yen',
        position: 'before'
    },
    CHF: {
        code: 'CHF',
        symbol: 'CHF',
        name: 'Swiss Franc',
        position: 'after'
    },
    CNY: {
        code: 'CNY',
        symbol: '¥',
        name: 'Chinese Yuan',
        position: 'before'
    }
};

// Default currency
export const DEFAULT_CURRENCY = 'PLN';

// Supported chart ranges
export const CHART_RANGES = {
    '1D': { label: '1 Dzień', value: '1d', interval: '5m' },
    '1W': { label: '1 Tydzień', value: '5d', interval: '1h' },
    '1M': { label: '1 Miesiąc', value: '1mo', interval: '1d' },
    '3M': { label: '3 Miesiące', value: '3mo', interval: '1d' },
    '6M': { label: '6 Miesięcy', value: '6mo', interval: '1d' },
    '1Y': { label: '1 Rok', value: '1y', interval: '1d' },
    '5Y': { label: '5 Lat', value: '5y', interval: '1wk' },
    MAX: { label: 'Max', value: 'max', interval: '1mo' }
};

// Transaction types
export const TRANSACTION_TYPES = {
    BUY: 'buy',
    SELL: 'sell',
    DEPOSIT: 'deposit',
    WITHDRAW: 'withdraw'
};

// Asset types
export const ASSET_TYPES = {
    STOCK: 'stock',
    ETF: 'etf',
    CRYPTO: 'crypto',
    COMMODITY: 'commodity'
};

// Portfolio risk thresholds
export const RISK_THRESHOLDS = {
    MAX_POSITION_SIZE_PERCENT: 20, // Max 20% in single position
    MAX_SECTOR_CONCENTRATION_PERCENT: 40, // Max 40% in single sector
    MIN_DIVERSIFICATION_ASSETS: 5 // Minimum 5 assets for diversification
};

// Chart colors
export const CHART_COLORS = {
    PROFIT: '#10b981', // green-500
    LOSS: '#ef4444', // red-500
    NEUTRAL: '#6b7280', // gray-500
    PRIMARY: '#3b82f6', // blue-500
    GRID: '#e5e7eb', // gray-200
    AXIS: '#9ca3af' // gray-400
};

// UI Configuration
export const UI_CONFIG = {
    SIDEBAR_WIDTH: 64,
    MODAL_ANIMATION_DURATION_MS: 200,
    TOAST_DURATION_MS: 3000,
    DEBOUNCE_DELAY_MS: 300
};

// WebGPU Chart Configuration
export const WEBGPU_CONFIG = {
    MAX_DATA_POINTS: 10000,
    LINE_WIDTH: 2,
    POINT_RADIUS: 3,
    ANIMATION_DURATION_MS: 500
};

// Cache versions (increment to invalidate all cache)
export const CACHE_VERSION = 'v2';

// Database configuration
export const DB_CONFIG = {
    NAME: 'StockTrackerDB',
    VERSION: 3
};

// Popular tickers by region
export const TICKER_REGIONS = {
    US: ['.', '-'], // US stocks typically don't have suffix
    POLAND: ['.WA'], // Warsaw Stock Exchange
    CRYPTO: ['-USD'] // Crypto pairs
};

// AI Model Configuration
export const AI_MODELS = {
    'Llama-3.2-3B-Instruct-q4f16_1-MLC': {
        name: 'Llama 3.2 3B',
        size: '~1.9GB',
        description: 'Szybki model do analizy danych',
        recommended: true
    },
    'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': {
        name: 'Qwen 2.5 1.5B',
        size: '~1.0GB',
        description: 'Bardzo lekki i szybki model'
    }
};

// Validation constraints
export const VALIDATION = {
    MAX_TICKER_LENGTH: 10,
    MIN_AMOUNT: 0.000001,
    MAX_AMOUNT: 1000000000,
    MIN_PRICE: 0.01,
    MAX_PRICE: 1000000,
    MAX_EXCHANGE_RATE: 1000
};

// Date formats
export const DATE_FORMATS = {
    SHORT: 'short', // 01.01.2024
    MEDIUM: 'medium', // 1 stycznia 2024
    LONG: 'long', // poniedziałek, 1 stycznia 2024
    TIME: 'time', // 14:30
    DATETIME: 'datetime' // 01.01.2024, 14:30
};

// Error messages
export const ERROR_MESSAGES = {
    NETWORK_ERROR: 'Błąd połączenia z serwerem',
    API_ERROR: 'Błąd pobierania danych z API',
    CACHE_ERROR: 'Błąd odczytu cache',
    VALIDATION_ERROR: 'Błąd walidacji danych',
    DB_ERROR: 'Błąd bazy danych',
    UNKNOWN_ERROR: 'Nieznany błąd'
};

// Success messages
export const SUCCESS_MESSAGES = {
    TRANSACTION_ADDED: 'Transakcja dodana pomyślnie',
    TRANSACTION_DELETED: 'Transakcja usunięta',
    WATCHLIST_ADDED: 'Dodano do obserwowanych',
    WATCHLIST_REMOVED: 'Usunięto z obserwowanych',
    SETTINGS_SAVED: 'Ustawienia zapisane'
};
