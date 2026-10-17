import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    PieChart,
    History,
    DollarSign,
    Settings,
    Calculator,
    TrendingUp,
    ReceiptText,
    HardDrive,
    LucideIcon
} from 'lucide-react';
import { cn } from '../lib/utils';

import { PortfolioSwitcher } from './PortfolioSwitcher';
import { usePortfolioAccount } from '../context/PortfolioContext';

interface SidebarItemProps {
    to: string;
    icon: LucideIcon;
    label: string;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ to, icon: Icon, label }) => (
    <NavLink
        data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
        to={to}
        className={({ isActive }) =>
            cn(
                'group relative w-full flex items-center gap-3 p-1.5 pr-3 rounded-2xl text-sm font-medium transition-all duration-200',
                isActive
                    ? 'bg-gradient-to-r from-violet-500/25 via-blue-500/10 to-transparent text-white ring-1 ring-inset ring-white/10'
                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
            )
        }
    >
        {({ isActive }) => (
            <>
                <span
                    className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all',
                        isActive
                            ? 'bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-lg shadow-violet-600/40'
                            : 'bg-white/[0.04] text-slate-400 group-hover:bg-white/[0.08] group-hover:text-slate-200'
                    )}
                >
                    <Icon size={16} strokeWidth={2.25} />
                </span>
                <span>{label}</span>
            </>
        )}
    </NavLink>
);

export const Sidebar = () => {
    const { isAllPortfolios } = usePortfolioAccount();

    return (
        <aside className="relative z-10 m-3 mr-0 w-64 shrink-0 flex flex-col p-4 rounded-[28px] glass shadow-2xl shadow-black/40">
            <div className="flex items-center gap-3 px-1 pt-1 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 shadow-lg shadow-violet-600/40 ring-1 ring-inset ring-white/25">
                    <TrendingUp className="text-white" size={20} strokeWidth={2.5} />
                </div>
                <div className="leading-tight">
                    <span className="block text-base font-bold tracking-tight text-white">StockTracker</span>
                    <span className="block text-[11px] text-slate-400">Portfel inwestycyjny</span>
                </div>
            </div>

            <PortfolioSwitcher />

            <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Nawigacja</p>
            <nav className="flex-1 space-y-1">
                <SidebarItem to="/" icon={LayoutDashboard} label={isAllPortfolios ? 'Podsumowanie' : 'Dashboard'} />
                <SidebarItem to="/portfolio" icon={PieChart} label="Portfel" />
                <SidebarItem to="/transactions" icon={History} label="Transakcje" />
                <SidebarItem to="/dividends" icon={DollarSign} label="Dywidendy" />
                <SidebarItem to="/simulator" icon={Calculator} label="Symulator" />
                <SidebarItem to="/taxes" icon={ReceiptText} label="Podatki (PIT-38)" />
                <SidebarItem to="/settings" icon={Settings} label="Ustawienia" />
            </nav>

            <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-white/[0.04] px-3 py-3 text-[11px] text-slate-400 ring-1 ring-inset ring-white/[0.06]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                    <HardDrive size={14} />
                </span>
                Dane przechowywane lokalnie
            </div>
        </aside>
    );
};
