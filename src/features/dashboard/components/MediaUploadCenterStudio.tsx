'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { importTradesCSV } from '@/features/trades/actions';
import { processOBSVideo } from '@/features/video/actions';
import { saveAudioRecording, transcribeAudioRecord } from '@/features/audio/actions';

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
      setStatusMessage(`Importando CSV do Profit Pro (${file.name})...`);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await importTradesCSV(formData);
        setStatus('done');
        setStatusMessage(`✅ CSV Importado com sucesso! ${res.tradesImported} trades registrados para ${res.date}.`);
        if (res.date !== date) {
          router.push(`/?date=${res.date}`);
        }
        onSuccess?.();
        router.refresh();
      } catch (err) {
        setStatus('error');
        setStatusMessage(`❌ Erro ao importar CSV: ${err instanceof Error ? err.message : 'Formato inválido'}`);
      }
      return;
    }

    // 2. Vídeo do OBS (.mp4, .mkv, .avi, .mov)
    if (['mp4', 'mkv', 'avi', 'mov'].includes(ext) || file.type.startsWith('video/')) {
      setStatus('uploading');
      setStatusMessage(`1/3 Upload do vídeo OBS (${(file.size / 1024 / 1024).toFixed(1)} MB)...`);
      try {
        const formData = new FormData();
        formData.append('video', file);
        formData.append('date', date);

        setStatus('processing');
        setStatusMessage('2/3 Extraindo screenshots dos trades + narração de voz...');

        const res = await processOBSVideo(formData);

        setStatus('done');
        setStatusMessage(
          `✅ Vídeo OBS Processado (${res.date})! ` +
          (res.framesExtracted > 0 ? `${res.framesExtracted} screenshots extraídos. ` : '') +
          (res.transcriptionSuccess ? '🎙️ Narração extraída e transcrita com Gemini AI!' : '')
        );
        if (res.date !== date) {
          router.push(`/?date=${res.date}`);
        }
        onSuccess?.();
        router.refresh();
      } catch (err) {
        setStatus('error');
        setStatusMessage(`❌ Erro ao processar vídeo: ${err instanceof Error ? err.message : 'Falha no processamento'}`);
      }
      return;
    }

    // 3. Áudio de Voz (.mp3, .wav, .webm)
    if (['mp3', 'wav', 'webm', 'm4a'].includes(ext) || file.type.startsWith('audio/')) {
      setStatus('uploading');
      setStatusMessage(`Upload do áudio de voz (${(file.size / 1024 / 1024).toFixed(1)} MB)...`);
      try {
        const formData = new FormData();
        formData.append('audio', file);
        formData.append('date', date);

        const record = await saveAudioRecording(formData);
        setStatus('processing');
        setStatusMessage('Transcrevendo áudio de voz com Gemini 2.5 Flash AI...');

        await transcribeAudioRecord(record.id);

        setStatus('done');
        setStatusMessage(`✅ Áudio de voz gravado e transcrito com sucesso!`);
        onSuccess?.();
        router.refresh();
      } catch (err) {
        setStatus('error');
        setStatusMessage(`❌ Erro ao processar áudio: ${err instanceof Error ? err.message : 'Falha na transcrição'}`);
      }
      return;
    }

    setStatus('error');
    setStatusMessage('❌ Formato não suportado. Envie CSV do Profit, Vídeo OBS (.mp4/.mkv) ou Áudio (.mp3/.webm).');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="bg-[#0d131f] border border-slate-800/80 rounded-2xl p-5 space-y-4 shadow-xl">
      {/* Header Seção 1 */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <span>⬆</span> 1. CENTRAL DE UPLOAD DE MÍDIAS
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
          Arraste e solte seus arquivos aqui ou clique para selecionar
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Caixa de Drag and Drop (Esquerda - 5 colunas) */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`lg:col-span-5 rounded-2xl border-2 border-dashed p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 min-h-[160px] ${
            isDragging
              ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
              : 'border-slate-800 hover:border-slate-600 bg-slate-950/50 hover:bg-slate-950/80'
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
              <span className="text-3xl animate-spin">⏳</span>
              <span className="text-xs font-semibold text-slate-200">{statusMessage}</span>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3 text-2xl shadow-inner">
                ☁️
              </div>

              <p className="text-xs font-bold text-slate-200">
                Arraste seus arquivos aqui
              </p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                CSV, Vídeos, Áudios ou Imagens <br />
                <span className="text-emerald-400/80 underline font-medium">ou clique para selecionar</span>
              </p>
            </>
          )}
        </div>

        {/* Tipos Aceitos (Centro - 4 colunas) */}
        <div className="lg:col-span-4 space-y-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">
            TIPOS ACEITOS
          </span>

          <div className="space-y-2">
            {/* Card CSV */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
                  📄
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-200 block">CSV DO PROFIT PRO</span>
                  <span className="text-[10px] text-slate-500">Arquivo .csv — Trades e Candles</span>
                </div>
              </div>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-semibold">
                ✓ Pronto para processar
              </span>
            </div>

            {/* Card Vídeo OBS */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-xs font-bold">
                  📹
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-200 block">VÍDEO DO OBS</span>
                  <span className="text-[10px] text-slate-500">.mp4, .mkv, .avi, .mov — Gravação de tela</span>
                </div>
              </div>
              <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded font-mono font-semibold">
                ✓ Pronto para processar
              </span>
            </div>

            {/* Card Áudio/Voz */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 text-xs font-bold">
                  🎙️
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-200 block">ÁUDIO / VOZ</span>
                  <span className="text-[10px] text-slate-500">.mp3, .wav, .webm — Narração do dia</span>
                </div>
              </div>
              <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded font-mono font-semibold">
                ✓ Pronto para processar
              </span>
            </div>
          </div>
        </div>

        {/* Processamento Automático (Direita - 3 colunas) */}
        <div className="lg:col-span-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 flex flex-col justify-between">
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">
            PROCESSAMENTO AUTOMÁTICO
          </span>

          <div className="space-y-1.5 text-xs text-slate-300 py-2 font-medium">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">1</span>
              <span>Upload do arquivo</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-bold">2</span>
              <span>Processamento e extração</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[10px] font-bold">3</span>
              <span>IA: Transcrição e análise</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">4</span>
              <span>Salvo e disponível</span>
            </div>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-2 text-center">
            <span className="text-[11px] font-semibold text-emerald-400">
              Tudo acontece automaticamente!
            </span>
          </div>
        </div>
      </div>

      {/* Feedback Message */}
      {statusMessage && status !== 'uploading' && status !== 'processing' && (
        <div className={`px-4 py-2.5 rounded-xl text-xs font-medium animate-in fade-in ${
          status === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
          status === 'done' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
          'bg-slate-900 text-slate-300'
        }`}>
          {statusMessage}
        </div>
      )}
    </div>
  );
}
