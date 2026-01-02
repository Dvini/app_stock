/**
 * UI Components - Reusable display components
 */

import { XCircle, X } from 'lucide-react';

interface ErrorBannerProps {
    error: string | null;
    onDismiss?: () => void;
    className?: string;
}

/**
 * ErrorBanner Component
 * Displays error messages with dismiss functionality
 */
export const ErrorBanner: React.FC<ErrorBannerProps> = ({ error, onDismiss, className = '' }) => {
    if (!error) return null;

    return (
        <div className={`bg-rose-900/20 border border-rose-800 rounded-lg p-4 mb-4 ${className}`}>
            <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                    <h4 className="font-semibold text-rose-300 mb-1">Wystąpił błąd</h4>
                    <p className="text-sm text-rose-200">{error}</p>
                </div>
                {onDismiss && (
                    <button
                        onClick={onDismiss}
                        className="text-rose-400 hover:text-rose-300 transition-colors"
                        aria-label="Zamknij"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>
        </div>
    );
};

interface SkeletonLoaderProps {
    rows?: number;
    className?: string;
}

/**
 * SkeletonLoader Component
 * Loading placeholder for tables
 */
export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ rows = 5, className = '' }) => {
    return (
        <div className={`space-y-2 ${className}`}>
            {[...Array(rows)].map((_, i) => (
                <div
                    key={i}
                    className="h-12 bg-slate-800 animate-pulse rounded"
                    style={{
                        animationDelay: `${i * 100}ms`
                    }}
                />
            ))}
        </div>
    );
};

type SpinnerSize = 'sm' | 'md' | 'lg';

interface LoadingSpinnerProps {
    size?: SpinnerSize;
    className?: string;
}

/**
 * LoadingSpinner Component
 * Simple loading indicator
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', className = '' }) => {
    const sizeClasses: Record<SpinnerSize, string> = {
        sm: 'w-4 h-4',
        md: 'w-6 h-6',
        lg: 'w-8 h-8'
    };

    return (
        <div
            className={`inline-block ${sizeClasses[size]} ${className} border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin`}
            role="status"
            aria-label="Ładowanie"
        />
    );
};
