/**
 * Validation utilities for form inputs and data
 */

/**
 * Validation result interface
 */
export interface ValidationResult<T = unknown> {
    valid: boolean;
    error: string | null;
    value?: T;
}

/**
 * Ticker validation result
 */
export interface TickerValidationResult extends ValidationResult<string> {
    ticker?: string;
}

/**
 * Amount validation options
 */
export interface AmountValidationOptions {
    min?: number;
    max?: number;
    allowZero?: boolean;
    allowNegative?: boolean;
    label?: string;
}

/**
 * Date validation options
 */
export interface DateValidationOptions {
    allowFuture?: boolean;
    allowPast?: boolean;
    minDate?: string | Date | null;
    maxDate?: string | Date | null;
    label?: string;
}

/**
 * Currency validation result
 */
export interface CurrencyValidationResult extends ValidationResult {
    currency?: string;
}

/**
 * Transaction validation result
 */
export interface TransactionValidationResult {
    valid: boolean;
    errors: Record<string, string>;
}

/**
 * Validate a stock ticker symbol
 */
export const validateTicker = (ticker: string | undefined | null): TickerValidationResult => {
    if (!ticker || typeof ticker !== 'string') {
        return { valid: false, error: 'Ticker jest wymagany' };
    }

    const trimmed = ticker.trim().toUpperCase();

    if (trimmed.length === 0) {
        return { valid: false, error: 'Ticker nie może być pusty' };
    }

    if (trimmed.length > 10) {
        return { valid: false, error: 'Ticker jest zbyt długi (max 10 znaków)' };
    }

    // Allow letters, numbers, dots, and dashes
    if (!/^[A-Z0-9.\-]+$/.test(trimmed)) {
        return { valid: false, error: 'Ticker zawiera niedozwolone znaki' };
    }

    return { valid: true, error: null, ticker: trimmed };
};

/**
 * Validate an amount (quantity or money)
 */
export const validateAmount = (
    amount: number | string | undefined | null,
    options: AmountValidationOptions = {}
): ValidationResult<number> => {
    const { min, max = Infinity, allowZero = false, allowNegative = false, label = 'Wartość' } = options;

    // Set default min based on allowNegative
    const effectiveMin = min !== undefined ? min : allowNegative ? -Infinity : 0;

    if (amount === undefined || amount === null || amount === '') {
        return { valid: false, error: `${label} jest wymagana`, value: undefined };
    }

    const num = typeof amount === 'string' ? parseFloat(amount.replace(',', '.')) : amount;

    if (isNaN(num)) {
        return { valid: false, error: `${label} musi być liczbą`, value: undefined };
    }

    if (!allowNegative && num < 0) {
        return { valid: false, error: `${label} nie może być ujemna`, value: undefined };
    }

    if (!allowZero && num === 0) {
        return { valid: false, error: `${label} musi być większa od zera`, value: undefined };
    }

    if (num < effectiveMin) {
        return { valid: false, error: `${label} musi być większa lub równa ${effectiveMin}`, value: undefined };
    }

    if (num > max) {
        return { valid: false, error: `${label} nie może przekraczać ${max}`, value: undefined };
    }

    return { valid: true, error: null, value: num };
};

/**
 * Validate a date
 */
