import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initDB } from './db/db';
import { AIProvider } from './context/AIContext';
import { CurrencyProvider } from './context/CurrencyContext';

// Lazy load all page components for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Portfolio = lazy(() => import('./pages/Portfolio').then(m => ({ default: m.Portfolio })));
const Transactions = lazy(() => import('./pages/Transactions').then(m => ({ default: m.Transactions })));
const Dividends = lazy(() => import('./pages/Dividends').then(m => ({ default: m.Dividends })));
const Simulator = lazy(() => import('./pages/Simulator').then(m => ({ default: m.Simulator })));
const AI = lazy(() => import('./pages/AI').then(m => ({ default: m.AI })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));

// Reusable loading fallback for lazy-loaded routes
const LoadingFallback = (
    <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>
);

function App() {
    useEffect(() => {
        initDB();

        // Clean up expired cache entries on startup
        import('./lib/CacheService').then(({ cacheService }) => {
            cacheService.cleanup();
        });
    }, []);

    return (
        <ErrorBoundary>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={
                        <CurrencyProvider>
                            <AIProvider>
                                <Layout />
                            </AIProvider>
                        </CurrencyProvider>
                    }>
                        <Route index element={
                            <Suspense fallback={LoadingFallback}>
                                <Dashboard />
                            </Suspense>
                        } />
                        <Route path="portfolio" element={
                            <Suspense fallback={LoadingFallback}>
                                <Portfolio />
                            </Suspense>
                        } />
                        <Route path="transactions" element={
                            <Suspense fallback={LoadingFallback}>
                                <Transactions />
                            </Suspense>
                        } />
                        <Route path="dividends" element={
                            <Suspense fallback={LoadingFallback}>
                                <Dividends />
                            </Suspense>
                        } />
                        <Route path="simulator" element={
                            <Suspense fallback={LoadingFallback}>
                                <Simulator />
                            </Suspense>
                        } />
                        <Route path="ai" element={
                            <Suspense fallback={LoadingFallback}>
                                <AI />
                            </Suspense>
                        } />
                        <Route path="settings" element={
                            <Suspense fallback={LoadingFallback}>
                                <Settings />
                            </Suspense>
                        } />
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
                        color: 'rgb(241 245 249)', // slate-100
                    },
                    className: 'font-sans',
                }}
            />
        </ErrorBoundary>
    );
}

export default App;
