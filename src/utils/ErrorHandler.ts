/**
 * Error Handling Utilities
 * Provides typed error handling and user-friendly error messages
 */

import { showMessage } from 'siyuan';
import { Logger } from './Logger';

/**
 * Custom error types for better error categorization
 */
export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class NetworkError extends Error {
    constructor(message: string, public readonly statusCode?: number) {
        super(message);
        this.name = 'NetworkError';
    }
}

export class APIError extends Error {
    constructor(message: string, public readonly provider?: string) {
        super(message);
        this.name = 'APIError';
    }
}

export class TimeoutError extends Error {
    constructor(message: string, public readonly timeoutMs?: number) {
        super(message);
        this.name = 'TimeoutError';
    }
}

export class ConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConfigurationError';
    }
}

/**
 * Error handler options
 */
export interface ErrorHandlerOptions {
    /** Show error message to user */
    showToUser?: boolean;
    /** Custom user-facing message (defaults to error.message) */
    userMessage?: string;
    /** Log error to console/logger */
    log?: boolean;
    /** Log level (default: error) */
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    /** Context information for debugging */
    context?: Record<string, any>;
    /** Rethrow the error after handling */
    rethrow?: boolean;
}

/**
 * Centralized error handler
 */
export class ErrorHandler {
    private static defaultOptions: ErrorHandlerOptions = {
        showToUser: false,
        log: true,
        logLevel: 'error',
        rethrow: false,
    };

    /**
     * Handle an error with specified options
     */
    static handle(error: unknown, options: ErrorHandlerOptions = {}): void {
        const opts = { ...this.defaultOptions, ...options };
        const errorMessage = this.extractErrorMessage(error);
        const errorDetails = this.extractErrorDetails(error);

        // Log the error
        if (opts.log) {
            const logContext = {
                error: errorMessage,
                type: this.getErrorType(error),
                ...errorDetails,
                ...opts.context,
            };

            switch (opts.logLevel) {
                case 'debug':
                    Logger.debug(errorMessage, logContext);
                    break;
                case 'info':
                    Logger.info(errorMessage, logContext);
                    break;
                case 'warn':
                    Logger.warn(errorMessage, logContext);
                    break;
                case 'error':
                default:
                    Logger.error(errorMessage, logContext);
                    break;
            }
        }

        // Show to user
        if (opts.showToUser) {
            const userMsg = opts.userMessage || this.getUserFriendlyMessage(error);
            showMessage(userMsg, 5000, 'error');
        }

        // Rethrow if requested
        if (opts.rethrow) {
            throw error;
        }
    }

    /**
     * Extract error message from unknown error type
     */
    static extractErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        if (error && typeof error === 'object' && 'message' in error) {
            return String(error.message);
        }
        return 'Unknown error';
    }

    /**
     * Extract additional error details
     */
    static extractErrorDetails(error: unknown): Record<string, any> {
        const details: Record<string, any> = {};

        if (error instanceof NetworkError) {
            details.statusCode = error.statusCode;
        } else if (error instanceof APIError) {
            details.provider = error.provider;
        } else if (error instanceof TimeoutError) {
            details.timeoutMs = error.timeoutMs;
        }

        if (error instanceof Error && error.stack) {
            details.stack = error.stack;
        }

        return details;
    }

    /**
     * Get error type name
     */
    static getErrorType(error: unknown): string {
        if (error instanceof Error) {
            return error.name;
        }
        return typeof error;
    }

    /**
     * Convert technical error to user-friendly message
     */
    static getUserFriendlyMessage(error: unknown): string {
        if (error instanceof ValidationError) {
            return `验证失败: ${error.message}`;
        }
        if (error instanceof NetworkError) {
            return `网络错误: ${error.message}${error.statusCode ? ` (${error.statusCode})` : ''}`;
        }
        if (error instanceof APIError) {
            return `AI 服务错误: ${error.message}${error.provider ? ` (${error.provider})` : ''}`;
        }
        if (error instanceof TimeoutError) {
            return `请求超时: ${error.message}`;
        }
        if (error instanceof ConfigurationError) {
            return `配置错误: ${error.message}`;
        }
        if (error instanceof Error) {
            return error.message;
        }
        return '发生未知错误';
    }

    /**
     * Wrap an async function with error handling
     */
    static async wrapAsync<T>(
        fn: () => Promise<T>,
        options: ErrorHandlerOptions = {}
    ): Promise<T | null> {
        try {
            return await fn();
        } catch (error) {
            this.handle(error, options);
            return null;
        }
    }

    /**
     * Wrap a sync function with error handling
     */
    static wrap<T>(
        fn: () => T,
        options: ErrorHandlerOptions = {}
    ): T | null {
        try {
            return fn();
        } catch (error) {
            this.handle(error, options);
            return null;
        }
    }
}

/**
 * Decorator for automatic error handling in class methods
 */
export function HandleErrors(options: ErrorHandlerOptions = {}) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            try {
                return await originalMethod.apply(this, args);
            } catch (error) {
                ErrorHandler.handle(error, {
                    ...options,
                    context: {
                        ...options.context,
                        method: propertyKey,
                        class: target.constructor.name,
                    },
                });
                return null;
            }
        };

        return descriptor;
    };
}

/**
 * Type guard for Error objects
 */
export function isError(error: unknown): error is Error {
    return error instanceof Error;
}

/**
 * Type guard for specific error types
 */
export function isNetworkError(error: unknown): error is NetworkError {
    return error instanceof NetworkError;
}

export function isAPIError(error: unknown): error is APIError {
    return error instanceof APIError;
}

export function isTimeoutError(error: unknown): error is TimeoutError {
    return error instanceof TimeoutError;
}

export function isValidationError(error: unknown): error is ValidationError {
    return error instanceof ValidationError;
}

export function isConfigurationError(error: unknown): error is ConfigurationError {
    return error instanceof ConfigurationError;
}
