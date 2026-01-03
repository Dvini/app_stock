/**
 * Centralized Cache Service for managing localStorage cache
 * Provides versioning, expiration, and pattern-based invalidation
 */

interface CacheData<T = unknown> {
    timestamp: number;
    value: T;
    ttl: number | null;
    metadata: Record<string, unknown>;
}

interface CacheSetOptions {
    ttl?: number;
    metadata?: Record<string, unknown>;
}

interface CacheStats {
    entries: number;
    sizeBytes: number;
    sizeKB: string;
}

class CacheService {
    private prefix: string;
    private version: string;

    /**
     * Create a new CacheService instance
     */
    constructor(prefix = 'stock_cache_', version = 'v2') {
        this.prefix = prefix;
        this.version = version;
    }

    /**
     * Generate a versioned cache key
     */
    private _getCacheKey(key: string): string {
        return `${this.prefix}${this.version}_${key}`;
    }

    /**
     * Get a value from cache if not expired
     */
    get<T = unknown>(key: string, maxAge: number | null = null): T | null {
        try {
            const cacheKey = this._getCacheKey(key);
            const cacheRaw = localStorage.getItem(cacheKey);

            if (!cacheRaw) return null;

            const cache = JSON.parse(cacheRaw) as CacheData<T>;
            const age = Date.now() - cache.timestamp;
            const effectiveMaxAge = maxAge || cache.ttl || Infinity;

            if (age < effectiveMaxAge) {
                return cache.value;
            }

            // Expired, remove from cache
            localStorage.removeItem(cacheKey);
            return null;
        } catch (e) {
            console.warn(`[CacheService] Error reading cache key "${key}":`, e);
            return null;
        }
    }

    /**
     * Set a value in cache with optional TTL
     */
    set<T = unknown>(key: string, value: T, options: CacheSetOptions = {}): void {
        try {
            const cacheKey = this._getCacheKey(key);
            const cacheData: CacheData<T> = {
                timestamp: Date.now(),
                value: value,
                ttl: options.ttl || null,
                metadata: options.metadata || {}
            };

            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (e) {
            console.error(`[CacheService] Error writing cache key "${key}":`, e);
            // Handle quota exceeded errors gracefully
            if (e instanceof Error && e.name === 'QuotaExceededError') {
                console.warn('[CacheService] localStorage quota exceeded, clearing old cache');
                this.clearOldest();
            }
        }
    }

    /**
     * Invalidate cache entries matching a pattern
     */
    invalidate(pattern: string | RegExp): void {
        try {
            const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
            const keysToRemove: string[] = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.prefix + this.version) && regex.test(key)) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
            console.log(`[CacheService] Invalidated ${keysToRemove.length} cache entries`);
        } catch (e) {
            console.error('[CacheService] Error invalidating cache:', e);
        }
    }

    /**
     * Clear all cache entries for this version
     */
    clear(): void {
        try {
            const keysToRemove: string[] = [];
            const versionPrefix = this.prefix + this.version;

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(versionPrefix)) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
            console.log(`[CacheService] Cleared ${keysToRemove.length} cache entries`);
        } catch (e) {
            console.error('[CacheService] Error clearing cache:', e);
        }
    }

    /**
     * Clear oldest cache entries (used when quota is exceeded)
     */
    clearOldest(count = 10): void {
        try {
            const entries: Array<{ key: string; timestamp: number }> = [];
            const versionPrefix = this.prefix + this.version;

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(versionPrefix)) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key) || '{}') as CacheData;
                        entries.push({ key, timestamp: data.timestamp || 0 });
                    } catch (e) {
                        // Invalid entry, mark for removal
                        entries.push({ key, timestamp: 0 });
                    }
                }
            }

            // Sort by timestamp (oldest first)
            entries.sort((a, b) => a.timestamp - b.timestamp);

            // Remove oldest entries
            const toRemove = entries.slice(0, count);
            toRemove.forEach(entry => localStorage.removeItem(entry.key));

            console.log(`[CacheService] Removed ${toRemove.length} oldest cache entries`);
        } catch (e) {
            console.error('[CacheService] Error clearing oldest cache:', e);
        }
    }

    /**
     * Clean up all expired cache entries
     * Should be called on app startup
     */
    cleanup(): number {
        try {
            const keysToRemove: string[] = [];
            const versionPrefix = this.prefix + this.version;
            const now = Date.now();

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(versionPrefix)) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key) || '{}') as CacheData;
                        const age = now - data.timestamp;
                        const ttl = data.ttl || Infinity;

                        if (age >= ttl) {
                            keysToRemove.push(key);
                        }
                    } catch (e) {
                        // Invalid entry, mark for removal
                        keysToRemove.push(key);
                    }
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
            
            if (keysToRemove.length > 0) {
                console.log(`[CacheService] Cleaned up ${keysToRemove.length} expired cache entries`);
            }
            
            return keysToRemove.length;
        } catch (e) {
            console.error('[CacheService] Error cleaning up cache:', e);
            return 0;
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        let totalEntries = 0;
        let totalSize = 0;
        const versionPrefix = this.prefix + this.version;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(versionPrefix)) {
                totalEntries++;
                const value = localStorage.getItem(key);
                totalSize += key.length + (value ? value.length : 0);
            }
        }

        return {
            entries: totalEntries,
            sizeBytes: totalSize,
            sizeKB: (totalSize / 1024).toFixed(2)
        };
    }
}

// Export singleton instance
export const cacheService = new CacheService();
export default CacheService;
