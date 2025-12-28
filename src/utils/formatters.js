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
