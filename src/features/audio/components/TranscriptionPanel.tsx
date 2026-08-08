'use client';

import { useState, useEffect } from 'react';
import type { AudioRecord } from '@/lib/db/schema';
import { deleteAudioRecord, clearAudioErrors, retryAudioTranscription } from '@/features/audio/actions';

interface Segment {
  audio_timestamp: string;
  market_time?: string | null;
  raw_text?: string | null;
  text?: string | null;
  ai_analysis?: string | null;
  title?: string | null;
}

export function TranscriptionPanel({ audios: initialAudios, date }: { audios: AudioRecord[]; date?: string }) {
  const [audios, setAudios] = useState<AudioRecord[]>(initialAudios);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingErrors, setClearingErrors] = useState(false);
  const [retranscribingId, setRetranscribingId] = useState<string | null>(null);
  const [selectedAiAnalysis, setSelectedAiAnalysis] = useState<{
    summary?: string;
    segments?: Segment[];
    trades?: any[];
    emotion?: string;
  } | null>(null);

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
      alert(`Erro ao re-transcrever áudio: ${err.message || String(err)}`);
    } finally {
      setRetranscribingId(null);
    }
  }

  return (
    <div className="space-y-4 font-mono">
      {/* Header com contagem e botão de limpar erros */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2 uppercase tracking-wider">
          📝 TRANSCRIÇÕES DE VOZ & LINHA DO TEMPO DA IA ({audios.length})
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
          aiSummary?: string;
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
            const firstBrace = audio.transcription.indexOf('{');
            const lastBrace = audio.transcription.lastIndexOf('}');
            const jsonText = (firstBrace !== -1 && lastBrace > firstBrace)
              ? audio.transcription.substring(firstBrace, lastBrace + 1)
              : audio.transcription;
            const parsed = JSON.parse(jsonText);
            if (Array.isArray(parsed.segments)) {
              segments = parsed.segments;
            }
            if (parsed.ai_summary && !insights.aiSummary) {
              insights.aiSummary = parsed.ai_summary;
            }
            if (parsed.trades_mentioned && (!insights.trades || insights.trades.length === 0)) {
              insights.trades = parsed.trades_mentioned;
            }
            if (parsed.emotional_state && !insights.emotion) {
              insights.emotion = parsed.emotional_state;
            }
          } catch {
            // Formato texto livre
          }
        }

        const isProcessing = audio.status === 'transcribing' || retranscribingId === audio.id;

        return (
          <div
            key={audio.id}
            className={`rounded-xl border p-4 space-y-4 transition-all ${
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
                  isProcessing ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse' :
                  audio.status === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                  'bg-slate-800 text-slate-400'
                }`}>
                  {audio.status === 'done' ? '✓ Transcrição Dupla Pronta' :
                   isProcessing ? '⏳ Processando Áudio API...' :
                   audio.status === 'error' ? '❌ Erro na transcrição' :
                   '🎙️ Gravado'}
                </span>

                {audio.durationSecs && (
                  <span className="text-xs font-mono text-slate-400">
                    ⏱️ {Math.floor(audio.durationSecs / 60)}:{(audio.durationSecs % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-2">
                {audio.status === 'done' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedAiAnalysis({
                        summary: insights.aiSummary,
                        segments: segments.filter(s => s.ai_analysis),
                        trades: insights.trades,
                        emotion: insights.emotion,
                      })}
                      className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold font-mono transition-all uppercase flex items-center gap-1"
                    >
                      <span>💡</span>
                      <span>VER ANÁLISE IA (POP-UP)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRetranscribe(audio.id)}
                      disabled={isProcessing}
                      title="Re-executar a transcrição verbatim natural do áudio a partir de 00:00"
                      className="px-2.5 py-1 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/30 rounded text-[10px] font-bold font-mono transition-all uppercase flex items-center gap-1 disabled:opacity-50"
                    >
                      <span>🔄</span>
                      <span>RE-TRANSCREVER</span>
                    </button>
                  </>
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
                    title="Deletar áudio / log"
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors text-xs font-bold"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>

            {/* Barra de Progresso Visual de Processamento da API */}
            {isProcessing && (
              <div className="bg-[#070a10] border border-teal-500/30 rounded-lg p-3 space-y-2 font-mono">
                <div className="flex items-center justify-between text-[10px] text-teal-400 font-bold">
                  <span className="flex items-center gap-1.5">
                    <span className="animate-spin">⏳</span>
                    <span>TRANSCREVENDO E CALCULANDO METRICAS COM GEMINI 2.5 FLASH...</span>
                  </span>
                  <span>STATUS: SEGURA & PERSISTIDA</span>
                </div>

                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-teal-500 h-full w-2/3 animate-pulse rounded-full" />
                </div>

                <p className="text-[10px] text-slate-500 font-sans">
                  Sua gravação de áudio está sendo processada de forma segura na nuvem Gemini. Você pode dar refresh (F5) livremente na página que a gravação não será sobrescrita.
                </p>
              </div>
            )}

            {/* PAINEL LADO A LADO (2 COLUNAS): FALA NATURAL (ESQ) vs LINHA DO TEMPO IA (DIR) */}
            {!isProcessing && segments.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* COLUNA 1: FALA NATURAL FIEL EM 1ª PESSOA */}
                <div className="bg-[#070a10] rounded-xl p-3 border border-teal-500/30 space-y-3 font-mono">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-[10px] text-teal-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <span>🗣️</span>
                      <span>SUA FALA NATURAL FIEL (INÍCIO EM 00:00)</span>
                    </span>
                    <span className="text-[9px] text-slate-500">1ª Pessoa Verbatim</span>
                  </div>

                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                    {segments.map((seg, i) => (
                      <div key={i} className="flex gap-2.5 border-b border-slate-800/40 last:border-0 pb-2 last:pb-0">
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
                        <p className="text-xs text-slate-200 leading-relaxed font-sans flex-1">
                          {seg.raw_text || seg.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* COLUNA 2: LINHA DO TEMPO & ANÁLISE TÉCNICA DA IA */}
                <div className="bg-[#070a10] rounded-xl p-3 border border-amber-500/30 space-y-3 font-mono">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <span>🤖</span>
                      <span>LINHA DO TEMPO & ANÁLISE TÉCNICA DA IA</span>
                    </span>
                    <span className="text-[9px] text-amber-400/80 font-bold">Síntese Profissional</span>
                  </div>

                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                    {segments.map((seg, i) => (
                      <div key={i} className="flex gap-2.5 border-b border-slate-800/40 last:border-0 pb-2.5 last:pb-0">
                        <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
                          <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-bold border border-amber-500/20">
                            ⏱️ {seg.audio_timestamp}
                          </span>
                          {seg.market_time && seg.market_time !== 'null' && (
                            <span className="text-[10px] font-mono text-teal-400 bg-teal-400/10 px-1.5 py-0.5 rounded font-bold border border-teal-400/20">
                              🕐 {seg.market_time}
                            </span>
                          )}
                        </div>

                        <div className="flex-1 space-y-1">
                          {seg.title && (
                            <span className="text-[11px] font-bold text-amber-300 block">
                              {seg.title}
                            </span>
                          )}
                          <p className="text-xs text-amber-100/90 leading-relaxed font-sans">
                            {seg.ai_analysis || seg.text}
                          </p>
                        </div>
                      </div>
                    ))}

                    {/* Resumo Executivo da IA ao final da linha do tempo */}
                    {insights.aiSummary && (
                      <div className="mt-3 p-2.5 bg-[#0b1018] rounded-lg border border-amber-500/30 space-y-1">
                        <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider block">
                          📌 RESUMO TÉCNICO EXECUTIVO DA SESSÃO:
                        </span>
                        <p className="text-xs text-slate-300 font-sans leading-relaxed">
                          {insights.aiSummary}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Fallback de Transcrição Texto Simples */}
            {!isProcessing && segments.length === 0 && audio.transcription && (
              <div className="bg-[#070a10] rounded-lg p-3 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-1 text-[10px] text-teal-400 font-bold uppercase">
                  <span>🗣️ TRANSCRIÇÃO DA GRAVAÇÃO</span>
                </div>
                <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans space-y-2">
                  {audio.transcription.split('\n\n').map((paragraph, idx) => (
                    <div key={idx} className="p-2 bg-[#0b1018] rounded border border-slate-800/50">
                      <p className="text-xs text-slate-300">{paragraph}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trades mencionados */}
            {!isProcessing && insights.trades && insights.trades.length > 0 && (
              <div className="space-y-1.5 bg-[#070a10] p-2.5 rounded-lg border border-slate-800/80">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                  📊 TRADES DETECTADOS NESTA GRAVAÇÃO:
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
          </div>
        );
      })}

      {/* POP-UP / MODAL DA ANÁLISE PROFISSIONAL DA IA */}
      {selectedAiAnalysis && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedAiAnalysis(null)}
        >
          <div
            className="relative max-w-3xl w-full max-h-[85vh] bg-[#0b1018] border border-amber-500/40 rounded-xl overflow-hidden shadow-2xl flex flex-col font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Pop-up */}
            <div className="p-3.5 bg-[#070a10] border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-base">🤖</span>
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  ANÁLISE & SÍNTESE TÉCNICA DA IA (SOBRE A SUA FALA)
                </span>
              </div>
              <button
                onClick={() => setSelectedAiAnalysis(null)}
                className="text-slate-400 hover:text-slate-200 text-lg px-2"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo do Pop-up */}
            <div className="p-4 overflow-y-auto space-y-4 font-sans text-xs">
              {selectedAiAnalysis.summary && (
                <div className="bg-[#070a10] p-3 rounded-lg border border-amber-500/20 space-y-1.5">
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider font-mono block">
                    📌 RESUMO EXECUTIVO DA IA SÊNIOR
                  </span>
                  <p className="text-slate-200 leading-relaxed font-sans text-xs">
                    {selectedAiAnalysis.summary}
                  </p>
                </div>
              )}

              {selectedAiAnalysis.segments && selectedAiAnalysis.segments.length > 0 && (
                <div className="space-y-3 font-mono">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                    🔍 DETALHAMENTO DOS TRECHOS SELECIONADOS:
                  </span>
                  {selectedAiAnalysis.segments.map((seg, idx) => (
                    <div key={idx} className="bg-[#070a10] p-3 rounded-lg border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-[10px] text-teal-400 border-b border-slate-800/80 pb-1 font-mono">
                        <span>⏱️ TEMPO NO ÁUDIO: {seg.audio_timestamp}</span>
                        {seg.market_time && <span>🕐 PREGÃO: {seg.market_time}</span>}
                      </div>

                      {seg.raw_text && (
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-slate-500 uppercase font-bold block">FALA NATURAL DO TRADER:</span>
                          <p className="text-slate-300 font-sans italic">"{seg.raw_text}"</p>
                        </div>
                      )}

                      {seg.ai_analysis && (
                        <div className="space-y-0.5 pt-1 border-t border-slate-800/50">
                          <span className="text-[9px] text-amber-400 uppercase font-bold block">💡 ANÁLISE TÉCNICA E SÍNTESE DA IA:</span>
                          <p className="text-amber-200 font-sans text-xs leading-relaxed">{seg.ai_analysis}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TranscriptionPanel;
