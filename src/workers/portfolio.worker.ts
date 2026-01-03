/**
 * Portfolio Calculation Web Worker
 * Handles heavy portfolio history calculations off the main thread
 */

import { calculatePortfolioHistory } from '../lib/portfolioHistory';
import type { Transaction } from '../types/database';

interface WorkerMessage {
    transactions: Transaction[];
    range: string;
    excludeCash: boolean;
    returnNative: boolean;
}

// Handle messages from main thread
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    try {
        const { transactions, range, excludeCash, returnNative } = e.data;

        // Perform heavy calculation in worker thread
        const result = await calculatePortfolioHistory(
            transactions,
            range,
            excludeCash,
            returnNative
        );

        // Send result back to main thread
        self.postMessage({ success: true, data: result });
    } catch (error) {
        // Send error back to main thread
        self.postMessage({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
