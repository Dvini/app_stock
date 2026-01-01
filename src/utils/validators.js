/**
 * Validation utilities for form inputs and data
 */

/**
 * Validate a stock ticker symbol
 * @param {string} ticker - Ticker to validate
 * @returns {{valid: boolean, error: string|null}}
 */
export const validateTicker = (ticker) => {
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
 * @param {number|string} amount - Amount to validate
 * @param {Object} options - Validation options
 * @returns {{valid: boolean, error: string|null, value: number|null}}
 */
export const validateAmount = (amount, options = {}) => {
    const {
        min = 0,
        max = Infinity,
        allowZero = false,
        allowNegative = false,
        label = 'Wartość'
    } = options;

    if (amount === undefined || amount === null || amount === '') {
        return { valid: false, error: `${label} jest wymagana`, value: null };
    }

    const num = typeof amount === 'string' ? parseFloat(amount.replace(',', '.')) : amount;

    if (isNaN(num)) {
        return { valid: false, error: `${label} musi być liczbą`, value: null };
    }

    if (!allowNegative && num < 0) {
        return { valid: false, error: `${label} nie może być ujemna`, value: null };
    }

    if (!allowZero && num === 0) {
        return { valid: false, error: `${label} musi być większa od zera`, value: null };
    }

    if (num < min) {
        return { valid: false, error: `${label} musi być większa lub równa ${min}`, value: null };
    }

    if (num > max) {
        return { valid: false, error: `${label} nie może przekraczać ${max}`, value: null };
    }

    return { valid: true, error: null, value: num };
};

/**
 * Validate a date
 * @param {string|Date} date - Date to validate
 * @param {Object} options - Validation options
 * @returns {{valid: boolean, error: string|null, date: Date|null}}
 */
export const validateDate = (date, options = {}) => {
    const {
        allowFuture = false,
        allowPast = true,
        minDate = null,
        maxDate = null,
        label = 'Data'
    } = options;

    if (!date) {
        return { valid: false, error: `${label} jest wymagana`, date: null };
    }

    const dateObj = date instanceof Date ? date : new Date(date);

    if (isNaN(dateObj.getTime())) {
        return { valid: false, error: `${label} jest nieprawidłowa`, date: null };
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (!allowFuture && dateObj > now) {
        return { valid: false, error: `${label} nie może być w przyszłości`, date: null };
    }

    if (!allowPast && dateObj < now) {
        return { valid: false, error: `${label} nie może być w przeszłości`, date: null };
    }

    if (minDate && dateObj < new Date(minDate)) {
        return { valid: false, error: `${label} jest zbyt wczesna`, date: null };
    }

    if (maxDate && dateObj > new Date(maxDate)) {
        return { valid: false, error: `${label} jest zbyt późna`, date: null };
    }

    return { valid: true, error: null, date: dateObj };
};

/**
 * Validate a currency code
 * @param {string} currency - Currency code to validate
 * @returns {{valid: boolean, error: string|null}}
 */
export const validateCurrency = (currency) => {
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
 * Validate a transaction object
 * @param {Object} transaction - Transaction to validate
 * @returns {{valid: boolean, errors: Object}}
 */
export const validateTransaction = (transaction) => {
    const errors = {};
    let valid = true;

    // Validate type
    if (!transaction.type || !['buy', 'sell', 'deposit', 'withdraw'].includes(transaction.type)) {
        errors.type = 'Typ transakcji jest wymagany (buy, sell, deposit, withdraw)';
        valid = false;
    }

    // Validate ticker (for buy/sell)
    if (['buy', 'sell'].includes(transaction.type)) {
        const tickerValidation = validateTicker(transaction.ticker);
        if (!tickerValidation.valid) {
            errors.ticker = tickerValidation.error;
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
        errors.amount = amountValidation.error;
        valid = false;
    }

    // Validate price (for buy/sell)
    if (['buy', 'sell'].includes(transaction.type)) {
        const priceValidation = validateAmount(transaction.price, {
            min: 0,
            allowZero: false,
            label: 'Cena'
        });
        if (!priceValidation.valid) {
            errors.price = priceValidation.error;
            valid = false;
        }
    }

    // Validate date
    const dateValidation = validateDate(transaction.date, {
        allowFuture: false
    });
    if (!dateValidation.valid) {
        errors.date = dateValidation.error;
        valid = false;
    }

    // Validate currency
    if (transaction.currency) {
        const currencyValidation = validateCurrency(transaction.currency);
        if (!currencyValidation.valid) {
            errors.currency = currencyValidation.error;
            valid = false;
        }
    }

    return { valid, errors };
};

/**
 * Sanitize user input (remove dangerous characters)
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized input
 */
export const sanitizeInput = (input) => {
    if (typeof input !== 'string') return '';

    // Remove HTML tags and dangerous characters
    return input
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>\"'`]/g, '') // Remove dangerous chars
        .trim();
};

/**
 * Validate exchange rate
 * @param {number} rate - Exchange rate to validate
 * @returns {{valid: boolean, error: string|null}}
 */
export const validateExchangeRate = (rate) => {
    const validation = validateAmount(rate, {
        min: 0,
        max: 1000,
        allowZero: false,
        label: 'Kurs wymiany'
    });

    return validation;
};
