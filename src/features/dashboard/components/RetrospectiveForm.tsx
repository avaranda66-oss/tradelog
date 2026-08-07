'use client';

import { useState } from 'react';
import { updateDayRetrospective } from '@/features/trades/actions';
import type { TradingDay } from '@/lib/db/schema';
import { IconScale, IconCheck } from '@/components/ui/icons';
import { SessionImageDropzone } from '@/features/images/components/SessionImageDropzone';
import { TagGroupSelector } from '@/components/ui/TagGroupSelector';

const EXECUTION_GRADES = [
  { id: 'A', label: 'A — EXCELENTE', desc: 'Execução 100% alinhada ao plano; decisões conscientes' },
  { id: 'B', label: 'B — PARCIAL', desc: 'Execução sólida com pequenos desvios contidos' },
  { id: 'C', label: 'C — REATIVA', desc: 'Desvios relevantes do plano ou trades por impulso' },
];

export function RetrospectiveForm({ day }: { day: TradingDay }) {
  // Parse seguro da nota de execução A/B/C
  const parsedGrade = day.retrospective?.match(/\[GRADE: ([A-C])\]/)?.[1] || null;

  // Extrai o texto livre do diário limpo (removendo tags de compilação antigas)
  const initialText = day.retrospective
    ? day.retrospective
        .replace(/\[GRADE:.*?\]/g, '')
        .replace(/\[DISCIPLINA:.*?\]/g, '')
        .replace(/ERROS:.*?/g, '')
        .replace(/GATILHO:.*?/g, '')
        .replace(/AÇÃO:.*?/g, '')
        .replace(/HINDSIGHT:.*?/g, '')
        .trim()
    : '';

  const [executionGrade, setExecutionGrade] = useState<string | null>(parsedGrade);
  const [dominantEmotion, setDominantEmotion] = useState<string>(day.emotionalPost || '');
  const [selectedErrors, setSelectedErrors] = useState<string>('');
  const [journalText, setJournalText] = useState<string>(initialText);
  const [honestPhrase, setHonestPhrase] = useState<string>(day.honestPhrase || '');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const compiledRetrospective = [
        executionGrade ? `[GRADE: ${executionGrade}]` : '',
        journalText ? journalText : '',
      ].filter(Boolean).join('\n\n');

      await updateDayRetrospective(day.id, {
        honestPhrase,
        retrospective: compiledRetrospective,
        emotionalPost: dominantEmotion || selectedErrors ? `${dominantEmotion} | ${selectedErrors}` : '',
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Retrospectiva pós-pregão" className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-5 shadow-2xl space-y-5 font-mono">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <IconScale className="text-teal-400" />
          <h3 className="text-xs tracking-[0.2em] font-bold text-slate-200 uppercase">
            POST-SESSION DEBRIEF · RETROSPECTIVA DO PREGÃO
          </h3>
        </div>
        <span className="text-[10px] tracking-wider text-teal-400 font-bold bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded">
          PROCESSO &gt; RESULTADO
        </span>
      </header>

      {/* BLOCO 1: SCREENSHOTS & GRÁFICOS DO PREGÃO (Com Ctrl + V) */}
      <div className="space-y-2">
        <SessionImageDropzone tradingDayId={day.id} date={day.date} />
      </div>

      {/* BLOCO 2: EXECUÇÃO DO PLANO (A / B / C) */}
      <div className="space-y-2 pt-2 border-t border-slate-800/60">
        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
          01 // VOCÊ EXECUTOU O PROCESSO PLANEJADO?
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {EXECUTION_GRADES.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => setExecutionGrade(g.id)}
              className={`p-3 rounded-lg border text-left transition-all ${
                executionGrade === g.id
                  ? g.id === 'A'
                    ? 'border-teal-500/60 bg-teal-500/10 text-teal-300 font-bold shadow-[0_0_12px_rgba(45,212,191,0.15)]'
                    : g.id === 'B'
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-300 font-bold shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                    : 'border-rose-500/60 bg-rose-500/10 text-rose-300 font-bold shadow-[0_0_12px_rgba(244,63,94,0.15)]'
                  : 'bg-[#070a10] border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold block flex items-center justify-between">
                <span>{g.label}</span>
                {executionGrade === g.id && <span>✓</span>}
              </span>
              <p className="text-[11px] text-slate-400 font-sans leading-tight mt-1">{g.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* BLOCO 3: EMOCIONAL DOMINANTE & DESVIOS OPERACIONAIS (Multi-Select & CRUD) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/60">
        <TagGroupSelector
          category="emotion_post"
          label="02 // ESTADO EMOCIONAL DOMINANTE DA SESSÃO"
          value={dominantEmotion}
          onChange={setDominantEmotion}
          defaultOptions={['Calmo', 'Focado', 'Centrado', 'Neutro', 'Ansioso', 'Frustrado', 'Eufórico', 'Cansado', 'Irritado']}
        />

        <TagGroupSelector
          category="operational_error"
          label="03 // PRINCIPAL DESVIO / ERRO OPERACIONAL"
          value={selectedErrors}
          onChange={setSelectedErrors}
          defaultOptions={[
            'Nenhum (Execução Limpa)',
            'Overtrading (Operou Demais)',
            'FOMO / Impulso',
            'Revenge Trade / Vingança',
            'Hesitação na Entrada',
            'Saída Antecipada por Medo',
            'Violou Stop Loss',
            'Moveu Stop Contra Posição',
            'Tamanho de Mão Incorreto',
          ]}
        />
      </div>

      {/* BLOCO 4: DIÁRIO LIVRE DA SESSÃO (CAMPO DE TEXTO AMPLO) */}
      <div className="space-y-2 pt-2 border-t border-slate-800/60">
        <label className="text-[10px] text-slate-300 font-bold uppercase tracking-wider block flex items-center justify-between">
          <span>04 // DIÁRIO & NARRATIVA DA SESSÃO (TEXTO LIVRE)</span>
          <span className="text-[9px] text-slate-500 font-sans">Escreva livremente a história do pregão</span>
        </label>

        <textarea
          value={journalText}
          onChange={(e) => setJournalText(e.target.value)}
          placeholder="Escreva livremente sobre a sessão de hoje: como o mercado se comportou em relação ao Farol do Mercado/GEX, leitura de fluxo, gatilhos acionados, o que funcionou bem e o que pode melhorar no próximo pregão…"
          className="w-full h-32 bg-[#070a10] border border-slate-800/80 rounded-lg p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/60 font-sans leading-relaxed"
        />
      </div>

      {/* BLOCO 5: REGRA DE OURO PARA O PRÓXIMO PREGÃO */}
      <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
        <label className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
          05 // REGRA DE OURO / LIÇÃO PARA O PRÓXIMO PREGÃO
        </label>
        <input
          value={honestPhrase}
          onChange={(e) => setHonestPhrase(e.target.value)}
          placeholder="Ex: Não operar no primeiro candle de abertura se o Payroll estiver pendente..."
          className="w-full bg-[#070a10] border border-slate-800/80 rounded-lg px-3 py-2 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 font-mono text-xs"
        />
      </div>

      {/* BOTÃO DE REGISTRO */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
        <span className="text-slate-500 font-mono text-[10px]">
          DEBRIEF COMPLETO // SALVO NO BANCO SQLITE
        </span>

        <button
          onClick={handleSave}
          disabled={saving}
          type="button"
          className="px-5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-mono font-bold text-xs rounded-lg transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
        >
          {saved ? (
            <>
              <IconCheck className="text-slate-950" />
              <span>RETROSPECTIVA SALVA COM SUCESSO!</span>
            </>
          ) : saving ? (
            'SALVANDO NO BANCO…'
          ) : (
            'REGISTRAR RETROSPECTIVA DA SESSÃO'
          )}
        </button>
      </div>
    </section>
  );
}

export default RetrospectiveForm;
