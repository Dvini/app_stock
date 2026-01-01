/**
 * Format a number with Polish locale formatting
 * @param {number|string} value - Value to format
 * @param {number} minDecimals - Minimum decimal places (default: 2)
 * @param {number} maxDecimals - Maximum decimal places (default: 2)
 * @returns {string} Formatted number
 */
export const formatNumber = (value, minDecimals = 2, maxDecimals = 2) => {
    if (value === undefined || value === null) return '0,00';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0,00';

    return new Intl.NumberFormat('pl-PL', {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
        useGrouping: true // This adds the space separator for thousands
    }).format(num);
};

/**
 * Format a quantity/amount with variable precision
 * @param {number|string} value - Value to format
 * @returns {string} Formatted quantity
 */
export const formatQuantity = (value) => {
    if (value === undefined || value === null) return '0';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';

    return new Intl.NumberFormat('pl-PL', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
        useGrouping: true
    }).format(num);
};

/**
 * Format a value with currency symbol
 * @param {number} value - Value to format
 * @param {string} currency - Currency code (PLN, USD, EUR, etc.)
 * @param {boolean} showSymbol - Whether to show currency symbol (default: true)
 * @returns {string} Formatted currency value
 */
export const formatCurrency = (value, currency = 'PLN', showSymbol = true) => {
    if (value === undefined || value === null) return '0,00 ' + currency;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0,00 ' + currency;

    const formatted = formatNumber(num, 2, 2);

    if (!showSymbol) return formatted;

    // Currency symbols mapping
    const symbols = {
        'PLN': 'zł',
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'JPY': '¥',
        'CHF': 'CHF',
        'CNY': '¥'
    };

    const symbol = symbols[currency] || currency;

    // For USD, EUR, GBP put symbol before the number
    if (['USD', 'EUR', 'GBP'].includes(currency)) {
        return `${symbol} ${formatted}`;
    }

    // For PLN and others, put after
    return `${formatted} ${symbol}`;
};

/**
 * Format a percentage value
 * @param {number} value - Value to format (0.15 = 15%)
 * @param {number} decimals - Decimal places (default: 2)
 * @param {boolean} includeSign - Include + for positive values (default: false)
 * @returns {string} Formatted percentage
 */
export const formatPercentage = (value, decimals = 2, includeSign = false) => {
    if (value === undefined || value === null) return '0,00%';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0,00%';

    const percentage = num * 100;
    const formatted = formatNumber(percentage, decimals, decimals);

    if (includeSign && num > 0) {
        return `+${formatted}%`;
    }

    return `${formatted}%`;
};

/**
 * Format a date with Polish locale
 * @param {Date|string|number} date - Date to format
 * @param {string} format - Format type: 'short', 'medium', 'long', 'time' (default: 'medium')
 * @returns {string} Formatted date
 */
export const formatDate = (date, format = 'medium') => {
    if (!date) return '';

    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) return '';

    const formats = {
        'short': { // 01.01.2024
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        },
        'medium': { // 1 stycznia 2024
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        },
        'long': { // poniedziałek, 1 stycznia 2024
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        },
        'time': { // 14:30
            hour: '2-digit',
            minute: '2-digit'
        },
        'datetime': { // 01.01.2024, 14:30
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }
    };

    const options = formats[format] || formats.medium;
    return new Intl.DateTimeFormat('pl-PL', options).format(dateObj);
};

/**
 * Format profit/loss value with color indication
 * @param {number} value - P/L value
 * @param {string} currency - Currency code
 * @returns {Object} Object with formatted value and color class
 */
export const formatProfitLoss = (value, currency = 'PLN') => {
    const formatted = formatCurrency(value, currency);
    const isPositive = value > 0;
    const isNegative = value < 0;

    return {
        value: formatted,
        className: isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-gray-500',
        withSign: isPositive ? `+${formatted}` : formatted
    };
};

/**
 * Format large numbers with abbreviations (K, M, B)
 * @param {number} value - Value to format
 * @param {number} decimals - Decimal places (default: 1)
 * @returns {string} Abbreviated number
 */
export const formatAbbreviated = (value, decimals = 1) => {
    if (value === undefined || value === null || isNaN(value)) return '0';

    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';

    if (absValue >= 1e9) {
        return sign + formatNumber(absValue / 1e9, decimals, decimals) + ' mld';
    }
    if (absValue >= 1e6) {
        return sign + formatNumber(absValue / 1e6, decimals, decimals) + ' mln';
    }
    if (absValue >= 1e3) {
        return sign + formatNumber(absValue / 1e3, decimals, decimals) + ' tys.';
    }

    return sign + formatNumber(absValue, 0, decimals);
};

