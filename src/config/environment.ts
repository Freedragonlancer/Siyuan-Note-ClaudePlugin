/**
 * Environment Configuration
 * Determines whether the plugin is running in development or production mode
 */

export const IS_DEV = import.meta.env?.DEV ?? false;
export const IS_PROD = !IS_DEV;

/**
 * Environment-aware console wrapper
 * In production, only console.warn and console.error are allowed
 * console.log and console.debug are suppressed
 */
export const devConsole = {
    log: (...args: any[]) => {
        if (IS_DEV) {
            console.log(...args);
        }
    },
    debug: (...args: any[]) => {
        if (IS_DEV) {
            console.debug(...args);
        }
    },
    info: (...args: any[]) => {
        // Info is allowed in both dev and prod
        console.info(...args);
    },
    warn: (...args: any[]) => {
        // Warnings always shown
        console.warn(...args);
    },
    error: (...args: any[]) => {
        // Errors always shown
        console.error(...args);
    },
};

/**
 * Get recommended log level based on environment
 */
export function getDefaultLogLevel(): 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' {
    return IS_DEV ? 'DEBUG' : 'WARN';
}
