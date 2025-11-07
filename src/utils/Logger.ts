/**
 * Logger Utility
 * Provides leveled logging with configurable output
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4
}

export interface LoggerOptions {
    level?: LogLevel;
    prefix?: string;
    enableTimestamp?: boolean;
    enableStackTrace?: boolean;
}

/**
 * Centralized logging system with level control
 */
export class Logger {
    private static level: LogLevel = LogLevel.INFO;
    private static prefix: string = '[ClaudePlugin]';
    private static enableTimestamp: boolean = false;
    private static enableStackTrace: boolean = false;

    /**
     * Configure logger settings
     */
    static configure(options: LoggerOptions): void {
        if (options.level !== undefined) {
            this.level = options.level;
        }
        if (options.prefix !== undefined) {
            this.prefix = options.prefix;
        }
        if (options.enableTimestamp !== undefined) {
            this.enableTimestamp = options.enableTimestamp;
        }
        if (options.enableStackTrace !== undefined) {
            this.enableStackTrace = options.enableStackTrace;
        }
    }

    /**
     * Set log level
     */
    static setLevel(level: LogLevel): void {
        this.level = level;
    }

    /**
     * Get current log level
     */
    static getLevel(): LogLevel {
        return this.level;
    }

    /**
     * Debug level logging
     */
    static debug(message: string, ...args: any[]): void {
        if (this.level <= LogLevel.DEBUG) {
            this.log('DEBUG', console.log, message, ...args);
        }
    }

    /**
     * Info level logging
     */
    static info(message: string, ...args: any[]): void {
        if (this.level <= LogLevel.INFO) {
            this.log('INFO', console.log, message, ...args);
        }
    }

    /**
     * Warning level logging
     */
    static warn(message: string, ...args: any[]): void {
        if (this.level <= LogLevel.WARN) {
            this.log('WARN', console.warn, message, ...args);
        }
    }

    /**
     * Error level logging
     */
    static error(message: string, ...args: any[]): void {
        if (this.level <= LogLevel.ERROR) {
            this.log('ERROR', console.error, message, ...args);

            // Optionally log stack trace for errors
            if (this.enableStackTrace) {
                const stack = new Error().stack;
                if (stack) {
                    console.error('Stack trace:', stack);
                }
            }
        }
    }

    /**
     * Internal log formatter
     */
    private static log(
        level: string,
        logFn: (...args: any[]) => void,
        message: string,
        ...args: any[]
    ): void {
        const parts: string[] = [];

        // Add timestamp if enabled
        if (this.enableTimestamp) {
            const timestamp = new Date().toISOString();
            parts.push(`[${timestamp}]`);
        }

        // Add prefix and level
        parts.push(`${this.prefix} [${level}]`);

        // Build final message
        const finalMessage = `${parts.join(' ')} ${message}`;

        // Log with console
        if (args.length > 0) {
            logFn(finalMessage, ...args);
        } else {
            logFn(finalMessage);
        }
    }

    /**
     * Create a scoped logger with a custom prefix
     */
    static createScoped(scope: string): ScopedLogger {
        return new ScopedLogger(scope);
    }
}

/**
 * Scoped logger for specific modules/components
 */
export class ScopedLogger {
    constructor(private scope: string) {}

    debug(message: string, ...args: any[]): void {
        Logger.debug(`[${this.scope}] ${message}`, ...args);
    }

    info(message: string, ...args: any[]): void {
        Logger.info(`[${this.scope}] ${message}`, ...args);
    }

    warn(message: string, ...args: any[]): void {
        Logger.warn(`[${this.scope}] ${message}`, ...args);
    }

    error(message: string, ...args: any[]): void {
        Logger.error(`[${this.scope}] ${message}`, ...args);
    }
}

// Export convenience functions for direct use
export const logger = {
    debug: Logger.debug.bind(Logger),
    info: Logger.info.bind(Logger),
    warn: Logger.warn.bind(Logger),
    error: Logger.error.bind(Logger),
    setLevel: Logger.setLevel.bind(Logger),
    configure: Logger.configure.bind(Logger),
    createScoped: Logger.createScoped.bind(Logger)
};
