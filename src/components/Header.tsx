'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

function HeaderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');

  const pathname = usePathname();

  function navigateDate(days: number) {
    const current = dateParam ? new Date(dateParam + 'T12:00:00') : new Date();
    current.setDate(current.getDate() + days);
    const y = current.getFullYear();
    const m = (current.getMonth() + 1).toString().padStart(2, '0');
    const d = current.getDate().toString().padStart(2, '0');
    router.push(`${pathname}?date=${y}-${m}-${d}`);
  }

  const displayDate = dateParam
    ? new Date(dateParam + 'T12:00:00').toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

  return (
    <header className="h-16 border-b border-slate-800/80 bg-[#090d16]/60 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Date Navigator */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigateDate(-1)}
          className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-all text-xs font-mono"
          title="Dia anterior"
        >
          ‹
        </button>

        <span className="text-sm font-semibold text-slate-200 min-w-[160px] text-center capitalize">
          📅 {displayDate}
        </span>

        <button
          onClick={() => navigateDate(1)}
          className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-all text-xs font-mono"
          title="Próximo dia"
        >
          ›
        </button>
      </div>

      {/* Quick Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/audios')}
          className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-all flex items-center gap-2 shadow-sm"
        >
          <span>🎙️</span>
          <span className="hidden sm:inline">Gravar Áudio</span>
        </button>

        <button
          onClick={() => router.push('/#import-csv')}
          className="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium transition-all flex items-center gap-2 shadow-sm"
        >
          <span>📥</span>
          <span>Importar CSV</span>
        </button>
      </div>
    </header>
  );
}

export function Header() {
  return (
    <Suspense fallback={
      <header className="h-16 border-b border-slate-800/80 bg-[#090d16]/60 px-6 flex items-center justify-between sticky top-0 z-40 text-xs text-slate-500">
        Carregando...
      </header>
    }>
      <HeaderContent />
    </Suspense>
  );
}
