import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nbpService } from './NBPService';

describe('nbpService.getTaxRate', () => {
    beforeEach(() => {
        localStorage.clear();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns the last NBP rate strictly before the transaction date', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                rates: [
                    { mid: 4.01, effectiveDate: '2025-01-02' },
                    { mid: 4.05, effectiveDate: '2025-01-03' }
                ]
            })
        });
        vi.stubGlobal('fetch', fetchMock);

        // Monday 2025-01-06 -> last business day before is Friday 2025-01-03
        const result = await nbpService.getTaxRate('USD', '2025-01-06');

        expect(result).toEqual({ rate: 4.05, date: '2025-01-03' });
        expect(fetchMock.mock.calls[0]![0]).toContain('/a/usd/2024-12-23/2025-01-05/');
    });

    it('returns null instead of guessing when the request fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
        expect(await nbpService.getTaxRate('EUR', '2025-03-10')).toBeNull();
    });

    it('returns 1 for PLN without a request', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        expect(await nbpService.getTaxRate('PLN', '2025-03-10')).toEqual({ rate: 1, date: '2025-03-10' });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
