/**
 * Date helpers working on calendar dates ('YYYY-MM-DD').
 *
 * `toISOString()` returns the UTC date, which in Poland (UTC+1/+2) is the previous day
 * between midnight and 01:00/02:00 local time. Use these helpers instead.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Local calendar date of a Date object as 'YYYY-MM-DD'
 */
export const toLocalISODate = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * Today's local calendar date as 'YYYY-MM-DD'
 */
export const todayLocal = (): string => toLocalISODate(new Date());

/**
 * Add (or subtract) whole days to a 'YYYY-MM-DD' date. Timezone/DST independent.
 */
export const addDaysISO = (dateStr: string, days: number): string => {
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
    const utc = new Date(Date.UTC(y!, m! - 1, d! + days));
    return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
};

/**
 * Calendar-date part of a stored date ('YYYY-MM-DD' or full ISO timestamp)
 */
export const datePart = (dateStr: string): string => (dateStr || '').slice(0, 10);
