'use client';

import { useState } from 'react';
import type { AudioRecord, Trade } from '@/lib/db/schema';
import { AudioRecorder } from '@/features/audio/components/AudioRecorder';
import { TranscriptionPanel } from '@/features/audio/components/TranscriptionPanel';
import { useRouter } from 'next/navigation';
import { IconMic, IconJournal } from '@/components/ui/icons';

export function AudioStudioClientV2({
  date,
  audios,
  trades,
}: {
  date: string;
  audios: AudioRecord[];
  trades: Trade[];
}) {
  const router = useRouter();
  const [association, setAssociation] = useState<'day' | string>('day');
  const [activeTab, setActiveTab] = useState<'gravar' | 'historico'>('gravar');

  return (
    <div className="space-y-5 font-mono">
      {/* Abas Superiores */}
      <div className="flex border-b border-slate-800/80 bg-[#070a10] rounded-md p-1 gap-1 max-w-md text-xs">
        <button
          onClick={() => setActiveTab('gravar')}
          type="button"
          className={`flex-1 py-1.5 rounded font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'gravar'
              ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <IconMic className="text-teal-400" />
          <span>GRAVAR NARRAÇÃO</span>
        </button>

        <button
          onClick={() => setActiveTab('historico')}
          type="button"
          className={`flex-1 py-1.5 rounded font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'historico'
              ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <IconJournal className="text-teal-400" />
          <span>TRANSCRIÇÕES ({audios.length})</span>
        </button>
      </div>

      {activeTab === 'gravar' && (
        <div className="space-y-4">
          {/* Seletor de Associação */}
          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-2">
            <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block">
              ASSOCIAR NARRAÇÃO A:
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setAssociation('day')}
                type="button"
                className={`px-3 py-1 rounded-md text-xs font-bold border transition-all ${
                  association === 'day'
                    ? 'bg-teal-500/15 text-teal-400 border-teal-500/30'
                    : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:text-slate-300'
                }`}
              >
                DIA INTEIRO ({date})
              </button>

              {trades.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setAssociation(t.id)}
                  type="button"
                  className={`px-3 py-1 rounded-md text-xs font-bold border transition-all ${
                    association === t.id
                      ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                      : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:text-slate-300'
                  }`}
                >
                  TRADE #{t.tradeNumber} ({t.side === 'C' ? 'COMPRA' : 'VENDA'})
                </button>
              ))}
            </div>
          </div>

          {/* Componente AudioRecorder */}
          <AudioRecorder
            date={date}
            onRecorded={() => router.refresh()}
          />
        </div>
      )}

      {/* Painel de Transcrições */}
      <TranscriptionPanel audios={audios} date={date} />
    </div>
  );
}

export default AudioStudioClientV2;
