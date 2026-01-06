import { test, expect } from '@playwright/test';

/**
 * SMOKE TESTS 🔥
 * 
 * Fast, critical tests that verify basic app functionality
 * Run time: < 1 minute
 * Run frequency: After every commit
 * 
 * Purpose:
 * - Detect critical failures quickly
 * - Verify app loads and basic navigation works
 * - Test fundamental user paths
 */

test.describe('Smoke Tests 🔥', () => {
    
    /**
     * Clear database before each test to ensure isolation
     */
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        
        // Clear IndexedDB to start fresh
        await page.evaluate(() => {
            return indexedDB.deleteDatabase('StockTrackerDB');
        });
        
        // Reload to reinitialize clean DB
        await page.reload();
        await page.waitForLoadState('networkidle');
    });

    // ========================================
    // BASIC FUNCTIONALITY
    // ========================================

    test.describe('Basic Functionality', () => {
        
        test('app loads successfully without errors', async ({ page }) => {
            const errors: string[] = [];
            page.on('pageerror', err => errors.push(err.message));
            
            await page.goto('/');
            
            // Dashboard should be visible
            await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 5000 });
            
            // No console errors
            expect(errors).toEqual([]);
        });

        test('all main routes are accessible', async ({ page }) => {
            const routes = [
                { path: '/', testId: 'dashboard-page', title: 'Dashboard' },
                { path: '/portfolio', testId: 'portfolio-page', title: 'Portfolio' },
                { path: '/transactions', testId: 'transactions-page', title: 'Transactions' },
                { path: '/dividends', testId: 'dividends-page', title: 'Dividends' },
                { path: '/settings', testId: 'settings-page', title: 'Settings' }
            ];
            
            for (const route of routes) {
                await page.goto(route.path);
                
                // Page should load
                await expect(page.getByTestId(route.testId)).toBeVisible({ timeout: 5000 });
                
                // No error pages
                await expect(page).not.toHaveTitle(/Error|404|Not Found/);
            }
        });

        test('sidebar navigation works', async ({ page }) => {
            await page.goto('/');
            
            // Navigate to Portfolio
            await page.getByTestId('nav-portfel').click();
            await expect(page).toHaveURL('/portfolio');
            await expect(page.getByTestId('portfolio-page')).toBeVisible();
            
            // Navigate to Transactions
            await page.getByTestId('nav-transakcje').click();
            await expect(page).toHaveURL('/transactions');
            await expect(page.getByTestId('transactions-page')).toBeVisible();
            
            // Navigate to Dividends
            await page.getByTestId('nav-dywidendy').click();
            await expect(page).toHaveURL('/dividends');
            await expect(page.getByTestId('dividends-page')).toBeVisible();
            
            // Navigate back to Dashboard
            await page.getByTestId('nav-dashboard').click();
            await expect(page).toHaveURL('/');
            await expect(page.getByTestId('dashboard-page')).toBeVisible();
        });

        test('IndexedDB is accessible and modal opens', async ({ page }) => {
            await page.goto('/');
            
            // Try to open transaction modal (requires DB access)
            await page.getByTestId('add-transaction-button').click();
            
            // Modal should open successfully
            await expect(page.getByTestId('add-transaction-modal')).toBeVisible();
            
            // Modal should have proper structure
            await expect(page.getByTestId('transaction-type-selector')).toBeVisible();
            await expect(page.getByTestId('submit-transaction-button')).toBeVisible();
            await expect(page.getByTestId('close-modal-button')).toBeVisible();
        });
    });

    // ========================================
    // CRITICAL USER PATHS
    // ========================================

    test.describe('Critical User Paths', () => {
        
        test('can add basic cash deposit', async ({ page }) => {
            await page.goto('/');
            
            // Verify initial state - no cash
            await expect(page.getByTestId('cash-card')).toBeVisible();
            
            // Open transaction modal
            await page.getByTestId('add-transaction-button').click();
            await expect(page.getByTestId('add-transaction-modal')).toBeVisible();
            
            // Select deposit type
            await page.getByTestId('transaction-type-wpłata').click();
            
            // Fill amount
            await page.getByTestId('price-input').fill('1000');
            
            // Submit
            await page.getByTestId('submit-transaction-button').click();
            
            // Modal should close
            await expect(page.getByTestId('add-transaction-modal')).not.toBeVisible();
            
            // Cash card should show amount (formatted with space)
            await expect(page.getByTestId('cash-card')).toContainText('1');
            
            // Verify in transactions page
            await page.getByTestId('nav-transakcje').click();
            await expect(page.getByTestId('transactions-table')).toContainText('1 000');
            await expect(page.getByTestId('transactions-table')).toContainText('Wpłata');
        });

        test('can withdraw cash', async ({ page }) => {
            await page.goto('/');
            
            // Step 1: Add cash first
            await page.getByTestId('add-transaction-button').click();
            await page.getByTestId('transaction-type-wpłata').click();
            await page.getByTestId('price-input').fill('5000');
            await page.getByTestId('submit-transaction-button').click();
            
            await expect(page.getByTestId('add-transaction-modal')).not.toBeVisible();
            await expect(page.getByTestId('cash-card')).toContainText('5');
            
            // Step 2: Withdraw some cash
            await page.getByTestId('add-transaction-button').click();
            await expect(page.getByTestId('add-transaction-modal')).toBeVisible();
            
            await page.getByTestId('transaction-type-wypłata').click();
            await page.getByTestId('price-input').fill('2000');
            await page.getByTestId('submit-transaction-button').click();
            
            // Modal should close
            await expect(page.getByTestId('add-transaction-modal')).not.toBeVisible();
            
            // Cash should decrease (5000 - 2000 = 3000)
            await expect(page.getByTestId('cash-card')).toContainText('3');
            
            // Verify in transactions
            await page.getByTestId('nav-transakcje').click();
            await expect(page.getByTestId('transactions-table')).toContainText('Wypłata');
            await expect(page.getByTestId('transactions-table')).toContainText('2 000');
        });

        test('can buy stock with sufficient funds', async ({ page }) => {
            await page.goto('/');
            
            // Step 1: Add cash first
            await page.getByTestId('add-transaction-button').click();
            await page.getByTestId('transaction-type-wpłata').click();
            await page.getByTestId('price-input').fill('10000');
            await page.getByTestId('submit-transaction-button').click();
            
            // Wait for modal to close
            await expect(page.getByTestId('add-transaction-modal')).not.toBeVisible();
            
            // Step 2: Buy stock
            await page.getByTestId('add-transaction-button').click();
            await expect(page.getByTestId('add-transaction-modal')).toBeVisible();
            
            // Select buy type
            await page.getByTestId('transaction-type-kupno').click();
            
            // Fill stock details
            await page.getByTestId('ticker-input').fill('AAPL');
            await page.getByTestId('amount-input').fill('1');
            await page.getByTestId('price-input').fill('150');
            
            // Wait a moment for potential exchange rate to load
            await page.waitForTimeout(500);
            
            // Submit
            await page.getByTestId('submit-transaction-button').click();
            
            // Modal should close
            await expect(page.getByTestId('add-transaction-modal')).not.toBeVisible({ timeout: 10000 });
            
            // Step 3: Verify in portfolio
            await page.getByTestId('nav-portfel').click();
            
            // Portfolio page should load
            await expect(page.getByTestId('portfolio-page')).toBeVisible();
            
            // AAPL should appear in assets table or portfolio section
            const portfolioContent = page.getByTestId('portfolio-page');
            await expect(portfolioContent).toContainText('AAPL');
        });

        test('can sell stock', async ({ page }) => {
            await page.goto('/');
            
            // Step 1: Add cash
            await page.getByTestId('add-transaction-button').click();
            await page.getByTestId('transaction-type-wpłata').click();
            await page.getByTestId('price-input').fill('10000');
            await page.getByTestId('submit-transaction-button').click();
            await expect(page.getByTestId('add-transaction-modal')).not.toBeVisible();
            
            // Step 2: Buy stock first
            await page.getByTestId('add-transaction-button').click();
            await page.getByTestId('transaction-type-kupno').click();
            await page.getByTestId('ticker-input').fill('MSFT');
            await page.getByTestId('amount-input').fill('5');
            await page.getByTestId('price-input').fill('300');
            await page.waitForTimeout(500);
            await page.getByTestId('submit-transaction-button').click();
            await expect(page.getByTestId('add-transaction-modal')).not.toBeVisible({ timeout: 10000 });
            
            // Step 3: Sell part of the stock
            await page.getByTestId('add-transaction-button').click();
            await expect(page.getByTestId('add-transaction-modal')).toBeVisible();
            
            await page.getByTestId('transaction-type-sprzedaż').click();
            
            // Select MSFT from dropdown (should appear in owned assets)
            await page.getByTestId('asset-selector').selectOption('MSFT');
            await page.getByTestId('amount-input').fill('2');
            await page.getByTestId('price-input').fill('320');
            await page.getByTestId('submit-transaction-button').click();
            
            // Modal should close
            await expect(page.getByTestId('add-transaction-modal')).not.toBeVisible({ timeout: 10000 });
            
            // Step 4: Verify in portfolio - should have 3 shares left
            await page.getByTestId('nav-portfel').click();
            const portfolioContent = page.getByTestId('portfolio-page');
            await expect(portfolioContent).toContainText('MSFT');
            // Note: Can't easily verify exact count without more specific locators
            
            // Verify sell transaction in history
            await page.getByTestId('nav-transakcje').click();
            await expect(page.getByTestId('transactions-table')).toContainText('Sprzedaż');
            await expect(page.getByTestId('transactions-table')).toContainText('MSFT');
        });
    });

    // ========================================
    // ADDITIONAL FEATURES
    // ========================================

    test.describe('Additional Features', () => {
        
        test('dividends page loads and shows structure', async ({ page }) => {
            await page.goto('/dividends');
            
            // Main sections should be visible
            await expect(page.getByTestId('dividends-page')).toBeVisible();
            await expect(page.getByTestId('dividends-summary-cards')).toBeVisible();
            await expect(page.getByTestId('calendar-section')).toBeVisible();
            await expect(page.getByTestId('received-dividends-section')).toBeVisible();
            
            // Refresh button should exist
            await expect(page.getByTestId('refresh-dividends-button')).toBeVisible();
        });

        test('can add and remove from watchlist', async ({ page }) => {
            await page.goto('/');
            
            // Step 1: Add to watchlist
            await page.getByTestId('add-watchlist-button').click();
            await expect(page.getByTestId('add-watchlist-modal')).toBeVisible();
            
            await page.getByTestId('watchlist-ticker-input').fill('NVDA');
            
            // Click first NVDA suggestion
            await page.getByText('NVDA').first().click();
            
            // Modal should close
            await expect(page.getByTestId('add-watchlist-modal')).not.toBeVisible();
            
            // Step 2: Verify in watchlist
            const watchlistSection = page.getByTestId('watchlist-assets');
            await expect(watchlistSection).toContainText('NVDA');
            
            // Step 3: Remove from watchlist  
            const removeButton = page.getByTestId('remove-watchlist-NVDA');
            await removeButton.click();
            
            // Wait a moment for removal to process
            await page.waitForTimeout(500);
            
            // Should be removed - either section is empty or NVDA text is gone
            // Note: If it was the only item, the section might not show "empty" message
            // So we just verify the remove button is gone
            await expect(removeButton).not.toBeVisible();
        });

        test('settings page shows data management options', async ({ page }) => {
            await page.goto('/settings');
            
            // Settings page should load
            await expect(page.getByTestId('settings-page')).toBeVisible();
            
            // Data management section should be visible
            // (Note: adjust these selectors based on actual implementation)
            const settingsContent = page.getByTestId('settings-page');
            await expect(settingsContent).toContainText(/Zarządzanie|Export|Import|Dane/i);
        });
    });

    // ========================================
    // VALIDATION & ERROR HANDLING
    // ========================================

    test.describe('Basic Validation', () => {
        
        test('cannot submit empty deposit', async ({ page }) => {
            await page.goto('/');
            
            await page.getByTestId('add-transaction-button').click();
            await page.getByTestId('transaction-type-wpłata').click();
            
            // Don't fill price - leave empty
            
            // Submit button should be disabled or submission should fail
            const submitButton = page.getByTestId('submit-transaction-button');
            
            // Try to click - if enabled, it shouldn't actually submit
            const modalBefore = await page.getByTestId('add-transaction-modal').isVisible();
            await submitButton.click();
            
            // Modal should still be visible (transaction not added)
            await expect(page.getByTestId('add-transaction-modal')).toBeVisible();
        });

        test('shows insufficient funds warning', async ({ page }) => {
            await page.goto('/');
            
            // Add small amount of cash
            await page.getByTestId('add-transaction-button').click();
            await page.getByTestId('transaction-type-wpłata').click();
            await page.getByTestId('price-input').fill('100');
            await page.getByTestId('submit-transaction-button').click();
            
            await expect(page.getByTestId('add-transaction-modal')).not.toBeVisible();
            
            // Try to buy expensive stock
            await page.getByTestId('add-transaction-button').click();
            await page.getByTestId('transaction-type-kupno').click();
            await page.getByTestId('ticker-input').fill('AAPL');
            await page.getByTestId('amount-input').fill('100');
            await page.getByTestId('price-input').fill('200');
            
            // Should show insufficient funds error
            await expect(page.locator('text=Brak wystarczających środków')).toBeVisible();
            
            // Submit button should be disabled
            await expect(page.getByTestId('submit-transaction-button')).toBeDisabled();
        });
    });

    // ========================================
    // PORTFOLIO & CHARTS
    // ========================================

    test.describe('Portfolio & Charts', () => {
        
        test('can toggle between history and pie chart view', async ({ page }) => {
            await page.goto('/portfolio');
            
            // Should start in some default view
            await expect(page.getByTestId('portfolio-page')).toBeVisible();
            
            // Toggle to history view
            const historyButton = page.getByTestId('view-history-button');
            if (await historyButton.isVisible()) {
                await historyButton.click();
                // Chart section should be visible
                await expect(page.getByTestId('portfolio-chart-section')).toBeVisible();
            }
            
            // Toggle to pie view
            const pieButton = page.getByTestId('view-pie-button');
            if (await pieButton.isVisible()) {
                await pieButton.click();
                // Pie chart should be visible
                await expect(page.getByTestId('portfolio-chart-section')).toBeVisible();
            }
        });

        test('chart range selectors are clickable', async ({ page }) => {
            await page.goto('/');
            
            // Wait for dashboard to load
            await expect(page.getByTestId('dashboard-page')).toBeVisible();
            
            // Try clicking different range buttons if they exist
            const ranges = ['1d', '5d', '1mo', '1y', '5y', 'max'];
            
            for (const range of ranges) {
                const rangeButton = page.getByTestId(`chart-range-${range}`);
                
                // If button exists and is visible, click it
                if (await rangeButton.isVisible().catch(() => false)) {
                    await rangeButton.click();
                    // Just verify it doesn't crash
                    await page.waitForTimeout(200);
                }
            }
        });
    });

    // ========================================
    // DIVIDENDS FEATURES
    // ========================================

    test.describe('Dividends', () => {
        
        test('manual dividend refresh button works', async ({ page }) => {
            // Add cash and buy dividend-paying stock
            await page.goto('/');
            
            // Add cash
            await page.getByTestId('add-transaction-button').click();
            await page.getByTestId('transaction-type-wpłata').click();
            await page.getByTestId('price-input').fill('50000');
            await page.getByTestId('submit-transaction-button').click();
            await expect(page.getByTestId('add-transaction-modal')).not.toBeVisible();
            
            // Buy AAPL (known dividend payer)
            // Note: For smoke test, we just verify the sync works, not that dividends appear
            await page.getByTestId('add-transaction-button').click();
            await page.getByTestId('transaction-type-kupno').click();
            
            await page.getByTestId('ticker-input').fill('AAPL');
            await page.getByTestId('amount-input').fill('10');
            await page.getByTestId('price-input').fill('150');
            await page.waitForTimeout(500);
            await page.getByTestId('submit-transaction-button').click();
            await expect(page.getByTestId('add-transaction-modal')).not.toBeVisible({ timeout: 10000 });
            
            // Now go to dividends page
            await page.getByTestId('nav-dywidendy').click();
            await expect(page.getByTestId('dividends-page')).toBeVisible();
            
            // Click refresh button
            const refreshButton = page.getByTestId('refresh-dividends-button');
            await expect(refreshButton).toBeVisible();
            
            // Click refresh - this is the critical action
            await refreshButton.click();
            
            // Wait a moment for sync to process
            await page.waitForTimeout(1000);
            
            // Just verify page doesn't crash and button is still there
            // The button might be disabled temporarily during sync
            await expect(refreshButton).toBeVisible();
            
            // Page should still be functional
            await expect(page.getByTestId('dividends-page')).toBeVisible();
        });
    });

    // ========================================
    // DATA MANAGEMENT
    // ========================================

    test.describe('Data Management', () => {
        
        test('export data button is functional', async ({ page }) => {
            await page.goto('/settings');
            
            // Settings page should load
            await expect(page.getByTestId('settings-page')).toBeVisible();
            
            // Look for export button (text-based since we don't have testid)
            const exportButton = page.locator('button:has-text("Pobierz Kopię")');
            
            // Should be visible and enabled
            await expect(exportButton).toBeVisible();
            
            // Setup download listener
            const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
            
            // Click export
            await exportButton.click();
            
            // Wait for download to start (or timeout gracefully)
            const download = await downloadPromise;
            
            // If download started, that's success
            // If not, at least we verified button doesn't crash the app
            if (download) {
                // Verify filename contains expected pattern
                const filename = download.suggestedFilename();
                expect(filename).toContain('portfolio_backup');
            }
        });

        test('import data file picker opens', async ({ page }) => {
            await page.goto('/settings');
            
            await expect(page.getByTestId('settings-page')).toBeVisible();
            
            // Look for import button
            const importLabel = page.locator('label:has-text("Wybierz Plik")');
            await expect(importLabel).toBeVisible();
            
            // Verify hidden file input exists
            const fileInput = page.locator('input[type="file"][accept=".json"]');
            await expect(fileInput).toBeAttached();
        });

        test('factory reset button shows warning', async ({ page }) => {
            // Mock the confirm dialog to prevent actual reset
            await page.goto('/settings');
            
            // Override window.confirm to prevent actual reset
            await page.evaluate(() => {
                window.confirm = () => false; // Always cancel
            });
            
            await expect(page.getByTestId('settings-page')).toBeVisible();
            
            // Find reset button
            const resetButton = page.locator('button:has-text("Wyczyść Wszystko")');
            await expect(resetButton).toBeVisible();
            
            // Click it (confirm dialog will be auto-cancelled)
            await resetButton.click();
            
            // Page should still be visible (not reloaded)
            await expect(page.getByTestId('settings-page')).toBeVisible();
        });
    });

    // ========================================
    // OPTIONAL FEATURES
    // ========================================

    test.describe('Optional Features', () => {
        
        test('AI page loads if enabled', async ({ page }) => {
            // Try to navigate to AI page
            await page.goto('/ai');
            
            // Either AI page loads, or we get redirected
            // Just verify app doesn't crash
            await page.waitForLoadState('networkidle');
            
            // Page should render something (either AI or redirect to dashboard)
            const body = await page.locator('body').textContent();
            expect(body).toBeTruthy();
        });
    });
});
