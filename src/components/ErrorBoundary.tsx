import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../utils/logger';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 * Logs errors and displays fallback UI
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        // Update state so the next render will show the fallback UI
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // Log the error to console (and potentially to analytics service)
        logger.error('React Error Boundary caught an error:', {
            error: error.toString(),
            componentStack: errorInfo.componentStack,
            stack: error.stack
        });

        this.setState({
            error,
            errorInfo
        });

        // TODO: Send error to analytics/monitoring service (e.g., Sentry)
        // sendErrorToMonitoring(error, errorInfo);
    }

    handleReset = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null
        });

        // Reload the page to reset app state
        window.location.reload();
    };

    render(): ReactNode {
        if (this.state.hasError) {
            // Use custom fallback if provided
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default fallback UI
            return <ErrorFallback error={this.state.error} onReset={this.handleReset} />;
        }

        return this.props.children;
    }
}

/**
 * ErrorFallback Component
 * Default fallback UI shown when an error is caught
 */
interface ErrorFallbackProps {
    error: Error | null;
    onReset: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, onReset }) => {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
            <div className="max-w-2xl w-full bg-slate-900 rounded-3xl border border-slate-800 p-8 shadow-2xl">
                {/* Icon */}
                <div className="flex justify-center mb-6">
                    <div className="p-4 bg-rose-500/10 rounded-2xl">
                        <AlertTriangle className="w-12 h-12 text-rose-500" />
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-white text-center mb-4">
                    Ups! Coś poszło nie tak
                </h1>

                {/* Description */}
                <p className="text-slate-400 text-center mb-8">
                    Aplikacja napotkała nieoczekiwany błąd. Nie martw się - Twoje dane są bezpieczne.
                    Spróbuj odświeżyć stronę.
                </p>

                {/* Error details (only in dev) */}
                {import.meta.env.DEV && error && (
                    <details className="mb-8 bg-slate-950 rounded-xl p-4 border border-slate-800">
                        <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-300 mb-2">
                            Szczegóły błędu (tylko w trybie deweloperskim)
                        </summary>
                        <pre className="text-xs text-rose-400 overflow-auto max-h-64 font-mono">
                            {error.toString()}
                            {error.stack && `\n\n${error.stack}`}
                        </pre>
                    </details>
                )}

                {/* Action buttons */}
                <div className="flex gap-4 justify-center">
                    <button
                        onClick={onReset}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20"
                    >
                        <RefreshCw className="w-5 h-5" />
                        Odśwież Stronę
                    </button>
                    <button
                        onClick={() => window.location.href = '/'}
                        className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all"
                    >
                        Wróć do Strony Głównej
                    </button>
                </div>

                {/* Help text */}
                <p className="text-center text-slate-500 text-sm mt-8">
                    Jeśli problem się powtarza, spróbuj wyczyścić cache przeglądarki lub skontaktuj się z supportem.
                </p>
            </div>
        </div>
    );
};

export default ErrorBoundary;
