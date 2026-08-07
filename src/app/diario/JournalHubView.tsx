'use client';

import { useState } from 'react';
import type { TradingDay, Trade, AudioRecord, keyLevels } from '@/lib/db/schema';
import { TradeModalV2 } from '@/features/trades/components/TradeModalV2';
import { TradeCard } from '@/features/trades/components/TradeCard';
import { StrategyTagManager } from '@/features/trades/components/StrategyTagManager';
import { TranscriptionPanel } from '@/features/audio/components/TranscriptionPanel';
import { JournalProgressWidget } from '@/features/dashboard/components/JournalProgressWidget';
import Link from 'next/link';

interface JournalHubViewProps {
  day: TradingDay | null;
  date: string;
  trades: Trade[];
  audios: AudioRecord[];
  levels?: (typeof keyLevels.$inferSelect)[];
}

export function JournalHubView({ day, date, trades, audios, levels = [] }: JournalHubViewProps) {
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
    <div className="max-w-[1440px] mx-auto space-y-6 pb-16 animate-in fade-in">
      {/* Header Hub 2 */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            📓 Diário de Operações
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">
            Sessão selecionada: <strong className="text-emerald-400">{date}</strong>
          </p>
        </div>

        <Link
          href={`/?date=${date}`}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center gap-2"
        >
          <span>📥 IR PARA O ESTÚDIO</span>
          <span>→</span>
        </Link>
      </div>

      {/* Widget de Gamificação & Foguinho */}
      <JournalProgressWidget
        day={day}
        trades={trades}
        levels={levels}
        audios={audios}
      />

      {/* Grid Principal: 2 Colunas (Esquerda = Operações & Tags | Direita = Contexto & Transcrições do Dia) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA (7 colunas): Operações, KPIs e Tags */}
        <div className="lg:col-span-7 space-y-5">
          {/* Summary KPI Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#0d131f] border border-slate-800/80 rounded-xl p-3.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Resultado R$</span>
              <span className={`text-base font-bold font-mono block mt-1 ${totalReais >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                R$ {totalReais > 0 ? '+' : ''}{totalReais.toFixed(2)}
              </span>
            </div>

            <div className="bg-[#0d131f] border border-slate-800/80 rounded-xl p-3.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Pontos</span>
              <span className={`text-base font-bold font-mono block mt-1 ${totalPoints >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totalPoints > 0 ? '+' : ''}{totalPoints} pts
              </span>
            </div>

            <div className="bg-[#0d131f] border border-slate-800/80 rounded-xl p-3.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Assertividade</span>
              <span className="text-base font-bold font-mono text-cyan-400 block mt-1">{winRate.toFixed(1)}%</span>
            </div>

            <div className="bg-[#0d131f] border border-slate-800/80 rounded-xl p-3.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Payoff</span>
              <span className="text-base font-bold font-mono text-amber-400 block mt-1">{payoff}</span>
            </div>
          </div>

          {/* Gerenciador de Tags de Estratégia */}
          <StrategyTagManager />

          {/* Feed de Operações do Dia */}
          {trades.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-bold text-slate-200">
                  Operações Registradas ({trades.length})
                </h2>
                <span className="text-xs text-slate-500">Clique no card para abrir o Trade Inspector</span>
              </div>

              <div className="space-y-3">
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
            <div className="bg-[#0d131f] border border-slate-800 rounded-2xl p-10 text-center text-slate-500 space-y-3">
              <span className="text-4xl block">📭</span>
              <p className="text-sm font-medium">Nenhum trade registrado para este dia ({date}).</p>
              <p className="text-xs text-slate-600">
                Vá para o <Link href={`/?date=${date}`} className="text-emerald-400 underline">Estúdio de Registro</Link> para importar o CSV do Profit Pro ou Vídeo do OBS.
              </p>
            </div>
          )}
        </div>

        {/* COLUNA DIREITA (5 colunas): Contexto do Pregão, Pré-Market, Níveis & Transcrições */}
        <div className="lg:col-span-5 space-y-5">
          {/* Pré-Market & Plano do Dia */}
          <div className="bg-[#0d131f] border border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-xl">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">
              ☀️ CONTEXTO & PRÉ-MARKET DO DIA
            </span>

            {day ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 font-mono">
                  <div>
                    <span className="text-slate-500 block text-[10px]">DESPERTAR</span>
                    <span className="font-semibold text-slate-300">{day.wakeUpTime || '06:30'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">VIÉS GERAL</span>
                    <span className="font-semibold text-emerald-400">{day.generalBias || 'Alta'}</span>
                  </div>
                </div>

                {day.personalNote && (
                  <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Nota Pessoal</span>
                    <p className="text-slate-300 italic">"{day.personalNote}"</p>
                  </div>
                )}

                {day.honestPhrase && (
                  <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Frase Brutalmente Honesta</span>
                    <p className="text-rose-400 font-medium">"{day.honestPhrase}"</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Nenhum pré-market registrado para este dia.</p>
            )}
          </div>

          {/* Níveis-Chave Técnicos */}
          {levels.length > 0 && (
            <div className="bg-[#0d131f] border border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-xl">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">
                🎯 NÍVEIS-CHAVE (GEX & TÉCNICOS)
              </span>

              <div className="space-y-1.5 font-mono text-xs">
                {levels.map((lvl) => (
                  <div key={lvl.id} className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/60 flex items-center justify-between">
                    <span className="font-bold text-slate-200">{lvl.price.toLocaleString('pt-BR')}</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-bold border border-emerald-500/20">
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
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block px-1">
                🎙️ NARRAÇÃO & TRANSCRIÇÃO DE VOZ
              </span>
              <TranscriptionPanel audios={audios} date={date} />
            </div>
          )}
        </div>
      </div>

      {/* Modal Expandido v2.5 */}
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
