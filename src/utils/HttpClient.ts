/**
 * HTTP Client Utility
 * Provides unified HTTP request handling with timeout, error classification, and retry support
 */

export interface HttpClientOptions extends RequestInit {
    timeout?: number;
    retries?: number;
    retryDelay?: number;
}

export interface HttpResponse<T = any> {
    success: boolean;
    data?: T;
    error?: {
        type: 'TIMEOUT' | 'NETWORK' | 'HTTP_ERROR' | 'API_ERROR' | 'UNKNOWN';
        message: string;
        code?: number;
        statusCode?: number;
        originalError?: any;
    };
}

/**
 * Unified HTTP client with timeout, retry, and error handling
 */
export class HttpClient {
    private static readonly DEFAULT_TIMEOUT = 10000; // 10 seconds
    private static readonly DEFAULT_RETRIES = 0;
    private static readonly DEFAULT_RETRY_DELAY = 1000; // 1 second

    /**
     * Fetch with timeout support
     */
    static async fetchWithTimeout(
        url: string,
        options: HttpClientOptions = {}
    ): Promise<Response> {
        const {
            timeout = this.DEFAULT_TIMEOUT,
            retries = this.DEFAULT_RETRIES,
            retryDelay = this.DEFAULT_RETRY_DELAY,
            ...fetchOptions
        } = options;

        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                try {
                    const response = await fetch(url, {
                        ...fetchOptions,
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    return response;
                } catch (error) {
                    clearTimeout(timeoutId);
                    throw error;
                }
            } catch (error) {
                lastError = error as Error;

                // If this is the last attempt or not a retriable error, throw
                if (attempt === retries || !this.isRetriableError(error)) {
                    throw error;
                }

                // Wait before retrying
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }

        throw lastError || new Error('Request failed after retries');
    }

    /**
     * POST JSON data to API endpoint
     */
    static async postJSON<T = any>(
        url: string,
        body: any,
        options: HttpClientOptions = {}
    ): Promise<HttpResponse<T>> {
        try {
            const response = await this.fetchWithTimeout(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                body: JSON.stringify(body),
                ...options
            });

            // Handle HTTP errors
            if (!response.ok) {
                return {
                    success: false,
                    error: {
                        type: 'HTTP_ERROR',
                        message: `HTTP ${response.status}: ${response.statusText}`,
                        statusCode: response.status
                    }
                };
            }

            // Parse JSON response
            const result = await response.json();

            // Check SiYuan API response format
            if (typeof result === 'object' && 'code' in result) {
                if (result.code === 0) {
                    return {
                        success: true,
                        data: result.data
                    };
                } else {
                    return {
                        success: false,
                        error: {
                            type: 'API_ERROR',
                            message: result.msg || 'API error',
                            code: result.code,
                            originalError: result
                        }
                    };
                }
            }

            // Return raw data for non-SiYuan APIs
            return {
                success: true,
                data: result
            };

        } catch (error) {
            const errorType = this.classifyError(error);
            return {
                success: false,
                error: {
                    type: errorType,
                    message: error instanceof Error ? error.message : String(error),
                    originalError: error
                }
            };
        }
    }

    /**
     * GET request with JSON response
     */
    static async getJSON<T = any>(
        url: string,
        options: HttpClientOptions = {}
    ): Promise<HttpResponse<T>> {
        try {
            const response = await this.fetchWithTimeout(url, {
                method: 'GET',
                ...options
            });

            if (!response.ok) {
                return {
                    success: false,
                    error: {
                        type: 'HTTP_ERROR',
                        message: `HTTP ${response.status}: ${response.statusText}`,
                        statusCode: response.status
                    }
                };
            }

            const result = await response.json();

            // Check SiYuan API response format
            if (typeof result === 'object' && 'code' in result) {
                if (result.code === 0) {
                    return {
                        success: true,
                        data: result.data
                    };
                } else {
                    return {
                        success: false,
                        error: {
                            type: 'API_ERROR',
                            message: result.msg || 'API error',
                            code: result.code
                        }
                    };
                }
            }

            return {
                success: true,
                data: result
            };

        } catch (error) {
            const errorType = this.classifyError(error);
            return {
                success: false,
                error: {
                    type: errorType,
                    message: error instanceof Error ? error.message : String(error),
                    originalError: error
                }
            };
        }
    }

    /**
     * Classify error type for better error handling
     */
    private static classifyError(error: any): 'TIMEOUT' | 'NETWORK' | 'UNKNOWN' {
        if (error.name === 'AbortError') {
            return 'TIMEOUT';
        }
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
            return 'NETWORK';
        }
        return 'UNKNOWN';
    }

    /**
     * Check if error is retriable
     */
    private static isRetriableError(error: any): boolean {
        // Retry on network errors and timeouts, but not on abort or other errors
        const errorType = this.classifyError(error);
        return errorType === 'NETWORK';
    }
}
