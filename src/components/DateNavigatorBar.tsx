'use client';

import React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { IconChart } from '@/components/ui/icons';

/**
 * Converte string 'YYYY-MM-DD' para objeto Date local (evitando timezone offset UTC)
 */
function parseDateISO(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

/**
 * Formata Date local para string ISO 'YYYY-MM-DD'
 */
function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTH_NAMES = [
  'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
  'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'
];

const WEEKDAY_NAMES = [
  'DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'
];

export function DateNavigatorBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const todayISO = formatDateISO(new Date());
  const currentDateParam = searchParams.get('date');

  // Fonte da verdade derivada da URL (ou HOJE por padrão caso não esteja na URL)
  const activeDateISO = currentDateParam || todayISO;
  const selectedDate = parseDateISO(activeDateISO);

  const handleDateChange = (newDateISO: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', newDateISO);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    handleDateChange(formatDateISO(prev));
  };

  const handleNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    handleDateChange(formatDateISO(next));
  };

  const dayNum = String(selectedDate.getDate()).padStart(2, '0');
  const monthName = MONTH_NAMES[selectedDate.getMonth()];
  const yearNum = selectedDate.getFullYear();
  const weekdayName = WEEKDAY_NAMES[selectedDate.getDay()];
  const dateFormattedLabel = `${dayNum} ${monthName} ${yearNum} // ${weekdayName}`;

  return (
    <div className="flex items-center gap-2 font-mono">
      <div className="flex items-center gap-1.5 bg-[#070a10] px-2.5 py-1 rounded-md border border-slate-800/80">
        {/* Dia Anterior */}
        <button
          onClick={handlePrevDay}
          type="button"
          className="p-1 text-slate-400 hover:text-teal-400 transition-colors"
          title="Dia Anterior"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        {/* Input de Data */}
        <input
          type="date"
          value={activeDateISO}
          onChange={(e) => {
            if (e.target.value) {
              handleDateChange(e.target.value);
            }
          }}
          className="bg-[#0b1018] border border-slate-800 rounded px-2 py-0.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500/60 tabular-nums cursor-pointer"
        />

        {/* Próximo Dia */}
        <button
          onClick={handleNextDay}
          type="button"
          className="p-1 text-slate-400 hover:text-teal-400 transition-colors"
          title="Próximo Dia"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        {/* Label Formatada da Data */}
        <span className="hidden md:inline-block text-[10px] font-bold text-teal-400/90 tracking-wider pl-1 border-l border-slate-800/80">
          {dateFormattedLabel}
        </span>
      </div>

      {/* Botão de Atalho para o Calendário P&L */}
      <Link
        href={`/calendario?date=${activeDateISO}`}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-[#070a10] hover:bg-slate-800 text-slate-300 hover:text-teal-400 border border-slate-800 rounded-md text-[10px] font-bold tracking-wider transition-all"
        title="Abrir Calendário de Resultados"
      >
        <IconChart width={12} height={12} className="text-teal-400" />
        <span className="hidden sm:inline">CALENDÁRIO P&L</span>
      </Link>
    </div>
  );
}

export default DateNavigatorBar;
