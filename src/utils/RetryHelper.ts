/**
 * RetryHelper - Provides retry functionality with exponential backoff
 *
 * Supports configurable retry count, delays, and error filtering
 */

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
    /** Maximum number of retry attempts (default: 2) */
    maxRetries: number;
    /** Initial delay before first retry in ms (default: 100) */
    baseDelay: number;
    /** Maximum delay cap in ms (default: 2000) */
    maxDelay: number;
    /** Multiplier for exponential backoff (default: 2) */
    backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 2,
    baseDelay: 100,
    maxDelay: 2000,
    backoffMultiplier: 2
};

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
    /** Whether the operation succeeded */
    success: boolean;
    /** The result if successful */
    result?: T;
    /** The last error if failed */
    error?: Error;
    /** Number of attempts made */
    attempts: number;
    /** Total time spent in ms */
    totalTime: number;
}

/**
 * Determines if an error is retryable based on common patterns
 * @param error The error to check
 * @returns true if the error is likely transient and retryable
 */
export function isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network errors are typically retryable
    if (name === 'typeerror' && message.includes('fetch')) {
        return true;
    }

    // HTTP 5xx errors are retryable (server errors)
    if (message.includes('http 5') || message.includes('500') ||
        message.includes('502') || message.includes('503') || message.includes('504')) {
        return true;
    }

    // Timeout errors are retryable
    if (message.includes('timeout') || message.includes('timed out')) {
        return true;
    }

    // Connection errors are retryable
    if (message.includes('econnreset') || message.includes('econnrefused') ||
        message.includes('network') || message.includes('connection')) {
        return true;
    }

    // Rate limiting is retryable with delay
    if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
        return true;
    }

    // Client errors (4xx except 429) are typically not retryable
    if (message.includes('http 4') && !message.includes('429')) {
        return false;
    }

    // Default: don't retry unknown errors
    return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 * @param attempt Current attempt number (0-based)
 * @param config Retry configuration
 * @returns Delay in milliseconds
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
    // Exponential backoff: baseDelay * (multiplier ^ attempt)
    const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);

    // Cap at maxDelay
    const cappedDelay = Math.min(exponentialDelay, config.maxDelay);

    // Add jitter (±25%) to prevent thundering herd
    const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

    return Math.max(0, cappedDelay + jitter);
}

/**
 * Execute an operation with retry logic
 *
 * @param operation The async operation to execute
 * @param config Retry configuration (optional, uses defaults)
 * @param isRetryable Optional function to determine if an error should trigger a retry
 * @returns The result of the operation
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *     () => fetchData(),
 *     { maxRetries: 3, baseDelay: 200 }
 * );
 * ```
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    isRetryable: (error: unknown) => boolean = isRetryableError
): Promise<T> {
    const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if we should retry
            const isLastAttempt = attempt >= fullConfig.maxRetries;
            const shouldRetry = !isLastAttempt && isRetryable(error);

            if (!shouldRetry) {
                console.warn(`[RetryHelper] Operation failed (attempt ${attempt + 1}/${fullConfig.maxRetries + 1}), not retrying:`, lastError.message);
                throw lastError;
            }

            // Calculate delay and wait
            const delay = calculateDelay(attempt, fullConfig);
            console.log(`[RetryHelper] Operation failed (attempt ${attempt + 1}/${fullConfig.maxRetries + 1}), retrying in ${Math.round(delay)}ms:`, lastError.message);

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Execute an operation with retry logic and return detailed result
 *
 * @param operation The async operation to execute
 * @param config Retry configuration (optional, uses defaults)
 * @param isRetryable Optional function to determine if an error should trigger a retry
 * @returns Detailed result including success status, attempts, and timing
 *
 * @example
 * ```typescript
 * const result = await withRetryResult(
 *     () => deleteBlock(id),
 *     { maxRetries: 2 }
 * );
 * if (!result.success) {
 *     console.error(`Failed after ${result.attempts} attempts:`, result.error);
 * }
 * ```
 */
export async function withRetryResult<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    isRetryable: (error: unknown) => boolean = isRetryableError
): Promise<RetryResult<T>> {
    const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    const startTime = Date.now();
    let lastError: Error | undefined;
    let attempts = 0;

    for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
        attempts++;
        try {
            const result = await operation();
            return {
                success: true,
                result,
                attempts,
                totalTime: Date.now() - startTime
            };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if we should retry
            const isLastAttempt = attempt >= fullConfig.maxRetries;
            const shouldRetry = !isLastAttempt && isRetryable(error);

            if (!shouldRetry) {
                break;
            }

            // Calculate delay and wait
            const delay = calculateDelay(attempt, fullConfig);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    return {
        success: false,
        error: lastError,
        attempts,
        totalTime: Date.now() - startTime
    };
}

/**
 * Create a retryable version of an async function
 *
 * @param fn The function to wrap with retry logic
 * @param config Retry configuration
 * @returns A wrapped function that will retry on failure
 *
 * @example
 * ```typescript
 * const retryableFetch = createRetryable(
 *     (url: string) => fetch(url),
 *     { maxRetries: 3 }
 * );
 * const response = await retryableFetch('https://api.example.com');
 * ```
 */
export function createRetryable<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    config: Partial<RetryConfig> = {},
    isRetryable: (error: unknown) => boolean = isRetryableError
): (...args: TArgs) => Promise<TResult> {
    return (...args: TArgs) => withRetry(() => fn(...args), config, isRetryable);
}
