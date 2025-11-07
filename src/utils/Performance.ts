/**
 * Performance Utilities
 * Provides performance optimization tools including debounce, throttle, and caching
 */

/**
 * Cache entry with timestamp
 */
interface CacheEntry<T> {
    value: T;
    timestamp: number;
}

/**
 * Performance optimization utilities
 */
export class PerformanceUtils {
    /**
     * Debounce function - waits until function hasn't been called for delay ms
     * Useful for: input fields, resize events
     *
     * @param func Function to debounce
     * @param delay Delay in milliseconds
     * @returns Debounced function
     *
     * @example
     * const debouncedSearch = PerformanceUtils.debounce((query) => {
     *   performSearch(query);
     * }, 300);
     */
    static debounce<T extends (...args: any[]) => any>(
        func: T,
        delay: number
    ): (...args: Parameters<T>) => void {
        let timeoutId: ReturnType<typeof setTimeout>;

        return function(this: any, ...args: Parameters<T>) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    /**
     * Throttle function - ensures function is called at most once per delay ms
     * Useful for: scroll events, frequent updates
     *
     * @param func Function to throttle
     * @param delay Delay in milliseconds
     * @returns Throttled function
     *
     * @example
     * const throttledScroll = PerformanceUtils.throttle(() => {
     *   updateScrollPosition();
     * }, 100);
     */
    static throttle<T extends (...args: any[]) => any>(
        func: T,
        delay: number
    ): (...args: Parameters<T>) => void {
        let lastCall = 0;

        return function(this: any, ...args: Parameters<T>) {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                func.apply(this, args);
            }
        };
    }

    /**
     * Request animation frame throttle - for smooth animations
     * Ensures function is called at most once per animation frame
     *
     * @param func Function to throttle
     * @returns RAF-throttled function
     *
     * @example
     * const smoothUpdate = PerformanceUtils.rafThrottle(() => {
     *   updateUI();
     * });
     */
    static rafThrottle<T extends (...args: any[]) => any>(
        func: T
    ): (...args: Parameters<T>) => void {
        let rafId: number | null = null;

        return function(this: any, ...args: Parameters<T>) {
            if (rafId !== null) return;

            rafId = requestAnimationFrame(() => {
                func.apply(this, args);
                rafId = null;
            });
        };
    }

    /**
     * Create a memoized version of a function
     * Caches results based on arguments
     *
     * @param func Function to memoize
     * @param resolver Custom key resolver function (optional)
     * @returns Memoized function
     *
     * @example
     * const expensiveCalc = PerformanceUtils.memoize((a, b) => {
     *   return a * b * Math.random(); // expensive calculation
     * });
     */
    static memoize<T extends (...args: any[]) => any>(
        func: T,
        resolver?: (...args: Parameters<T>) => string
    ): T & { cache: Map<string, ReturnType<T>> } {
        const cache = new Map<string, ReturnType<T>>();

        const memoized = function(this: any, ...args: Parameters<T>): ReturnType<T> {
            const key = resolver ? resolver(...args) : JSON.stringify(args);

            if (cache.has(key)) {
                return cache.get(key)!;
            }

            const result = func.apply(this, args);
            cache.set(key, result);
            return result;
        } as T & { cache: Map<string, ReturnType<T>> };

        memoized.cache = cache;
        return memoized;
    }

    /**
     * Batch DOM operations to reduce reflows
     * Collects operations and executes them in a single frame
     *
     * @example
     * const batcher = new PerformanceUtils.DOMBatcher();
     * batcher.add(() => element1.style.width = '100px');
     * batcher.add(() => element2.style.height = '200px');
     * batcher.flush(); // Executes all operations together
     */
    static createDOMBatcher() {
        return new DOMBatcher();
    }

    /**
     * Simple cache with TTL (Time To Live)
     *
     * @example
     * const cache = PerformanceUtils.createCache<string>(5000); // 5 second TTL
     * cache.set('key', 'value');
     * const value = cache.get('key'); // Returns 'value' if not expired
     */
    static createCache<T>(ttl: number = 60000) {
        return new SimpleCache<T>(ttl);
    }
}

/**
 * DOM Batcher for reducing reflows
 */
export class DOMBatcher {
    private operations: Array<() => void> = [];
    private scheduled: boolean = false;

    /**
     * Add an operation to the batch
     */
    add(operation: () => void): void {
        this.operations.push(operation);

        if (!this.scheduled) {
            this.scheduled = true;
            requestAnimationFrame(() => this.flush());
        }
    }

    /**
     * Execute all batched operations
     */
    flush(): void {
        const ops = this.operations;
        this.operations = [];
        this.scheduled = false;

        ops.forEach(op => {
            try {
                op();
            } catch (error) {
                console.error('DOM batch operation failed:', error);
            }
        });
    }

    /**
     * Clear all pending operations
     */
    clear(): void {
        this.operations = [];
        this.scheduled = false;
    }
}

/**
 * Simple cache with TTL support
 */
export class SimpleCache<T> {
    private cache: Map<string, CacheEntry<T>> = new Map();
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor(
        private ttl: number = 60000, // Default 1 minute
        private maxSize: number = 100
    ) {
        // Start cleanup interval
        this.startCleanup();
    }

    /**
     * Get value from cache
     */
    get(key: string): T | undefined {
        const entry = this.cache.get(key);

        if (!entry) {
            return undefined;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return undefined;
        }

        return entry.value;
    }

    /**
     * Set value in cache
     */
    set(key: string, value: T): void {
        // Enforce max size
        if (this.cache.size >= this.maxSize) {
            // Remove oldest entry
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    /**
     * Check if key exists and is not expired
     */
    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    /**
     * Delete a specific key
     */
    delete(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Clear all cached values
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache size
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Start periodic cleanup of expired entries
     */
    private startCleanup(): void {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of this.cache.entries()) {
                if (now - entry.timestamp > this.ttl) {
                    this.cache.delete(key);
                }
            }
        }, this.ttl);
    }

    /**
     * Stop cleanup and destroy cache
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.cache.clear();
    }
}

// Timing constants for common use cases
export const TIMING_CONSTANTS = {
    DOM_RENDER_DELAY: 300,          // Wait for SiYuan DOM updates
    DOM_RENDER_LONG_DELAY: 500,     // Longer wait for complex operations
    RETRY_DELAY: 300,               // Retry delay for failed operations
    API_TIMEOUT: 10000,             // Default API timeout
    ANIMATION_DURATION: 200,        // Standard animation duration
    CACHE_TTL: 60000,              // Default cache TTL (1 minute)
    DEBOUNCE_DELAY: 300,           // Standard debounce delay
    THROTTLE_DELAY: 100,           // Standard throttle delay
} as const;
