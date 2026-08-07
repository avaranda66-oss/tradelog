'use client';

import { useState } from 'react';
import { updateDayRetrospective } from '@/features/trades/actions';
import type { TradingDay } from '@/lib/db/schema';
import { IconScale, IconCheck } from '@/components/ui/icons';

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
    <section aria-label="Retrospectiva pós-pregão" className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 shadow-xl space-y-4">
      <header className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <IconScale className="text-teal-400" />
          <h3 className="font-mono text-[10px] tracking-[0.25em] font-bold text-slate-300 uppercase">
            POST-SESSION DEBRIEF · RETROSPECTIVA & AUTOAVALIAÇÃO
          </h3>
        </div>
        <span className="font-mono text-[9px] tracking-widest text-slate-600">NO EGO PROTOCOL</span>
      </header>

      <div className="space-y-4 font-mono text-xs">
        {/* Frase honesta */}
        <div>
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
            BRUTALLY HONEST SENTENCE (FRASE BRUTALMENTE HONESTA)
          </label>
          <input
            value={honestPhrase}
            onChange={(e) => setHonestPhrase(e.target.value)}
            placeholder="Uma frase. Sem desculpas. O que realmente aconteceu hoje no pregão?"
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-teal-500/60 font-mono text-xs"
          />
        </div>

        {/* Estado emocional pós */}
        <div>
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
            ESTADO EMOCIONAL PÓS-PREGÃO
          </label>
          <input
            value={emotionalPost}
            onChange={(e) => setEmotionalPost(e.target.value)}
            placeholder="Sensação ao encerrar as operações: Frustrado, Neutro, Confiante, Disciplinado…"
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-teal-500/60 font-sans text-xs"
          />
        </div>

        {/* Retrospectiva completa */}
        <div>
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
            ANÁLISE DE HINDSIGHT (O QUE O GRÁFICO MOSTROU DEPOIS)
          </label>
          <textarea
            value={retrospective}
            onChange={(e) => setRetrospective(e.target.value)}
            placeholder="Oportunidades perdidas, alvos não atingidos, falhas de execução a corrigir amanhã…"
            className="w-full h-24 bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 placeholder:text-slate-700 resize-none focus:outline-none focus:border-teal-500/60 font-sans text-xs leading-relaxed"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 font-mono text-[10px]">
        <span className="text-slate-500">
          DOCUMENTAÇÃO INVIOLÁVEL DO PREGÃO
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
              <span>DEBRIEF REGISTRADO</span>
            </>
          ) : saving ? (
            'SALVANDO…'
          ) : (
            'CLOSE SESSION DEBRIEF'
          )}
        </button>
      </div>
    </section>
  );
}

export default RetrospectiveForm;
