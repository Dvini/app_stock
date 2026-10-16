import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initDB } from './db/db';
import { cacheService } from './lib/CacheService';
import { loadLedgerReport } from './lib/ledgerReconcile';
import { refreshSnapshots } from './lib/ledgerStore';
import { PortfolioProvider, usePortfolioAccount } from './context/PortfolioContext';

// Lazy load all page components for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const AllPortfoliosOverview = lazy(() =>
    import('./pages/AllPortfoliosOverview').then(m => ({ default: m.AllPortfoliosOverview }))
);
const Portfolio = lazy(() => import('./pages/Portfolio').then(m => ({ default: m.Portfolio })));
const Transactions = lazy(() => import('./pages/Transactions').then(m => ({ default: m.Transactions })));
const Dividends = lazy(() => import('./pages/Dividends').then(m => ({ default: m.Dividends })));
const Simulator = lazy(() => import('./pages/Simulator').then(m => ({ default: m.Simulator })));
const Taxes = lazy(() => import('./pages/Taxes').then(m => ({ default: m.Taxes })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));

// Reusable loading fallback for lazy-loaded routes
const LoadingFallback = (
    <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>
);

// Dynamic Home route: AllPortfoliosOverview when ALL is selected or Dashboard for specific portfolio
const HomeRoute = () => {
    const { isAllPortfolios } = usePortfolioAccount();
    if (isAllPortfolios) {
        return (
            <Suspense fallback={LoadingFallback}>
                <AllPortfoliosOverview />
            </Suspense>
        );
    }
    return (
        <Suspense fallback={LoadingFallback}>
            <Dashboard />
        </Suspense>
    );
};

function App() {
    useEffect(() => {
        // Opening the DB runs pending migrations; a reconciliation report may appear afterwards
        initDB().then(async () => {
            // Dividends whose payment date has passed since the last run must reach cash
            await refreshSnapshots().catch(error => console.error('Snapshot refresh failed', error));
            const report = loadLedgerReport();
            if (report) {
                toast.warning('Dane portfela zostały uzgodnione z historią transakcji', {
                    id: 'ledger-report', // StrictMode runs effects twice
                    description: `${report.items.length} uwag do przejrzenia w Ustawieniach.`,
                    duration: 10000
                });
            }
        });

        // Clean up expired cache entries on startup
        cacheService.cleanup();
    }, []);

    return (
        <ErrorBoundary>
            <BrowserRouter>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <PortfolioProvider>
                                <Layout />
                            </PortfolioProvider>
                        }
                    >
                        <Route index element={<HomeRoute />} />
                        <Route
                            path="portfolio"
                            element={
                                <Suspense fallback={LoadingFallback}>
                                    <Portfolio />
                                </Suspense>
                            }
                        />
                        <Route
                            path="transactions"
                            element={
                                <Suspense fallback={LoadingFallback}>
                                    <Transactions />
                                </Suspense>
                            }
                        />
                        <Route
                            path="dividends"
                            element={
                                <Suspense fallback={LoadingFallback}>
                                    <Dividends />
                                </Suspense>
                            }
                        />
                        <Route
                            path="simulator"
                            element={
                                <Suspense fallback={LoadingFallback}>
                                    <Simulator />
                                </Suspense>
                            }
                        />
                        <Route
                            path="taxes"
                            element={
                                <Suspense fallback={LoadingFallback}>
                                    <Taxes />
                                </Suspense>
                            }
                        />
                        <Route
                            path="settings"
                            element={
                                <Suspense fallback={LoadingFallback}>
                                    <Settings />
                                </Suspense>
                            }
                        />
                    </Route>
                </Routes>
            </BrowserRouter>
            <Toaster
                position="top-right"
                expand={false}
                richColors
                closeButton
                toastOptions={{
                    style: {
                        background: 'rgb(15 23 42)', // slate-950
                        border: '1px solid rgb(51 65 85)', // slate-700
                        color: 'rgb(241 245 249)' // slate-100
                    },
                    className: 'font-sans'
                }}
            />
        </ErrorBoundary>
    );
}

export default App;
