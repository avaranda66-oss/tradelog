'use client';

import { useRef, useState } from 'react';

interface VideoUploaderProps {
  date: string;
  hasTrades: boolean;
  onProcessed?: () => void;
}

interface StepStatus {
  step: string;
  percent: number;
  status: 'pending' | 'active' | 'done' | 'error';
  message: string;
}

export function VideoUploader({ date, hasTrades, onProcessed }: VideoUploaderProps) {
  const [mode, setMode] = useState<'upload' | 'path'>('path');
  const [localPath, setLocalPath] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Estados detalhados de progresso por etapa
  const [overallPercent, setOverallPercent] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [steps, setSteps] = useState<Record<string, StepStatus>>({
    video_copy: { step: '1. Registro & Validação do Vídeo', percent: 0, status: 'pending', message: 'Aguardando início' },
    audio_extract: { step: '2. Extração da Faixa de Áudio MP3', percent: 0, status: 'pending', message: 'Aguardando vídeo' },
    transcription: { step: '3. Transcrição & Análise de Voz (Gemini AI)', percent: 0, status: 'pending', message: 'Aguardando áudio' },
    frames: { step: '4. Vinculação de Screenshots dos Trades', percent: 0, status: 'pending', message: 'Aguardando transcrição' },
  });

  const [startTime, setStartTime] = useState('');
  const [extractAudio, setExtractAudio] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Processa via SSE Stream para ter barras de carregamento em tempo real
  async function handleProcessStream(pathToUse: string) {
    const cleanPath = pathToUse.trim().replace(/^["']|["']$/g, '');
    if (!cleanPath) {
      setErrorMessage('❌ Digite ou cole o caminho completo do vídeo (ex: d:\\estudos\\2026-08-07 09-04-54.mp4)');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    setSuccessMessage('');
    setOverallPercent(5);

    // Reseta etapas
    setSteps({
      video_copy: { step: '1. Registro & Validação do Vídeo OBS', percent: 15, status: 'active', message: 'Iniciando cópia...' },
      audio_extract: { step: '2. Extração da Faixa de Áudio MP3', percent: 0, status: 'pending', message: 'Aguardando vídeo' },
      transcription: { step: '3. Transcrição & Análise de Voz (Gemini AI)', percent: 0, status: 'pending', message: 'Aguardando áudio' },
      frames: { step: '4. Vinculação de Screenshots dos Trades', percent: 0, status: 'pending', message: 'Aguardando transcrição' },
    });

    try {
      const response = await fetch('/api/process-video/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: cleanPath,
          date,
          startTime,
          extractAudio,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Falha ao conectar ao servidor de processamento SSE');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.replace(/^data:\s*/, '').trim();
          if (!trimmed) continue;

          try {
            const data = JSON.parse(trimmed);
            if (data.percent) setOverallPercent(data.percent);

            if (data.step === 'error' || data.status === 'error') {
              setErrorMessage(`❌ Erro: ${data.details?.message || 'Falha no processamento'}`);
              setIsProcessing(false);
              return;
            }

            if (data.step === 'complete') {
              setOverallPercent(100);
              setIsProcessing(false);
              setSuccessMessage(`✅ ${data.details?.message || 'Processamento concluído com sucesso!'}`);
              onProcessed?.();
              return;
            }

            // Atualiza status da etapa individual
            if (data.step && steps[data.step]) {
              setSteps(prev => ({
                ...prev,
                [data.step]: {
                  ...prev[data.step],
                  percent: data.percent,
                  status: data.status,
                  message: data.details?.message || prev[data.step].message,
                },
              }));
            }
          } catch (e) {
            console.error('[VideoUploader] Erro ao parsear SSE data:', e);
          }
        }
      }
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(`❌ Erro de conexão: ${err.message || String(err)}`);
    }
  }

  return (
    <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-4 font-mono shadow-2xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-teal-400 font-bold text-sm">🎬</span>
          <h3 className="text-xs font-mono font-bold text-slate-100 uppercase tracking-[0.15em]">
            OBS VIDEO &amp; AI AUDIO REPLAY ENGINE
          </h3>
        </div>

        {/* Toggle de Modo */}
        <div className="flex items-center gap-1 text-[10px] bg-[#070a10] p-1 rounded border border-slate-800/80">
          <button
            type="button"
            onClick={() => setMode('path')}
            className={`px-2 py-0.5 rounded font-bold transition-all ${
              mode === 'path' ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            📁 CAMINHO LOCAL (RECOMENDADO PARA VÍDEOS &gt; 500MB)
          </button>
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`px-2 py-0.5 rounded font-bold transition-all ${
              mode === 'upload' ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            📤 ARRASTAR &amp; SOLTAR
          </button>
        </div>
      </div>

      {/* Opções de Início & Transcrição */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#070a10] p-2.5 rounded-lg border border-slate-800/80">
        <div className="flex items-center gap-2">
          <label className="text-slate-400 shrink-0">Horário início:</label>
          <input
            type="time"
            step="1"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="Auto"
            className="bg-[#0b1018] border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200 w-28 focus:outline-none focus:border-teal-500/50 font-mono"
          />
          <span className="text-[10px] text-slate-500 font-sans">(auto-detecta do nome OBS)</span>
        </div>

        <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={extractAudio}
            onChange={(e) => setExtractAudio(e.target.checked)}
            className="rounded border-slate-700 text-teal-500 focus:ring-teal-500 bg-slate-900"
          />
          <span>🎙️ Extrair narração de voz &amp; transcrever via Gemini AI</span>
        </label>
      </div>

      {/* Input de Caminho Local */}
      {mode === 'path' ? (
        <div className="space-y-2 bg-[#070a10] p-3 rounded-lg border border-slate-800/80">
          <label className="text-[10px] text-slate-400 uppercase font-bold block">
            CAMINHO COMPLETO DO VÍDEO NO COMPUTADOR (EX: d:\estudos\2026-08-07 09-04-54.mp4)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              placeholder="Cole o caminho do arquivo MP4/MKV aqui..."
              disabled={isProcessing}
              className="bg-[#0b1018] border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 w-full focus:outline-none focus:border-teal-500/50 font-mono"
            />
            <button
              type="button"
              onClick={() => handleProcessStream(localPath)}
              disabled={isProcessing}
              className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded text-xs transition-all shrink-0 uppercase tracking-wider"
            >
              {isProcessing ? 'PROCESSANDO…' : 'PROCESSAR VÍDEO'}
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files[0];
            const p = (f as any)?.path;
            if (p) {
              setLocalPath(p);
              handleProcessStream(p);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-6 px-4 transition-all text-xs ${
            isDragging
              ? 'border-teal-400 bg-teal-400/5 cursor-pointer'
              : 'border-slate-700/50 hover:border-slate-500 text-slate-500 cursor-pointer'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mp4,.mkv,.avi,.mov"
            onChange={(e) => {
              const f = e.target.files?.[0];
              const p = (f as any)?.path;
              if (p) handleProcessStream(p);
            }}
            className="hidden"
          />
          <span className="text-2xl">🎬</span>
          <span className="font-medium">Arraste o vídeo do OBS aqui</span>
        </div>
      )}

      {/* BARRAS DE CARREGAMENTO & PROGRESSO DAS 4 ETAPAS */}
      {(isProcessing || overallPercent > 0) && (
        <div className="space-y-3 bg-[#070a10] border border-slate-800/80 rounded-xl p-3.5 animate-in fade-in">
          {/* Barra Global de Carregamento */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold text-slate-300 uppercase tracking-wider">
              <span>PROGRESSO GERAL DE PROCESSAMENTO</span>
              <span className="text-teal-400">{overallPercent}%</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className="bg-teal-400 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(45,212,191,0.5)]"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          </div>

          {/* Lista de Barras e Status por Etapa */}
          <div className="space-y-2 pt-1 divide-y divide-slate-800/50">
            {Object.entries(steps).map(([key, item]) => (
              <div key={key} className="pt-2 first:pt-0 space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className={`font-semibold flex items-center gap-2 ${
                    item.status === 'done' ? 'text-teal-400' :
                    item.status === 'active' ? 'text-cyan-400 font-bold animate-pulse' :
                    item.status === 'error' ? 'text-rose-400' : 'text-slate-500'
                  }`}>
                    {item.status === 'done' ? '✓' : item.status === 'active' ? '⏳' : '•'}
                    {item.step}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    item.status === 'done' ? 'bg-teal-500/10 border-teal-500/30 text-teal-400' :
                    item.status === 'active' ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300' :
                    item.status === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
                    'bg-slate-900 border-slate-800 text-slate-600'
                  }`}>
                    {item.status === 'done' ? 'CONCLUÍDO' : item.status === 'active' ? 'EM ANDAMENTO' : 'PENDENTE'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans">{item.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mensagens Finais */}
      {errorMessage && (
        <div className="px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs font-mono text-rose-400">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="px-3 py-2 bg-teal-500/10 border border-teal-500/30 rounded-lg text-xs font-mono text-teal-400">
          {successMessage}
        </div>
      )}
    </div>
  );
}

export default VideoUploader;
