'use client';

import { useState } from 'react';
import type { TradingDay } from '@/lib/db/schema';
import { updatePreMarket } from '@/features/trades/actions';
import { IconTarget, IconArrowUp, IconArrowDown, IconDash, IconCheck } from '@/components/ui/icons';

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
    <section aria-label="Farol do mercado" className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 shadow-xl space-y-4">
      {/* Header Command */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <IconTarget className="text-teal-400" width={16} height={16} />
          <div>
            <h2 className="font-mono text-[10px] tracking-[0.25em] text-slate-300 uppercase font-bold">
              MARKET BEACON · GEX & MACRO PROTOCOL
            </h2>
            <p className="text-[11px] text-slate-500 font-sans mt-0.5">
              Mapeamento de viés, volatilidade implícita e níveis-chave de Gamma Flip
            </p>
          </div>
        </div>

        <button
          onClick={handleAutoFill}
          type="button"
          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-teal-400 border border-slate-700/80 rounded-md font-mono text-[10px] font-bold tracking-wider transition-all"
        >
          SYNC FAROL DATA
        </button>
      </div>

      {/* Grid do Formulário */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
        {/* Viés do Farol */}
        <div className="space-y-1">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            VIÉS DO FAROL DO MERCADO
          </label>
          <select
            value={farolBias}
            onChange={(e) => setFarolBias(e.target.value)}
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500/60 font-mono text-xs font-bold"
          >
            <option value="Alta">LONG // ALTA (COMPRADOR)</option>
            <option value="Baixa">SHORT // BAIXA (VENDEDOR)</option>
            <option value="Lateral">NEUTRAL // LATERAL (CONSOLIDAÇÃO)</option>
          </select>
        </div>

        {/* Níveis-Chave do Farol */}
        <div className="space-y-1">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            NÍVEIS-CHAVE (GEX & CALL/PUT WALL)
          </label>
          <input
            type="text"
            value={farolKeyLevels}
            onChange={(e) => setFarolKeyLevels(e.target.value)}
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500/60 font-mono text-xs"
          />
        </div>

        {/* Notícias & Calendário Macro */}
        <div className="md:col-span-2 space-y-1">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            CALENDÁRIO MACRO & DRIVERS DO DIA
          </label>
          <input
            type="text"
            value={farolNews}
            onChange={(e) => setFarolNews(e.target.value)}
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500/60 font-mono text-xs"
          />
        </div>

        {/* Insights do Farol */}
        <div className="md:col-span-2 space-y-1">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            INSIGHTS & ANÁLISE ESTRATÉGICA DO FAROL
          </label>
          <textarea
            rows={2}
            value={farolInsights}
            onChange={(e) => setFarolInsights(e.target.value)}
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500/60 font-sans text-xs leading-relaxed"
          />
        </div>
      </div>

      {/* Footer de Ação */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 font-mono text-[10px]">
        <span className="text-slate-500">
          REGISTRO DO FAROL SISMICO VS PLANO DO PREGÃO
        </span>

        <button
          onClick={handleSave}
          disabled={loading}
          type="button"
          className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-mono font-bold text-xs rounded-md transition-all flex items-center gap-1.5 disabled:opacity-50"
        >
          {saved ? (
            <>
              <IconCheck className="text-slate-950" />
              <span>REGISTRO SALVO</span>
            </>
          ) : loading ? (
            'SALVANDO…'
          ) : (
            'SALVAR FAROL MARKET'
          )}
        </button>
      </div>
    </section>
  );
}

export default FarolMarketCard;
