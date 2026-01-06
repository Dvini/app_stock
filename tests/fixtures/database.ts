/**
 * Database Helper Utilities for Playwright Tests
 * 
 * Provides functions to reset and seed test database
 */

import type { Page } from '@playwright/test';

/**
 * Delete and recreate clean database
 */
export async function resetDatabase(page: Page): Promise<void> {
    await page.evaluate(() => {
        return indexedDB.deleteDatabase('StockTrackerDB');
    });
}

/**
 * Seed database with test data
 */
export async function seedDatabase(page: Page, data: {
    cash?: number;
    transactions?: any[];
    assets?: any[];
    dividends?: any[];
    watchlist?: any[];
}): Promise<void> {
    await page.evaluate((testData) => {
        return new Promise<void>(async (resolve, reject) => {
            try {
                // @ts-ignore - accessing global db instance
                const { db } = window;
                
                if (!db) {
                    reject(new Error('Database not available'));
                    return;
                }

                // Add cash if provided
                if (testData.cash !== undefined) {
                    await db.cash.put({ currency: 'PLN', amount: testData.cash });
                }

                // Add transactions
                if (testData.transactions) {
                    for (const tx of testData.transactions) {
                        await db.transactions.add(tx);
                    }
                }

                // Add assets
                if (testData.assets) {
                    for (const asset of testData.assets) {
                        await db.assets.add(asset);
                    }
                }

                // Add dividends
                if (testData.dividends) {
                    for (const dividend of testData.dividends) {
                        await db.dividends.add(dividend);
                    }
                }

                // Add watchlist items
                if (testData.watchlist) {
                    for (const item of testData.watchlist) {
                        await db.watchlist.add(item);
                    }
                }

                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }, data);
}

/**
 * Get current database state
 */
export async function getDatabaseState(page: Page): Promise<{
    cash: any[];
    transactions: any[];
    assets: any[];
    dividends: any[];
    watchlist: any[];
}> {
    return await page.evaluate(() => {
        return new Promise(async (resolve, reject) => {
            try {
                // @ts-ignore
                const { db } = window;
                
                if (!db) {
                    reject(new Error('Database not available'));
                    return;
                }

                const state = {
                    cash: await db.cash.toArray(),
                    transactions: await db.transactions.toArray(),
                    assets: await db.assets.toArray(),
                    dividends: await db.dividends.toArray(),
                    watchlist: await db.watchlist.toArray()
                };

                resolve(state);
            } catch (error) {
                reject(error);
            }
        });
    });
}
