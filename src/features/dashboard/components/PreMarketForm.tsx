'use client';

import { useState } from 'react';
import { updatePreMarket } from '@/features/trades/actions';
import type { TradingDay } from '@/lib/db/schema';

const biasOptions = [
  { value: 'alta', label: '🟢 Alta', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { value: 'baixa', label: '🔴 Baixa', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  { value: 'indefinido', label: '⚪ Indefinido', color: 'bg-slate-700 text-slate-400 border-slate-600' },
];

export function PreMarketForm({ day }: { day: TradingDay }) {
  const [form, setForm] = useState({
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
        ...form,
        preMarketDone: true,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
        🌅 Pré-Market
        {day.preMarketDone && (
          <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded">
            ✓ Feito
          </span>
        )}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Hora que acordou */}
        <div>
          <label className="text-xs text-slate-500 block mb-1">Hora que acordou</label>
          <input
            type="time"
            value={form.wakeUpTime}
            onChange={(e) => setForm(f => ({ ...f, wakeUpTime: e.target.value }))}
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200"
          />
        </div>

        {/* Qualidade do sono */}
        <div>
          <label className="text-xs text-slate-500 block mb-1">Qualidade do sono</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => setForm(f => ({ ...f, sleepQuality: v }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  form.sleepQuality === v
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800/50 text-slate-500 border border-slate-700/50 hover:text-slate-300'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Estado mental */}
        <div className="sm:col-span-2">
          <label className="text-xs text-slate-500 block mb-1">Estado mental/emocional</label>
          <input
            value={form.mentalState}
            onChange={(e) => setForm(f => ({ ...f, mentalState: e.target.value }))}
            placeholder="Como se sente ao sentar na tela..."
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
          />
        </div>

        {/* Viés */}
        <div className="sm:col-span-2">
          <label className="text-xs text-slate-500 block mb-1">Viés pré-abertura</label>
          <div className="flex gap-2">
            {biasOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setForm(f => ({ ...f, generalBias: opt.value }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                  form.generalBias === opt.value ? opt.color : 'bg-slate-800/50 text-slate-500 border-slate-700/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Overnight */}
        <div>
          <label className="text-xs text-slate-500 block mb-1">Overnight / Cenário</label>
          <textarea
            value={form.overnightNote}
            onChange={(e) => setForm(f => ({ ...f, overnightNote: e.target.value }))}
            placeholder="Mercados internacionais, futuro americano..."
            className="w-full h-16 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 resize-none"
          />
        </div>

        {/* Calendário macro */}
        <div>
          <label className="text-xs text-slate-500 block mb-1">Calendário do dia</label>
          <textarea
            value={form.macroCalendar}
            onChange={(e) => setForm(f => ({ ...f, macroCalendar: e.target.value }))}
            placeholder="Payroll, COPOM, vencimento de opções..."
            className="w-full h-16 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 resize-none"
          />
        </div>
      </div>

      {/* Botão salvar */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm font-medium hover:bg-emerald-500/20 transition-all disabled:opacity-50 border border-emerald-500/20"
        >
          {saving ? 'Salvando...' : '💾 Salvar pré-market'}
        </button>
        {saved && (
          <span className="text-xs text-emerald-400 animate-in fade-in">✅ Salvo!</span>
        )}
      </div>
    </div>
  );
}
