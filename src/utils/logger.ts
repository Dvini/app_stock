/**
 * Centralized logger.
 *
 * - debug/info: silent unless debug logging is switched on, so the console stays readable.
 *   Turn on in the browser console:  localStorage.setItem('debug', '1')  (and reload)
 * - warn/error: always visible, also in production builds.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
    prefix?: string;
}

const isDebugEnabled = (): boolean => {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem('debug') === '1';
    } catch {
        return false;
    }
};

class Logger {
    private prefix: string;

    constructor(options: LoggerOptions = {}) {
        this.prefix = options.prefix || '';
    }

    /**
     * Detailed tracing - only with debug logging on
     */
    debug(...args: unknown[]): void {
        if (isDebugEnabled()) {
            console.log(this.formatMessage('debug'), ...args);
        }
    }

    /**
     * General information - only with debug logging on
     */
    info(...args: unknown[]): void {
        if (isDebugEnabled()) {
            console.info(this.formatMessage('info'), ...args);
        }
    }

    /**
     * Recoverable problems - always visible
     */
    warn(...args: unknown[]): void {
        console.warn(this.formatMessage('warn'), ...args);
    }

    /**
     * Errors and exceptions - always visible
     */
    error(...args: unknown[]): void {
        console.error(this.formatMessage('error'), ...args);
    }

    private formatMessage(level: LogLevel): string {
        const timestamp = new Date().toLocaleTimeString('pl-PL');
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
