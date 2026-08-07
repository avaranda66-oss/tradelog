'use client';

import { useState, useEffect } from 'react';
import type { AudioRecord } from '@/lib/db/schema';
import { deleteAudioRecord, clearAudioErrors, retryAudioTranscription } from '@/features/audio/actions';

interface Segment {
  audio_timestamp: string;
  market_time?: string | null;
  text: string;
}

export function TranscriptionPanel({ audios: initialAudios, date }: { audios: AudioRecord[]; date?: string }) {
  const [audios, setAudios] = useState<AudioRecord[]>(initialAudios);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingErrors, setClearingErrors] = useState(false);

  useEffect(() => {
    setAudios(initialAudios);
  }, [initialAudios]);

  if (audios.length === 0) return null;

  const errorCount = audios.filter(a => a.status === 'error').length;

  async function handleDelete(audioId: string) {
    setDeletingId(audioId);
    setConfirmDeleteId(null);
    setAudios(prev => prev.filter(a => a.id !== audioId));

    try {
      await deleteAudioRecord(audioId);
    } catch (err) {
      console.error('Erro ao deletar transcrição:', err);
      setAudios(initialAudios);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearErrors() {
    if (!date) return;
    setClearingErrors(true);
    setAudios(prev => prev.filter(a => a.status !== 'error'));

    try {
      await clearAudioErrors(date);
    } catch (err) {
      console.error('Erro ao limpar erros:', err);
      setAudios(initialAudios);
    } finally {
      setClearingErrors(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Header com contagem e botão de limpar erros */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          📝 Transcrições & Logs ({audios.length})
        </h3>

        {errorCount > 0 && (
          <button
            onClick={handleClearErrors}
            disabled={clearingErrors}
            className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
          >
            🧹 {clearingErrors ? 'Limpando...' : `Limpar ${errorCount} erro(s)`}
          </button>
        )}
      </div>

      {/* Lista de Transcrições/Áudios */}
      {audios.map((audio) => {
        let segments: Segment[] = [];
        let insights: {
          trades?: { trade_number?: number; side?: string; time?: string; level?: string; audio_timestamp?: string }[];
          emotion?: string;
          observations?: string[];
        } = {};

        if (audio.insights && audio.insights !== '{}') {
          try { insights = JSON.parse(audio.insights); } catch {}
        }

        if (audio.transcription) {
          try {
            const parsed = JSON.parse(audio.transcription);
            if (Array.isArray(parsed.segments)) {
              segments = parsed.segments;
            }
          } catch {
            // Formato legado
          }
        }

        return (
          <div
            key={audio.id}
            className={`rounded-xl border p-4 space-y-3 transition-all ${
              audio.status === 'error'
                ? 'bg-rose-950/10 border-rose-500/20'
                : 'bg-slate-900/50 border-slate-800/50'
            }`}
          >
            {/* Header do item */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  audio.status === 'done' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  audio.status === 'transcribing' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                  audio.status === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                  'bg-slate-700 text-slate-400'
                }`}>
                  {audio.status === 'done' ? '✅ Transcrito' :
                   audio.status === 'transcribing' ? '⏳ Transcrevendo...' :
                   audio.status === 'error' ? '❌ Erro na transcrição' :
                   '🎙️ Gravado'}
                </span>
                {audio.durationSecs && (
                  <span className="text-xs font-mono text-slate-500">
                    {Math.floor(audio.durationSecs / 60)}:{(audio.durationSecs % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </div>

              {/* Ações e Confirmação de exclusão */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">
                  {new Date(audio.createdAt!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>

                {confirmDeleteId === audio.id ? (
                  <div className="flex items-center gap-1 animate-in fade-in">
                    <button
                      onClick={() => handleDelete(audio.id)}
                      disabled={deletingId === audio.id}
                      className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold transition-all"
                    >
                      {deletingId === audio.id ? 'Deletando...' : 'Confirmar Deletar'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-1.5 text-slate-400 hover:text-slate-200 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(audio.id)}
                    title="Deletar transcrição / log"
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors text-xs font-bold"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>

            {/* Conteúdo de Transcrição */}
            {segments.length > 0 ? (
              <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/30 space-y-2 max-h-80 overflow-y-auto">
                {segments.map((seg, i) => (
                  <div key={i} className="flex gap-3 group">
                    <div className="shrink-0 flex flex-col items-end gap-0.5 pt-0.5">
                      <span className="text-[10px] font-mono text-cyan-500/70 bg-cyan-500/5 px-1.5 py-0.5 rounded">
                        {seg.audio_timestamp}
                      </span>
                      {seg.market_time && seg.market_time !== 'null' && (
                        <span className="text-[10px] font-mono text-amber-400/70 bg-amber-400/5 px-1.5 py-0.5 rounded">
                          🕐 {seg.market_time}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed flex-1">
                      {seg.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : audio.transcription ? (
              <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/30">
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {audio.transcription}
                </p>
              </div>
            ) : audio.status === 'error' ? (
              <div className="bg-rose-950/20 border border-rose-500/20 rounded-lg p-3 text-xs text-rose-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span>⚠️ Falha na transcrição AI: {audio.transcription || 'Chave API Gemini precisa ser configurada no .env.local'}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await retryAudioTranscription(audio.id);
                        } catch (err: any) {
                          alert(`Erro ao reprocessar áudio: ${err.message || String(err)}`);
                        }
                      }}
                      className="px-2 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 rounded text-[10px] font-bold font-mono transition-all"
                    >
                      🔄 TENTAR NOVAMENTE
                    </button>
                    <button
                      onClick={() => handleDelete(audio.id)}
                      className="underline text-rose-400 hover:text-rose-200 text-[10px]"
                    >
                      Excluir este log
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Trades mencionados */}
            {insights.trades && insights.trades.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-slate-500">📊 Trades mencionados:</span>
                <div className="flex flex-wrap gap-2">
                  {insights.trades.map((t, i) => (
                    <span key={i} className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded flex items-center gap-1.5">
                      {t.trade_number && <span className="text-slate-500">#{t.trade_number}</span>}
                      <span className={t.side === 'compra' ? 'text-emerald-400' : 'text-rose-400'}>
                        {t.side}
                      </span>
                      {t.time && <span className="text-slate-500">{t.time}</span>}
                      {t.level && <span className="text-cyan-400">{t.level}</span>}
                      {t.audio_timestamp && (
                        <span className="text-[10px] font-mono text-cyan-500/50">@{t.audio_timestamp}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Insights */}
            <div className="space-y-2">
              {insights.emotion && (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-slate-500 w-24 shrink-0">💭 Emocional:</span>
                  <span className="text-xs text-amber-400">{insights.emotion}</span>
                </div>
              )}
              {insights.observations && insights.observations.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-slate-500 w-24 shrink-0">👁️ Observações:</span>
                  <div className="space-y-1">
                    {insights.observations.map((obs: string, i: number) => (
                      <span key={i} className="text-xs text-cyan-400 block">• {obs}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
