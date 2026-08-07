'use client';

import { useState } from 'react';
import type { TradingDay } from '@/lib/db/schema';
import { updatePreMarket } from '@/features/trades/actions';

interface FarolMarketCardProps {
  day: TradingDay;
}

export function FarolMarketCard({ day }: FarolMarketCardProps) {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const [farolBias, setFarolBias] = useState(day.farolBias || 'Alta');
  const [farolKeyLevels, setFarolKeyLevels] = useState(
    day.farolKeyLevels || '125.600 Call Wall | 124.800 Put Wall | 125.170 GEX Zero | 125.000 VWAP'
  );
  const [farolNews, setFarolNews] = useState(
    day.farolNews || '09:30 Payroll US (Alto Impacto) | 15:00 Decisão Copom | Minério -0.65%'
  );
  const [farolInsights, setFarolInsights] = useState(
    day.farolInsights || 'Fluxo institucional comprador nos derivativos de minério e petróleo. Atenção à barreira do Call Wall em 125.600.'
  );

  async function handleSave() {
    setLoading(true);
    try {
      // Atualiza no banco via Server Action
      await updatePreMarket(day.id, {
        generalBias: day.generalBias || farolBias,
        farolBias,
        farolKeyLevels,
        farolNews,
        farolInsights,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setLoading(false);
    }
  }

  function handleAutoFill() {
    setFarolBias('Alta');
    setFarolKeyLevels('125.600 Call Wall | 124.800 Put Wall | 125.170 GEX Zero | 125.000 VWAP');
    setFarolNews('09:30 Payroll US (Alto Impacto) | 15:00 Decisão Copom | Minério -0.65%');
    setFarolInsights('Farol do Mercado indica forte proteção em Put Wall no 124.800 e alvo no Call Wall 125.600.');
  }

  return (
    <div className="bg-[#0d131f] border border-slate-800/80 rounded-2xl p-5 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚨</span>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              PANORAMA FAROL DO MERCADO (GPS & ANÁLISE MACRO)
            </h2>
            <p className="text-[11px] text-slate-500">
              Integração de inteligência pré-market do Farol do Mercado vs Visão do Trader
            </p>
          </div>
        </div>

        <button
          onClick={handleAutoFill}
          className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
        >
          <span>⚡ Impar/Atualizar Farol</span>
        </button>
      </div>

      {/* Form Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Viés do Farol */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 font-bold uppercase block font-mono">
            Viés do Farol do Mercado
          </label>
          <select
            value={farolBias}
            onChange={(e) => setFarolBias(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold"
          >
            <option value="Alta">Alta ↑ (Comprador)</option>
            <option value="Baixa">Baixa ↓ (Vendedor)</option>
            <option value="Lateral">Lateral ↔ (Consolidação)</option>
          </select>
        </div>

        {/* Níveis-Chave do Farol */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 font-bold uppercase block font-mono">
            Níveis-Chave (GEX & Call/Put Wall)
          </label>
          <input
            type="text"
            value={farolKeyLevels}
            onChange={(e) => setFarolKeyLevels(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-xs"
          />
        </div>

        {/* Notícias & Calendário Macro */}
        <div className="md:col-span-2 space-y-1">
          <label className="text-[10px] text-slate-400 font-bold uppercase block font-mono">
            Calendário Macro & Notícias do Farol
          </label>
          <input
            type="text"
            value={farolNews}
            onChange={(e) => setFarolNews(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-xs"
          />
        </div>

        {/* Insights do Farol */}
        <div className="md:col-span-2 space-y-1">
          <label className="text-[10px] text-slate-400 font-bold uppercase block font-mono">
            Insights & Leitura Estratégica do Farol
          </label>
          <textarea
            rows={2}
            value={farolInsights}
            onChange={(e) => setFarolInsights(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 text-xs"
          />
        </div>
      </div>

      {/* Salvar Botão */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
        <span className="text-[11px] text-slate-500 italic">
          Compare a análise do Farol do Mercado com as suas entradas no diário pós-pregão.
        </span>

        <button
          onClick={handleSave}
          disabled={loading}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-lg"
        >
          {saved ? '✅ Salvo!' : loading ? 'Salvando...' : '💾 Salvar Pré-Market Farol'}
        </button>
      </div>
    </div>
  );
}
