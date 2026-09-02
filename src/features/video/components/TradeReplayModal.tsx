'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Trade, TradeAnnotation } from '@/lib/db/schema';
import {
  getTradeVideoReplayData,
  type TradeVideoReplayData,
  getTradeAnnotations,
  saveTradeAnnotation,
  deleteTradeAnnotation,
  generateAIFrameInsight,
  generateAIMultiFrameInsight,
} from '@/features/video/actions';

import { TradeReplayCanvas, type TradeReplayCanvasHandle } from './TradeReplayCanvas';
import {
  IconArrowUp,
  IconArrowDown,
  IconTerminal,
} from '@/components/ui/icons';

interface TradeReplayModalProps {
  trade: Trade;
  onClose: () => void;
}

type ReplayMode = 'trade_only' | 'post_trade' | 'full_video';

const SPEED_OPTIONS = [0.1, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0];
const PEN_COLORS = [
  { name: 'Verde (Compra)', hex: '#10b981' },
  { name: 'Vermelho (Venda/Stop)', hex: '#f43f5e' },
  { name: 'Amarelo (GEX/Atenção)', hex: '#facc15' },
  { name: 'Ciano (Fluxo)', hex: '#06b6d4' },
  { name: 'Branco (Texto)', hex: '#ffffff' },
];

