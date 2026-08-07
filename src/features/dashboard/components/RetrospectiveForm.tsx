'use client';

import { useState } from 'react';
import { updateDayRetrospective } from '@/features/trades/actions';
import type { TradingDay } from '@/lib/db/schema';
import { IconScale, IconCheck } from '@/components/ui/icons';

const EXECUTION_GRADES = [
  { id: 'A', label: 'A — EXCELENTE', desc: 'Execução alinhada ao processo; decisões conscientes' },
  { id: 'B', label: 'B — PARCIAL', desc: 'Execução sólida com pequenos desvios contidos' },
  { id: 'C', label: 'C — REATIVA', desc: 'Desvios relevantes do processo ou decisões reativas' },
];

const DOMINANT_EMOTIONS = [
  { id: 'Calmo', label: 'Calmo', tone: 'teal' },
  { id: 'Focado', label: 'Focado', tone: 'teal' },
  { id: 'Neutro', label: 'Neutro', tone: 'slate' },
  { id: 'Ansioso', label: 'Ansioso', tone: 'rose' },
  { id: 'Frustrado', label: 'Frustrado', tone: 'rose' },
  { id: 'Eufórico', label: 'Eufórico', tone: 'rose' },
  { id: 'Cansado', label: 'Cansado', tone: 'slate' },
  { id: 'Irritado', label: 'Irritado', tone: 'rose' },
];

const OPERATIONAL_ERRORS = [
  'Nenhum (Execução Limpa)',
  'Overtrading (Operou Demais)',
  'FOMO / Impulso',
  'Revenge Trade / Vingança',
  'Hesitação na Entrada',
  'Saída Antecipada por Medo',
  'Violou Stop Loss',
  'Moveu Stop Contra Posição',
  'Tamanho de Mão Incorreto',
  'Ignorou Plano Matinal',
  'Excedeu Limite Diário',
];

const DISCIPLINE_LEVELS = [
  { value: 1, label: '1 — REATIVO' },
  { value: 2, label: '2 — INSTÁVEL' },
  { value: 3, label: '3 — PARCIAL' },
  { value: 4, label: '4 — CONSISTENTE' },
  { value: 5, label: '5 — PRECISO' },
];

