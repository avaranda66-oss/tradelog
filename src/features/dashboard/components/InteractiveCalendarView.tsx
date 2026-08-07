'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { TradingDay, Trade } from '@/lib/db/schema';
import { IconChart, IconCheck } from '@/components/ui/icons';

interface InteractiveCalendarViewProps {
  tradingDaysData?: TradingDay[];
  tradesData?: Trade[];
  currentDateStr?: string;
}

const MONTH_NAMES = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
];

const WEEKDAY_HEADERS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

function formatISO(y: number, m: number, d: number): string {
  const monthStr = String(m + 1).padStart(2, '0');
  const dayStr = String(d).padStart(2, '0');
  return `${y}-${monthStr}-${dayStr}`;
}

export function InteractiveCalendarView({
  tradingDaysData = [],
  tradesData = [],
  currentDateStr,
}: InteractiveCalendarViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Mês/Ano selecionado no visualizador
  const initialDate = currentDateStr ? new Date(currentDateStr + 'T12:00:00') : new Date();
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth());

  const activeDateISO = currentDateStr || searchParams.get('date') || formatISO(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  // Mapeamento de dados por data (YYYY-MM-DD)
  const daysMap = new Map<string, TradingDay>();
  for (const d of tradingDaysData) {
    daysMap.set(d.date, d);
  }

  const tradesCountMap = new Map<string, { count: number; pnlReais: number; pnlPoints: number }>();
  for (const t of tradesData) {
    const dayObj = tradingDaysData.find(d => d.id === t.tradingDayId);
    if (dayObj) {
      const dateKey = dayObj.date;
      const current = tradesCountMap.get(dateKey) || { count: 0, pnlReais: 0, pnlPoints: 0 };
      tradesCountMap.set(dateKey, {
        count: current.count + 1,
        pnlReais: current.pnlReais + (t.reais || 0),
        pnlPoints: current.pnlPoints + (t.points || 0),
      });
    }
  }

  function handlePrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  }

  function handleNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  }

  function handleSelectDate(dateISO: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', dateISO);
    router.push(`/?${params.toString()}`);
  }

  // Métricas do Mês Exibido
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const daysInMonthList = tradingDaysData.filter(d => d.date.startsWith(monthPrefix));
  
  let monthPnlReais = 0;
  let monthTradesCount = 0;
  for (const d of daysInMonthList) {
    monthPnlReais += d.totalReais || 0;
    const tData = tradesCountMap.get(d.date);
    if (tData) monthTradesCount += tData.count;
  }

  // Geração da grade de 35 a 42 células do mês
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const startingWeekday = firstDayOfMonth.getDay(); // 0 (Dom) a 6 (Sáb)
  const totalDaysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  // Dias do mês anterior para preencher offset inicial
  const prevMonthTotalDays = new Date(viewYear, viewMonth, 0).getDate();

  const gridCells = [];

  // 1. Células do mês anterior
  for (let i = startingWeekday - 1; i >= 0; i--) {
    const dayNum = prevMonthTotalDays - i;
    const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
    const dateISO = formatISO(prevY, prevM, dayNum);
    gridCells.push({ dayNum, dateISO, isCurrentMonth: false });
  }

  // 2. Células do mês atual
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dateISO = formatISO(viewYear, viewMonth, d);
    gridCells.push({ dayNum: d, dateISO, isCurrentMonth: true });
  }

  // 3. Células do mês seguinte para fechar a última semana
  const remaining = 7 - (gridCells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateISO = formatISO(nextY, nextM, d);
      gridCells.push({ dayNum: d, dateISO, isCurrentMonth: false });
    }
  }

  return (
    <section aria-label="Calendário mensal de resultados" className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 shadow-2xl space-y-4 font-mono">
      {/* Header com Mês, Ano e Navegação */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-3">
          <IconChart className="text-teal-400" />
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              CALENDÁRIO DE RESULTADOS & MAPA DE P&L
            </h2>
            <p className="text-[11px] text-slate-500 font-sans mt-0.5">
              Clique em qualquer dia do mês para realizar o switch instantâneo da sessão
            </p>
          </div>
        </div>

        {/* Botões Mês Anterior / Próximo */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevMonth}
            type="button"
            className="p-1.5 bg-[#070a10] hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-teal-400 rounded-md transition-colors"
            title="Mês Anterior"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <span className="text-xs font-bold text-slate-100 tracking-wider px-2">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>

          <button
            onClick={handleNextMonth}
            type="button"
            className="p-1.5 bg-[#070a10] hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-teal-400 rounded-md transition-colors"
            title="Próximo Mês"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Resumo do Mês */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#070a10] p-3 rounded-md border border-slate-800/80 text-xs font-mono tabular-nums">
        <div>
          <span className="text-[9px] text-slate-500 uppercase block tracking-wider font-bold">P&L ACUMULADO DO MÊS</span>
          <span className={`text-base font-bold ${monthPnlReais > 0 ? 'text-teal-400' : monthPnlReais < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
            R$ {monthPnlReais > 0 ? '+' : ''}{monthPnlReais.toFixed(2)}
          </span>
        </div>

        <div>
          <span className="text-[9px] text-slate-500 uppercase block tracking-wider font-bold">TOTAL DE OPERAÇÕES</span>
          <span className="text-base font-bold text-slate-200">
            {monthTradesCount} OPS
          </span>
        </div>

        <div>
          <span className="text-[9px] text-slate-500 uppercase block tracking-wider font-bold">PREGÕES REGISTRADOS</span>
          <span className="text-base font-bold text-slate-200">
            {daysInMonthList.length} SESSÕES
          </span>
        </div>
      </div>

      {/* Grid de 7 Colunas do Calendário */}
      <div className="space-y-1">
        {/* Cabeçalho dos Dias da Semana */}
        <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] font-bold text-slate-500 uppercase tracking-widest pb-1 border-b border-slate-800/80">
          {WEEKDAY_HEADERS.map(w => (
            <div key={w}>{w}</div>
          ))}
        </div>

        {/* Células de Dias */}
        <div className="grid grid-cols-7 gap-1">
          {gridCells.map((cell, idx) => {
            const dayObj = daysMap.get(cell.dateISO);
            const tradeData = tradesCountMap.get(cell.dateISO);

            const isSelected = cell.dateISO === activeDateISO;
            const pnl = dayObj?.totalReais ?? tradeData?.pnlReais ?? 0;
            const hasTrades = (tradeData?.count || 0) > 0 || (dayObj?.totalPoints !== null && dayObj?.totalPoints !== undefined);
            const isComplete = Boolean((dayObj?.preMarketDone || dayObj?.generalBias) && (dayObj?.retrospective || dayObj?.honestPhrase || dayObj?.totalPoints !== null));

            const isPositive = pnl > 0;
            const isNegative = pnl < 0;

            const bgStyle = isSelected
              ? 'bg-teal-500/10 border-teal-500/60 shadow-[0_0_10px_rgba(45,212,191,0.15)]'
              : cell.isCurrentMonth
              ? isPositive
                ? 'bg-teal-500/5 border-teal-500/20 hover:border-teal-400/50'
                : isNegative
                ? 'bg-rose-500/5 border-rose-500/20 hover:border-rose-400/50'
                : 'bg-[#070a10] border-slate-800/80 hover:border-slate-700'
              : 'bg-[#070a10]/40 border-slate-900 opacity-30 hover:opacity-60';

            return (
              <div
                key={`${cell.dateISO}-${idx}`}
                onClick={() => handleSelectDate(cell.dateISO)}
                className={`p-2 rounded-md border cursor-pointer transition-all min-h-[72px] flex flex-col justify-between ${bgStyle}`}
              >
                {/* Linha Superior: Número do Dia + Badge Status */}
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className={`font-bold ${isSelected ? 'text-teal-400 font-black' : cell.isCurrentMonth ? 'text-slate-300' : 'text-slate-600'}`}>
                    {String(cell.dayNum).padStart(2, '0')}
                  </span>

                  {dayObj && (
                    <span className={`text-[8px] font-bold px-1 rounded border ${
                      isComplete ? 'bg-teal-500/20 text-teal-400 border-teal-500/30' : 'bg-slate-900 text-slate-500 border-slate-800'
                    }`}>
                      {isComplete ? '100%' : 'PEND'}
                    </span>
                  )}
                </div>

                {/* Linha Inferior: P&L e Ops */}
                <div className="text-right font-mono tabular-nums space-y-0.5">
                  {hasTrades ? (
                    <>
                      <span className={`text-xs font-bold block ${isPositive ? 'text-teal-400' : isNegative ? 'text-rose-400' : 'text-slate-400'}`}>
                        R$ {isPositive ? '+' : ''}{pnl.toFixed(0)}
                      </span>
                      <span className="text-[9px] text-slate-500 block">
                        {tradeData?.count || 0} OPS
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-700 block">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default InteractiveCalendarView;
