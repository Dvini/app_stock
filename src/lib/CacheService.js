/**
 * Centralized Cache Service for managing localStorage cache
 * Provides versioning, expiration, and pattern-based invalidation
 */
class CacheService {
    /**
     * Create a new CacheService instance
     * @param {string} prefix - Prefix for all cache keys
     * @param {string} version - Cache version for invalidation
     */
    constructor(prefix = 'stock_cache_', version = 'v2') {
        this.prefix = prefix;
        this.version = version;
    }

    /**
     * Generate a versioned cache key
     * @param {string} key - The base key
     * @returns {string} Prefixed and versioned key
     */
    _getCacheKey(key) {
        return `${this.prefix}${this.version}_${key}`;
    }

    /**
     * Get a value from cache if not expired
     * @param {string} key - Cache key
     * @param {number} maxAge - Maximum age in milliseconds (optional, uses stored TTL if not provided)
     * @returns {any|null} Cached value or null if expired/not found
     */
    get(key, maxAge = null) {
        try {
            const cacheKey = this._getCacheKey(key);
            const cacheRaw = localStorage.getItem(cacheKey);

            if (!cacheRaw) return null;

            const cache = JSON.parse(cacheRaw);
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
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {Object} options - Additional options
     * @param {number} options.ttl - Time to live in milliseconds
     * @param {Object} options.metadata - Additional metadata to store
     */
    set(key, value, options = {}) {
        try {
            const cacheKey = this._getCacheKey(key);
            const cacheData = {
                timestamp: Date.now(),
                value: value,
                ttl: options.ttl || null,
                metadata: options.metadata || {}
            };

            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (e) {
            console.error(`[CacheService] Error writing cache key "${key}":`, e);
            // Handle quota exceeded errors gracefully
            if (e.name === 'QuotaExceededError') {
                console.warn('[CacheService] localStorage quota exceeded, clearing old cache');
                this.clearOldest();
            }
        }
    }

    /**
     * Invalidate cache entries matching a pattern
     * @param {string|RegExp} pattern - Pattern to match keys against
     */
    invalidate(pattern) {
        try {
            const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
            const keysToRemove = [];

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
    clear() {
        try {
            const keysToRemove = [];
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
     * @param {number} count - Number of entries to remove (default: 10)
     */
    clearOldest(count = 10) {
        try {
            const entries = [];
            const versionPrefix = this.prefix + this.version;

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(versionPrefix)) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
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
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getStats() {
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
