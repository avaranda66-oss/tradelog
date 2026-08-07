'use client';

import { useRef, useState } from 'react';
import { importTradesCSV, importCandlesCSV } from '@/features/trades/actions';

export function CsvUploader({ onImported }: { onImported?: (date?: string) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStatus('loading');
    setMessage('Importando...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Detecta tipo pelo nome do arquivo
      const name = file.name.toLowerCase();
      let result;

      if (name.includes('1min')) {
        formData.append('timeframe', '1min');
        result = await importCandlesCSV(formData);
        setMessage(`✅ ${result.imported} candles de 1min importados`);
      } else if (name.includes('5min')) {
        formData.append('timeframe', '5min');
        result = await importCandlesCSV(formData);
        setMessage(`✅ ${result.imported} candles de 5min importados`);
      } else {
        result = await importTradesCSV(formData);
        setMessage(
          `✅ ${result.tradesImported} trades importados (${result.date}) | ${result.totalPoints > 0 ? '+' : ''}${result.totalPoints}pts | R$ ${result.totalReais.toFixed(2)}`
        );
      }

      setStatus('success');
      onImported?.(result && 'date' in result ? result.date : undefined);
    } catch (err) {
      setStatus('error');
      setMessage(`❌ Erro: ${err instanceof Error ? err.message : 'Falha ao importar'}`);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      handleFile(file);
    } else {
      setStatus('error');
      setMessage('❌ Apenas arquivos .csv são aceitos');
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? 'border-emerald-400 bg-emerald-400/5 scale-[1.02]'
            : 'border-slate-700 bg-slate-900/50 hover:border-slate-500 hover:bg-slate-800/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          className="hidden"
        />
        <div className="space-y-2">
          <span className="text-3xl block">📤</span>
          <p className="text-sm font-medium text-slate-300">
            Arraste o CSV aqui ou clique para selecionar
          </p>
          <p className="text-xs text-slate-500">
            Relatório de trades, candles 1min ou 5min do Profit Pro
          </p>
        </div>
      </div>

      {status !== 'idle' && (
        <div
          className={`px-4 py-3 rounded-lg text-sm font-medium transition-all animate-in fade-in slide-in-from-top-2 ${
            status === 'loading' ? 'bg-blue-500/10 text-blue-400' :
            status === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
            'bg-red-500/10 text-red-400'
          }`}
        >
          {status === 'loading' && (
            <span className="inline-block animate-spin mr-2">⏳</span>
          )}
          {message}
        </div>
      )}
    </div>
  );
}
