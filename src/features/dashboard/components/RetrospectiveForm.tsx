'use client';

import { useState } from 'react';
import { updateDayRetrospective } from '@/features/trades/actions';
import type { TradingDay } from '@/lib/db/schema';
import { IconScale, IconCheck } from '@/components/ui/icons';

const SESSION_GRADES = [
  { id: 'A', label: 'A-GAME', desc: 'Execução cirúrgica, alinhada 100% ao plano', color: 'border-teal-500/50 bg-teal-500/10 text-teal-400' },
  { id: 'B', label: 'B-GAME', desc: 'Execução sólida com pequenos desvios contidos', color: 'border-amber-500/50 bg-amber-500/10 text-amber-300' },
  { id: 'C', label: 'C-GAME', desc: 'Execução com falhas de risco, indisciplina ou tilt', color: 'border-rose-500/50 bg-rose-500/10 text-rose-400' },
];

const EMOTIONAL_STATES = [
  // Construtivos
  { id: 'Flow', label: 'Em Flow / Zona', category: 'positive' },
  { id: 'Focado', label: 'Focado', category: 'positive' },
  { id: 'Calmo', label: 'Calmo & Centrado', category: 'positive' },
  { id: 'Satisfeito', label: 'Satisfeito com Processo', category: 'positive' },
  // Tensão
  { id: 'Ansioso', label: 'Ansioso', category: 'neutral' },
  { id: 'Frustrado', label: 'Frustrado', category: 'neutral' },
  { id: 'Cansado', label: 'Cansado / Fadigado', category: 'neutral' },
  // Risco
  { id: 'Eufórico', label: 'Eufórico', category: 'negative' },
  { id: 'Irritado', label: 'Irritado / Revanche', category: 'negative' },
  { id: 'Tilt', label: 'Em Tilt', category: 'negative' },
];

const OPERATIONAL_ERRORS = [
  'Execução Limpa (Sem Violações)',
  'Overtrading (Operou Demais)',
  'FOMO / Impulso',
  'Revenge Trade / Vingança',
  'Hesitação na Entrada',
  'Saída Antecipada por Medo',
  'Violou Stop Loss',
  'Moveu Stop Contra a Posição',
  'Tamanho de Mão Incorreto',
  'Ignorou Plano Matinal',
  'Excedeu Limite Diário',
];

