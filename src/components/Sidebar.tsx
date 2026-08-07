'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Estúdio & Registro', icon: '📥', desc: 'Mídias, CSV e Pré-Market' },
  { href: '/diario', label: 'Diário de Operações', icon: '📓', desc: 'Trades com Screenshots & Voz' },
  { href: '/database', label: 'Banco de Dados', icon: '💾', desc: 'Datalog, Vídeos OBS e Mídias' },
  { href: '/calendario', label: 'Calendário Mensal', icon: '📅', desc: 'Heatmap de P&L' },
  { href: '/configuracoes', label: 'Configurações', icon: '⚙️', desc: 'Pastas e Preferências' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 lg:w-64 bg-[#090d16]/95 backdrop-blur-2xl border-r border-slate-800/80 flex flex-col z-50 transition-all">
      {/* Logo Apple-style */}
      <div className="h-16 flex items-center px-4 border-b border-slate-800/80">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
            W
          </div>
          <div className="hidden lg:block">
            <span className="text-base font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-slate-100 bg-clip-text text-transparent block leading-tight">
              TradeLog Hub
            </span>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-mono">
              v3 Apple UX
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[inset_0_0_15px_rgba(16,185,129,0.08)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <div className="hidden lg:block">
                <span className="block font-semibold">{item.label}</span>
                <span className="text-[10px] text-slate-500 font-normal block">{item.desc}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer Status */}
      <div className="p-3 border-t border-slate-800/80 space-y-2">
        <div className="hidden lg:block bg-slate-950/60 border border-slate-800/60 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-200">WINFUT</span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold">
              +0,62%
            </span>
          </div>
          <div className="text-sm font-mono font-bold text-emerald-400 mt-0.5">
            125.430
          </div>
        </div>

        <div className="hidden lg:flex items-center justify-between text-[10px] text-slate-500 px-1 font-mono">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>SQLite Local</span>
          </div>
          <span className="text-slate-600">v3.0</span>
        </div>
      </div>
    </aside>
  );
}
