'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { importTradesCSV } from '@/features/trades/actions';
import { processOBSVideo } from '@/features/video/actions';
import { saveAudioRecording, transcribeAudioRecord } from '@/features/audio/actions';
import { IconUpload, IconFile, IconVideo, IconMic, IconCheck } from '@/components/ui/icons';

interface MediaUploadCenterStudioProps {
  date: string;
  onSuccess?: () => void;
}

export function MediaUploadCenterStudio({ date, onSuccess }: MediaUploadCenterStudioProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    // 1. CSV do Profit Pro
    if (ext === 'csv' || file.type.includes('csv') || file.type.includes('excel')) {
      setStatus('uploading');
      setStatusMessage(`Importando CSV do Profit Pro (${file.name})…`);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await importTradesCSV(formData);
        setStatus('done');
        setStatusMessage(`CSV IMPORTADO COM SUCESSO // ${res.tradesImported} trades registrados em ${res.date}.`);
        if (res.date !== date) {
          router.push(`/?date=${res.date}`);
        }
        onSuccess?.();
        router.refresh();
      } catch (err) {
        setStatus('error');
        setStatusMessage(`ERRO AO IMPORTAR CSV // ${err instanceof Error ? err.message : 'Formato inválido'}`);
      }
      return;
    }

    // 2. Vídeo do OBS (.mp4, .mkv, .avi, .mov)
    if (['mp4', 'mkv', 'avi', 'mov'].includes(ext) || file.type.startsWith('video/')) {
      setStatus('uploading');
      setStatusMessage(`1/3 Upload do vídeo OBS (${(file.size / 1024 / 1024).toFixed(1)} MB)…`);
      try {
        const formData = new FormData();
        formData.append('video', file);
        formData.append('date', date);

        setStatus('processing');
        setStatusMessage('2/3 Extraindo screenshots dos trades + narração de voz…');

        const res = await processOBSVideo(formData);

        setStatus('done');
        setStatusMessage(
          `VÍDEO OBS PROCESSADO // ` +
          (res.framesExtracted > 0 ? `${res.framesExtracted} screenshots extraídos. ` : '') +
          (res.transcriptionSuccess ? 'Narração extraída e transcrita com Gemini AI.' : '')
        );
        if (res.date !== date) {
          router.push(`/?date=${res.date}`);
        }
        onSuccess?.();
        router.refresh();
      } catch (err) {
        setStatus('error');
        setStatusMessage(`ERRO AO PROCESSAR VÍDEO // ${err instanceof Error ? err.message : 'Falha no processamento'}`);
      }
      return;
    }

    // 3. Áudio de Voz (.mp3, .wav, .webm)
    if (['mp3', 'wav', 'webm', 'm4a'].includes(ext) || file.type.startsWith('audio/')) {
      setStatus('uploading');
      setStatusMessage(`Upload do áudio de voz (${(file.size / 1024 / 1024).toFixed(1)} MB)…`);
      try {
        const formData = new FormData();
        formData.append('audio', file);
        formData.append('date', date);

        const record = await saveAudioRecording(formData);
        setStatus('processing');
        setStatusMessage('Transcrevendo áudio de voz com Gemini 2.5 Flash AI…');

        await transcribeAudioRecord(record.id);

        setStatus('done');
        setStatusMessage(`ÁUDIO DE VOZ GRAVADO E TRANSCRITO COM SUCESSO`);
        onSuccess?.();
        router.refresh();
      } catch (err) {
        setStatus('error');
        setStatusMessage(`ERRO AO PROCESSAR ÁUDIO // ${err instanceof Error ? err.message : 'Falha na transcrição'}`);
      }
      return;
    }

    setStatus('error');
    setStatusMessage('FORMATO NÃO SUPORTADO // Envie CSV do Profit, Vídeo OBS (.mp4/.mkv) ou Áudio (.mp3/.webm).');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <section aria-label="Central de mídia" className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <IconUpload className="text-teal-400" />
          <h2 className="font-mono text-[10px] tracking-[0.25em] font-bold text-slate-300 uppercase">
            MEDIA INTAKE PROTOCOL · UPLOAD & PROCESSAMENTO
          </h2>
        </div>
        <span className="font-mono text-[9px] text-slate-600">PROFIT PRO / OBS REPLAY</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Caixa de Drag and Drop (Esquerda - 5 colunas) */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`lg:col-span-5 rounded-lg border border-dashed p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 min-h-[160px] ${
            isDragging
              ? 'border-teal-400 bg-teal-500/10 scale-[1.01]'
              : 'border-slate-800 hover:border-slate-600 bg-[#070a10] hover:bg-slate-950/80'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,video/*,.mp4,.mkv,.avi,.mov,audio/*,.mp3,.wav,.webm"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="hidden"
          />

          {status === 'uploading' || status === 'processing' ? (
            <div className="flex flex-col items-center gap-2">
              <span className="font-mono text-xs font-bold text-teal-400 animate-pulse">PROCESSING FILE…</span>
              <span className="font-mono text-[11px] text-slate-300">{statusMessage}</span>
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-md bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 mb-2">
                <IconUpload width={20} height={20} />
              </div>

              <p className="font-mono text-xs font-bold text-slate-200">
                DROP FILES HERE OR CLICK TO SELECT
              </p>
              <p className="font-mono text-[10px] text-slate-500 mt-1">
                CSV DO PROFIT, VÍDEOS OBS OU ÁUDIOS <br />
                <span className="text-teal-400/90 underline">clique para procurar no sistema</span>
              </p>
            </>
          )}
        </div>

        {/* Tipos Aceitos (Centro - 4 colunas) */}
        <div className="lg:col-span-4 space-y-2 font-mono">
          <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block">
            TIPOS ACEITOS & PROTOCOLO
          </span>

          <div className="space-y-1.5">
            {/* Card CSV */}
            <div className="bg-[#070a10] border border-slate-800/80 rounded-md p-2 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <IconFile className="text-teal-400" />
                <div>
                  <span className="text-[11px] font-bold text-slate-200 block">CSV DO PROFIT PRO</span>
                  <span className="text-[9px] text-slate-500">Extrato .csv de Execuções</span>
                </div>
              </div>
              <span className="text-[9px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-1.5 py-0.5 rounded font-bold">
                READY
              </span>
            </div>

            {/* Card Vídeo OBS */}
            <div className="bg-[#070a10] border border-slate-800/80 rounded-md p-2 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <IconVideo className="text-cyan-400" />
                <div>
                  <span className="text-[11px] font-bold text-slate-200 block">VÍDEO REPLAY OBS</span>
                  <span className="text-[9px] text-slate-500">.mp4, .mkv - Screen Replay</span>
                </div>
              </div>
              <span className="text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded font-bold">
                READY
              </span>
            </div>

            {/* Card Áudio/Voz */}
            <div className="bg-[#070a10] border border-slate-800/80 rounded-md p-2 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <IconMic className="text-purple-400" />
                <div>
                  <span className="text-[11px] font-bold text-slate-200 block">ÁUDIO / NARRAÇÃO DE VOZ</span>
                  <span className="text-[9px] text-slate-500">.mp3, .wav, .webm - Voice Log</span>
                </div>
              </div>
              <span className="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-bold">
                READY
              </span>
            </div>
          </div>
        </div>

        {/* Processamento Automático (Direita - 3 colunas) */}
        <div className="lg:col-span-3 bg-[#070a10] border border-slate-800/80 rounded-md p-3 flex flex-col justify-between font-mono">
          <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block">
            FLUXO AUTOMÁTICO
          </span>

          <div className="space-y-1 text-[10px] text-slate-300 py-1.5">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-[9px] font-bold">1</span>
              <span>Upload do arquivo</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[9px] font-bold">2</span>
              <span>Extração de frames</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[9px] font-bold">3</span>
              <span>IA Visão + Transcrição</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-[9px] font-bold">4</span>
              <span>Sincronizado no banco</span>
            </div>
          </div>

          <div className="bg-teal-500/10 border border-teal-500/20 rounded p-1.5 text-center">
            <span className="text-[10px] font-bold text-teal-400">
              IN Pipeline Automático
            </span>
          </div>
        </div>
      </div>

      {/* Feedback Message */}
      {statusMessage && status !== 'uploading' && status !== 'processing' && (
        <div className={`px-3 py-2 rounded-md font-mono text-xs ${
          status === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
          status === 'done' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' :
          'bg-slate-900 text-slate-300'
        }`}>
          {statusMessage}
        </div>
      )}
    </section>
  );
}

export default MediaUploadCenterStudio;