export function RetrospectiveForm({ day }: { day: TradingDay }) {
  const [sessionGrade, setSessionGrade] = useState<string>(
    day.mentalState?.includes('GRADE:')
      ? day.mentalState.match(/GRADE: ([A-C])/)?.[1] || 'B'
      : 'B'
  );
  
  const [emotionalPost, setEmotionalPost] = useState<string>(day.emotionalPost || '');
  const [honestPhrase, setHonestPhrase] = useState<string>(day.honestPhrase || '');
  const [retrospective, setRetrospective] = useState<string>(day.retrospective || '');
  
  // Extrai erros operacionais do texto existente se houver
  const [selectedErrors, setSelectedErrors] = useState<string[]>([]);
  const [disciplineScore, setDisciplineScore] = useState<number>(4);
  const [nextSessionRule, setNextSessionRule] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleEmotionalState(emoLabel: string) {
    setEmotionalPost(current => {
      const items = current ? current.split(/\s*\|\s*/).filter(Boolean) : [];
      if (items.includes(emoLabel)) {
        return items.filter(i => i !== emoLabel).join(' | ');
      }
      return current ? `${current} | ${emoLabel}` : emoLabel;
    });
  }

  function toggleOperationalError(errorLabel: string) {
    if (errorLabel === 'Execução Limpa (Sem Violações)') {
      setSelectedErrors(['Execução Limpa (Sem Violações)']);
      return;
    }

    setSelectedErrors(prev => {
      const filtered = prev.filter(e => e !== 'Execução Limpa (Sem Violações)');
      if (filtered.includes(errorLabel)) {
        return filtered.filter(e => e !== errorLabel);
      }
      return [...filtered, errorLabel];
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const compiledRetrospective = [
        `[GRADE: ${sessionGrade}] [DISCIPLINA: ${disciplineScore}/5]`,
        selectedErrors.length > 0 ? `ERROS: ${selectedErrors.join(', ')}` : '',
        nextSessionRule ? `REGRA AMANHÃ: ${nextSessionRule}` : '',
        retrospective ? `HINDSIGHT: ${retrospective}` : '',
      ].filter(Boolean).join('\n');

      await updateDayRetrospective(day.id, {
        honestPhrase,
        retrospective: compiledRetrospective,
        emotionalPost,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Retrospectiva pós-pregão" className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 shadow-xl space-y-5 font-mono">
      <header className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <IconScale className="text-teal-400" />
          <div>
            <h3 className="text-[10px] tracking-[0.25em] font-bold text-slate-300 uppercase">
              DEBRIEF PÓS-PREGÃO · RETROSPECTIVA & AVALIAÇÃO DE PROCESSO
            </h3>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
              METODOLOGIA DE TENDLER & DOUGLAS (AVALIAÇÃO DE PROCESSO, NÃO DE P&L)
            </p>
          </div>
        </div>
        <span className="text-[9px] tracking-widest text-slate-500 font-bold">REGISTRO INVIOLÁVEL</span>
      </header>

      {/* BLOCO 1: SESSION GRADE (A/B/C GAME) */}
      <div className="space-y-1.5">
        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
          01 // CLASSIFICAÇÃO DA SESSÃO (SESSION GRADE)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SESSION_GRADES.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSessionGrade(g.id)}
              className={`p-2.5 rounded-md border text-left transition-all ${
                sessionGrade === g.id
                  ? g.color
                  : 'bg-[#070a10] border-slate-800/80 text-slate-500 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono">{g.label}</span>
                {sessionGrade === g.id && <span className="text-[10px] font-bold">✓ SELECIONADO</span>}
              </div>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5 leading-tight">{g.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* BLOCO 2: ESTADO EMOCIONAL PÓS-PREGÃO */}
      <div className="space-y-1.5">
        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
          02 // ESTADO EMOCIONAL AO FECHAR A PLATAFORMA
        </label>
        <div className="flex flex-wrap gap-1.5">
          {EMOTIONAL_STATES.map(emo => {
            const active = emotionalPost.includes(emo.label);
            return (
              <button
                key={emo.id}
                type="button"
                onClick={() => toggleEmotionalState(emo.label)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                  active
                    ? emo.category === 'positive'
                      ? 'bg-teal-500/20 text-teal-400 border-teal-500/40'
                      : emo.category === 'negative'
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-[#070a10] text-slate-400 border-slate-800/80 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                {emo.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* BLOCO 3: AUDITORIA DE ERROS OPERACIONAIS */}
      <div className="space-y-1.5">
        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
          03 // AUDITORIA DE ERROS OPERACIONAIS & DESVIOS DO PLANO
        </label>
        <div className="flex flex-wrap gap-1.5">
          {OPERATIONAL_ERRORS.map(err => {
            const active = selectedErrors.includes(err);
            const isClean = err === 'Execução Limpa (Sem Violações)';
            return (
              <button
                key={err}
                type="button"
                onClick={() => toggleOperationalError(err)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                  active
                    ? isClean
                      ? 'bg-teal-500/20 text-teal-400 border-teal-500/40'
                      : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                    : 'bg-[#070a10] text-slate-400 border-slate-800/80 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                {err}
              </button>
            );
          })}
        </div>
      </div>

      {/* BLOCO 4: NOTA DE DISCIPLINA DA SESSÃO */}
      <div className="space-y-1.5">
        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
          04 // NOTA DE DISCIPLINA DA SESSÃO (1 A 5)
        </label>
        <div className="flex gap-2 items-center">
          <span className="text-[10px] text-slate-500">1 (CAÓTICO)</span>
          <div className="flex gap-1 flex-1">
            {[1, 2, 3, 4, 5].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setDisciplineScore(v)}
                className={`flex-1 py-1.5 rounded-md text-xs font-bold border transition-all tabular-nums ${
                  disciplineScore === v
                    ? 'bg-teal-500/20 text-teal-400 border-teal-500/40'
                    : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:text-slate-300'
                }`}
              >
                {v} ★
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-500">5 (CIRÚRGICO)</span>
        </div>
      </div>

      {/* BLOCO 5: REFLEXÃO & REGRA PARA O PRÓXIMO PREGÃO */}
      <div className="space-y-3 pt-1 border-t border-slate-800/60">
        <div>
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
            FRASE BRUTALMENTE HONESTA (UMA FRASE SEM DESCULPAS)
          </label>
          <input
            value={honestPhrase}
            onChange={(e) => setHonestPhrase(e.target.value)}
            placeholder="Qual foi a decisão mais cara que tomei hoje? Seja específico."
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-teal-500/60 font-sans text-xs"
          />
        </div>

        <div>
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
            UMA REGRA PARA O PRÓXIMO PREGÃO (INJECTING LOGIC)
          </label>
          <input
            value={nextSessionRule}
            onChange={(e) => setNextSessionRule(e.target.value)}
            placeholder="Ex: Se eu tomar 2 stops seguidos, fecho a plataforma por 15 minutos."
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-teal-500/60 font-sans text-xs"
          />
        </div>

        <div>
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
            ANÁLISE DE HINDSIGHT (O QUE O GRÁFICO REVELOU DEPOIS)
          </label>
          <textarea
            value={retrospective}
            onChange={(e) => setRetrospective(e.target.value)}
            placeholder="Depois do fechamento, ficou claro que…"
            className="w-full h-20 bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 placeholder:text-slate-700 resize-none focus:outline-none focus:border-teal-500/60 font-sans text-xs leading-relaxed"
          />
        </div>
      </div>

      {/* BOTÃO SALVAR */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 font-mono text-[10px]">
        <span className="text-slate-500">
          DOCUMENTAÇÃO INVIOLÁVEL DA SESSÃO
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
              <span>DEBRIEF SALVO</span>
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
