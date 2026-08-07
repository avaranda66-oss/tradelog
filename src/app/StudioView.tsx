'use client';

import { useState } from 'react';
import type { TradingDay, Trade, AudioRecord, keyLevels } from '@/lib/db/schema';
import { MediaUploadCenterStudio } from '@/features/dashboard/components/MediaUploadCenterStudio';
import { PreMarketForm } from '@/features/dashboard/components/PreMarketForm';
import { RetrospectiveForm } from '@/features/dashboard/components/RetrospectiveForm';
import { KeyLevelsTable } from '@/features/dashboard/components/KeyLevelsTable';
import { TranscriptionPanel } from '@/features/audio/components/TranscriptionPanel';
import { FarolMarketCard } from '@/features/dashboard/components/FarolMarketCard';
import { JournalProgressWidget } from '@/features/dashboard/components/JournalProgressWidget';
import Link from 'next/link';

interface StudioViewProps {
  day: TradingDay;
  date: string;
  tradeCount: number;
  hasCsv: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  dayAudios: AudioRecord[];
  dayLevels: (typeof keyLevels.$inferSelect)[];
  dayTrades?: Trade[];
  allTrades?: Trade[];
  allAudios?: AudioRecord[];
  imageCount: number;
  historyDays?: TradingDay[];
}

export function StudioView({
  day,
  date,
  tradeCount,
  hasCsv,
  hasVideo,
  hasAudio,
  dayAudios,
  dayLevels,
  dayTrades = [],
  allTrades = [],
  allAudios = [],
  imageCount,
  historyDays = [],
}: StudioViewProps) {
  const hasTranscription = dayAudios.some(a => a.status === 'done');
  const totalReais = day.totalReais || 0;
  const totalPoints = day.totalPoints || 0;
  const winRate = day.tradesRight && tradeCount > 0 ? ((day.tradesRight / tradeCount) * 100).toFixed(0) : '0';

  return (
    <div className="max-w-[1440px] mx-auto space-y-5 pb-16 animate-in fade-in">
      {/* Widget de Gamificação & Foguinho */}
      <JournalProgressWidget
        day={day}
        trades={dayTrades}
        allTrades={allTrades}
        allAudios={allAudios}
        levels={dayLevels}
        audios={dayAudios}
        imagesCount={imageCount}
        historyDays={historyDays}
      />

      {/* Seção 1: Central de Upload de Mídias */}
      <MediaUploadCenterStudio date={date} />

      {/* Seção 2: Status do Pregão */}
      <div className="bg-[#0d131f] border border-slate-800/80 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <span>⚙️</span> 2. STATUS DO PREGÃO
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-mono font-medium transition-all ${
              hasCsv ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-950/60 text-slate-500 border-slate-800'
            }`}>
              <span>{hasCsv ? '✅' : '⏳'}</span>
              <span>CSV: {tradeCount > 0 ? `${tradeCount} TRADES` : 'PENDENTE'}</span>
            </div>

            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-mono font-medium transition-all ${
              hasVideo ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-slate-950/60 text-slate-500 border-slate-800'
            }`}>
              <span>📹</span>
              <span>VÍDEO OBS {hasVideo ? 'Processado' : 'Pendente'}</span>
            </div>

            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-mono font-medium transition-all ${
              hasAudio ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' : 'bg-slate-950/60 text-slate-500 border-slate-800'
            }`}>
              <span>🎙️</span>
              <span>ÁUDIO: {hasAudio ? 'MP3 Extraído' : 'Pendente'}</span>
            </div>

            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-mono font-medium transition-all ${
              hasTranscription ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' : 'bg-slate-950/60 text-slate-500 border-slate-800'
            }`}>
              <span>📑</span>
              <span>TRANSCRIÇÃO {hasTranscription ? 'Concluída' : 'Pendente'}</span>
            </div>

            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-mono font-medium transition-all ${
              imageCount > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-slate-950/60 text-slate-500 border-slate-800'
            }`}>
              <span>🖼️</span>
              <span>PRINTS: {imageCount > 0 ? `${imageCount} IMAGENS` : '0 IMAGENS'}</span>
            </div>

            {hasCsv && (
              <Link
                href={`/operacoes?date=${date}`}
                className="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <span>📓 Ver Operações ({tradeCount})</span>
                <span>→</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Seção 3: Split View — Pré-Market + Retrospectiva */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div className="space-y-5">
          <PreMarketForm key={day.id} day={day} />
          <FarolMarketCard key={day.id} day={day} />
          <KeyLevelsTable key={day.id} day={day} initialLevels={dayLevels} />
        </div>

        <div className="space-y-5">
          <RetrospectiveForm key={day.id} day={day} />
          {dayAudios.length > 0 && <TranscriptionPanel key={day.id} audios={dayAudios} date={date} />}

          {/* Resumo da Sessão */}
          <div className="bg-[#0d131f] border border-slate-800/80 rounded-2xl p-4 space-y-2 shadow-xl">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">
              RESUMO DA SESSÃO
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Trades</span>
                <span className="text-base font-bold font-mono text-slate-100">{tradeCount}</span>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Pontos</span>
                <span className={`text-base font-bold font-mono ${totalPoints >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalPoints > 0 ? '+' : ''}{totalPoints}
                </span>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Resultado</span>
                <span className={`text-base font-bold font-mono ${totalReais >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  R$ {totalReais > 0 ? '+' : ''}{totalReais.toFixed(2)}
                </span>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Assertividade</span>
                <span className="text-base font-bold font-mono text-purple-400">{winRate}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
