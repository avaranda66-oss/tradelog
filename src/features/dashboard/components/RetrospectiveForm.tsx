'use client';

import { useState } from 'react';
import { updateDayRetrospective } from '@/features/trades/actions';
import type { TradingDay } from '@/lib/db/schema';

export function RetrospectiveForm({ day }: { day: TradingDay }) {
  const [honestPhrase, setHonestPhrase] = useState(day.honestPhrase || '');
  const [retrospective, setRetrospective] = useState(day.retrospective || '');
  const [emotionalPost, setEmotionalPost] = useState(day.emotionalPost || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateDayRetrospective(day.id, {
        honestPhrase,
        retrospective,
        emotionalPost,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-slate-300">🔍 Retrospectiva do Dia</h3>

      {/* Frase honesta */}
      <div>
        <label className="text-xs text-slate-500 block mb-1">
          Uma frase honesta sobre o dia
        </label>
        <input
          value={honestPhrase}
          onChange={(e) => setHonestPhrase(e.target.value)}
          placeholder="Resumo brutalmente honesto do que aconteceu..."
          className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
        />
      </div>

      {/* Estado emocional pós */}
      <div>
        <label className="text-xs text-slate-500 block mb-1">
          Estado emocional pós-pregão
        </label>
        <input
          value={emotionalPost}
          onChange={(e) => setEmotionalPost(e.target.value)}
          placeholder="Como se sente agora? Frustrado, tranquilo, confiante..."
          className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
        />
      </div>

      {/* Retrospectiva completa */}
      <div>
        <label className="text-xs text-slate-500 block mb-1">
          O que o gráfico mostrou depois (análise de hindsight)
        </label>
        <textarea
          value={retrospective}
          onChange={(e) => setRetrospective(e.target.value)}
          placeholder="Oportunidades perdidas, trades que deveriam ter sido feitos..."
          className="w-full h-24 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 resize-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm font-medium hover:bg-emerald-500/20 transition-all disabled:opacity-50 border border-emerald-500/20"
        >
          {saving ? 'Salvando...' : '💾 Salvar retrospectiva'}
        </button>
        {saved && <span className="text-xs text-emerald-400 animate-in fade-in">✅ Salvo!</span>}
      </div>
    </div>
  );
}
