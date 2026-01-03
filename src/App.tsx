import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
                            <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
                                <Dashboard />
                            </Suspense>
                        } />
                        <Route path="portfolio" element={
                            <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
                                <Portfolio />
                            </Suspense>
                        } />
                        <Route path="transactions" element={
                            <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
                                <Transactions />
                            </Suspense>
                        } />
                        <Route path="dividends" element={
                            <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
                                <Dividends />
                            </Suspense>
                        } />
                        <Route path="simulator" element={
                            <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
                                <Simulator />
                            </Suspense>
                        } />
                        <Route path="ai" element={
                            <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
                                <AI />
                            </Suspense>
                        } />
                        <Route path="settings" element={
                            <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
                                <Settings />
                            </Suspense>
                        } />
                    </Route>
                </Routes>
            </BrowserRouter>
        </ErrorBoundary>
    );
}

export default App;
