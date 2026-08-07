'use client';

import { useState } from 'react';
import type { TradingDay, Trade, AudioRecord, keyLevels } from '@/lib/db/schema';
import { TradeModalV2 } from '@/features/trades/components/TradeModalV2';
import { TradeCard } from '@/features/trades/components/TradeCard';
import { StrategyTagManager } from '@/features/trades/components/StrategyTagManager';
import { TranscriptionPanel } from '@/features/audio/components/TranscriptionPanel';
import { JournalProgressWidget } from '@/features/dashboard/components/JournalProgressWidget';
import Link from 'next/link';
import { IconJournal, IconTerminal, IconTarget, IconMic, IconCheck } from '@/components/ui/icons';

interface JournalHubViewProps {
  day: TradingDay | null;
  date: string;
  trades: Trade[];
  allTrades?: Trade[];
  audios: AudioRecord[];
  allAudios?: AudioRecord[];
  levels?: (typeof keyLevels.$inferSelect)[];
}

function calculateSleepDuration(sleepTime?: string | null, wakeUpTime?: string | null): string {
  if (!sleepTime || !wakeUpTime) return '—';
  const [sH, sM] = sleepTime.split(':').map(Number);
  const [wH, wM] = wakeUpTime.split(':').map(Number);
  if (isNaN(sH) || isNaN(sM) || isNaN(wH) || isNaN(wM)) return '—';

  let startMinutes = sH * 60 + sM;
  let endMinutes = wH * 60 + wM;

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  const diffMinutes = endMinutes - startMinutes;
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;

  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

function calculatePrepTime(wakeUpTime?: string | null, marketOpenTime: string = '09:00'): string {
  if (!wakeUpTime) return '—';
  const [wH, wM] = wakeUpTime.split(':').map(Number);
  const [mH, mM] = marketOpenTime.split(':').map(Number);
  if (isNaN(wH) || isNaN(wM) || isNaN(mH) || isNaN(mM)) return '—';

  const startMinutes = wH * 60 + wM;
  const openMinutes = mH * 60 + mM;

  if (startMinutes >= openMinutes) return '0 min (acordou pós 09:00)';

  const diffMinutes = openMinutes - startMinutes;
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;

  if (hours === 0) return `${mins} min de estudo`;
  if (mins === 0) return `${hours}h de estudo`;
  return `${hours}h ${mins}min de estudo`;
}

export function JournalHubView({ day, date, trades, allTrades = [], audios, allAudios = [], levels = [] }: JournalHubViewProps) {
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);

  const wins = trades.filter(t => (t.reais || 0) > 0);
  const losses = trades.filter(t => (t.reais || 0) < 0);
  const totalReais = day?.totalReais || trades.reduce((acc, t) => acc + (t.reais || 0), 0);
  const totalPoints = day?.totalPoints || trades.reduce((acc, t) => acc + (t.points || 0), 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;

  const totalGain = wins.reduce((acc, t) => acc + (t.reais || 0), 0);
  const totalLoss = Math.abs(losses.reduce((acc, t) => acc + (t.reais || 0), 0));
  const payoff = totalLoss > 0 ? (totalGain / totalLoss).toFixed(2) : 'N/A';

  return (
    <div className="max-w-[1440px] mx-auto space-y-5 pb-16 animate-in fade-in font-mono">
      {/* Header Hub Command */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-3">
          <IconJournal className="text-teal-400" />
          <div>
            <h1 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-[0.2em]">
              JOURNAL LOGS · DIÁRIO DE OPERAÇÕES
            </h1>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
              SESSÃO SELECIONADA: <strong className="text-teal-400 font-bold tabular-nums">{date}</strong>
            </p>
          </div>
        </div>

        <Link
          href={`/?date=${date}`}
          className="px-3 py-1.5 bg-[#070a10] hover:bg-slate-800 text-teal-400 border border-slate-800 rounded-md text-xs font-mono font-bold tracking-wider transition-all flex items-center gap-1.5"
        >
          <span>ESTÚDIO COMMAND</span>
          <span>→</span>
        </Link>
      </div>

      {/* Widget de Gamificação & Foguinho */}
      <JournalProgressWidget
        day={day}
        trades={trades}
        allTrades={allTrades}
        allAudios={allAudios}
        levels={levels}
        audios={audios}
      />

      {/* Grid Principal: 2 Colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUNA ESQUERDA (7 colunas): Operações, KPIs e Tags */}
        <div className="lg:col-span-7 space-y-4">
          {/* Summary KPI Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
            <div className="bg-[#0b1018] border border-slate-800/80 rounded-lg p-3">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">RESULTADO R$</span>
              <span className={`text-sm font-bold block mt-1 ${totalReais >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
                R$ {totalReais > 0 ? '+' : ''}{totalReais.toFixed(2)}
              </span>
            </div>

            <div className="bg-[#0b1018] border border-slate-800/80 rounded-lg p-3">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">PONTOS (PTS)</span>
              <span className={`text-sm font-bold block mt-1 ${totalPoints >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
                {totalPoints > 0 ? '+' : ''}{totalPoints} pts
              </span>
            </div>

            <div className="bg-[#0b1018] border border-slate-800/80 rounded-lg p-3">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">WIN RATE</span>
              <span className="text-sm font-bold text-teal-400 block mt-1">{winRate.toFixed(1)}%</span>
            </div>

            <div className="bg-[#0b1018] border border-slate-800/80 rounded-lg p-3">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">PAYOFF</span>
              <span className="text-sm font-bold text-slate-200 block mt-1">{payoff}</span>
            </div>
          </div>

          {/* Gerenciador de Tags de Estratégia */}
          <StrategyTagManager />

          {/* Feed de Operações do Dia */}
          {trades.length > 0 ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                  OPERAÇÕES REGISTRADAS ({trades.length})
                </h2>
                <span className="text-[10px] text-slate-500 font-mono">CLIQUE PARA ABRIR INSPECTOR</span>
              </div>

              <div className="space-y-2.5">
                {trades.map((trade) => (
                  <TradeCard
                    key={trade.id}
                    trade={trade}
                    date={date}
                    onOpenModal={(t) => setSelectedTrade(t)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-10 text-center text-slate-500 space-y-2 font-mono">
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">NO TRADES RECORDED FOR {date}</p>
              <p className="text-[11px] text-slate-500">
                Nenhum trade importado nesta sessão.{' '}
                <Link href={`/?date=${date}`} className="text-teal-400 underline font-bold">
                  Ir para o Estúdio Command
                </Link>
              </p>
            </div>
          )}
        </div>

        {/* COLUNA DIREITA (5 colunas): Contexto do Pregão, Níveis & Transcrições */}
        <div className="lg:col-span-5 space-y-4 font-mono">
          {/* Pré-Market & Plano do Dia */}
          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-3 shadow-xl font-mono">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold block">
                CONTEXTO & PLANO MATINAL
              </span>
              {day?.generalBias && (
                <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase border ${
                  day.generalBias === 'alta'
                    ? 'bg-teal-500/10 text-teal-400 border-teal-500/30'
                    : day.generalBias === 'baixa'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}>
                  VIÉS: {day.generalBias}
                </span>
              )}
            </div>

            {day ? (
              <div className="space-y-3 text-xs">
                {/* Métricas de Rotina e Sono (Cálculo Automático) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#070a10] p-2.5 rounded-md border border-slate-800/80 tabular-nums">
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase font-bold">DORMIU</span>
                    <span className="font-semibold text-slate-300">{day.sleepTime || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase font-bold">ACORDOU</span>
                    <span className="font-semibold text-slate-300">{day.wakeUpTime || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase font-bold">HORAS SONO</span>
                    <span className="font-semibold text-teal-400">{calculateSleepDuration(day.sleepTime, day.wakeUpTime)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase font-bold">PREP. PRÉ-MARKET</span>
                    <span className="font-semibold text-teal-300">{calculatePrepTime(day.wakeUpTime)}</span>
                  </div>
                </div>

                {/* Qualidade do Sono e Estado Mental */}
                {(day.sleepQuality || day.mentalState) && (
                  <div className="grid grid-cols-2 gap-2 bg-[#070a10] p-2.5 rounded-md border border-slate-800/80">
                    {day.sleepQuality && (
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase font-bold">QUALIDADE SONO</span>
                        <span className="font-bold text-amber-400">{day.sleepQuality} / 5 ★</span>
                      </div>
                    )}
                    {day.mentalState && (
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase font-bold">ESTADO MENTAL</span>
                        <span className="font-bold text-slate-200 truncate block">{day.mentalState}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Calendário Macro & Drivers */}
                {day.macroCalendar && (
                  <div className="bg-[#070a10] p-2.5 rounded-md border border-slate-800/80 space-y-0.5">
                    <span className="text-[9px] text-amber-400 uppercase font-bold flex items-center gap-1">
                      <span>📅</span>
                      <span>CALENDÁRIO MACRO & DRIVERS</span>
                    </span>
                    <p className="text-slate-300 font-mono text-xs whitespace-pre-line">{day.macroCalendar}</p>
                  </div>
                )}

                {/* Cenário Overnight */}
                {day.overnightNote && (
                  <div className="bg-[#070a10] p-2.5 rounded-md border border-slate-800/80 space-y-0.5">
                    <span className="text-[9px] text-teal-400 uppercase font-bold flex items-center gap-1">
                      <span>🌐</span>
                      <span>CENÁRIO OVERNIGHT & ASIA/EUROPA</span>
                    </span>
                    <p className="text-slate-300 font-sans text-xs whitespace-pre-line">{day.overnightNote}</p>
                  </div>
                )}

                {/* Farol do Mercado Snapshot */}
                {(day.farolBias || day.farolKeyLevels) && (
                  <div className="bg-[#070a10] p-2.5 rounded-md border border-teal-500/30 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-teal-400 uppercase font-bold flex items-center gap-1">
                        <span>🚦</span>
                        <span>FAROL DO MERCADO SNAPSHOT</span>
                      </span>
                      {day.farolBias && (
                        <span className="text-[9px] font-bold text-teal-300">{day.farolBias}</span>
                      )}
                    </div>
                    {day.farolKeyLevels && (
                      <p className="text-slate-300 font-mono text-[11px]">{day.farolKeyLevels}</p>
                    )}
                  </div>
                )}

                {/* Nota Pessoal Matinal (Limpa de duplicações) */}
                {day.personalNote && (
                  <div className="bg-[#070a10] p-2.5 rounded-md border border-slate-800/80 space-y-0.5">
                    <span className="text-[9px] text-slate-500 uppercase font-bold">NOTA PESSOAL MATINAL</span>
                    <p className="text-slate-300 font-sans text-xs">"{day.personalNote.replace(/\[Dormiu:.*?\]/g, '').trim()}"</p>
                  </div>
                )}

                {day.honestPhrase && (
                  <div className="bg-[#070a10] p-2.5 rounded-md border border-slate-800/80 space-y-0.5">
                    <span className="text-[9px] text-rose-400 uppercase font-bold">REGRA / FRASE HONESTA</span>
                    <p className="text-rose-300 font-mono text-xs">"{day.honestPhrase}"</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Sem registro pré-market para esta sessão.</p>
            )}
          </div>

          {/* Níveis-Chave Técnicos */}
          {levels.length > 0 && (
            <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-3 shadow-xl">
              <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
                <IconTarget className="text-teal-400" />
                <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block">
                  KEY LEVELS · GEX & NÍVEIS CHAVE
                </span>
              </div>

              <div className="space-y-1.5 font-mono text-xs">
                {levels.map((lvl) => (
                  <div key={lvl.id} className="bg-[#070a10] p-2 rounded-md border border-slate-800/80 flex items-center justify-between">
                    <span className="font-bold text-slate-200 tabular-nums">{lvl.price.toLocaleString('pt-BR')}</span>
                    <span className="text-[9px] bg-teal-500/10 text-teal-400 px-1.5 py-0.5 rounded font-bold border border-teal-500/20 uppercase">
                      {lvl.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Narração por Voz & Transcrições do Dia */}
          {audios.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <IconMic className="text-teal-400" />
                <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono font-bold block">
                  VOICE LOGS & TRANSCRIÇÕES
                </span>
              </div>
              <TranscriptionPanel audios={audios} date={date} />
            </div>
          )}
        </div>
      </div>

      {/* Modal Inspector v2.5 */}
      {selectedTrade && (
        <TradeModalV2
          trade={selectedTrade}
          date={date}
          onClose={() => setSelectedTrade(null)}
        />
      )}
    </div>
  );
}

export default JournalHubView;
