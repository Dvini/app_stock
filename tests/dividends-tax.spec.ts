import { test, expect, type Page } from '@playwright/test';

/** Insert a dividend straight into IndexedDB (sync sources are external and not available in tests) */
const insertDividend = (page: Page, dividend: Record<string, unknown>) =>
    page.evaluate(
        d =>
            new Promise<void>((resolve, reject) => {
                const open = indexedDB.open('StockTrackerDB');
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const tx = open.result.transaction('dividends', 'readwrite');
                    tx.objectStore('dividends').add(d);
                    tx.oncomplete = () => {
                        open.result.close();
                        resolve();
                    };
                    tx.onerror = () => reject(tx.error);
                };
            }),
        dividend
    );

const readCash = (page: Page) =>
    page.evaluate(
        () =>
            new Promise<number>((resolve, reject) => {
                const open = indexedDB.open('StockTrackerDB');
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const req = open.result.transaction('portfolioCash').objectStore('portfolioCash').getAll();
                    req.onsuccess = () => {
                        open.result.close();
                        resolve(req.result.reduce((s: number, c: { amount: number }) => s + c.amount, 0));
                    };
                };
            })
    );

test('foreign dividend: net amount reaches cash and PIT-38 part G follows the withholding rate', async ({ page }) => {
    // Keep external dividend sources out of the test (auto-sync would add real AAPL dividends)
    await page.route('**/www.alphavantage.co/**', route => route.fulfill({ json: {} }));
    await page.route(/\/api\/yahoo\/.*events=div/, route => route.fulfill({ json: { chart: { result: [{}] } } }));
    await page.route('**/api/stooq/**', route => route.fulfill({ body: '' }));

    await page.goto('/');

    await page.getByTestId('add-transaction-button').click();
    await page.getByTestId('transaction-type-wpłata').click();
    await page.getByTestId('transaction-date-input').fill('2025-03-01');
    await page.getByTestId('price-input').fill('10000');
    await page.getByTestId('submit-transaction-button').click();
    await expect(page.getByTestId('add-transaction-modal')).not.toBeVisible();

    await page.getByTestId('add-transaction-button').click();
    await page.getByTestId('transaction-type-kupno').click();
    await page.getByTestId('transaction-date-input').fill('2025-03-03');
    await page.getByTestId('ticker-input').fill('AAPL');
    await page.getByTestId('currency-selector').selectOption('USD');
    await page.getByTestId('amount-input').fill('10');
    await page.getByTestId('price-input').fill('100');
    await page.getByTestId('exchange-rate-input').fill('4');
    await page.getByTestId('submit-transaction-button').click();
    await expect(page.getByTestId('add-transaction-modal')).not.toBeVisible({ timeout: 15000 });

    await insertDividend(page, {
        portfolioId: 1,
        ticker: 'AAPL',
        recordDate: '2025-05-10',
        paymentDate: '2025-05-15',
        amountPerShare: 1,
        totalAmount: 10,
        sharesOwned: 10,
        currency: 'USD',
        exchangeRate: 4,
        valuePLN: 40,
        withholdingTaxRate: 15,
        status: 'received'
    });
    await page.reload(); // startup refresh credits paid dividends to cash
    await expect.poll(() => readCash(page)).toBeCloseTo(10000 - 4000 + 34, 2);

    // Part G: gross 40 zł, tax 19% = 7.60 -> 8, credit 15% = 6 -> to pay 2
    await page.getByTestId('nav-podatki-(pit-38)').click();
    await page.getByTestId('tax-year-select').selectOption('2025');
    const section = page.getByTestId('foreign-dividends-section');
    await expect(section).toContainText('AAPL');
    await expect(page.getByTestId('dividend-tax-to-pay')).toHaveText('2 zł');

    // No withholding abroad -> full 19% due in Poland, and cash gets the gross amount
    await page.getByTestId('nav-dywidendy').click();
    await page
        .getByTestId(/^edit-dividend-/)
        .first()
        .click();
    await page.getByTestId('dividend-withholding-input').fill('0');
    await page.getByTestId('dividend-save-button').click();
    await expect(page.getByTestId('dividend-edit-modal')).not.toBeVisible();
    await expect.poll(() => readCash(page)).toBeCloseTo(10000 - 4000 + 40, 2);

    await page.getByTestId('nav-podatki-(pit-38)').click();
    await page.getByTestId('tax-year-select').selectOption('2025');
    await expect(page.getByTestId('dividend-tax-to-pay')).toHaveText('8 zł');
});
