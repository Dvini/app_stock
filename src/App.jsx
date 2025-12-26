import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Portfolio } from './pages/Portfolio';
import { AI } from './pages/AI';
import { Settings } from './pages/Settings';
import { Simulator } from './pages/Simulator';
import { Transactions } from './pages/Transactions';
import { initDB } from './db/db';
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
          <Route path="simulator" element={<Simulator />} />
          <Route path="ai" element={<AI />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
