import React from 'react';

// Base Skeleton with shimmer animation
export const Skeleton = ({ className = '', width, height, rounded = 'rounded-lg' }) => (
    <div
        className={`bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer ${rounded} ${className}`}
        style={{ width, height }}
    />
);

// Text line skeleton
export const SkeletonText = ({ lines = 1, className = '' }) => (
    <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
            <Skeleton
                key={i}
                className={`h-4 ${i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'}`}
                rounded="rounded"
            />
        ))}
    </div>
);

// Avatar skeleton
export const SkeletonAvatar = ({ size = 'md' }) => {
    const sizes = {
        sm: 'w-8 h-8',
        md: 'w-12 h-12',
        lg: 'w-16 h-16',
        xl: 'w-24 h-24'
    };
    return <Skeleton className={sizes[size]} rounded="rounded-full" />;
};

// Card skeleton for list items
export const SkeletonCard = ({ hasIcon = true, hasActions = false }) => (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-5 space-y-4">
        <div className="flex items-start gap-4">
            {hasIcon && <Skeleton className="w-12 h-12 flex-shrink-0" rounded="rounded-lg" />}
            <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-2/3" rounded="rounded" />
                <Skeleton className="h-4 w-full" rounded="rounded" />
                <Skeleton className="h-4 w-4/5" rounded="rounded" />
            </div>
            {hasActions && (
                <div className="flex gap-2">
                    <Skeleton className="w-8 h-8" rounded="rounded-lg" />
                    <Skeleton className="w-8 h-8" rounded="rounded-lg" />
                </div>
            )}
        </div>
        <div className="flex gap-2 pt-2">
            <Skeleton className="h-6 w-16" rounded="rounded-full" />
            <Skeleton className="h-6 w-20" rounded="rounded-full" />
            <Skeleton className="h-6 w-14" rounded="rounded-full" />
        </div>
    </div>
);

// Stats card skeleton
export const SkeletonStatsCard = () => (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-6 space-y-4">
        <div className="flex items-center justify-between">
            <div className="space-y-2">
                <Skeleton className="h-4 w-24" rounded="rounded" />
                <Skeleton className="h-8 w-16" rounded="rounded" />
            </div>
            <Skeleton className="w-12 h-12" rounded="rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-12" rounded="rounded" />
            <Skeleton className="h-4 w-20" rounded="rounded" />
        </div>
    </div>
);

// Table row skeleton
export const SkeletonTableRow = ({ cols = 5 }) => (
    <tr className="border-b border-gray-100">
        {Array.from({ length: cols }).map((_, i) => (
            <td key={i} className="py-4 px-4">
                <Skeleton className="h-4 w-full" rounded="rounded" />
            </td>
        ))}
    </tr>
);

// Chart skeleton
export const SkeletonChart = ({ height = 'h-64' }) => (
    <div className={`bg-white rounded-xl border border-[var(--color-border)] p-6 ${height}`}>
        <div className="flex items-center justify-between mb-6">
            <div className="space-y-2">
                <Skeleton className="h-5 w-32" rounded="rounded" />
                <Skeleton className="h-4 w-24" rounded="rounded" />
            </div>
            <Skeleton className="w-8 h-8" rounded="rounded-lg" />
        </div>
        <div className="flex items-end gap-2 h-3/4">
            {[40, 65, 45, 80, 55, 70, 50].map((h, i) => (
                <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} rounded="rounded-t" />
            ))}
        </div>
    </div>
);

// Page header skeleton
export const SkeletonPageHeader = () => (
    <div className="flex items-center gap-4">
        <Skeleton className="w-12 h-12" rounded="rounded-lg" />
        <div className="space-y-2">
            <Skeleton className="h-8 w-48" rounded="rounded" />
            <Skeleton className="h-4 w-64" rounded="rounded" />
        </div>
    </div>
);

// Grid of card skeletons
export const SkeletonCardGrid = ({ count = 6, cols = 3 }) => (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${cols} gap-6`}>
        {Array.from({ length: count }).map((_, i) => (
            <SkeletonCard key={i} />
        ))}
    </div>
);

// List of card skeletons
export const SkeletonCardList = ({ count = 3 }) => (
    <div className="space-y-4">
        {Array.from({ length: count }).map((_, i) => (
            <SkeletonCard key={i} hasActions />
        ))}
    </div>
);

export default {
    Skeleton,
    SkeletonText,
    SkeletonAvatar,
    SkeletonCard,
    SkeletonStatsCard,
    SkeletonTableRow,
    SkeletonChart,
    SkeletonPageHeader,
    SkeletonCardGrid,
    SkeletonCardList
};
