'use client';

import { useState } from 'react';
import { updatePreMarket } from '@/features/trades/actions';
import type { TradingDay } from '@/lib/db/schema';
import { IconClock, IconCheck, IconArrowUp, IconArrowDown, IconDash } from '@/components/ui/icons';

const biasOptions = [
  { value: 'alta', label: '↑ ALTA (COMPRADOR)', color: 'border-teal-500/50 bg-teal-500/10 text-teal-400', Icon: IconArrowUp },
  { value: 'baixa', label: '↓ BAIXA (VENDEDOR)', color: 'border-rose-400/50 bg-rose-400/10 text-rose-400', Icon: IconArrowDown },
  { value: 'indefinido', label: '— LATERAL / INDEFINIDO', color: 'border-slate-600 bg-slate-900 text-slate-400', Icon: IconDash },
];

const TRADING_PSYCHOLOGY_STATES = [
  'Calmo',
  'Centrado',
  'Confiante',
  'Focado',
  'Ansioso',
  'Agitado',
  'Estressado',
  'Pressionado',
  'Cansado',
  'Fadigado',
  'Impulsivo',
  'Eufórico',
];

export function PreMarketForm({ day }: { day: TradingDay }) {
  const [form, setForm] = useState({
    sleepTime: day.sleepTime || '', // Horário que dormiu na noite anterior (persistido no banco)
    wakeUpTime: day.wakeUpTime || '',
    sleepQuality: day.sleepQuality || 3,
    mentalState: day.mentalState || '',
    personalNote: day.personalNote || '',
    macroCalendar: day.macroCalendar || '',
    overnightNote: day.overnightNote || '',
    generalBias: day.generalBias || 'indefinido',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updatePreMarket(day.id, {
        sleepTime: form.sleepTime,
        wakeUpTime: form.wakeUpTime,
        sleepQuality: form.sleepQuality,
        mentalState: form.mentalState,
        personalNote: form.personalNote,
        macroCalendar: form.macroCalendar,
        overnightNote: form.overnightNote,
        generalBias: form.generalBias,
        preMarketDone: true,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function handleSelectState(stateText: string) {
    setForm(f => {
      const current = f.mentalState.trim();
      if (!current) return { ...f, mentalState: stateText };
      const items = current.split(/\s*\|\s*/).filter(Boolean);
      if (items.includes(stateText)) {
        const updated = items.filter(s => s !== stateText).join(' | ');
        return { ...f, mentalState: updated };
      }
      return { ...f, mentalState: `${current} | ${stateText}` };
    });
  }

  return (
    <section aria-label="Checklist pré-market" className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 shadow-xl space-y-4 font-mono">
      <header className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <IconClock className="text-teal-400" />
          <h3 className="text-[10px] tracking-[0.25em] font-bold text-slate-300 uppercase">
            PROTOCOLO PRÉ-MARKET · PREPARAÇÃO & REPOUSO MATINAL
          </h3>
        </div>

        {day.preMarketDone && (
          <span className="text-[9px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/30 px-2 py-0.5 rounded uppercase">
            ✓ CONCLUÍDO
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        {/* Horário que dormiu */}
        <div>
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
            HORÁRIO QUE DORMIU (NOITE ANTERIOR)
          </label>
          <input
            type="time"
            value={form.sleepTime}
            onChange={(e) => setForm(f => ({ ...f, sleepTime: e.target.value }))}
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-1.5 text-slate-200 focus:outline-none focus:border-teal-500/60 font-mono text-xs tabular-nums"
          />
        </div>

        {/* Hora que acordou */}
        <div>
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
            HORÁRIO DE DESPERTAR (MANHÃ)
          </label>
          <input
            type="time"
            value={form.wakeUpTime}
            onChange={(e) => setForm(f => ({ ...f, wakeUpTime: e.target.value }))}
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-1.5 text-slate-200 focus:outline-none focus:border-teal-500/60 font-mono text-xs tabular-nums"
          />
        </div>

        {/* Qualidade do sono */}
        <div>
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
            QUALIDADE DO SONO (1 A 5)
          </label>
          <div className="flex gap-1" role="radiogroup" aria-label="Qualidade do sono">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={form.sleepQuality === v}
                onClick={() => setForm(f => ({ ...f, sleepQuality: v }))}
                className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all border font-mono tabular-nums ${
                  form.sleepQuality === v
                    ? 'bg-teal-500/20 text-teal-400 border-teal-500/40'
                    : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:text-slate-300'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Estado Emocional & Psicologia do Trading */}
        <div className="sm:col-span-3 space-y-1.5">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            ESTADO EMOCIONAL & PRONTIDÃO (PSICOLOGIA DE TRADING)
          </label>
          
          {/* Botões Rápidos de Sentimentos */}
          <div className="flex flex-wrap gap-1.5">
            {TRADING_PSYCHOLOGY_STATES.map((st) => {
              const active = form.mentalState.includes(st);
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleSelectState(st)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                    active
                      ? 'bg-teal-500/20 text-teal-400 border-teal-500/40'
                      : 'bg-[#070a10] text-slate-400 border-slate-800/80 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {st}
                </button>
              );
            })}
          </div>

          <input
            value={form.mentalState}
            onChange={(e) => setForm(f => ({ ...f, mentalState: e.target.value }))}
            placeholder="Descreva seu sentimento ou selecione os botões acima…"
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-teal-500/60 font-sans text-xs"
          />
        </div>

        {/* Viés pré-abertura (Sem inglês) */}
        <div className="sm:col-span-3 space-y-1">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            VIÉS PRÉ-ABERTURA DO PREGÃO
          </label>
          <div className="flex gap-2">
            {biasOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, generalBias: opt.value }))}
                className={`flex-1 py-2 rounded-md text-xs font-bold border transition-all flex items-center justify-center gap-1.5 font-mono ${
                  form.generalBias === opt.value
                    ? opt.color
                    : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:text-slate-300'
                }`}
              >
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Overnight */}
        <div className="sm:col-span-3 md:col-span-1 space-y-1">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            CENÁRIO OVERNIGHT & ASIA/EUROPA
          </label>
          <textarea
            value={form.overnightNote}
            onChange={(e) => setForm(f => ({ ...f, overnightNote: e.target.value }))}
            placeholder="Mercados globais, S&P futuro, DXY, commodities…"
            className="w-full h-16 bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 placeholder:text-slate-700 resize-none focus:outline-none focus:border-teal-500/60 font-sans text-xs leading-relaxed"
          />
        </div>

        {/* Calendário macro */}
        <div className="sm:col-span-3 md:col-span-2 space-y-1">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            CALENDÁRIO MACRO & DRIVERS DO DIA
          </label>
          <textarea
            value={form.macroCalendar}
            onChange={(e) => setForm(f => ({ ...f, macroCalendar: e.target.value }))}
            placeholder="09:30 Payroll US | 15:00 COPOM | 16:30 CFTC…"
            className="w-full h-16 bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 placeholder:text-slate-700 resize-none focus:outline-none focus:border-teal-500/60 font-mono text-xs leading-relaxed"
          />
        </div>
      </div>

      {/* Botão salvar */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 font-mono text-[10px]">
        <span className="text-slate-500">
          REGISTRO MATINAL PRONTO PARA ABERTURA
        </span>

        <button
          onClick={handleSave}
          disabled={saving}
          type="button"
          className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-mono font-bold text-xs rounded-md transition-all flex items-center gap-1.5 disabled:opacity-50"
        >
          {saved ? (
            <>
              <IconCheck className="text-slate-950" />
              <span>REGISTRADO COM SUCESSO</span>
            </>
          ) : saving ? (
            'SALVANDO…'
          ) : (
            'SALVAR PRÉ-MARKET'
          )}
        </button>
      </div>
    </section>
  );
}

export default PreMarketForm;
