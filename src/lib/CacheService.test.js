/**
 * Tests for CacheService
 * Tests caching functionality including get/set, TTL, invalidation, and cleanup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import CacheService from '../lib/CacheService';

describe('CacheService', () => {
    let cacheService;

    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
        // Create new instance
        cacheService = new CacheService('test_cache_', 'v1');
    });

    afterEach(() => {
        localStorage.clear();
    });

    describe('Basic Operations', () => {
        it('should set and get a value', () => {
            cacheService.set('test_key', { data: 'test value' });
            const result = cacheService.get('test_key');

            expect(result).toEqual({ data: 'test value' });
        });

        it('should return null for non-existent key', () => {
            const result = cacheService.get('non_existent');
            expect(result).toBeNull();
        });

        it('should overwrite existing key', () => {
            cacheService.set('key', { value: 1 });
            cacheService.set('key', { value: 2 });

            const result = cacheService.get('key');
            expect(result).toEqual({ value: 2 });
        });
    });

    describe('TTL (Time To Live)', () => {
        it('should respect TTL and return null for expired entries', () => {
            const now = Date.now();

            // Mock Date.now to control time
            vi.spyOn(Date, 'now').mockReturnValue(now);

            // Set value with 1000ms TTL
            cacheService.set('key', { data: 'test' }, { ttl: 1000 });

            // Immediately get - should work
            expect(cacheService.get('key', 1000)).toEqual({ data: 'test' });

            // Advance time by 1001ms
            vi.spyOn(Date, 'now').mockReturnValue(now + 1001);

            // Now should be expired
            expect(cacheService.get('key', 1000)).toBeNull();

            vi.restoreAllMocks();
        });

        it('should use maxAge parameter in get()', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            cacheService.set('key', { data: 'test' });

            // Advance time by 500ms
            vi.spyOn(Date, 'now').mockReturnValue(now + 500);

            // maxAge=1000 should pass
            expect(cacheService.get('key', 1000)).toEqual({ data: 'test' });

            // maxAge=100 should fail (expired)
            expect(cacheService.get('key', 100)).toBeNull();

            vi.restoreAllMocks();
        });
    });

    describe('Invalidation', () => {
        it('should invalidate entries by exact key', () => {
            cacheService.set('key1', { data: 'test1' });
            cacheService.set('key2', { data: 'test2' });

            cacheService.invalidate('key1');

            expect(cacheService.get('key1')).toBeNull();
            expect(cacheService.get('key2')).toEqual({ data: 'test2' });
        });

        it('should invalidate entries by pattern', () => {
            cacheService.set('price_AAPL', { price: 100 });
            cacheService.set('price_GOOGL', { price: 200 });
            cacheService.set('history_AAPL', { data: [] });

            cacheService.invalidate('price_*');

            expect(cacheService.get('price_AAPL')).toBeNull();
            expect(cacheService.get('price_GOOGL')).toBeNull();
            expect(cacheService.get('history_AAPL')).toEqual({ data: [] });
        });
    });

    describe('Clear', () => {
        it('should clear all cache entries', () => {
            cacheService.set('key1', { data: 'test1' });
            cacheService.set('key2', { data: 'test2' });
            cacheService.set('key3', { data: 'test3' });

            cacheService.clear();

            expect(cacheService.get('key1')).toBeNull();
            expect(cacheService.get('key2')).toBeNull();
            expect(cacheService.get('key3')).toBeNull();
        });
    });

    describe('Storage Management', () => {
        it('should provide cache statistics', () => {
            cacheService.set('key1', { data: 'test1' });
            cacheService.set('key2', { data: 'test2' });

            const stats = cacheService.getStats();

            expect(stats.entries).toBe(2);
            expect(stats.sizeBytes).toBeGreaterThan(0);
        });

        it('should clear oldest entries when storage limit exceeded', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now')
                .mockReturnValueOnce(now)
                .mockReturnValueOnce(now + 100)
                .mockReturnValueOnce(now + 200);

            cacheService.set('oldest', { data: 'old' });
            cacheService.set('middle', { data: 'mid' });
            cacheService.set('newest', { data: 'new' });

            vi.restoreAllMocks();

            // Call clearOldest directly (it will remove 1 oldest entry by default for count=10 but we have 3)
            cacheService.clearOldest(1);

            // Oldest should be removed
            expect(cacheService.get('oldest')).toBeNull();
            // Others should remain
            expect(cacheService.get('middle')).toEqual({ data: 'mid' });
            expect(cacheService.get('newest')).toEqual({ data: 'new' });

            vi.restoreAllMocks();
        });
    });

    describe('Edge Cases', () => {
        it('should handle null/undefined values', () => {
            cacheService.set('null_key', null);
            cacheService.set('undefined_key', undefined);

            // When null/undefined is stored, it gets serialized and retrieved as null
            expect(cacheService.get('null_key')).toBeNull();
            // undefined becomes null when JSON stringified
            const result = cacheService.get('undefined_key');
            expect(result === null || result === undefined).toBe(true);
        });

        it('should handle complex objects', () => {
            const complexObject = {
                nested: {
                    array: [1, 2, 3],
                    object: { key: 'value' }
                },
                date: new Date().toISOString()
            };

            cacheService.set('complex', complexObject);
            const result = cacheService.get('complex');

            expect(result).toEqual(complexObject);
        });

        it('should handle JSON serialization errors gracefully', () => {
            const circular = {};
            circular.self = circular; // Circular reference

            // Should not throw, but handle gracefully
            expect(() => cacheService.set('circular', circular)).not.toThrow();
        });
    });
});
