import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
// @ts-ignore - will be migrated to TypeScript
import { Dashboard } from './pages/Dashboard';
// @ts-ignore - will be migrated to TypeScript
import { Portfolio } from './pages/Portfolio';
// @ts-ignore - will be migrated to TypeScript
import { AI } from './pages/AI';
// @ts-ignore - will be migrated to TypeScript
import { Settings } from './pages/Settings';
// @ts-ignore - will be migrated to TypeScript
import { Simulator } from './pages/Simulator';
import { Transactions } from './pages/Transactions';
// @ts-ignore - will be migrated to TypeScript
import { Dividends } from './pages/Dividends';
import { initDB } from './db/db';
// @ts-ignore - will be migrated to TypeScript
import { AIProvider } from './context/AIContext';
import { CurrencyProvider } from './context/CurrencyContext';

function App() {
    useEffect(() => {
        initDB();
    }, []);

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={
                    <CurrencyProvider>
                        <AIProvider>
                            <Layout />
                        </AIProvider>
                    </CurrencyProvider>
                }>
                    <Route index element={<Dashboard />} />
                    <Route path="portfolio" element={<Portfolio />} />
                    <Route path="transactions" element={<Transactions />} />
                    <Route path="dividends" element={<Dividends />} />
                    <Route path="simulator" element={<Simulator />} />
                    <Route path="ai" element={<AI />} />
                    <Route path="settings" element={<Settings />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
