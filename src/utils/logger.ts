/**
 * Centralized Logger Service
 * Provides environment-aware logging with different levels
 * In production: only errors are logged
 * In development: all logs are visible
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
    prefix?: string;
    enabled?: boolean;
}

class Logger {
    private isDev: boolean;
    private prefix: string;

    constructor(options: LoggerOptions = {}) {
        this.isDev = import.meta.env.DEV;
        this.prefix = options.prefix || '';
    }

    /**
     * Debug logs - only in development
     * Use for detailed debugging information
     */
    debug(...args: any[]): void {
        if (this.isDev) {
            console.log(this.formatMessage('debug'), ...args);
        }
    }

    /**
     * Info logs - only in development
     * Use for general information
     */
    info(...args: any[]): void {
        if (this.isDev) {
            console.log(this.formatMessage('info'), ...args);
        }
    }

    /**
     * Warning logs - always visible
     * Use for potential issues
     */
    warn(...args: any[]): void {
        console.warn(this.formatMessage('warn'), ...args);
    }

    /**
     * Error logs - always visible
     * Use for errors and exceptions
     */
    error(...args: any[]): void {
        console.error(this.formatMessage('error'), ...args);
    }

    /**
     * Format log message with timestamp and level
     */
    private formatMessage(level: LogLevel): string {
        const timestamp = new Date().toISOString().split('T')[1]?.split('.')[0] || '';
        const prefix = this.prefix ? `[${this.prefix}]` : '';
        return `[${timestamp}] [${level.toUpperCase()}]${prefix}`;
    }

    /**
     * Create a child logger with a specific prefix
     */
    createChild(prefix: string): Logger {
        return new Logger({ prefix: `${this.prefix}${prefix}` });
    }
}

// Export singleton instance
export const logger = new Logger();

// Export factory for service-specific loggers
export const createLogger = (serviceName: string): Logger => {
    return new Logger({ prefix: serviceName });
};

export default logger;