export const validateDate = (
    date: string | Date | undefined | null,
    options: DateValidationOptions = {}
): ValidationResult<Date> => {
    const { allowFuture = false, allowPast = true, minDate = null, maxDate = null, label = 'Data' } = options;

    if (!date) {
        return { valid: false, error: `${label} jest wymagana`, value: undefined };
    }

    const dateObj = date instanceof Date ? date : new Date(date);

    if (isNaN(dateObj.getTime())) {
        return { valid: false, error: `${label} jest nieprawidłowa`, value: undefined };
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (!allowFuture && dateObj > now) {
        return { valid: false, error: `${label} nie może być w przyszłości`, value: undefined };
    }

    if (!allowPast && dateObj < now) {
        return { valid: false, error: `${label} nie może być w przeszłości`, value: undefined };
    }

    if (minDate && dateObj < new Date(minDate)) {
        return { valid: false, error: `${label} jest zbyt wczesna`, value: undefined };
    }

    if (maxDate && dateObj > new Date(maxDate)) {
        return { valid: false, error: `${label} jest zbyt późna`, value: undefined };
    }

    return { valid: true, error: null, value: dateObj };
};

/**
 * Validate a currency code
 */
export const validateCurrency = (currency: string | undefined | null): CurrencyValidationResult => {
    const validCurrencies = ['PLN', 'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CNY'];

    if (!currency || typeof currency !== 'string') {
        return { valid: false, error: 'Waluta jest wymagana' };
    }

    const upperCurrency = currency.toUpperCase();

    if (!validCurrencies.includes(upperCurrency)) {
        return { valid: false, error: `Nieprawidłowa waluta. Dozwolone: ${validCurrencies.join(', ')}` };
    }

    return { valid: true, error: null, currency: upperCurrency };
};

/**
 * Transaction object for validation
 */
export interface TransactionInput {
    type?: string;
    ticker?: string;
    amount?: number | string;
    price?: number | string;
    date?: string | Date;
    currency?: string;
}

/**
 * Validate a transaction object
 */
export const validateTransaction = (transaction: TransactionInput): TransactionValidationResult => {
    const errors: Record<string, string> = {};
    let valid = true;

    // Validate type
    if (!transaction.type || !['buy', 'sell', 'deposit', 'withdraw'].includes(transaction.type)) {
        errors.type = 'Typ transakcji jest wymagany (buy, sell, deposit, withdraw)';
        valid = false;
    }

    // Validate ticker (for buy/sell)
    if (['buy', 'sell'].includes(transaction.type || '')) {
        const tickerValidation = validateTicker(transaction.ticker);
        if (!tickerValidation.valid) {
            errors.ticker = tickerValidation.error || 'Błąd walidacji tickera';
            valid = false;
        }
    }

    // Validate amount
    const amountValidation = validateAmount(transaction.amount, {
        min: 0,
        allowZero: false,
        label: 'Ilość'
    });
    if (!amountValidation.valid) {
        errors.amount = amountValidation.error || 'Błąd walidacji ilości';
        valid = false;
    }

    // Validate price (for buy/sell)
    if (['buy', 'sell'].includes(transaction.type || '')) {
        const priceValidation = validateAmount(transaction.price, {
            min: 0,
            allowZero: false,
            label: 'Cena'
        });
        if (!priceValidation.valid) {
            errors.price = priceValidation.error || 'Błąd walidacji ceny';
            valid = false;
        }
    }

    // Validate date
    const dateValidation = validateDate(transaction.date, {
        allowFuture: false
    });
    if (!dateValidation.valid) {
        errors.date = dateValidation.error || 'Błąd walidacji daty';
        valid = false;
    }

    // Validate currency
    if (transaction.currency) {
        const currencyValidation = validateCurrency(transaction.currency);
        if (!currencyValidation.valid) {
            errors.currency = currencyValidation.error || 'Błąd walidacji waluty';
            valid = false;
        }
    }

    return { valid, errors };
};

/**
 * Sanitize user input (remove dangerous characters)
 */
export const sanitizeInput = (input: unknown): string => {
    if (typeof input !== 'string') return '';

    // Remove HTML tags and dangerous characters
    return input
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>"'`]/g, '') // Remove dangerous chars
        .trim();
};

/**
 * Validate exchange rate
 */
export const validateExchangeRate = (rate: number | string | undefined | null): ValidationResult<number> => {
    const validation = validateAmount(rate, {
        min: 0,
        max: 1000,
        allowZero: false,
        label: 'Kurs wymiany'
    });

    return validation;
};
