import { defineConfig, devices } from '@playwright/test';

/**
 * Konfiguracja Playwright dla testów E2E
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  
  /* Maksymalny czas na jeden test */
  timeout: 30 * 1000,
  
  /* Uruchom testy równolegle */
  fullyParallel: true,
  
  /* Nie kontynuuj testów jeśli któryś failuje w CI */
  forbidOnly: !!process.env.CI,
  
  /* Retry tylko w CI */
  retries: process.env.CI ? 2 : 0,
  
  /* Liczba workerów */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter */
  reporter: 'html',
  
  /* Ustawienia współdzielone dla wszystkich projektów */
  use: {
    /* URL bazowy dla użycia w `await page.goto('/')` */
    baseURL: 'http://localhost:5173',
    
    /* Zbieraj ślady przy pierwszym retry failed testu */
    trace: 'on-first-retry',
    
    /* Screenshot tylko przy niepowodzeniu */
    screenshot: 'only-on-failure',
    
    /* Video tylko przy niepowodzeniu */
    video: 'retain-on-failure',
  },

  /* Konfiguracja projektów testowych dla różnych przeglądarek */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test na mobile viewport */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  /* Uruchom dev server przed rozpoczęciem testów */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
