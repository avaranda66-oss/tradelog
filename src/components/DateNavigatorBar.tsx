'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { IconArrowUp, IconArrowDown } from '@/components/ui/icons';

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

  const currentDateParam = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    return currentDateParam ? parseDateISO(currentDateParam) : new Date();
  });

  useEffect(() => {
    if (currentDateParam) {
      setSelectedDate(parseDateISO(currentDateParam));
    }
  }, [currentDateParam]);

  const handleDateChange = (newDate: Date) => {
    setSelectedDate(newDate);
    const dateStr = formatDateISO(newDate);
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', dateStr);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    handleDateChange(prev);
  };

  const handleNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    handleDateChange(next);
  };

  const handleToday = () => {
    handleDateChange(new Date());
  };

  const dayNum = String(selectedDate.getDate()).padStart(2, '0');
  const monthName = MONTH_NAMES[selectedDate.getMonth()];
  const yearNum = selectedDate.getFullYear();
  const weekdayName = WEEKDAY_NAMES[selectedDate.getDay()];
  const dateFormattedLabel = `${dayNum} ${monthName} ${yearNum} // ${weekdayName}`;

  return (
    <div className="flex items-center gap-1.5 bg-[#070a10] px-2.5 py-1 rounded-md border border-slate-800/80 font-mono">
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

      <button
        onClick={handleToday}
        type="button"
        className="px-2 py-0.5 text-[10px] font-bold text-slate-400 hover:text-teal-400 border border-slate-800 rounded transition-colors tracking-wider"
      >
        HOJE
      </button>

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

      <input
        type="date"
        value={formatDateISO(selectedDate)}
        onChange={(e) => {
          if (e.target.value) {
            handleDateChange(parseDateISO(e.target.value));
          }
        }}
        className="bg-[#0b1018] border border-slate-800 rounded px-2 py-0.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500/60 tabular-nums cursor-pointer"
      />

      <span className="hidden md:inline-block text-[10px] font-bold text-teal-400/90 tracking-wider pl-1 border-l border-slate-800/80">
        {dateFormattedLabel}
      </span>
    </div>
  );
}

export default DateNavigatorBar;
