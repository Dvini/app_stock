/**
 * Loading Skeleton Components
 * Reusable skeleton loaders for consistent loading states
 */

import React from 'react';
import { cn } from '../lib/utils';

interface SkeletonProps {
    className?: string;
}

/**
 * Base Skeleton component - simple animated placeholder
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
    return <div className={cn('animate-pulse bg-slate-800 rounded', className)} />;
};

/**
 * Card Skeleton - for portfolio/dashboard cards
 */
export const CardSkeleton: React.FC = () => {
    return (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <div className="space-y-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-8 w-1/2" />
                <div className="flex gap-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                </div>
            </div>
        </div>
    );
};

/**
 * Table Row Skeleton - for table loading states
 */
export const TableRowSkeleton: React.FC = () => {
    return (
        <tr className="border-b border-slate-800">
            <td className="px-4 py-3">
                <Skeleton className="h-4 w-20" />
            </td>
            <td className="px-4 py-3">
                <Skeleton className="h-4 w-16" />
            </td>
            <td className="px-4 py-3">
                <Skeleton className="h-4 w-24" />
            </td>
            <td className="px-4 py-3">
                <Skeleton className="h-4 w-24" />
            </td>
            <td className="px-4 py-3">
                <Skeleton className="h-4 w-20" />
            </td>
        </tr>
    );
};

/**
 * Chart Skeleton - for chart loading areas
 */
export const ChartSkeleton: React.FC = () => {
    return (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-8 w-24" />
                </div>
                <Skeleton className="h-64 w-full" />
                <div className="flex gap-2 justify-center">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                </div>
            </div>
        </div>
    );
};

/**
 * Stats Card Skeleton - for statistics cards
 */
export const StatsCardSkeleton: React.FC = () => {
    return (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <Skeleton className="h-3 w-24 mb-2" />
            <Skeleton className="h-10 w-32 mb-1" />
            <Skeleton className="h-3 w-20" />
        </div>
    );
};

/**
 * Asset Item Skeleton - for asset list items
 */
export const AssetItemSkeleton: React.FC = () => {
    return (
        <div className="p-3 rounded-xl border border-slate-800 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-3 w-12" />
                </div>
            </div>
            <div className="space-y-2 text-right">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-16" />
            </div>
        </div>
    );
};

export default Skeleton;
