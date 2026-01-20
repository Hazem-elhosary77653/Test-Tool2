import React from 'react';
import { Loader2 } from 'lucide-react';

export const Spinner = ({ size = 24, className = '', color = 'text-primary' }) => (
    <Loader2
        size={size}
        className={`animate-spin ${color} ${className}`}
    />
);

export const LoadingOverlay = ({ message = 'Loading...', isFullPage = false }) => {
    const containerClasses = isFullPage
        ? "fixed inset-0 z-[9999] bg-[var(--color-surface)]/80 backdrop-blur-sm flex items-center justify-center"
        : "absolute inset-0 z-10 bg-[var(--color-surface)]/60 backdrop-blur-[2px] flex items-center justify-center rounded-lg";

    return (
        <div className={containerClasses}>
            <div className="flex flex-col items-center gap-4">
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                        </div>
                    </div>
                </div>
                {message && (
                    <p className="text-sm font-bold text-primary animate-pulse tracking-wide uppercase">
                        {message}
                    </p>
                )}
            </div>
        </div>
    );
};

export const LoadingCard = ({ message = 'Loading data...', height = 'h-64' }) => (
    <div className={`card w-full ${height} flex flex-col items-center justify-center p-8 text-center bg-white border border-[var(--color-border)] shadow-soft`}>
        <div className="p-4 bg-[var(--color-surface-strong)] rounded-full border border-[var(--color-border)] mb-4">
            <Spinner size={32} className="text-primary" />
        </div>
        <p className="text-sm text-[var(--color-text-muted)] font-semibold">{message}</p>
    </div>
);

export default { Spinner, LoadingOverlay, LoadingCard };
