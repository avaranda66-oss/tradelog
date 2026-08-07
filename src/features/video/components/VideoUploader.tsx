'use client';

import { useRef, useState } from 'react';
import { processOBSVideo } from '@/features/video/actions';

interface VideoUploaderProps {
  date: string;
  hasTrades: boolean;
  onProcessed?: () => void;
}

export function VideoUploader({ date, hasTrades, onProcessed }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState('');
  const [startTime, setStartTime] = useState('');
  const [extractAudio, setExtractAudio] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mkv|avi|mov)$/i)) {
      setMessage('❌ Arquivo deve ser um vídeo (.mp4, .mkv, .avi, .mov)');
      setStatus('error');
      return;
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
          ? `🎙️ Narração extraída e transcrita com sucesso via Gemini 2.5 Flash!`
          : `🎙️ Narração de áudio extraída para o diário.`;
      }

      setMessage(msg);
      onProcessed?.();
    } catch (err) {
      setStatus('error');
      setMessage(`❌ ${err instanceof Error ? err.message : 'Erro ao processar vídeo'}`);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          🎬 Gravação OBS
        </h3>
        {!hasTrades && (
          <span className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
            Importe o CSV antes
          </span>
        )}
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
            className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-2 py-1 text-xs text-slate-200 w-28 focus:outline-none focus:border-emerald-500/50"
          />
          <span className="text-[10px] text-slate-600 hidden lg:inline">(auto-detecta do nome)</span>
        </div>

        {/* Extrair áudio toggle */}
        <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={extractAudio}
            onChange={(e) => setExtractAudio(e.target.checked)}
            className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800"
          />
          <span>🎙️ Extrair narração & transcrever com Gemini AI</span>
        </label>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => hasTrades && fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-6 px-4 transition-all text-xs ${
          !hasTrades
            ? 'border-slate-800/30 text-slate-700 cursor-not-allowed'
            : isDragging
              ? 'border-cyan-400 bg-cyan-400/5 cursor-pointer'
              : 'border-slate-700/50 hover:border-slate-500 text-slate-500 cursor-pointer'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mp4,.mkv,.avi,.mov"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          className="hidden"
          disabled={!hasTrades}
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
            <span className="text-[10px] text-slate-600">
              {extractAudio
                ? 'Extrai screenshots 30s antes de cada trade + extrai narração e transcreve via AI'
                : 'Extrai screenshots 30s antes de cada trade automaticamente'}
            </span>
          </>
        )}
      </div>

      {/* Status */}
      {message && status !== 'uploading' && status !== 'processing' && (
        <div className={`px-3 py-2 rounded-lg text-xs font-medium animate-in fade-in ${
          status === 'error' ? 'bg-red-500/10 text-red-400' :
          status === 'done' ? 'bg-emerald-500/10 text-emerald-400' :
          'bg-blue-500/10 text-blue-400'
        }`}>
          {message}
        </div>
      )}

      {/* Info */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-600">
        <span>Formatos: MP4, MKV, AVI, MOV</span>
        <span>•</span>
        <span>Screenshots: 30s antes + entrada + saída</span>
        <span>•</span>
        <span>Narração: extração MP3 direta</span>
        <span>•</span>
        <span>Nome OBS: auto-detecta horário</span>
      </div>
    </div>
  );
}
