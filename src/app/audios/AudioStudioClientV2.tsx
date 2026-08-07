'use client';

import { useState } from 'react';
import type { AudioRecord, Trade } from '@/lib/db/schema';
import { AudioRecorder } from '@/features/audio/components/AudioRecorder';
import { TranscriptionPanel } from '@/features/audio/components/TranscriptionPanel';
import { useRouter } from 'next/navigation';

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
    <div className="space-y-6">
      {/* Abas Superiores */}
      <div className="flex border-b border-slate-800 bg-[#0d131f] rounded-xl p-1 gap-1 max-w-md">
        <button
          onClick={() => setActiveTab('gravar')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'gravar'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          🎙️ Gravar Narração
        </button>
        <button
          onClick={() => setActiveTab('historico')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'historico'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          📝 Transcrições ({audios.length})
        </button>
      </div>

      {activeTab === 'gravar' && (
        <div className="space-y-4">
          {/* Seletor de Associação (Dia inteiro vs Trade específico) */}
          <div className="bg-[#0d131f] border border-slate-800 rounded-xl p-4 space-y-2">
            <label className="text-xs text-slate-400 block font-semibold">Associar narração a:</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAssociation('day')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  association === 'day'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                Dia Inteiro ({date})
              </button>

              {trades.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setAssociation(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    association === t.id
                      ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Trade #{t.tradeNumber} ({t.side === 'C' ? 'Compra' : 'Venda'})
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
