import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Sign of a profit/loss as displayed: a number, or a formatted string such as "+1 234,50 PLN (2,10%)".
 * Anything that rounds to 0,00 counts as zero, so it is shown neutral rather than red or green.
 */
export function plSign(value: number | string): -1 | 0 | 1 {
    let num = 0;
    if (typeof value === 'number') {
        num = Math.round(value * 100) / 100;
    } else {
        const match = value.trim().match(/^[+\-\u2212]?[\d\s\u00a0\u202f]*\d(?:,\d+)?/);
        if (match) {
            num = parseFloat(
                match[0]
                    .replace(/[\s\u00a0\u202f]/g, '')
                    .replace('\u2212', '-')
                    .replace(',', '.')
            );
        }
    }
    return num > 0 ? 1 : num < 0 ? -1 : 0;
}

/** Text color for a profit/loss: green above zero, red below, neutral at zero */
export function plTextClass(value: number | string): string {
    const sign = plSign(value);
    return sign > 0 ? 'text-emerald-400' : sign < 0 ? 'text-rose-400' : 'text-slate-400';
}
