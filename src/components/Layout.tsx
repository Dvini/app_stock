import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const Layout = () => {
    return (
        <div className="relative flex h-screen bg-canvas text-slate-100 overflow-hidden">
            {/* Gradient mesh behind the glass panels */}
            <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -top-56 -left-40 h-[640px] w-[640px] rounded-full bg-violet-600/30 blur-[140px]" />
                <div className="absolute -top-40 right-[-10%] h-[520px] w-[620px] rounded-full bg-cyan-500/15 blur-[140px]" />
                <div className="absolute bottom-[-30%] left-[30%] h-[600px] w-[760px] rounded-full bg-fuchsia-600/15 blur-[160px]" />
                <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.035)_1px,transparent_1px)] [background-size:24px_24px]" />
            </div>

            <Sidebar />
            <main className="relative flex-1 overflow-y-auto py-6 pr-6 pl-3 flex flex-col custom-scrollbar">
                <Outlet />
            </main>
        </div>
    );
};
