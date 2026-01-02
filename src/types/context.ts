/**
 * React context type definitions
 */

import { ReactNode } from 'react';
import { CurrencyCode } from './database';

/**
 * Theme values
 */
export type Theme = 'light' | 'dark';

/**
 * ThemeContext value
 */
export interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

/**
 * ThemeProvider props
 */
export interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * CurrencyContext value
 */
export interface CurrencyContextValue {
  baseCurrency: CurrencyCode;
  setBaseCurrency: (currency: CurrencyCode) => void;
  supportedCurrencies: CurrencyCode[];
}

/**
 * CurrencyProvider props
 */
export interface CurrencyProviderProps {
  children: ReactNode;
}

/**
 * AI Model configuration
 */
export interface AIModel {
  name: string;
  size: string;
  description: string;
  recommended?: boolean;
}

/**
 * AI Message
 */
export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

/**
 * AIContext value
 */
export interface AIContextValue {
  isInitializing: boolean;
  isReady: boolean;
  error: string | null;
  selectedModel: string;
  availableModels: Record<string, AIModel>;
  messages: AIMessage[];
  initializeAI: (modelId: string) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
  resetAI: () => void;
}

/**
 * AIProvider props
 */
export interface AIProviderProps {
  children: ReactNode;
}
