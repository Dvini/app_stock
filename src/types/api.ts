/**
 * API response type definitions
 */

import { CurrencyCode } from './database';

/**
 * Yahoo Finance price data
 */
export interface YahooFinancePriceData {
  price: number;
  currency: CurrencyCode;
  timestamp?: number;
}

// Alias for compatibility
export type PriceData = YahooFinancePriceData;

/**
 * Yahoo Finance chart response
 */
export interface YahooFinanceChartResponse {
  chart: {
    result?: Array<{
      meta: {
        currency: string;
        regularMarketPrice?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: (number | null)[];
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
    error?: {
      code: string;
      description: string;
    };
  };
}

/**
 * NBP (Polish National Bank) exchange rate response
 */
export interface NBPExchangeRateResponse {
  table: string;
  currency: string;
  code: string;
  rates: Array<{
    no: string;
    effectiveDate: string;
    mid: number;
  }>;
}

/**
 * Historical data point for charts
 */
export interface HistoricalDataPoint {
  timestamp: number; // Unix timestamp in milliseconds
  date: string; // ISO date string
  price: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

/**
 * Historical price data response
 */
export interface HistoricalData {
  data: HistoricalDataPoint[];
  currency: CurrencyCode;
}

/**
 * Dividend data from API
 */
export interface DividendData {
  ticker: string;
  exDate: string; // Ex-dividend date
  paymentDate: string;
  amount: number;
  currency: CurrencyCode;
  frequency?: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
}

/**
 * Exchange rate data
 */
export interface ExchangeRate {
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
  date: string; // ISO date string
}

/**
 * Generic API error
 */
export interface APIError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: number;
}
