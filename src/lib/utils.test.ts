import { describe, it, expect } from 'vitest';
import { plSign, plTextClass } from './utils';
import { formatNumber } from '../utils/formatters';

describe('plSign', () => {
    it('reads formatted P/L strings, including grouped thousands', () => {
        expect(plSign('+2 248,00 PLN (74,93%)')).toBe(1);
        expect(plSign(`${formatNumber(-12345.67)} PLN`)).toBe(-1);
        expect(plSign(`+${formatNumber(1234567)} USD`)).toBe(1);
    });

    it('treats values that display as zero as zero', () => {
        expect(plSign('0,00 PLN (0,00%)')).toBe(0);
        expect(plSign(`${formatNumber(-0.001)} PLN`)).toBe(0);
        expect(plSign(-0.004)).toBe(0);
        expect(plSign(0)).toBe(0);
    });

    it('handles numbers and the unicode minus sign', () => {
        expect(plSign(0.01)).toBe(1);
        expect(plSign(-0.01)).toBe(-1);
        expect(plSign('\u22125,00')).toBe(-1);
    });
});

describe('plTextClass', () => {
    it('maps sign to green, red or neutral', () => {
        expect(plTextClass(5)).toBe('text-emerald-400');
        expect(plTextClass(-5)).toBe('text-rose-400');
        expect(plTextClass('0,00 PLN')).toBe('text-slate-400');
    });
});
