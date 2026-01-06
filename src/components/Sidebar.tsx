import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    PieChart,
    History,
    DollarSign,
    Bot,
    Settings,
    Calculator,
    TrendingUp,
    LucideIcon
} from 'lucide-react';
import { cn } from '../lib/utils';

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
                "w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200",
                isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            )
        }
    >
        <Icon size={20} />
        <span className="font-medium text-sm">{label}</span>
    </NavLink>
);

export const Sidebar = () => {
    return (
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col p-4 shrink-0 h-screen sticky top-0">
            <div className="flex items-center space-x-2 px-4 mb-10">
                <div className="bg-blue-600 p-1.5 rounded-lg">
                    <TrendingUp className="text-white" size={20} />
                </div>
                <span className="text-xl font-bold tracking-tight text-white">StockTracker</span>
            </div>
            <nav className="flex-1 space-y-1">
                <SidebarItem to="/" icon={LayoutDashboard} label="Dashboard" />
                <SidebarItem to="/portfolio" icon={PieChart} label="Portfel" />
                <SidebarItem to="/transactions" icon={History} label="Transakcje" />
                <SidebarItem to="/dividends" icon={DollarSign} label="Dywidendy" />
                <SidebarItem to="/simulator" icon={Calculator} label="Symulator" />
                {(import.meta.env.VITE_DISABLE_AI as string) !== 'true' && (
                    <SidebarItem to="/ai" icon={Bot} label="AI Advisor" />
                )}
                <SidebarItem to="/settings" icon={Settings} label="Ustawienia" />
            </nav>
        </aside>
    );
};
