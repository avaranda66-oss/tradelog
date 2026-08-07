'use client';

import { useRef, useState } from 'react';
import { processOBSVideo, processVideoFromPathAction } from '@/features/video/actions';

interface VideoUploaderProps {
  date: string;
  hasTrades: boolean;
  onProcessed?: () => void;
}

export function VideoUploader({ date, hasTrades, onProcessed }: VideoUploaderProps) {
  const [mode, setMode] = useState<'upload' | 'path'>('path'); // Padrão 'path' para vídeos grandes do OBS
  const [localPath, setLocalPath] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState('');
  const [startTime, setStartTime] = useState('');
  const [extractAudio, setExtractAudio] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Processa via caminho do disco local (sem estourar limite HTTP em vídeos de 2.5GB+)
  async function handleProcessLocalPath(pathOverride?: string) {
    const pathToUse = (pathOverride || localPath).trim().replace(/^["']|["']$/g, '');
    if (!pathToUse) {
      setMessage('❌ Digite ou cole o caminho completo do vídeo (ex: d:\\estudos\\2026-08-07 09-04-54.mp4)');
      setStatus('error');
      return;
    }

    setStatus('processing');
    setMessage(`1/2 Processando vídeo no disco (${pathToUse})...`);
    setProgress(extractAudio ? 'Extraindo screenshots dos trades + narração e transcrevendo via AI...' : 'Extraindo screenshots dos trades...');

    try {
      const formData = new FormData();
      formData.append('path', pathToUse);
      formData.append('date', date);
      formData.append('extractAudio', extractAudio ? 'true' : 'false');
      if (startTime) formData.append('startTime', startTime);

      const result = await processVideoFromPathAction(formData);

      setStatus('done');
      let msg = `✅ Vídeo de ${Math.floor(result.duration / 60)}min processado no disco com sucesso! `;
      if (result.framesExtracted > 0) {
        msg += `📸 ${result.framesExtracted} screenshots salvos nos trades. `;
      }
      if (result.audioExtracted) {
        msg += result.transcriptionSuccess
          ? `🎙️ Narração extraída e transcrita via Gemini AI!`
          : `🎙️ Narração extraída com sucesso.`;
      }

      setMessage(msg);
      onProcessed?.();
    } catch (err) {
      setStatus('error');
      setMessage(`❌ Erro ao processar vídeo: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mkv|avi|mov)$/i)) {
      setMessage('❌ Arquivo deve ser um vídeo (.mp4, .mkv, .avi, .mov)');
      setStatus('error');
      return;
    }

    // Se o arquivo for maior que 250MB, alerta o usuário para usar o caminho local
    if (file.size > 250 * 1024 * 1024) {
      setMessage(`⚠️ Vídeo grande (${(file.size / 1024 / 1024).toFixed(0)} MB). Utilize o modo "Caminho Local" abaixo para processar sem limite HTTP.`);
    }

    setStatus('uploading');
    setMessage(`1/3 Fazendo upload do vídeo (${(file.size / 1024 / 1024).toFixed(1)} MB)...`);

    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('date', date);
      formData.append('extractAudio', extractAudio ? 'true' : 'false');
      if (startTime) formData.append('startTime', startTime);

      setStatus('processing');
      setProgress(extractAudio ? '2/3 Extraindo screenshots dos trades e narração de áudio...' : '2/2 Extraindo screenshots dos trades...');

      const result = await processOBSVideo(formData);

      setStatus('done');
      let msg = `✅ Vídeo processado com sucesso! Duração: ${Math.floor(result.duration / 60)}min. `;
      if (result.framesExtracted > 0) {
        msg += `📸 ${result.framesExtracted} screenshots vinculados aos trades. `;
      }
      if (result.audioExtracted) {
        msg += result.transcriptionSuccess
          ? `🎙️ Narração extraída e transcrita com sucesso via Gemini AI!`
          : `🎙️ Narração de áudio extraída para o diário.`;
      }

      setMessage(msg);
      onProcessed?.();
    } catch (err) {
      setStatus('error');
      setMessage(`❌ ${err instanceof Error ? err.message : 'Erro ao processar vídeo. Tente usar o modo "Caminho Local"'}`);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      // Se tiver path local da API do browser (electron/tauri) ou arquivo
      const pathProperty = (file as any).path;
      if (pathProperty) {
        setLocalPath(pathProperty);
        setMode('path');
        handleProcessLocalPath(pathProperty);
      } else {
        handleFile(file);
      }
    }
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-4 space-y-3 font-mono">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
        <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2 uppercase tracking-wider">
          🎬 PROCESSAMENTO DE VÍDEO DO OBS REPLAY
        </h3>
        
        {/* Toggle de Modo */}
        <div className="flex items-center gap-1 text-[10px] bg-slate-950 p-1 rounded border border-slate-800">
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

      {/* Opções de processamento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Horário de início (opcional) */}
        <div className="flex items-center gap-2">
          <label className="text-slate-400 shrink-0">Início vídeo:</label>
          <input
            type="time"
            step="1"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="Auto (do nome OBS)"
            className="bg-slate-800/50 border border-slate-700/50 rounded px-2 py-1 text-xs text-slate-200 w-28 focus:outline-none focus:border-teal-500/50 font-mono"
          />
          <span className="text-[10px] text-slate-500 font-sans">(auto-detecta do nome)</span>
        </div>

        {/* Extrair áudio toggle */}
        <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={extractAudio}
            onChange={(e) => setExtractAudio(e.target.checked)}
            className="rounded border-slate-700 text-teal-500 focus:ring-teal-500 bg-slate-800"
          />
          <span>🎙️ Extrair narração &amp; transcrever via Gemini AI</span>
        </label>
      </div>

      {/* MODO 1: CAMINHO DO ARQUIVO LOCAL (Instantâneo sem estouro de RAM) */}
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
              disabled={status === 'processing'}
              className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 w-full focus:outline-none focus:border-teal-500/50 font-mono"
            />
            <button
              type="button"
              onClick={() => handleProcessLocalPath()}
              disabled={status === 'processing'}
              className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded text-xs transition-all shrink-0"
            >
              {status === 'processing' ? 'PROCESSANDO…' : 'PROCESSAR VÍDEO'}
            </button>
          </div>
          <p className="text-[10px] text-teal-400/80 font-sans">
            💡 <strong>Sem limite de tamanho!</strong> Lê diretamente do disco rígido sem travamentos ou falha de upload HTTP.
          </p>
        </div>
      ) : (
        /* MODO 2: DROPZONE PADRÃO */
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
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
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="hidden"
          />
          {status === 'uploading' || status === 'processing' ? (
            <div className="flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              <span>{progress || message}</span>
            </div>
          ) : (
            <>
              <span className="text-2xl">🎬</span>
              <span className="font-medium">Arraste o vídeo do OBS aqui</span>
              <span className="text-[10px] text-slate-600 font-sans">
                Para vídeos maiores que 500MB, use o modo "Caminho Local" acima.
              </span>
            </>
          )}
        </div>
      )}

      {/* Status Message */}
      {message && (
        <div className={`px-3 py-2 rounded-lg text-xs font-mono font-medium animate-in fade-in ${
          status === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' :
          status === 'done' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30' :
          'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
}

export default VideoUploader;
