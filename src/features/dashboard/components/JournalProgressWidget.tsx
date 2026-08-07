'use client';

import { useState } from 'react';
import type { TradingDay, Trade, keyLevels, AudioRecord } from '@/lib/db/schema';
import { calculateJournalCompleteness } from '@/lib/gamification';
import { DisciplineFlameIcon } from './DisciplineFlameIcon';
import { BadgeMatrixWidget } from './BadgeMatrixWidget';

interface JournalProgressWidgetProps {
  day: TradingDay | null;
  trades?: Trade[];
  allTrades?: Trade[];
  allAudios?: AudioRecord[];
  levels?: (typeof keyLevels.$inferSelect)[];
  audios?: AudioRecord[];
  imagesCount?: number;
  historyDays?: TradingDay[];
}

/**
 * Módulo de Ritmo Operacional e Instrumentação de Disciplina
 * Estética Editorial / Command Center (Linear / Vercel / Raycast / Bloomberg)
 */
export function JournalProgressWidget({
  day,
  trades = [],
  allTrades = [],
  allAudios = [],
  levels = [],
  audios = [],
  imagesCount = 0,
  historyDays = [],
}: JournalProgressWidgetProps) {
  const [showRows, setShowRows] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const result = calculateJournalCompleteness(day, trades, levels, audios, imagesCount, historyDays);

  return (
    <div className="space-y-3">
      {/* Container Principal — Command Header */}
      <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 shadow-2xl transition-all hover:border-slate-700/80 space-y-3">
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Chama Vetorial com evento de volta no anel ao atingir 100% */}
          <div className="flex items-center gap-3">
            <DisciplineFlameIcon
              level={result.flameLevel}
              size={38}
              complete={result.score === 100}
            />

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
                  RITMO OPERACIONAL DO DIÁRIO
                </h3>
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${result.badgeColor}`}>
                  {result.badgeTitle} // {result.badgeTag}
                </span>
              </div>

              {/* Streak Engine Status */}
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-teal-400 font-mono font-semibold">
                  {result.streakStatus}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  ({result.completedCount}/{result.totalCount} ETAPAS)
                </span>
              </div>
            </div>
          </div>

          {/* Score Mono + Botões em Estilo Terminal sem colchetes decorativos */}
          <div className="flex items-center gap-3">
            <div className="text-right font-mono">
              <span className={`text-2xl font-bold ${result.score === 100 ? 'text-teal-400' : result.score >= 50 ? 'text-cyan-400' : 'text-slate-300'}`}>
                {result.score}%
              </span>
            </div>

            <button
              onClick={() => setShowArchive(!showArchive)}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-teal-400 border border-slate-700/80 rounded-md text-xs font-bold font-mono transition-all flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" />
              </svg>
              <span>{showArchive ? 'FECHAR ARQUIVO' : 'ARQUIVO DE CONQUISTAS'}</span>
            </button>

            <button
              onClick={() => setShowRows(!showRows)}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 rounded-md text-xs font-bold font-mono transition-all"
            >
              {showRows ? 'FECHAR ETAPAS' : 'LINHAS OPERACIONAIS'}
            </button>
          </div>
        </div>

        {/* Trilho de Energia 6px com preenchimento 4px centralizado e marcadores de 1px */}
        <div className="relative w-full bg-[#070a10] border border-slate-800/80 rounded-full h-[6px] p-[1px] overflow-hidden">
          {/* Preenchimento Térmico 4px */}
          <div
            className={`h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] relative ${
              result.score === 100
                ? 'bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.5)]'
                : result.score >= 70
                ? 'bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.3)]'
                : result.score >= 40
                ? 'bg-indigo-500'
                : 'bg-slate-700'
            }`}
            style={{ width: `${Math.max(result.score, 1.5)}%` }}
          />

          {/* Marcadores de Segmento de 1px nos pontos 20%, 40%, 60%, 80% */}
          <div className="absolute inset-0 flex justify-between px-2 pointer-events-none opacity-20">
            <div className="w-[1px] h-full bg-slate-400" />
            <div className="w-[1px] h-full bg-slate-400" />
            <div className="w-[1px] h-full bg-slate-400" />
            <div className="w-[1px] h-full bg-slate-400" />
          </div>
        </div>

        {/* Linhas Operacionais do Checklist (Substituindo caracteres por SVG próprio) */}
        {showRows && (
          <div className="pt-2 border-t border-slate-800/80 space-y-1.5 animate-in fade-in duration-200">
            <div className="space-y-1 font-mono text-xs">
              {result.items.map((item) => (
                <div
                  key={item.id}
                  className={`p-2 rounded-md border transition-all flex items-center justify-between gap-3 ${
                    item.completed
                      ? 'bg-teal-500/5 border-teal-500/20 text-teal-300'
                      : 'bg-slate-950/40 border-slate-900 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* SVG próprio: Quadrado com check 1px para concluído vs Quadrado 1px vazado para pendente */}
                    {item.completed ? (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-teal-400">
                        <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.25" />
                        <path d="M4.5 8L7 10.5L11.5 5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-slate-600">
                        <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.25" />
                      </svg>
                    )}

                    <span className="font-semibold text-slate-200">{item.label}</span>
                    <span className="text-[10px] text-slate-500 font-sans">({item.hint})</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500">{item.weight} PTS</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                      item.completed
                        ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                        : 'bg-slate-900 text-slate-600 border-slate-800'
                    }`}>
                      {item.completed ? 'CONCLUÍDO // 20 PTS' : 'PENDENTE // AGUARDANDO REGISTRO'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Banner de Sincronização 100% */}
        {result.score === 100 && (
          <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg p-2.5 text-center font-mono space-y-0.5 animate-in fade-in duration-300">
            <span className="text-xs font-bold text-teal-400 uppercase tracking-wider block">
              DIÁRIO 100% SINCRONIZADO // DISCIPLINA REGISTRADA
            </span>
            <p className="text-[11px] text-teal-300/80 font-sans">
              Arquivo formatado exportado automaticamente para <code className="bg-slate-950 px-1.5 py-0.5 rounded text-teal-200 font-mono">04-DIARIO-TRADE</code>.
            </p>
          </div>
        )}
      </div>

      {/* Arquivo de Conquistas (Sessão Expansível sob demanda) */}
      {showArchive && (
        <div className="animate-in fade-in duration-300">
          <BadgeMatrixWidget historyDays={historyDays} currentDay={day} allTrades={allTrades} audios={allAudios} />
        </div>
      )}
    </div>
  );
}
