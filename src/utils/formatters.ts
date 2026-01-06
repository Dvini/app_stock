/**
 * Format a number with Polish locale formatting
 */
export const formatNumber = (value: number | string | undefined | null, minDecimals = 2, maxDecimals = 2): string => {
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
 */
export const formatQuantity = (value: number | string | undefined | null): string => {
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
 */
export const formatCurrency = (
    value: number | string | undefined | null,
    currency = 'PLN',
    showSymbol = true
): string => {
    if (value === undefined || value === null) return '0,00 ' + currency;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0,00 ' + currency;

    const formatted = formatNumber(num, 2, 2);

    if (!showSymbol) return formatted;

    // Currency symbols mapping
    const symbols: Record<string, string> = {
        PLN: 'zł',
        USD: '$',
        EUR: '€',
        GBP: '£',
        JPY: '¥',
        CHF: 'CHF',
        CNY: '¥'
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
 */
export const formatPercentage = (
    value: number | string | undefined | null,
    decimals = 2,
    includeSign = false
): string => {
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

type DateFormatType = 'short' | 'medium' | 'long' | 'time' | 'datetime';

/**
 * Format a date with Polish locale
 */
export const formatDate = (
    date: Date | string | number | undefined | null,
    format: DateFormatType = 'medium'
): string => {
    if (!date) return '';

    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) return '';

    const formats: Record<DateFormatType, Intl.DateTimeFormatOptions> = {
        short: {
            // 01.01.2024
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        },
        medium: {
            // 1 stycznia 2024
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        },
        long: {
            // poniedziałek, 1 stycznia 2024
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        },
        time: {
            // 14:30
            hour: '2-digit',
            minute: '2-digit'
        },
        datetime: {
            // 01.01.2024, 14:30
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
 * Profit/loss formatted result
 */
export interface ProfitLossResult {
    value: string;
    className: string;
    withSign: string;
}

/**
 * Format profit/loss value with color indication
 */
export const formatProfitLoss = (value: number, currency = 'PLN'): ProfitLossResult => {
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
 */
export const formatAbbreviated = (value: number | undefined | null, decimals = 1): string => {
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
