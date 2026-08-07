'use client';

import { useState, useEffect } from 'react';
import type { AudioRecord } from '@/lib/db/schema';
import { deleteAudioRecord, clearAudioErrors, retryAudioTranscription } from '@/features/audio/actions';

interface Segment {
  audio_timestamp: string;
  market_time?: string | null;
  title?: string | null;
  text: string;
}

export function TranscriptionPanel({ audios: initialAudios, date }: { audios: AudioRecord[]; date?: string }) {
  const [audios, setAudios] = useState<AudioRecord[]>(initialAudios);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingErrors, setClearingErrors] = useState(false);
  const [retranscribingId, setRetranscribingId] = useState<string | null>(null);

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

  async function handleRetranscribe(audioId: string) {
    setRetranscribingId(audioId);
    try {
      const res = await retryAudioTranscription(audioId);
      if (res && res.transcription) {
        setAudios(prev => prev.map(a => a.id === audioId ? { ...a, transcription: res.transcription, insights: res.insights, status: 'done' } : a));
      }
    } catch (err: any) {
      alert(`Erro ao re-transcrever áudio com timestamps: ${err.message || String(err)}`);
    } finally {
      setRetranscribingId(null);
    }
  }

  return (
    <div className="space-y-3 font-mono">
      {/* Header com contagem e botão de limpar erros */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2 uppercase tracking-wider">
          📝 TRANSCRIÇÕES & LOGS DE VOZ ({audios.length})
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
          segments?: Segment[];
        } = {};

        if (audio.insights && audio.insights !== '{}') {
          try {
            insights = JSON.parse(audio.insights);
            if (Array.isArray(insights.segments)) {
              segments = insights.segments;
            }
          } catch {}
        }

        if (segments.length === 0 && audio.transcription) {
          try {
            const parsed = JSON.parse(audio.transcription);
            if (Array.isArray(parsed.segments)) {
              segments = parsed.segments;
            }
          } catch {
            // Formato texto livre
          }
        }

        return (
          <div
            key={audio.id}
            className={`rounded-xl border p-4 space-y-3 transition-all ${
              audio.status === 'error'
                ? 'bg-rose-950/10 border-rose-500/20'
                : 'bg-[#0b1018] border-slate-800/80 shadow-xl'
            }`}
          >
            {/* Header do item */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                  audio.status === 'done' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' :
                  audio.status === 'transcribing' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                  audio.status === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                  'bg-slate-800 text-slate-400'
                }`}>
                  {audio.status === 'done' ? '✓ Transcrito' :
                   audio.status === 'transcribing' ? '⏳ Transcrevendo...' :
                   audio.status === 'error' ? '❌ Erro na transcrição' :
                   '🎙️ Gravado'}
                </span>
                {audio.durationSecs && (
                  <span className="text-xs font-mono text-slate-400">
                    ⏱️ {Math.floor(audio.durationSecs / 60)}:{(audio.durationSecs % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </div>

              {/* Botão de Re-transcrever com Timestamps & Ações */}
              <div className="flex items-center gap-2">
                {audio.status === 'done' && (
                  <button
                    type="button"
                    onClick={() => handleRetranscribe(audio.id)}
                    disabled={retranscribingId === audio.id}
                    title="Re-gerar transcrição limpa em Markdown com timestamps e destaques técnicos"
                    className="px-2.5 py-1 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/30 rounded text-[10px] font-bold font-mono transition-all uppercase flex items-center gap-1"
                  >
                    <span>🔄</span>
                    <span>{retranscribingId === audio.id ? 'FORMATANDO...' : 'FORMATAR COM TIMESTAMPS'}</span>
                  </button>
                )}

                <span className="text-[10px] text-slate-500">
                  {new Date(audio.createdAt!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>

                {confirmDeleteId === audio.id ? (
                  <div className="flex items-center gap-1 animate-in fade-in">
                    <button
                      onClick={() => handleDelete(audio.id)}
                      disabled={deletingId === audio.id}
                      className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold transition-all"
                    >
                      {deletingId === audio.id ? 'Deletando...' : 'Confirmar'}
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

            {/* Conteúdo de Transcrição ou Card de Erro */}
            {audio.status === 'error' ? (
              <div className="bg-rose-950/30 border border-rose-500/40 rounded-lg p-3 text-xs text-rose-300 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1 max-w-xl">
                    <span className="font-bold text-rose-400 block uppercase tracking-wider text-[10px]">
                      ⚠️ FALHA NO PROCESSAMENTO DA IA GEMINI
                    </span>
                    <p className="font-mono text-[11px] text-rose-300/90 break-all">
                      {audio.transcription || 'Chave API Gemini precisa ser configurada no .env.local'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRetranscribe(audio.id)}
                      disabled={retranscribingId === audio.id}
                      className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded text-xs font-bold font-mono transition-all uppercase shadow-md flex items-center gap-1.5"
                    >
                      <span>🔄</span>
                      <span>RE-TENTAR TRANSCRIÇÃO AI</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : segments.length > 0 ? (
              <div className="bg-[#070a10] rounded-lg p-3 border border-slate-800/80 space-y-2.5 max-h-96 overflow-y-auto font-mono">
                {segments.map((seg, i) => (
                  <div key={i} className="flex gap-3 group border-b border-slate-800/40 last:border-0 pb-2 last:pb-0">
                    <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
                      <span className="text-[10px] font-mono text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded font-bold border border-teal-500/20">
                        ⏱️ {seg.audio_timestamp}
                      </span>
                      {seg.market_time && seg.market_time !== 'null' && (
                        <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded font-bold border border-amber-400/20">
                          🕐 {seg.market_time}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      {seg.title && (
                        <span className="text-[11px] font-bold text-teal-300 block">
                          {seg.title}
                        </span>
                      )}
                      <p className="text-xs text-slate-200 leading-relaxed font-sans">
                        {seg.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : audio.transcription ? (
              <div className="bg-[#070a10] rounded-lg p-3 border border-slate-800/80 space-y-2">
                <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans space-y-2">
                  {audio.transcription.split('\n\n').map((paragraph, idx) => (
                    <div key={idx} className="p-2 bg-[#0b1018] rounded border border-slate-800/50">
                      <p className="text-xs text-slate-300">{paragraph}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Trades mencionados */}
            {insights.trades && insights.trades.length > 0 && (
              <div className="space-y-1.5 bg-[#070a10] p-2.5 rounded-lg border border-slate-800/80">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                  📊 TRADES MENCIONADOS NESTA NARRAÇÃO:
                </span>
                <div className="flex flex-wrap gap-2">
                  {insights.trades.map((t, i) => (
                    <span key={i} className="text-xs bg-[#0b1018] text-slate-300 px-2 py-1 rounded border border-slate-800 flex items-center gap-1.5 font-mono">
                      {t.trade_number && <span className="text-slate-500">#{t.trade_number}</span>}
                      <span className={t.side === 'compra' ? 'text-teal-400 font-bold uppercase' : 'text-rose-400 font-bold uppercase'}>
                        {t.side}
                      </span>
                      {t.time && <span className="text-amber-400">@{t.time}</span>}
                      {t.level && <span className="text-teal-300 font-bold">{t.level}</span>}
                      {t.audio_timestamp && (
                        <span className="text-[10px] font-mono text-slate-500">[{t.audio_timestamp}]</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Insights Emocionais & Observações */}
            {(insights.emotion || (insights.observations && insights.observations.length > 0)) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#070a10] p-2.5 rounded-lg border border-slate-800/80 text-xs">
                {insights.emotion && (
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-amber-400 uppercase font-bold">💭 ESTADO EMOCIONAL DEDUZIDO</span>
                    <p className="text-amber-300 font-sans">{insights.emotion}</p>
                  </div>
                )}
                {insights.observations && insights.observations.length > 0 && (
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-teal-400 uppercase font-bold">👁️ OBSERVAÇÕES CHAVE</span>
                    <div className="space-y-1">
                      {insights.observations.map((obs: string, i: number) => (
                        <span key={i} className="text-slate-300 font-sans text-xs block">• {obs}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default TranscriptionPanel;