const NOTE_TAGS = [
  { id: 'insight', label: '💡 Insight', color: 'bg-teal-500/20 text-teal-300 border-teal-500/40' },
  { id: 'entrada', label: '🎯 Entrada', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  { id: 'stop', label: '🛑 Stop / Erro', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  { id: 'tape_reading', label: '📊 Tape Reading', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
  { id: 'atencao', label: '⚠️ Atenção', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
];

export const AI_FOCUS_OPTIONS = [
  { id: 'general' as const, label: '🧭 Geral', desc: 'Tela Toda (Panorâmica)' },
  { id: 'tape' as const, label: '📊 Tape', desc: 'Times & Trades / Fluxo' },
  { id: 'book' as const, label: '📑 Book', desc: 'Escoras e Absorção' },
  { id: 'chart' as const, label: '📈 Gráfico', desc: 'Candles e VWAP' },
  { id: 'zoom' as const, label: '🔍 Zoom', desc: 'Área Ampliada' },
];

export function TradeReplayModal({ trade, onClose }: TradeReplayModalProps) {
  const [loading, setLoading] = useState(true);
  const [replayData, setReplayData] = useState<TradeVideoReplayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Anotações e Insights Frame-a-Frame
  const [annotations, setAnnotations] = useState<TradeAnnotation[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteTag, setNewNoteTag] = useState('insight');
  const [savingNote, setSavingNote] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiFocusArea, setAiFocusArea] = useState<'general' | 'tape' | 'book' | 'chart' | 'zoom'>('general');
  const [saveDrawingWithNote, setSaveDrawingWithNote] = useState(true);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);

  // Pop-up Flutuante e Arrastável de Leitura Completa
  const [readingAnnotation, setReadingAnnotation] = useState<TradeAnnotation | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingPopup, setIsDraggingPopup] = useState(false);
  const popupDragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });
  const [copiedNote, setCopiedNote] = useState(false);



  // Estados de reprodução
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [isLooping, setIsLooping] = useState(false);
  const [replayMode, setReplayMode] = useState<ReplayMode>('trade_only');


  // Estados de Zoom & Pan
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Estados de Anotação (Caneta Piloto)
  const [penEnabled, setPenEnabled] = useState(false);
  const [penColor, setPenColor] = useState('#10b981');
  const [penSize, setPenSize] = useState(3);
  const [isEraser, setIsEraser] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<TradeReplayCanvasHandle | null>(null);


  // Carrega dados do vídeo, offsets e anotações
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      getTradeVideoReplayData(trade.id),
      getTradeAnnotations(trade.id),
    ])
      .then(([data, noteList]) => {
        if (!isMounted) return;
        setReplayData(data);
        setAnnotations(noteList);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('[Replay] Erro ao carregar dados do replay:', err);
        setError(err.message || 'Falha ao buscar vídeo da sessão');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [trade.id]);

  // Converte tempo relativo do vídeo (segundos) para o horário real do relógio do pregão (HH:MM:SS)
  const getRealClockTime = useCallback((videoCurrentSecs: number, withMillis = false): string => {
    const startTimeStr = replayData?.videoStartTime || '09:00:00';
    const parts = startTimeStr.split(':').map((p) => parseInt(p, 10) || 0);
    const startSecs = (parts[0] || 9) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);

    const totalSecs = startSecs + videoCurrentSecs;
    const hours = Math.floor(totalSecs / 3600) % 24;
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = Math.floor(totalSecs % 60);
    const tenths = Math.floor((totalSecs % 1) * 10);

    const base = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return withMillis ? `${base}.${tenths}` : base;
  }, [replayData?.videoStartTime]);

  // Salva anotação no frame atual
  const handleSaveAnnotation = async () => {
    if (!newNoteText.trim()) return;
    setSavingNote(true);
    try {
      const drawingData = (saveDrawingWithNote && canvasRef.current?.hasDrawings())
        ? canvasRef.current.exportDrawingData()
        : undefined;

      const saved = await saveTradeAnnotation({
        tradeId: trade.id,
        timestampSecs: currentTime,
        formattedTime: formatTime(currentTime),
        clockTime: getRealClockTime(currentTime),
        text: newNoteText.trim(),
        tag: newNoteTag,
        drawingData,
        author: 'user',
      });

      setAnnotations((prev) => [...prev.filter((a) => a.id !== saved.id), saved].sort((a, b) => a.timestampSecs - b.timestampSecs));
      setNewNoteText('');
    } catch (err) {
      console.error('Erro ao salvar anotação:', err);
    } finally {
      setSavingNote(false);
    }
  };


  // Pula para anotação e restaura desenho se houver
  const handleJumpToAnnotation = (ann: TradeAnnotation) => {
    jumpTo(ann.timestampSecs);
    setActiveAnnotationId(ann.id);
    if (ann.drawingData && canvasRef.current) {
      canvasRef.current.importDrawingData(ann.drawingData);
    }
  };

  // Exclui anotação
  const handleDeleteAnnotation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteTradeAnnotation(id);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      if (activeAnnotationId === id) setActiveAnnotationId(null);
    } catch (err) {
      console.error('Erro ao deletar anotação:', err);
    }
  };

  // Captura o frame real do vídeo em alta resolução (Base64 JPEG)
  const captureCurrentFrameBase64 = (): string | null => {
    const video = videoRef.current;
    if (!video) return null;

    try {
      const canvas = document.createElement('canvas');
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, width, height);

      // Se o foco for 'zoom' e o usuário estiver com zoom ativo, recorta a área visível
      if (aiFocusArea === 'zoom' && zoomLevel > 1.0) {
        const zoomCanvas = document.createElement('canvas');
        zoomCanvas.width = width;
        zoomCanvas.height = height;
        const zCtx = zoomCanvas.getContext('2d');
        if (zCtx) {
          const cropW = width / zoomLevel;
          const cropH = height / zoomLevel;
          const cropX = Math.max(0, Math.min(width - cropW, width / 2 - cropW / 2 - (panPosition.x / zoomLevel)));
          const cropY = Math.max(0, Math.min(height - cropH, height / 2 - cropH / 2 - (panPosition.y / zoomLevel)));
          zCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, width, height);
          return zoomCanvas.toDataURL('image/jpeg', 0.85);
        }
      }

      return canvas.toDataURL('image/jpeg', 0.85);
    } catch (err) {
      console.error('Erro ao capturar frame:', err);
      return null;
    }
  };

  // Gera leitura analítica AI multimodal usando o frame real do Profit Pro
  const handleGenerateAIInsight = async (focusOverride?: 'general' | 'tape' | 'book' | 'chart' | 'zoom') => {
    const focus = focusOverride || aiFocusArea;
    setGeneratingAI(true);
    try {
      const imageBase64 = captureCurrentFrameBase64();

      const saved = await generateAIFrameInsight({
        tradeId: trade.id,
        timestampSecs: currentTime,
        formattedTime: formatTime(currentTime),
        clockTime: getRealClockTime(currentTime),
        imageBase64: imageBase64 || undefined,
        focusArea: focus,
        customPrompt: newNoteText.trim() || undefined,
      });

      setAnnotations((prev) => [...prev.filter((a) => a.id !== saved.id), saved].sort((a, b) => a.timestampSecs - b.timestampSecs));
      setNewNoteText('');
      setReadingAnnotation(saved);
    } catch (err) {
      console.error('Erro ao gerar insight AI:', err);
    } finally {
      setGeneratingAI(false);
    }
  };

  // Captura um frame em um timestamp específico do vídeo
  const captureFrameAtTimestamp = async (timeSecs: number): Promise<string> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      if (!video) return resolve('');

      const handleSeek = () => {
        video.removeEventListener('seeked', handleSeek);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1920;
          canvas.height = video.videoHeight || 1080;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
            return;
          }
        } catch {
          // fallback
        }
        resolve('');
      };

      video.addEventListener('seeked', handleSeek, { once: true });
      video.currentTime = timeSecs;
    });
  };

  // Gera debriefing completo analisando a sequência multi-frames (Pré, Entrada, Durante, Saída e Pós)
  const handleGenerateMultiFrameDebriefing = async () => {
    if (!replayData || !videoRef.current) return;
    const originalTime = currentTime;
    setGeneratingAI(true);
    try {
      const beforeOffset = replayData.beforeOffsetSecs ?? 0;
      const entryOffset = replayData.entryOffsetSecs ?? (beforeOffset + 30);
      const exitOffset = replayData.exitOffsetSecs ?? (entryOffset + 14);
      const midOffset = (entryOffset + exitOffset) / 2;
      const postOffset = Math.min(duration || 9999, exitOffset + 45);

      const milestones = [
        { label: 'PRÉ-TRADE (T-30s Preparação)', timeSecs: beforeOffset },
        { label: 'ENTRADA', timeSecs: entryOffset },
        { label: 'DURANTE (Evolução do Fluxo)', timeSecs: midOffset },
        { label: 'SAÍDA / STOP', timeSecs: exitOffset },
        { label: 'PÓS-TRADE (Continuidade / Estudo)', timeSecs: postOffset },
      ];

      const capturedFrames = [];
      for (const m of milestones) {
        const base64 = await captureFrameAtTimestamp(m.timeSecs);
        if (base64) {
          capturedFrames.push({
            label: m.label,
            timestampSecs: m.timeSecs,
            formattedTime: formatTime(m.timeSecs),
            clockTime: getRealClockTime(m.timeSecs),
            imageBase64: base64,
          });
        }
      }

      // Restaura o tempo original do vídeo
      videoRef.current.currentTime = originalTime;
      setCurrentTime(originalTime);

      if (capturedFrames.length > 0) {
        const saved = await generateAIMultiFrameInsight({
          tradeId: trade.id,
          frames: capturedFrames,
          customPrompt: newNoteText.trim() || undefined,
        });

        setAnnotations((prev) => [...prev.filter((a) => a.id !== saved.id), saved].sort((a, b) => a.timestampSecs - b.timestampSecs));
        setNewNoteText('');
        setReadingAnnotation(saved);
      }
    } catch (err) {
      console.error('Erro ao gerar debriefing multi-frame:', err);
    } finally {
      setGeneratingAI(false);
      if (videoRef.current) {
        videoRef.current.currentTime = originalTime;
        setCurrentTime(originalTime);
      }
    }
  };

  // Dragging do Pop-up Flutuante de Leitura
  const handlePopupMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;
    setIsDraggingPopup(true);
    const initialX = popupPosition?.x ?? (typeof window !== 'undefined' ? Math.max(20, window.innerWidth / 2 - 340) : 100);
    const initialY = popupPosition?.y ?? 50;
    popupDragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: initialX,
      startY: initialY,
    };
  };

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!isDraggingPopup) return;
      const dx = e.clientX - popupDragStartRef.current.mouseX;
      const dy = e.clientY - popupDragStartRef.current.mouseY;
      setPopupPosition({
        x: Math.max(10, Math.min(window.innerWidth - 620, popupDragStartRef.current.startX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - 250, popupDragStartRef.current.startY + dy)),
      });
    };

    const handleWindowMouseUp = () => {
      setIsDraggingPopup(false);
    };

    if (isDraggingPopup) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isDraggingPopup]);

  const handleCopyAnnotationText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2000);
  };

  // Pula o vídeo para um timestamp específico
  const jumpToFrame = (timeSecs: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(video.duration || duration || 9999, timeSecs));
    video.currentTime = clamped;
    setCurrentTime(clamped);
    video.pause();
    setIsPlaying(false);
  };

  // Converte horário de relógio (ex: '09:12:13') para offset em segundos do vídeo
  const convertClockTimeToSeconds = (clockStr: string): number | null => {
    const videoStart = replayData?.videoStartTime || '09:00:00';
    try {
      const match = clockStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (!match) return null;
      const targetH = parseInt(match[1], 10);
      const targetM = parseInt(match[2], 10);
      const targetS = match[3] ? parseInt(match[3], 10) : 0;

      const [startH, startM, startS] = videoStart.split(':').map(Number);
      const startTotal = startH * 3600 + startM * 60 + (startS || 0);
      const targetTotal = targetH * 3600 + targetM * 60 + targetS;
      const diff = targetTotal - startTotal;
      return diff >= 0 ? diff : null;
    } catch {
      return null;
    }
  };

  // Renderizador inteligente e interativo do Debriefing com botões por frame
  const renderInteractiveDebriefing = (fullText: string) => {
    const beforeOffset = replayData?.beforeOffsetSecs ?? 0;
    const entryOffset = replayData?.entryOffsetSecs ?? (beforeOffset + 30);
    const exitOffset = replayData?.exitOffsetSecs ?? (entryOffset + 14);
    const midOffset = (entryOffset + exitOffset) / 2;
    const postOffset = Math.min(duration || 9999, exitOffset + 45);

    const defaultMilestones = [
      { id: 1, label: 'PRÉ-TRADE', time: beforeOffset, clock: getRealClockTime(beforeOffset), icon: '🎬' },
      { id: 2, label: 'ENTRADA', time: entryOffset, clock: getRealClockTime(entryOffset), icon: '🎯' },
      { id: 3, label: 'DURANTE', time: midOffset, clock: getRealClockTime(midOffset), icon: '📊' },
      { id: 4, label: 'SAÍDA / STOP', time: exitOffset, clock: getRealClockTime(exitOffset), icon: '🛑' },
      { id: 5, label: 'PÓS-TRADE', time: postOffset, clock: getRealClockTime(postOffset), icon: '🔮' },
    ];

    // Divide o texto em blocos por quebras de linha duplas
    const chunks = fullText.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean);


    return (
      <div className="space-y-4">
        {/* Barra Superior de Navegação Rápida entre Frames */}
        <div className="p-2.5 bg-[#060a14] rounded-xl border border-cyan-500/30 flex flex-wrap items-center gap-1.5 shadow-sm">
          <span className="text-[10px] font-bold text-cyan-400 flex items-center gap-1 px-1">
            <span>⏱️</span>
            <span>IR DIRETO AO FRAME:</span>
          </span>
          {defaultMilestones.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => jumpToFrame(m.time)}
              className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-teal-500/20 text-slate-200 hover:text-teal-300 border border-slate-700 hover:border-teal-500/50 text-[10px] font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95"
              title={`Pular vídeo para ${m.label} (${m.clock})`}
            >
              <span>{m.icon} {m.label}</span>
              <span className="text-cyan-400 font-mono text-[9px]">({m.clock})</span>
            </button>
          ))}
        </div>

        {/* Blocos de cada Seção com Botão de Pular para o Frame */}
        <div className="space-y-3">
          {chunks.map((chunk, idx) => {
            const trimmed = chunk.trim();
            if (!trimmed) return null;

            let matchedTime: number | null = null;
            let matchedLabel = '';

            // 1. Procura por menção de Frame 1 a 6
            const frameMatch = trimmed.match(/(?:Frame\s*([1-6])|[1-6]️⃣|\*\*([1-6]))/i);
            if (frameMatch) {
              const frameNum = parseInt(frameMatch[1] || frameMatch[2], 10);
              const m = defaultMilestones.find((dm) => dm.id === frameNum);
              if (m) {
                matchedTime = m.time;
                matchedLabel = `${m.icon} Frame ${frameNum}: ${m.label} (${m.clock})`;
              }
            }

            // 2. Procura por horário HH:MM:SS ou HH:MM no texto (ex: 09:12:13)
            const timeMatch = trimmed.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
            if (timeMatch && matchedTime === null) {
              const parsedSecs = convertClockTimeToSeconds(timeMatch[1]);
              if (parsedSecs !== null) {
                matchedTime = parsedSecs;
                matchedLabel = `🕒 Frame @ ${timeMatch[1]}`;
              }
            }

            // 3. Match por palavras-chave caso não tenha achado número
            if (matchedTime === null) {
              if (/pré-trade|preparação/i.test(trimmed)) {
                matchedTime = beforeOffset;
                matchedLabel = `🎬 Pré-Trade (${getRealClockTime(beforeOffset)})`;
              } else if (/entrada|compra|venda/i.test(trimmed) && /momento/i.test(trimmed)) {
                matchedTime = entryOffset;
                matchedLabel = `🎯 Entrada (${getRealClockTime(entryOffset)})`;
              } else if (/saída|stop/i.test(trimmed)) {
                matchedTime = exitOffset;
                matchedLabel = `🛑 Saída / Stop (${getRealClockTime(exitOffset)})`;
              } else if (/pós-trade|violinada/i.test(trimmed)) {
                matchedTime = postOffset;
                matchedLabel = `🔮 Pós-Trade (${getRealClockTime(postOffset)})`;
              }
            }

            return (
              <div
                key={idx}
                className="p-3.5 bg-[#060a15] border border-slate-800/90 rounded-xl space-y-2.5 hover:border-slate-700 transition-all shadow-sm group/block"
              >
                {matchedTime !== null && (
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 gap-2">
                    <span className="text-[10px] font-bold text-slate-400 font-mono flex items-center gap-1">
                      <span>📌</span>
                      <span>MOMENTO DO COMENTÁRIO:</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => jumpToFrame(matchedTime!)}
                      className="px-3 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/50 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                      title="Pular vídeo exatamente para o frame deste comentário"
                    >
                      <span>⏱️ Ver Frame no Vídeo</span>
                      <span className="font-mono text-teal-200">({getRealClockTime(matchedTime)})</span>
                      <span>▶</span>
                    </button>
                  </div>
                )}

                <p className="whitespace-pre-wrap font-sans text-xs md:text-sm text-slate-200 leading-relaxed">
                  {trimmed}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Posiciona o vídeo inicialmente no ponto de 30s antes da entrada
  const handleVideoLoadedMetadata = () => {

    const video = videoRef.current;
    if (!video || !replayData) return;

    setDuration(video.duration || replayData.durationSecs || 0);

    const startTime = replayData.beforeOffsetSecs ?? 0;
    video.currentTime = startTime;
    setCurrentTime(startTime);
  };

  // Monitora o tempo para respeitar os limites de modo (ex: pausar na saída se trade_only)
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !replayData) return;

    const curr = video.currentTime;
    setCurrentTime(curr);

    const beforeOffset = replayData.beforeOffsetSecs ?? 0;
    const exitOffset = replayData.exitOffsetSecs ?? (beforeOffset + 30);
    const postOffset = replayData.postOffsetSecs ?? (exitOffset + 300);

    if (replayMode === 'trade_only') {
      if (curr >= exitOffset) {
        if (isLooping) {
          video.currentTime = beforeOffset;
        } else {
          video.pause();
          setIsPlaying(false);
        }
      }
    } else if (replayMode === 'post_trade') {
      if (curr >= postOffset) {
        if (isLooping) {
          video.currentTime = beforeOffset;
        } else {
          video.pause();
          setIsPlaying(false);
        }
      }
    }
  };

  // Reverse playback interval ref & multiplier state
  const reverseIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.0);

  const stopReversePlayback = useCallback(() => {
    if (reverseIntervalRef.current) {
      clearInterval(reverseIntervalRef.current);
      reverseIntervalRef.current = null;
    }
  }, []);

  // Define multiplicador de velocidade (positivo = frente >>, negativo = trás <<)
  const setPlaybackMultiplier = useCallback((multiplier: number) => {
    const video = videoRef.current;
    if (!video) return;

    stopReversePlayback();
    setCurrentMultiplier(multiplier);

    if (multiplier === 0) {
      video.pause();
      setIsPlaying(false);
      return;
    }

    if (multiplier > 0) {
      // Avanço normal ou acelerado (>> 1x a 16x)
      video.playbackRate = Math.min(16, multiplier);
      if (video.paused) {
        video.play().catch(() => {});
      }
      setIsPlaying(true);
    } else {
      // Reprodução reversa suave (<< -1x a -16x)
      video.pause();
      setIsPlaying(true);

      const absMult = Math.abs(multiplier);
      const intervalMs = 40; // 25 fps de atualização reversa
      const stepSecs = (intervalMs / 1000) * absMult;

      reverseIntervalRef.current = setInterval(() => {
        if (!videoRef.current) return;
        const v = videoRef.current;
        const newTime = Math.max(0, v.currentTime - stepSecs);
        v.currentTime = newTime;
        setCurrentTime(newTime);

        if (newTime <= 0) {
          stopReversePlayback();
          setIsPlaying(false);
          setCurrentMultiplier(1.0);
        }
      }, intervalMs);
    }
  }, [stopReversePlayback]);

  // Play / Pause
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      stopReversePlayback();
      video.pause();
      setIsPlaying(false);
    } else {
      if (currentMultiplier < 0) {
        setPlaybackMultiplier(currentMultiplier);
      } else {
        setPlaybackMultiplier(currentMultiplier > 0 ? currentMultiplier : 1.0);
      }
    }
  }, [isPlaying, currentMultiplier, setPlaybackMultiplier, stopReversePlayback]);

  // Shuttle Jog: Acelera para trás (<<) ou para frente (>>)
  const shuttleJog = useCallback((direction: 'backward' | 'forward') => {
    const FORWARD_STAGES = [1, 2, 4, 8, 16];
    const REVERSE_STAGES = [-1, -2, -4, -8, -16];

    if (direction === 'forward') {
      if (currentMultiplier < 0) {
        // Estava voltando, agora zera ou vai pra 1x
        setPlaybackMultiplier(1.0);
      } else {
        const currIdx = FORWARD_STAGES.indexOf(currentMultiplier);
        const nextMult = currIdx >= 0 && currIdx < FORWARD_STAGES.length - 1 ? FORWARD_STAGES[currIdx + 1] : 16;
        setPlaybackMultiplier(nextMult);
      }
    } else {
      if (currentMultiplier > 0) {
        // Estava indo pra frente, agora inverte pra -1x
        setPlaybackMultiplier(-1.0);
      } else {
        const currIdx = REVERSE_STAGES.indexOf(currentMultiplier);
        const nextMult = currIdx >= 0 && currIdx < REVERSE_STAGES.length - 1 ? REVERSE_STAGES[currIdx + 1] : -16;
        setPlaybackMultiplier(nextMult);
      }
    }
  }, [currentMultiplier, setPlaybackMultiplier]);

  // Hold interval para avanço contínuo
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const targetTimeRef = useRef<number | null>(null);

  // Frame a Frame com suporte a acúmulo e seek responsivo
  const stepFrame = useCallback((deltaSecs: number) => {
    const video = videoRef.current;
    if (!video) return;

    stopReversePlayback();
    video.pause();
    setIsPlaying(false);

    const base = targetTimeRef.current !== null ? targetTimeRef.current : video.currentTime;
    const nextTime = Math.max(0, Math.min(video.duration || 999999, Number((base + deltaSecs).toFixed(2))));
    targetTimeRef.current = nextTime;

    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, [stopReversePlayback]);

  const handleSeeked = useCallback(() => {
    targetTimeRef.current = null;
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const startHoldingStep = (deltaSecs: number) => {
    stepFrame(deltaSecs);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    const timeout = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        stepFrame(deltaSecs);
      }, 80);
    }, 220);
    (holdIntervalRef as any).timeout = timeout;
  };

  const stopHoldingStep = () => {
    if ((holdIntervalRef as any).timeout) clearTimeout((holdIntervalRef as any).timeout);
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  // Limpa os intervals ao desmontar
  useEffect(() => {
    return () => {
      stopReversePlayback();
      stopHoldingStep();
    };
  }, [stopReversePlayback]);

  // Pulos rápidos para os marcadores
  const jumpTo = (timeSecs: number) => {
    const video = videoRef.current;
    if (!video) return;
    stopReversePlayback();
    video.currentTime = timeSecs;
    setCurrentTime(timeSecs);
  };


  // Zoom Controls & Dynamic Cursor Zoom
  const handleZoomChange = (delta: number) => {
    setZoomLevel((prev) => {
      const next = Math.max(1.0, Math.min(5.0, Number((prev + delta).toFixed(1))));
      if (next === 1.0) setPanPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const resetZoom = () => {
    setZoomLevel(1.0);
    setPanPosition({ x: 0, y: 0 });
  };

  // Zoom Dinâmico com a roda do mouse (Scroll Wheel / Alt+Scroll / Ctrl+Scroll) centrado no cursor
  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (penEnabled) return;
    e.preventDefault();
    e.stopPropagation();

    const container = videoContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left - rect.width / 2;
    const cursorY = e.clientY - rect.top - rect.height / 2;

    const zoomStep = e.deltaY < 0 ? 0.35 : -0.35;

    setZoomLevel((prevZoom) => {
      const nextZoom = Math.max(1.0, Math.min(5.0, Number((prevZoom + zoomStep).toFixed(2))));
      if (nextZoom === 1.0) {
        setPanPosition({ x: 0, y: 0 });
        return 1.0;
      }

      setPanPosition((prevPan) => {
        const ratio = nextZoom / prevZoom;
        const newPanX = cursorX - (cursorX - prevPan.x) * ratio;
        const newPanY = cursorY - (cursorY - prevPan.y) * ratio;
        return {
          x: Number(newPanX.toFixed(1)),
          y: Number(newPanY.toFixed(1)),
        };
      });

      return nextZoom;
    });
  };

  // Duplo-Clique para dar Zoom Rápido focado no ponto exato
  const handleDoubleClickZoom = (e: React.MouseEvent<HTMLDivElement>) => {
    if (penEnabled) return;
    const container = videoContainerRef.current;
    if (!container) return;

    if (zoomLevel > 1.0) {
      resetZoom();
    } else {
      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left - rect.width / 2;
      const cursorY = e.clientY - rect.top - rect.height / 2;
      const targetZoom = 2.5;

      setZoomLevel(targetZoom);
      setPanPosition({
        x: Number((-cursorX * (targetZoom - 1)).toFixed(1)),
        y: Number((-cursorY * (targetZoom - 1)).toFixed(1)),
      });
    }
  };

  // Pan Mouse Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1.0 || penEnabled) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panPosition.x,
      panY: panPosition.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomLevel <= 1.0) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanPosition({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };


  // Fullscreen
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        shuttleJog('backward');
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        shuttleJog('forward');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepFrame(e.shiftKey ? -1.0 : -0.1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepFrame(e.shiftKey ? 1.0 : 0.1);
      } else if (e.key === '1' && replayData?.beforeOffsetSecs !== undefined) {


        jumpTo(replayData.beforeOffsetSecs);
      } else if (e.key === '2' && replayData?.entryOffsetSecs !== undefined) {
        jumpTo(replayData.entryOffsetSecs);
      } else if (e.key === '3' && replayData?.exitOffsetSecs !== undefined) {
        jumpTo(replayData.exitOffsetSecs);
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      } else if (e.key.toLowerCase() === 'z') {
        resetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, stepFrame, replayData, onClose]);

  // Formata segundos para MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const isPos = (trade.reais || 0) > 0;
  const isNeg = (trade.reais || 0) < 0;
  const resultColor = isPos ? 'text-emerald-400' : isNeg ? 'text-rose-400' : 'text-slate-400';

  const beforeOffset = replayData?.beforeOffsetSecs ?? 0;
  const entryOffset = replayData?.entryOffsetSecs ?? (beforeOffset + 30);
  const exitOffset = replayData?.exitOffsetSecs ?? (entryOffset + 14);
  const postOffset = replayData?.postOffsetSecs ?? (exitOffset + 300);

  // Status visual da fase do trade
  let phaseBadge = { text: '⏱️ T-30s (Preparação)', bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' };
  if (currentTime >= entryOffset && currentTime < exitOffset) {
    phaseBadge = { text: '🟢 TRADE EM ANDAMENTO', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
  } else if (currentTime >= exitOffset && currentTime <= exitOffset + 3) {
    phaseBadge = { text: '🔴 MOMENTO DA SAÍDA / STOP', bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
  } else if (currentTime > exitOffset) {
    phaseBadge = { text: '🔮 PÓS-TRADE (Violinada / Pós-Saída)', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-2 md:p-6 animate-in fade-in font-mono">
      <div
        ref={containerRef}
        className="relative flex flex-col w-full max-w-6xl max-h-[96vh] bg-[#070a12] border border-slate-800/90 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* ── TOP BAR HEADER ── */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0b101c] border-b border-slate-800/80">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold px-2.5 py-1 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">
              TRADE #{trade.tradeNumber}
            </span>

            <span
              className={`text-xs font-bold px-2.5 py-1 rounded border ${
                trade.side === 'C'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              }`}
            >
              {trade.side === 'C' ? 'COMPRA' : 'VENDA'}
            </span>

            <span className="text-xs text-slate-300 font-bold">
              {trade.instrument} @ {trade.entryPrice.toLocaleString('pt-BR')} → {trade.exitPrice.toLocaleString('pt-BR')}
            </span>

            <span className={`text-xs font-bold ${resultColor}`}>
              {(trade.points || 0) > 0 ? '+' : ''}{trade.points} pts (R$ {(trade.reais || 0) > 0 ? '+' : ''}{trade.reais?.toFixed(2)})
            </span>

            <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${phaseBadge.bg}`}>
              {phaseBadge.text}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/80 border border-slate-700/80 px-2.5 py-1 rounded-md font-mono shadow-sm">
              <span className="text-teal-400 font-bold">🕒 PREGÃO:</span>
              <strong className="text-white text-xs">{getRealClockTime(currentTime)}</strong>
              <span className="text-slate-500 text-[10px]">({formatTime(currentTime)})</span>
            </span>

            <span className="hidden lg:inline-block text-[11px] text-slate-500 font-mono">
              Início: {replayData?.videoStartTime || '09:00:00'}
            </span>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 rounded-lg transition-colors"
              title="Fechar (ESC)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

        </div>

        {/* ── MAIN CONTENT (VIDEO + DRAWING CANVAS) ── */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[380px] max-h-[65vh]">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Sincronizando timeline do vídeo OBS...</p>
            </div>
          )}

          {!loading && error && (
            <div className="p-8 text-center text-rose-400 max-w-md space-y-2">
              <span className="text-3xl block">⚠️</span>
              <p className="text-sm font-bold">Vídeo não encontrado para este dia</p>
              <p className="text-xs text-slate-500">{error}</p>
            </div>
          )}

          {!loading && !error && replayData && (
            <div
              ref={videoContainerRef}
              onWheel={handleWheelZoom}
              onDoubleClick={handleDoubleClickZoom}
              className={`relative w-full h-full flex items-center justify-center select-none ${
                zoomLevel > 1.0 && !penEnabled
                  ? isDragging
                    ? 'cursor-grabbing'
                    : 'cursor-grab'
                  : penEnabled
                  ? 'cursor-crosshair'
                  : 'cursor-zoom-in'
              }`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              title={
                penEnabled
                  ? 'Modo Caneta Ativo (Clique e arraste para desenhar)'
                  : zoomLevel > 1.0
                  ? 'Zoom Ativo (Scroll: Ajusta zoom no cursor | Arraste: Move tela | Duplo-clique / (Z): Resetar)'
                  : 'Zoom Dinâmico (Use o Scroll ou dê Duplo-clique no ponto exato que deseja ampliar)'
              }
            >
              {/* Container de Pan & Zoom */}
              <div
                className="relative w-full h-full flex items-center justify-center transition-transform duration-75 origin-center"
                style={{
                  transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
                }}
              >
                <video
                  ref={videoRef}
                  src={replayData.videoUrl}
                  preload="auto"
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onSeeked={handleSeeked}
                  playsInline
                  className="max-w-full max-h-full object-contain pointer-events-none"
                />

                {/* Camada Canvas de Desenho */}
                <TradeReplayCanvas
                  ref={canvasRef}
                  enabled={penEnabled}
                  color={penColor}
                  size={penSize}
                  isEraser={isEraser}
                  onDrawingStart={() => {
                    if (videoRef.current && !videoRef.current.paused) {
                      videoRef.current.pause();
                      setIsPlaying(false);
                    }
                  }}
                />
              </div>

              {/* Indicador de Zoom Ativo */}
              {zoomLevel > 1.0 && (
                <div className="absolute top-3 left-3 z-40 bg-black/85 border border-teal-500/50 text-teal-300 text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl backdrop-blur-md flex items-center gap-2">
                  <span>🔍 ZOOM DINÂMICO {zoomLevel.toFixed(1)}x</span>
                  <span className="text-slate-400 text-[9px] font-normal hidden sm:inline">| 🖱️ Scroll: Zoom no cursor · Arraste: Mover tela · Duplo-clique / (Z): Reset</span>
                  <button
                    type="button"
                    onClick={resetZoom}
                    className="ml-1 px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-[9px] font-bold transition-all"
                  >
                    1.0x Reset
                  </button>
                </div>
              )}


              {/* Indicador de Multiplicador de Velocidade Ativo */}
              {isPlaying && currentMultiplier !== 1.0 && (
                <div className={`absolute top-3 right-3 z-40 px-3 py-1.5 rounded-md text-xs font-black shadow-xl backdrop-blur-md flex items-center gap-1.5 border animate-pulse ${
                  currentMultiplier < 0
                    ? 'bg-rose-950/80 text-rose-300 border-rose-500/50 shadow-rose-500/20'
                    : 'bg-teal-950/80 text-teal-300 border-teal-500/50 shadow-teal-500/20'
                }`}>
                  <span>{currentMultiplier < 0 ? '⏪ REWIND' : '⏩ AVANÇO'}</span>
                  <span>{currentMultiplier < 0 ? `${currentMultiplier}x` : `+${currentMultiplier}x`}</span>
                </div>
              )}

            </div>
          )}
        </div>

        {/* ── TIMELINE SCRUBBER COM MARCADORES ── */}
        {!loading && !error && replayData && (
          <div className="px-5 py-2.5 bg-[#090d17] border-t border-slate-800/80 space-y-2">
            {/* Marcadores de Bookmark Rápidos */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">MARCADORES:</span>

                <button
                  type="button"
                  onClick={() => jumpTo(beforeOffset)}
                  className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20 text-[10px] font-bold transition-all"
                  title="Pular para 30s antes da entrada (1)"
                >
                  ⏱️ T-30s Pré
                </button>

                <button
                  type="button"
                  onClick={() => jumpTo(entryOffset)}
                  className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 text-[10px] font-bold transition-all"
                  title="Pular para a Entrada (2)"
                >
                  🟢 Entrada ({trade.openTime.includes(' ') ? trade.openTime.split(' ')[1]?.substring(0, 5) : trade.openTime.substring(0, 5)})
                </button>

                <button
                  type="button"
                  onClick={() => jumpTo(exitOffset)}
                  className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 text-[10px] font-bold transition-all"
                  title="Pular para a Saída / Stop (3)"
                >
                  🔴 Saída ({trade.closeTime.includes(' ') ? trade.closeTime.split(' ')[1]?.substring(0, 5) : trade.closeTime.substring(0, 5)})
                </button>

                <button
                  type="button"
                  onClick={() => jumpTo(exitOffset + 60)}
                  className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20 text-[10px] font-bold transition-all"
                  title="Pós-Trade +1 minuto"
                >
                  🔮 +1 min Pós
                </button>

                <button
                  type="button"
                  onClick={() => jumpTo(exitOffset + 300)}
                  className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20 text-[10px] font-bold transition-all"
                  title="Pós-Trade +5 minutos (Estudo de Violinada)"
                >
                  🔮 +5 min Pós
                </button>
              </div>

              <div className="text-[11px] font-mono text-slate-300 flex items-center gap-2">
                <span className="bg-teal-500/10 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded font-bold flex items-center gap-1 shadow-sm">
                  <span>🕒 {getRealClockTime(currentTime)}</span>
                </span>
                <span className="text-slate-400 text-xs">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
            </div>

            {/* Barra de Progresso Interativa */}

            <div className="relative w-full h-3 bg-slate-900 border border-slate-800 rounded-full overflow-hidden cursor-pointer group">
              {/* Barra de progresso atual */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-teal-500/80 transition-[width] duration-75"
                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              />

              {/* Faixa T-30s até Entrada */}
              <div
                className="absolute top-0 bottom-0 bg-cyan-500/30 pointer-events-none"
                style={{
                  left: `${duration > 0 ? (beforeOffset / duration) * 100 : 0}%`,
                  width: `${duration > 0 ? ((entryOffset - beforeOffset) / duration) * 100 : 0}%`,
                }}
              />

              {/* Faixa do Trade (Entrada até Saída) */}
              <div
                className="absolute top-0 bottom-0 bg-emerald-500/40 border-l border-r border-emerald-400 pointer-events-none"
                style={{
                  left: `${duration > 0 ? (entryOffset / duration) * 100 : 0}%`,
                  width: `${duration > 0 ? ((exitOffset - entryOffset) / duration) * 100 : 0}%`,
                }}
              />

              {/* Marcador de Saída */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-rose-500 pointer-events-none"
                style={{ left: `${duration > 0 ? (exitOffset / duration) * 100 : 0}%` }}
              />

              {/* Marcadores de Anotações Timestamped */}
              {annotations.map((ann) => (
                <div
                  key={ann.id}
                  className="absolute top-0 bottom-0 w-1.5 bg-amber-400 z-20 pointer-events-none rounded-full shadow-[0_0_8px_rgba(251,191,36,0.9)]"
                  style={{ left: `${duration > 0 ? (ann.timestampSecs / duration) * 100 : 0}%` }}
                  title={`[${ann.formattedTime}] ${ann.text}`}
                />
              ))}

              {/* Input range para clique preciso */}

              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.01}
                value={currentTime}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  jumpTo(val);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>
          </div>
        )}

        {/* ── BOTTOM TOOLBAR: CONTROLES DE REPRODUÇÃO, TIMELAPSE, ZOOM & CANETA ── */}
        {!loading && !error && replayData && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-[#0b101c] border-t border-slate-800/80">
            {/* Bloco 1: Play/Pause, Frame-a-Frame & Loop */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={togglePlay}
                className="px-3.5 py-1.5 rounded-lg bg-teal-500 text-slate-950 font-bold text-xs hover:bg-teal-400 transition-colors flex items-center gap-1.5 shadow-lg shadow-teal-500/20"
                title="Play/Pause (Espaço)"
              >
                {isPlaying ? '⏸ PAUSAR' : '▶ REPRODUZIR'}
              </button>

              <button
                type="button"
                onClick={() => stepFrame(-1.0)}
                className="px-2 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700/60 transition-colors"
                title="Recuar 1 Segundo (Shift + Seta Esquerda)"
              >
                ◀◀ -1s
              </button>

              <button
                type="button"
                onMouseDown={() => startHoldingStep(-0.1)}
                onMouseUp={stopHoldingStep}
                onMouseLeave={stopHoldingStep}
                onTouchStart={() => startHoldingStep(-0.1)}
                onTouchEnd={stopHoldingStep}
                className="px-2.5 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 active:bg-teal-500/20 text-slate-200 text-xs font-bold border border-slate-700/60 transition-colors select-none"
                title="Recuar 1 Frame (Segure para avançar continuamente / Seta Esquerda)"
              >
                ◀ -1 Frame
              </button>

              <button
                type="button"
                onMouseDown={() => startHoldingStep(0.1)}
                onMouseUp={stopHoldingStep}
                onMouseLeave={stopHoldingStep}
                onTouchStart={() => startHoldingStep(0.1)}
                onTouchEnd={stopHoldingStep}
                className="px-2.5 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 active:bg-teal-500/20 text-slate-200 text-xs font-bold border border-slate-700/60 transition-colors select-none"
                title="Avançar 1 Frame (Segure para avançar continuamente / Seta Direita)"
              >
                +1 Frame ▶
              </button>

              <button
                type="button"
                onClick={() => stepFrame(1.0)}
                className="px-2 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700/60 transition-colors"
                title="Avançar 1 Segundo (Shift + Seta Direita)"
              >
                +1s ▶▶
              </button>

              <button
                type="button"
                onClick={() => setIsLooping(!isLooping)}
                className={`px-2.5 py-1.5 rounded text-xs font-bold border transition-colors ${
                  isLooping
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/50'
                    : 'bg-slate-800/60 text-slate-500 border-slate-800 hover:text-slate-300'
                }`}
                title="Repetir trecho em Loop"
              >
                🔁 Loop
              </button>

            </div>

            {/* Bloco 2: Seletor de Modo (Foco Trade vs Pós-Trade Violinada) */}
            <div className="flex items-center gap-1 bg-[#070a10] p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setReplayMode('trade_only')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                  replayMode === 'trade_only'
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Toca apenas de T-30s até a Saída"
              >
                🎯 Foco Trade (T-30s → Saída)
              </button>

              <button
                type="button"
                onClick={() => setReplayMode('post_trade')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                  replayMode === 'post_trade'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Continua reproduzindo +5 min pós-saída para ver se foi violinada"
              >
                🔮 Pós-Trade (+5 min)
              </button>

              <button
                type="button"
                onClick={() => setReplayMode('full_video')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                  replayMode === 'full_video'
                    ? 'bg-slate-700/50 text-slate-200 border border-slate-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Vídeo Completo Livre"
              >
                🌐 Vídeo Livre
              </button>
            </div>

            {/* Bloco 3: Multiplicadores de Velocidade (<< Trás e Frente >>) */}
            <div className="flex items-center gap-1 bg-[#070a10] px-2 py-1 rounded-lg border border-slate-800">
              <span className="text-[9px] text-slate-500 font-bold uppercase hidden xl:inline mr-1">VELOCIDADE:</span>

              {/* Botão Shuttle Jog Rewind << */}
              <button
                type="button"
                onClick={() => shuttleJog('backward')}
                className="px-1.5 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold flex items-center gap-0.5 transition-all shadow-sm"
                title="Acelerar para Trás / Rewind (Tecla J)"
              >
                <span>⏪ &lt;&lt;</span>
              </button>

              {/* Multiplicadores Reversos */}
              {[-8, -4, -2, -1].map((mult) => (
                <button
                  key={mult}
                  type="button"
                  onClick={() => setPlaybackMultiplier(mult)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                    isPlaying && currentMultiplier === mult
                      ? 'bg-rose-500/30 text-rose-300 border border-rose-500/60 font-black shadow-[0_0_8px_rgba(244,63,94,0.3)] animate-pulse'
                      : 'text-slate-500 hover:text-rose-400'
                  }`}
                  title={`Voltar a ${Math.abs(mult)}x velocidade`}
                >
                  {mult}x
                </button>
              ))}

              <div className="h-3 w-px bg-slate-800 mx-0.5" />

              {/* Multiplicadores Frente */}
              {[1, 2, 4, 8, 16].map((mult) => (
                <button
                  key={mult}
                  type="button"
                  onClick={() => setPlaybackMultiplier(mult)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                    isPlaying && currentMultiplier === mult
                      ? 'bg-teal-500/30 text-teal-300 border border-teal-500/60 font-black shadow-[0_0_8px_rgba(45,212,191,0.3)]'
                      : 'text-slate-500 hover:text-teal-300'
                  }`}
                  title={`Avançar a ${mult}x velocidade`}
                >
                  {mult === 1 ? '1x' : `+${mult}x`}
                </button>
              ))}

              {/* Botão Shuttle Jog Forward >> */}
              <button
                type="button"
                onClick={() => shuttleJog('forward')}
                className="px-1.5 py-0.5 rounded bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-bold flex items-center gap-0.5 transition-all shadow-sm"
                title="Acelerar para Frente / Fast-Forward (Tecla L)"
              >
                <span>&gt;&gt; ⏩</span>
              </button>
            </div>


            {/* Bloco 4: Zoom & Caneta Piloto & Fullscreen */}
            <div className="flex items-center gap-2">
              {/* Controles de Zoom Dinâmico */}
              <div className="flex items-center gap-1 bg-[#070a10] p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => handleZoomChange(-0.5)}
                  disabled={zoomLevel <= 1.0}
                  className="px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 rounded disabled:opacity-30"
                  title="Diminuir Zoom"
                >
                  −
                </button>
                <span className="text-[10px] font-bold text-teal-400 px-1">{zoomLevel.toFixed(1)}x</span>
                <button
                  type="button"
                  onClick={() => handleZoomChange(0.5)}
                  disabled={zoomLevel >= 5.0}
                  className="px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 rounded disabled:opacity-30"
                  title="Aumentar Zoom (ou use o Scroll no ponto exato mirado)"
                >
                  +
                </button>
                {zoomLevel > 1.0 && (
                  <button
                    type="button"
                    onClick={resetZoom}
                    className="text-[9px] text-slate-400 hover:text-slate-100 px-1 border-l border-slate-700 ml-1 font-bold"
                    title="Resetar Zoom (Tecla Z)"
                  >
                    Reset (Z)
                  </button>
                )}
                <span className="text-[9px] text-slate-500 font-mono hidden 2xl:inline pl-1 border-l border-slate-800" title="Rode o scroll do mouse ou dê duplo clique sobre qualquer book, gráfico ou times & trades">
                  🔍 Scroll/2x Click
                </span>
              </div>


              {/* Botão Caneta Piloto */}
              <div className="flex items-center gap-1.5 bg-[#070a10] p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setPenEnabled(!penEnabled)}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                    penEnabled
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Ativar Caneta Piloto para desenhar na tela"
                >
                  ✏️ {penEnabled ? 'Caneta ATIVA' : 'Caneta'}
                </button>

                {penEnabled && (
                  <>
                    {/* Seletor de Cores */}
                    <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
                      {PEN_COLORS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => {
                            setPenColor(c.hex);
                            setIsEraser(false);
                          }}
                          className={`w-4 h-4 rounded-full transition-transform ${
                            penColor === c.hex && !isEraser ? 'scale-125 ring-2 ring-white' : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => canvasRef.current?.undo()}
                      className="text-[10px] text-slate-400 hover:text-slate-200 px-1"
                      title="Desfazer traço"
                    >
                      ↩
                    </button>

                    <button
                      type="button"
                      onClick={() => canvasRef.current?.clear()}
                      className="text-[10px] text-rose-400 hover:text-rose-200 px-1"
                      title="Limpar todos os desenhos"
                    >
                      Limpar
                    </button>
                  </>
                )}
              </div>

              {/* Tela Cheia */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors"
                title="Tela Cheia (F)"
              >
                ⛶
              </button>
            </div>
          </div>
        )}

        {/* ── PAINEL DE TRANSCRIÇÃO & ANOTAÇÕES FRAME-A-FRAME ── */}
        {!loading && !error && replayData && (
          <div className="px-5 py-3 bg-[#080c16] border-t border-slate-800/90 flex flex-col md:flex-row gap-4 max-h-[260px] overflow-y-auto font-mono">
            {/* Coluna Esquerda: Formulário de Nova Anotação no Frame Atual */}
            <div className="w-full md:w-5/12 space-y-2.5 bg-[#0b101c] p-3 rounded-xl border border-slate-800/80">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[11px] font-bold text-teal-300 flex items-center gap-1.5">
                  <span>📝 ANOTAR NO MOMENTO:</span>
                  <span className="bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded border border-teal-500/40 font-mono font-bold flex items-center gap-1.5">
                    <span>🕒 {getRealClockTime(currentTime)}</span>
                    <span className="text-slate-400 text-[10px]">({formatTime(currentTime)})</span>
                  </span>
                </span>

                {/* Tags de Categoria */}

                <div className="flex items-center gap-1">
                  {NOTE_TAGS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setNewNoteTag(t.id)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all ${
                        newNoteTag === t.id ? `${t.color} font-black shadow-sm` : 'bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seletor de Foco para Análise Visual com AI */}
              <div className="flex items-center justify-between gap-1 text-[9px] bg-[#070a12] px-2 py-1 rounded-md border border-slate-800/80">
                <span className="text-slate-500 font-bold">FOCO AI:</span>
                <div className="flex items-center gap-1">
                  {AI_FOCUS_OPTIONS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setAiFocusArea(f.id)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${
                        aiFocusArea === f.id
                          ? 'bg-purple-500/30 text-purple-200 border border-purple-500/60 shadow-sm'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                      title={f.desc}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleSaveAnnotation();
                  }
                }}
                placeholder="O que você observou neste frame? (Opcional: faça uma pergunta para a IA analisar na imagem...)"
                className="w-full h-16 bg-[#060911] border border-slate-800/90 rounded-lg p-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/60 font-sans resize-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveDrawingWithNote}
                    onChange={(e) => setSaveDrawingWithNote(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-teal-500 focus:ring-0 w-3.5 h-3.5"
                  />
                  <span>✏️ Salvar desenho da tela</span>
                </label>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleGenerateMultiFrameDebriefing}
                    disabled={generatingAI}
                    className="px-2 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 text-[10px] font-bold transition-all disabled:opacity-50 flex items-center gap-1 shadow-sm"
                    title="A IA analisa toda a evolução do trade: Pré-Trade (T-30s), Entrada, Durante, Saída e Pós-Trade (Violinada)"
                  >
                    {generatingAI ? '⏳ ANALISANDO SEQUÊNCIA…' : '🎬 DEBRIEFING MULTI-SEGUNDOS'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleGenerateAIInsight()}
                    disabled={generatingAI}
                    className="px-2 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-[10px] font-bold transition-all disabled:opacity-50 flex items-center gap-1 shadow-sm"
                    title="A IA analisa o screenshot real deste frame individual da tela do Profit Pro"
                  >
                    {generatingAI ? '🤖 LENDO…' : '🤖 LER FRAME'}
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveAnnotation}
                    disabled={savingNote || !newNoteText.trim()}
                    className="px-3 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-[10px] transition-all disabled:opacity-40 shadow-md shadow-teal-500/20"
                  >
                    {savingNote ? 'SALVANDO…' : '💾 SALVAR'}
                  </button>
                </div>

              </div>

            </div>

            {/* Coluna Direita: Lista de Anotações Timestamped */}
            <div className="w-full md:w-7/12 flex flex-col space-y-2 bg-[#0b101c] p-3 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    INSIGHTS & TRANSCRIÇÃO DO TRADE
                  </span>
                  <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[9px] text-slate-400 font-bold">
                    {annotations.length}
                  </span>
                </div>
                <span className="text-[9px] text-slate-500">
                  Clique na anotação para pular direto ao frame
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[160px]">
                {annotations.length === 0 ? (
                  <div className="py-6 text-center text-slate-600 text-xs">
                    Nenhuma anotação registrada ainda. Pause no frame desejado e adicione suas reflexões!
                  </div>
                ) : (
                  annotations.map((ann) => {
                    const isAI = ann.author === 'ai';
                    const isActive = activeAnnotationId === ann.id;
                    const tagObj = NOTE_TAGS.find((t) => t.id === ann.tag) || NOTE_TAGS[0];

                    return (
                      <div
                        key={ann.id}
                        onClick={() => handleJumpToAnnotation(ann)}
                        className={`p-2 rounded-lg border transition-all cursor-pointer group flex items-start justify-between gap-3 ${
                          isActive
                            ? 'bg-teal-500/10 border-teal-500/50 shadow-[0_0_10px_rgba(45,212,191,0.15)]'
                            : isAI
                            ? 'bg-purple-950/20 border-purple-800/40 hover:border-purple-500/50'
                            : 'bg-[#070a12] border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 rounded font-mono flex items-center gap-1">
                              <span>🕒 {ann.clockTime || getRealClockTime(ann.timestampSecs)}</span>
                              <span className="text-slate-500 text-[9px]">({ann.formattedTime})</span>
                            </span>


                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${tagObj.color}`}>
                              {tagObj.label}
                            </span>

                            {isAI && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                🤖 AI Coach
                              </span>
                            )}

                            {ann.drawingData && (
                              <span className="text-[9px] text-amber-400 font-bold flex items-center gap-0.5">
                                ✏️ Desenho salvo
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-300 font-sans leading-relaxed whitespace-pre-wrap line-clamp-3">
                            {ann.text}
                          </p>

                          {ann.text.length > 100 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReadingAnnotation(ann);
                                handleJumpToAnnotation(ann);
                              }}
                              className="text-[10px] text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 pt-0.5"
                            >
                              <span>📖 Ler Análise Completa em Pop-up ↗</span>
                            </button>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReadingAnnotation(ann);
                              handleJumpToAnnotation(ann);
                            }}
                            className="p-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold transition-all"
                            title="Abrir em pop-up de leitura"
                          >
                            ↗
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleDeleteAnnotation(e, ann.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity text-xs"
                            title="Excluir anotação"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── POPUP FLUTUANTE & ARRASTÁVEL DE LEITURA COMPLETA ── */}
        {readingAnnotation && (
          <div
            style={{
              left: popupPosition ? `${popupPosition.x}px` : 'calc(50% - 320px)',
              top: popupPosition ? `${popupPosition.y}px` : '50px',
            }}
            className="fixed z-[90] w-[92vw] max-w-2xl bg-[#090d18]/95 border border-cyan-500/50 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl flex flex-col max-h-[82vh] overflow-hidden animate-in fade-in zoom-in-95 font-mono select-text"
          >
            {/* Header Arrastável */}
            <div
              onMouseDown={handlePopupMouseDown}
              className="flex items-center justify-between px-4 py-3 bg-[#0d1424] border-b border-slate-800/90 cursor-move select-none"
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs font-bold flex items-center gap-1">
                  <span>⋮⋮</span>
                  <span>📖 DEBRIEFING & ANÁLISE COMPLETA</span>
                </span>

                <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded font-mono">
                  🕒 {readingAnnotation.clockTime || getRealClockTime(readingAnnotation.timestampSecs)}
                </span>

                {readingAnnotation.author === 'ai' && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    🤖 AI Coach
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => jumpToFrame(readingAnnotation.timestampSecs)}
                  className="px-2.5 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1"
                  title="Pular vídeo para o momento desta análise"
                >
                  ⏱️ Ir ao Frame Inicial
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyAnnotationText(readingAnnotation.text)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold transition-all"
                  title="Copiar texto da análise"
                >
                  {copiedNote ? '✓ Copiado!' : '📋 Copiar'}
                </button>

                <button
                  type="button"
                  onClick={() => setReadingAnnotation(null)}
                  className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-all text-xs px-2"
                  title="Fechar Pop-up"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Dica de arraste */}
            <div className="bg-[#0b101d] px-4 py-1.5 border-b border-slate-800/50 flex items-center justify-between text-[9px] text-slate-500">
              <span>💡 Arraste pelo cabeçalho superior para mover este pop-up pela tela</span>
              <span>Frame: ⏱️ {readingAnnotation.formattedTime}</span>
            </div>

            {/* Conteúdo Completo com Blocos Interativos e Botões por Frame */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 font-sans text-sm text-slate-200 leading-relaxed max-h-[65vh]">
              {renderInteractiveDebriefing(readingAnnotation.text)}
            </div>


            {/* Rodapé do Popup */}
            <div className="px-4 py-2.5 bg-[#0d1424] border-t border-slate-800/90 flex items-center justify-between text-xs">
              <span className="text-[10px] text-slate-500 font-mono">
                Trade #{trade.tradeNumber} · {trade.instrument} ({trade.side === 'C' ? 'Compra' : 'Venda'}) @ {trade.entryPrice}
              </span>
              <button
                type="button"
                onClick={() => setReadingAnnotation(null)}
                className="px-4 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] font-bold transition-all"
              >
                Concluir Leitura
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


