/**
 * React component props type definitions
 */

import { ReactNode } from 'react';
import { CurrencyCode, TransactionType } from './database';

/**
 * AddTransactionModal props
 */
export interface AddTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit?: () => void;
}

/**
 * AddToWatchlistModal props
 */
export interface AddToWatchlistModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * WebGPU Chart props
 */
export interface WebGPUChartProps {
    ticker: string;
    range?: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '5y' | 'max';
    className?: string;
}

/**
 * PieChart props
 */
export interface PieChartProps {
    data: Array<{
        label: string;
        value: number;
        color?: string;
    }>;
    width?: number;
    height?: number;
    showLegend?: boolean;
}

/**
 * Layout props
 */
export interface LayoutProps {
    children: ReactNode;
}

/**
 * Button props
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
}

/**
 * Card props
 */
export interface CardProps {
    title?: string;
    children: ReactNode;
    className?: string;
    actions?: ReactNode;
}

/**
 * Input props
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    helperText?: string;
}

/**
 * Modal props
 */
export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    footer?: ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Select props
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: Array<{
        value: string;
        label: string;
    }>;
    error?: string;
}

/**
 * Sidebar props
 */
export interface SidebarProps {
    className?: string;
}

/**
 * Transaction row data for display
 */
export interface TransactionRowData {
    id: number;
    date: string;
    type: TransactionType;
    ticker?: string;
    amount: number;
    price?: number;
    total: number;
    currency?: CurrencyCode;
    exchangeRate?: number;
}