export function RetrospectiveForm({ day }: { day: TradingDay }) {
  // Parse inicial seguro de dados salvos anteriormente
  const parsedGrade = day.retrospective?.match(/\[GRADE: ([A-C])\]/)?.[1] || null;
  const parsedDiscipline = day.retrospective?.match(/\[DISCIPLINA: ([1-5])\/5\]/)?.[1];
  const parsedTrigger = day.retrospective?.match(/GATILHO: (.*?)(?=\s*\|\s*AÇÃO:|\n|$)/)?.[1] || '';
  const parsedAction = day.retrospective?.match(/AÇÃO: (.*?)(?=\n|$)/)?.[1] || '';

  const [executionGrade, setExecutionGrade] = useState<string | null>(parsedGrade);
  const [dominantEmotion, setDominantEmotion] = useState<string | null>(day.emotionalPost || null);
  const [emotionalIntensity, setEmotionalIntensity] = useState<number | null>(3);
  
  const [selectedErrors, setSelectedErrors] = useState<string[]>([]);
  const [disciplineScore, setDisciplineScore] = useState<number | null>(parsedDiscipline ? Number(parsedDiscipline) : null);
  
  const [trigger, setTrigger] = useState<string>(parsedTrigger);
  const [actionRule, setActionRule] = useState<string>(parsedAction);
  
  const [honestPhrase, setHonestPhrase] = useState<string>(day.honestPhrase || '');
  const [hindsightText, setHindsightText] = useState<string>(
    day.retrospective?.replace(/\[GRADE:.*?\]|\[DISCIPLINA:.*?\]|ERROS:.*?|GATILHO:.*?|AÇÃO:.*/g, '').trim() || ''
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleError(err: string) {
    if (err === 'Nenhum (Execução Limpa)') {
      setSelectedErrors(prev => prev.includes('Nenhum (Execução Limpa)') ? [] : ['Nenhum (Execução Limpa)']);
      return;
    }

    setSelectedErrors(prev => {
      const filtered = prev.filter(e => e !== 'Nenhum (Execução Limpa)');
      if (filtered.includes(err)) {
        return filtered.filter(e => e !== err);
      }
      return [...filtered, err];
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const compiledRetrospective = [
        executionGrade ? `[GRADE: ${executionGrade}]` : '',
        disciplineScore ? `[DISCIPLINA: ${disciplineScore}/5]` : '',
        selectedErrors.length > 0 ? `ERROS: ${selectedErrors.join(', ')}` : '',
        trigger || actionRule ? `GATILHO: ${trigger} | AÇÃO: ${actionRule}` : '',
        hindsightText ? `HINDSIGHT: ${hindsightText}` : '',
      ].filter(Boolean).join('\n');

      const compiledEmotion = dominantEmotion
        ? `${dominantEmotion} (Intensidade: ${emotionalIntensity || 3}/5)`
        : '';

      await updateDayRetrospective(day.id, {
        honestPhrase,
        retrospective: compiledRetrospective,
        emotionalPost: compiledEmotion,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Retrospectiva pós-pregão" className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 shadow-xl space-y-4 font-mono">
      <header className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <IconScale className="text-teal-400" />
          <h3 className="text-[10px] tracking-[0.2em] font-bold text-slate-300 uppercase">
            POST-SESSION DEBRIEF · AVALIAÇÃO DE PROCESSO
          </h3>
        </div>
        <span className="text-[9px] tracking-widest text-slate-500 font-bold">
          PROCESSO &gt; RESULTADO
        </span>
      </header>

      {/* BLOCO 1: QUALIDADE DA EXECUÇÃO (A/B/C) */}
      <div className="space-y-1">
        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
          01 // VOCÊ EXECUTOU O PROCESSO PLANEJADO?
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
          {EXECUTION_GRADES.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => setExecutionGrade(g.id)}
              className={`p-2 rounded-md border text-left transition-all ${
                executionGrade === g.id
                  ? g.id === 'A'
                    ? 'border-teal-500/50 bg-teal-500/10 text-teal-400 font-bold'
                    : g.id === 'B'
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 font-bold'
                    : 'border-rose-500/50 bg-rose-500/10 text-rose-400 font-bold'
                  : 'bg-[#070a10] border-slate-800/80 text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="text-xs font-bold block">{g.label}</span>
              <p className="text-[10px] text-slate-400 font-sans leading-tight mt-0.5">{g.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* BLOCO 2: ESTADO DOMINANTE & INTENSIDADE */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-8 space-y-1">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            02 // ESTADO EMOCIONAL DOMINANTE
          </label>
          <div className="flex flex-wrap gap-1 font-mono">
            {DOMINANT_EMOTIONS.map(emo => {
              const active = dominantEmotion === emo.label;
              return (
                <button
                  key={emo.id}
                  type="button"
                  onClick={() => setDominantEmotion(active ? null : emo.label)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                    active
                      ? emo.tone === 'teal'
                        ? 'bg-teal-500/20 text-teal-400 border-teal-500/40'
                        : emo.tone === 'rose'
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                        : 'bg-slate-700 text-slate-100 border-slate-600'
                      : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:text-slate-300'
                  }`}
                >
                  {emo.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="md:col-span-4 space-y-1">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            INTENSIDADE (1 A 5)
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setEmotionalIntensity(v)}
                className={`flex-1 py-1 rounded-md text-[10px] font-bold border transition-all tabular-nums ${
                  emotionalIntensity === v
                    ? 'bg-teal-500/20 text-teal-400 border-teal-500/40'
                    : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:text-slate-300'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* BLOCO 3: PRINCIPAL DESVIO / ERROS */}
      <div className="space-y-1">
        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
          03 // PRINCIPAL DESVIO OPERACIONAL
        </label>
        <div className="flex flex-wrap gap-1">
          {OPERATIONAL_ERRORS.map(err => {
            const active = selectedErrors.includes(err);
            const isClean = err === 'Nenhum (Execução Limpa)';
            return (
              <button
                key={err}
                type="button"
                onClick={() => toggleError(err)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                  active
                    ? isClean
                      ? 'bg-teal-500/20 text-teal-400 border-teal-500/40'
                      : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                    : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:text-slate-300'
                }`}
              >
                {err}
              </button>
            );
          })}
        </div>
      </div>

      {/* BLOCO 4: NOTA DE DISCIPLINA OPERACIONAL */}
      <div className="space-y-1">
        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
          04 // DISCIPLINA DA SESSÃO
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 text-[10px]">
          {DISCIPLINE_LEVELS.map(d => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDisciplineScore(d.value)}
              className={`py-1.5 rounded-md font-bold border transition-all ${
                disciplineScore === d.value
                  ? 'bg-teal-500/20 text-teal-400 border-teal-500/40'
                  : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:text-slate-300'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* BLOCO 5: CICLO DE TENDLER (GATILHO -> REGRA DE AÇÃO) */}
      <div className="space-y-2 pt-2 border-t border-slate-800/80">
        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
          05 // CORREÇÃO DE LOGICA (GATILHO → AÇÃO PARA O PRÓXIMO PREGÃO)
        </label>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <span className="text-[9px] text-slate-500 block uppercase">GATILHO / SINAL</span>
            <input
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="Ex: Após 2 stops consecutivos no início do pregão…"
              className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-1.5 text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-teal-500/60 font-sans text-xs mt-0.5"
            />
          </div>
          <div>
            <span className="text-[9px] text-slate-500 block uppercase">AÇÃO CONCRETA</span>
            <input
              value={actionRule}
              onChange={(e) => setActionRule(e.target.value)}
              placeholder="Ex: Fechar a plataforma e pausar por 15 minutos."
              className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-1.5 text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-teal-500/60 font-sans text-xs mt-0.5"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <div>
            <span className="text-[9px] text-slate-500 block uppercase">FRASE BRUTALMENTE HONESTA</span>
            <input
              value={honestPhrase}
              onChange={(e) => setHonestPhrase(e.target.value)}
              placeholder="Qual foi a decisão mais cara tomada hoje?"
              className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-1.5 text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-teal-500/60 font-sans text-xs mt-0.5"
            />
          </div>
          <div>
            <span className="text-[9px] text-slate-500 block uppercase">HINDSIGHT (VISÃO POSTERIOR)</span>
            <input
              value={hindsightText}
              onChange={(e) => setHindsightText(e.target.value)}
              placeholder="Depois do fechamento, ficou claro que…"
              className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-1.5 text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-teal-500/60 font-sans text-xs mt-0.5"
            />
          </div>
        </div>
      </div>

      {/* BOTÃO SALVAR */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px]">
        <span className="text-slate-500 font-mono">
          DEBRIEF COMPLETO // SEM JULGAMENTO DE EGO
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
              <span>SALVO COM SUCESSO</span>
            </>
          ) : saving ? (
            'SALVANDO…'
          ) : (
            'REGISTRAR RETROSPECTIVA'
          )}
        </button>
      </div>
    </section>
  );
}

export default RetrospectiveForm;
