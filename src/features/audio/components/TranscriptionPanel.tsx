'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AudioRecord } from '@/lib/db/schema';
import { deleteAudioRecord, clearAudioErrors, retryAudioTranscription, reSyncAudioTradeConfluence } from '@/features/audio/actions';
import { extractAndTranscribeVideoAudioAction } from '@/features/video/actions';

interface Segment {
  audio_timestamp: string;
  market_time?: string | null;
  raw_text?: string | null;
  text?: string | null;
  ai_analysis?: string | null;
  title?: string | null;
}

export function TranscriptionPanel({
  audios: initialAudios,
  date,
  hasVideo = false,
}: {
  audios: AudioRecord[];
  date?: string;
  hasVideo?: boolean;
}) {
  const router = useRouter();
  const [audios, setAudios] = useState<AudioRecord[]>(initialAudios);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingErrors, setClearingErrors] = useState(false);
  const [retranscribingId, setRetranscribingId] = useState<string | null>(null);
  const [syncingConfluenceId, setSyncingConfluenceId] = useState<string | null>(null);
  const [selectedAiAnalysis, setSelectedAiAnalysis] = useState<{
    summary?: string;
    segments?: Segment[];
    trades?: any[];
    emotion?: string;
  } | null>(null);

  const [isProcessingVideoAudio, setIsProcessingVideoAudio] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  async function handleProcessVideoAudio() {
    if (!date) return;
    setIsProcessingVideoAudio(true);
    setProcessError(null);
    try {
      const res = await extractAndTranscribeVideoAudioAction(date);
      if (!res.success) {
        setProcessError((res as any).error || 'Falha ao processar vídeo');
      } else {
        router.refresh();
      }
    } catch (err: any) {
      setProcessError(err?.message || 'Erro inesperado ao processar');
    } finally {
      setIsProcessingVideoAudio(false);
    }
  }

  async function handleReSyncConfluence(audioId: string) {
    setSyncingConfluenceId(audioId);
    try {
      const res = await reSyncAudioTradeConfluence(audioId);
      if (res && res.insights) {
        setAudios(prev => prev.map(a => a.id === audioId ? { ...a, insights: res.insights } : a));
      }
    } catch (err: any) {
      alert(`Erro ao sincronizar confluência: ${err.message || String(err)}`);
    } finally {
      setSyncingConfluenceId(null);
    }
  }

  if (audios.length === 0) {
    return (
      <div className="bg-[#0b1018] rounded-xl p-4 border border-slate-800 space-y-3 font-mono">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span>🎙️</span>
            <span>TRANSCRIÇÕES & LINHA DO TEMPO DA IA</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Nenhuma gravação</span>
        </div>

        <p className="text-xs text-slate-400 font-sans">
          Nenhuma narração em áudio foi gravada para este dia ainda. Se houver um vídeo gravado do OBS, você pode extrair e transcrever o áudio automaticamente clicando no botão abaixo:
        </p>

        {processError && (
          <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded text-rose-300 text-xs font-mono">
            ⚠️ {processError}
          </div>
        )}

        <button
          type="button"
          onClick={handleProcessVideoAudio}
          disabled={isProcessingVideoAudio}
          className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
        >
          {isProcessingVideoAudio ? (
            <>
              <span className="animate-spin">⏳</span>
              <span>EXTRAINDO ÁUDIO DO VÍDEO & TRANSCREVENDO COM GEMINI AI...</span>
            </>
          ) : (
            <>
              <span>🎙️</span>
              <span>PROCESSAR ÁUDIO DO VÍDEO & TRANSCREVER COM GEMINI AI AGORA</span>
            </>
          )}
        </button>
      </div>
    );
  }

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
            className="text-[10px] text-rose-400 hover:text-rose-300 font-bold bg-rose-500/10 border border-rose-500/30 px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>🗑️</span>
            <span>{clearingErrors ? 'Limpando...' : `Limpar ${errorCount} erro(s)`}</span>
          </button>
        )}
      </div>

      {/* Lista de Áudios / Transcrições */}
      {audios.map((audio) => {
        let insights: {
          trades?: any[];
          confluenceTrades?: any[];
          confluenceSummary?: string;
          emotion?: string;
          observations?: string[];
          segments?: Segment[];
          aiSummary?: string;
          startMarketTime?: string;
        } = {};

        try {
          if (audio.insights) {
            insights = JSON.parse(audio.insights);
          }
        } catch {}

        const segments: Segment[] = insights.segments || [];
        const confluenceTrades: any[] = insights.confluenceTrades || [];
        const fallbackTrades: any[] = insights.trades || [];
        const isProcessing = audio.status === 'transcribing' || retranscribingId === audio.id;

        return (
          <div
            key={audio.id}
            className={`rounded-2xl p-4 border transition-all duration-300 space-y-4 ${
              audio.status === 'error'
                ? 'bg-rose-950/20 border-rose-500/40 shadow-lg shadow-rose-950/20'
                : isProcessing
                ? 'bg-purple-950/20 border-purple-500/40 animate-pulse'
                : 'bg-[#05080e] border-slate-800 shadow-xl'
            }`}
          >
            {/* Header do Áudio com Status e Metadados */}
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base">🎙️</span>
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  {audio.filePath.includes('.mp4') || audio.filePath.includes('.mkv') || hasVideo
                    ? 'Áudio do Vídeo OBS'
                    : 'Gravação de Voz'}
                </span>

                <span
                  className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${
                    audio.status === 'done'
                      ? 'bg-teal-500/10 text-teal-400 border-teal-500/30'
                      : isProcessing
                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                      : audio.status === 'recorded'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}
                >
                  {isProcessing
                    ? 'Transcrevendo...'
                    : audio.status === 'done'
                    ? 'IA Concluída'
                    : audio.status === 'recorded'
                    ? 'Pronto p/ Transcrever'
                    : 'Erro'}
                </span>

                {insights.emotion && (
                  <span className="text-[9px] bg-slate-800/80 text-amber-300 px-2 py-0.5 rounded border border-amber-500/20">
                    🎭 {insights.emotion}
                  </span>
                )}

                {insights.startMarketTime && (
                  <span className="text-[9px] bg-teal-500/10 text-teal-300 px-2 py-0.5 rounded border border-teal-500/20">
                    🕐 Pregão às {insights.startMarketTime}
                  </span>
                )}

                {audio.durationSecs && (
                  <span className="text-xs font-mono text-slate-400">
                    ⏱️ {Math.floor(audio.durationSecs / 60)}:{(audio.durationSecs % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-2">
                {audio.status === 'done' && (
                  <button
                    type="button"
                    onClick={() => setSelectedAiAnalysis({
                      summary: insights.aiSummary,
                      segments: segments.filter(s => s.ai_analysis),
                      trades: confluenceTrades.length > 0 ? confluenceTrades : insights.trades,
                      emotion: insights.emotion,
                    })}
                    className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold font-mono transition-all uppercase flex items-center gap-1 cursor-pointer"
                  >
                    <span>💡</span>
                    <span>VER ANÁLISE IA (POP-UP)</span>
                  </button>
                )}

                {!isProcessing && (
                  <button
                    type="button"
                    onClick={() => handleRetranscribe(audio.id)}
                    disabled={isProcessing}
                    title="Processar / Re-executar a transcrição com Gemini AI"
                    className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono transition-all uppercase flex items-center gap-1 disabled:opacity-50 cursor-pointer ${
                      audio.status === 'error'
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md animate-pulse'
                        : audio.status === 'recorded'
                        ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md'
                        : 'bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/30'
                    }`}
                  >
                    <span>🔄</span>
                    <span>{audio.status === 'error' ? 'TENTAR NOVAMENTE' : audio.status === 'recorded' ? 'TRANSCREVER AGORA' : 'RE-TRANSCREVER'}</span>
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
                      className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold transition-all cursor-pointer"
                    >
                      {deletingId === audio.id ? 'Deletando...' : 'Confirmar'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-1.5 text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(audio.id)}
                    title="Deletar áudio / log"
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors text-xs font-bold cursor-pointer"
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
                    <span>TRANSCREVENDO E CONFLUENCIANDO TRADES COM GEMINI 2.5 FLASH...</span>
                  </span>
                  <span>STATUS: PROCESSANDO</span>
                </div>

                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-teal-500 h-full w-2/3 animate-pulse rounded-full" />
                </div>
              </div>
            )}

            {/* PAINEL DE CONFLUÊNCIA DE TRADES: PROFIT PRO (CSV) × NARRAÇÃO DE VOZ (IA) */}
            {!isProcessing && (confluenceTrades.length > 0 || fallbackTrades.length > 0) && (
              <div className="space-y-3 bg-[#070a10] p-3.5 rounded-xl border border-teal-500/30 font-mono">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">📊</span>
                    <span className="text-[11px] font-bold text-teal-300 uppercase tracking-wider">
                      CONFLUÊNCIA DE TRADES: PROFIT PRO (CSV) × NARRAÇÃO DE VOZ ({confluenceTrades.length || fallbackTrades.length})
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleReSyncConfluence(audio.id)}
                    disabled={syncingConfluenceId === audio.id}
                    className="px-2.5 py-1 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span>🔄</span>
                    <span>{syncingConfluenceId === audio.id ? 'ANALISANDO COM GEMINI...' : 'RE-SINCRONIZAR COM CSV'}</span>
                  </button>
                </div>

                {insights.confluenceSummary && (
                  <div className="p-3 bg-[#0b1018] rounded-lg border border-teal-500/20 text-xs text-slate-300 font-sans leading-relaxed">
                    <span className="font-bold font-mono text-[10px] text-teal-400 block mb-1 uppercase tracking-wider">
                      🧠 SÍNTESE DA AUDITORIA OPERACIONAL & COMPORTAMENTAL (IA SÊNIOR):
                    </span>
                    {insights.confluenceSummary}
                  </div>
                )}

                <div className="space-y-3">
                  {(confluenceTrades.length > 0 ? confluenceTrades : fallbackTrades).map((t: any, i: number) => {
                    const isBuy = t.side === 'COMPRA' || t.side === 'compra' || t.side === 'C';
                    const isProfit = (t.points ?? 0) >= 0;
                    const statusConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
                      realtime: { label: '🟢 🎙️ TEMPO REAL (DURANTE O TRADE)', bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/30' },
                      delayed: { label: `🟡 ⏱️ NARRADO COM ATRASO${t.latency_minutes ? ` (+${t.latency_minutes}m)` : ''}`, bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/30' },
                      retrospective: { label: '🔵 🔄 RETROSPECTIVA / PÓS-TRADE', bg: 'bg-cyan-500/10', text: 'text-cyan-300', border: 'border-cyan-500/30' },
                      silent: { label: '🔴 🔇 NÃO NARRADO NO ÁUDIO', bg: 'bg-rose-500/10', text: 'text-rose-300', border: 'border-rose-500/30' },
                    };
                    const status = statusConfig[t.narration_status] || {
                      label: t.narration_status ? `🎙️ ${t.narration_status}` : '🎙️ DETECTADO NO ÁUDIO',
                      bg: 'bg-slate-800',
                      text: 'text-slate-300',
                      border: 'border-slate-700',
                    };

                    return (
                      <div
                        key={i}
                        className={`p-3.5 rounded-xl border ${
                          isProfit ? 'border-teal-500/30 bg-[#090e17]' : 'border-rose-500/30 bg-[#12090b]'
                        } space-y-3`}
                      >
                        {/* Header do Card do Trade */}
                        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800/60 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-bold text-xs">
                              #{t.trade_number || i + 1}
                            </span>
                            <span className={`px-2 py-0.5 rounded font-bold text-xs ${isBuy ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                              {isBuy ? '🟢 COMPRA' : '🔴 VENDA'} {t.instrument || 'WINFUT'}
                            </span>
                            {t.open_time && (
                              <span className="text-[11px] text-slate-400">
                                🕐 {t.open_time} ➔ {t.close_time || '—'}
                              </span>
                            )}
                            {t.entry_price && (
                              <span className="text-[11px] text-slate-400">
                                ({t.entry_price} ➔ {t.exit_price})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {t.points !== undefined && (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded ${isProfit ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'}`}>
                                {t.points > 0 ? `+${t.points}` : t.points} pts {t.reais !== undefined ? `(R$ ${t.reais})` : ''}
                              </span>
                            )}
                            {t.mep !== undefined && (
                              <span className="text-[10px] text-slate-400 font-sans" title="Máxima Excursão Positiva">
                                MEP: <strong className="text-teal-300">+{t.mep}</strong> pts
                              </span>
                            )}
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${status.bg} ${status.text} ${status.border}`}>
                              {status.label}
                            </span>
                          </div>
                        </div>

                        {/* Detalhes Confluenciados */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs font-sans">
                          {(t.rationale_spoken || t.rationale) && (
                            <div className="p-2.5 bg-[#05080e] rounded-lg border border-slate-800/80 space-y-1">
                              <span className="text-[9px] font-bold font-mono text-teal-400 uppercase block">
                                🎯 MOTIVO / SETUP FALADO NO MICROFONE:
                              </span>
                              <p className="text-slate-200 leading-relaxed">{t.rationale_spoken || t.rationale}</p>
                            </div>
                          )}

                          {(t.management_spoken || t.details) && (
                            <div className="p-2.5 bg-[#05080e] rounded-lg border border-slate-800/80 space-y-1">
                              <span className="text-[9px] font-bold font-mono text-cyan-400 uppercase block">
                                ⚙️ MANEJO OPERACIONAL FALADO (ALVOS / STOPS):
                              </span>
                              <p className="text-slate-200 leading-relaxed">{t.management_spoken || t.details}</p>
                            </div>
                          )}

                          {t.psychology_spoken && (
                            <div className="p-2.5 bg-[#05080e] rounded-lg border border-slate-800/80 space-y-1">
                              <span className="text-[9px] font-bold font-mono text-amber-400 uppercase block">
                                🧠 ESTADO EMOCIONAL / PSICOLÓGICO:
                              </span>
                              <p className="text-slate-200 leading-relaxed">{t.psychology_spoken}</p>
                            </div>
                          )}

                          {t.key_takeaway && (
                            <div className="p-2.5 bg-[#05080e] rounded-lg border border-slate-800/80 space-y-1">
                              <span className="text-[9px] font-bold font-mono text-purple-400 uppercase block">
                                💡 DIAGNÓSTICO DO MENTOR IA:
                              </span>
                              <p className="text-slate-200 leading-relaxed">{t.key_takeaway}</p>
                            </div>
                          )}
                        </div>

                        {/* Timestamp no Áudio e Atraso */}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/40 flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {t.audio_timestamp && (
                              <span className="font-mono text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20">
                                ⏱️ Áudio: [{t.audio_timestamp}]
                              </span>
                            )}
                            {t.narration_time_market && (
                              <span className="font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                🕐 Pregão: {t.narration_time_market}
                              </span>
                            )}
                            {t.latency_description && (
                              <span className="text-slate-400 italic">
                                {t.latency_description}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {t.did_follow_plan !== undefined && (
                              <span className={`px-1.5 py-0.5 rounded font-bold text-[9px] ${t.did_follow_plan ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                                {t.did_follow_plan ? '✓ Seguiu o Plano' : '✕ Desviou do Plano'}
                              </span>
                            )}
                            {t.discipline_score !== undefined && (
                              <span className="font-bold text-amber-300">
                                Disciplina: {t.discipline_score}/10
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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

                        <div className="flex-1 space-y-1">
                          <p className="text-xs text-slate-200 leading-relaxed font-sans">
                            {seg.raw_text || seg.text}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* COLUNA 2: LINHA DO TEMPO & ANÁLISE IA */}
                <div className="bg-[#070a10] rounded-xl p-3 border border-amber-500/30 space-y-3 font-mono">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <span>🤖</span>
                      <span>LINHA DO TEMPO & ANÁLISE IA</span>
                    </span>
                    <span className="text-[9px] text-slate-500">Insights Estruturados</span>
                  </div>

                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                    {segments.map((seg, i) => (
                      <div key={i} className="flex gap-2.5 border-b border-slate-800/40 last:border-0 pb-2 last:pb-0">
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
                className="text-slate-400 hover:text-slate-200 text-lg px-2 cursor-pointer"
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
                  <p className="text-slate-200 leading-relaxed">
                    {selectedAiAnalysis.summary}
                  </p>
                </div>
              )}

              {selectedAiAnalysis.emotion && (
                <div className="flex items-center gap-2 bg-[#070a10] p-2.5 rounded-lg border border-slate-800">
                  <span className="font-mono text-slate-400">🎭 Estado Emocional:</span>
                  <span className="text-amber-300 font-bold">{selectedAiAnalysis.emotion}</span>
                </div>
              )}

              {selectedAiAnalysis.trades && selectedAiAnalysis.trades.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] text-teal-400 font-bold uppercase tracking-wider font-mono block">
                    📊 TRADES IDENTIFICADOS:
                  </span>
                  <div className="space-y-2">
                    {selectedAiAnalysis.trades.map((t, idx) => (
                      <div key={idx} className="p-2.5 bg-[#070a10] rounded-lg border border-slate-800 font-mono text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200">#{t.trade_number || idx + 1}</span>
                          <span className={t.side === 'COMPRA' || t.side === 'compra' || t.side === 'C' ? 'text-teal-400 font-bold' : 'text-rose-400 font-bold'}>
                            {t.side} {t.instrument || 'WINFUT'}
                          </span>
                          {t.points !== undefined && (
                            <span className="text-amber-300 font-bold">
                              {t.points > 0 ? `+${t.points}` : t.points} pts
                            </span>
                          )}
                        </div>
                        {t.rationale_spoken && <p className="text-slate-300 font-sans text-xs">{t.rationale_spoken}</p>}
                        {t.psychology_spoken && <p className="text-amber-200/90 font-sans text-xs">{t.psychology_spoken}</p>}
                      </div>
                    ))}
                  </div>
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
