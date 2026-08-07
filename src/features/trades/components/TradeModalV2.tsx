'use client';

import { useState, useEffect } from 'react';
import type { Trade, TradeImage } from '@/lib/db/schema';
import { updateTradeNotes, deleteTrade } from '@/features/trades/actions';
import { getTradeImages } from '@/features/images/actions';
import { ImageDropzone } from '@/features/images/components/ImageDropzone';

// ─── Opções de Seleção ─────────────────────────────────────────
const EMOTIONS_PRE = [
  { value: 'confiante', emoji: '😎', label: 'Confiante' },
  { value: 'neutro', emoji: '😐', label: 'Neutro' },
  { value: 'ansioso', emoji: '😰', label: 'Ansioso' },
  { value: 'fomo', emoji: '🤑', label: 'FOMO' },
  { value: 'revenge', emoji: '😤', label: 'Revenge' },
  { value: 'medo', emoji: '😱', label: 'Medo' },
  { value: 'euforia', emoji: '🤩', label: 'Euforia' },
];

const EMOTIONS_POST = [
  { value: 'calmo', emoji: '😌', label: 'Calmo' },
  { value: 'satisfeito', emoji: '😃', label: 'Satisfeito' },
  { value: 'neutro', emoji: '😐', label: 'Neutro' },
  { value: 'frustrado', emoji: '😤', label: 'Frustrado' },
  { value: 'aliviado', emoji: '😮‍💨', label: 'Aliviado' },
  { value: 'arrependido', emoji: '😔', label: 'Arrependido' },
];

const STRATEGIES = ['Rompimento', 'Pullback', 'VWAP Revert', 'Fluxo', 'Scalp', 'Momentum', 'Contra-Tendência', 'Abertura'];
const ENTRY_TYPES = ['Breakout', 'Pullback', 'Reversão', 'Scalp', 'Momentum', 'Contra-Tendência'];
const MARKET_REGIMES = ['Tendência', 'Range', 'Chop', 'Volatilidade', 'Abertura'];
const DAY_PHASES = ['Pré-Abertura', 'Abertura', 'Meio Pregão', 'Final Pregão'];
const STOP_TYPES = ['Técnico', 'Financeiro', 'Temporal', 'Trail', 'Breakeven'];

type TabId = 'resumo' | 'pre' | 'durante' | 'pos' | 'screenshots' | 'audio';

interface TradeModalV2Props {
  trade: Trade | null;
  date: string;
  onClose: () => void;
}

export function TradeModalV2({ trade, date, onClose }: TradeModalV2Props) {
  const [activeTab, setActiveTab] = useState<TabId>('resumo');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [images, setImages] = useState<TradeImage[]>([]);

  // ─── Form State ────────────────────────────────────────────
  const [form, setForm] = useState({
    // Existentes
    conviction: trade?.conviction ?? null as number | null,
    execution: trade?.execution ?? null as number | null,
    whatISawNow: trade?.whatISawNow || '',
    retrospective: trade?.retrospective || '',
    // Pré-Trade
    strategy: trade?.strategy || '',
    emotionalPre: trade?.emotionalPre || '',
    entryType: trade?.entryType || '',
    preTradeNote: trade?.preTradeNote || '',
    // Durante
    marketRegime: trade?.marketRegime || '',
    dayPhase: trade?.dayPhase || '',
    stopType: trade?.stopType || '',
    didPartial: trade?.didPartial ?? false,
    movedStop: trade?.movedStop ?? false,
    reducedSize: trade?.reducedSize ?? false,
    exitedEarly: trade?.exitedEarly ?? false,
    duringTradeNote: trade?.duringTradeNote || '',
    // Pós
    emotionalPost: trade?.emotionalPost || '',
    tradeQuality: trade?.tradeQuality ?? null as number | null,
    postTradeNote: trade?.postTradeNote || '',
  });

  useEffect(() => {
    if (trade) {
      setForm({
        conviction: trade.conviction,
        execution: trade.execution,
        whatISawNow: trade.whatISawNow || '',
        retrospective: trade.retrospective || '',
        strategy: trade.strategy || '',
        emotionalPre: trade.emotionalPre || '',
        entryType: trade.entryType || '',
        preTradeNote: trade.preTradeNote || '',
        marketRegime: trade.marketRegime || '',
        dayPhase: trade.dayPhase || '',
        stopType: trade.stopType || '',
        didPartial: trade.didPartial ?? false,
        movedStop: trade.movedStop ?? false,
        reducedSize: trade.reducedSize ?? false,
        exitedEarly: trade.exitedEarly ?? false,
        duringTradeNote: trade.duringTradeNote || '',
        emotionalPost: trade.emotionalPost || '',
        tradeQuality: trade.tradeQuality,
        postTradeNote: trade.postTradeNote || '',
      });
      getTradeImages(trade.id).then(setImages);
    }
  }, [trade]);

  if (!trade) return null;

  const isPositive = (trade.reais || 0) > 0;
  const isNegative = (trade.reais || 0) < 0;
  const sideColor = trade.side === 'C' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30';
  const resultColor = isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-slate-400';

  async function handleSave() {
    if (!trade) return;
    setSaving(true);
    try {
      await updateTradeNotes(trade.id, {
        conviction: form.conviction ?? undefined,
        execution: form.execution ?? undefined,
        whatISawNow: form.whatISawNow || undefined,
        retrospective: form.retrospective || undefined,
        strategy: form.strategy || undefined,
        emotionalPre: form.emotionalPre || undefined,
        entryType: form.entryType || undefined,
        preTradeNote: form.preTradeNote || undefined,
        marketRegime: form.marketRegime || undefined,
        dayPhase: form.dayPhase || undefined,
        stopType: form.stopType || undefined,
        didPartial: form.didPartial,
        movedStop: form.movedStop,
        reducedSize: form.reducedSize,
        exitedEarly: form.exitedEarly,
        duringTradeNote: form.duringTradeNote || undefined,
        emotionalPost: form.emotionalPost || undefined,
        tradeQuality: form.tradeQuality ?? undefined,
        postTradeNote: form.postTradeNote || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTrade() {
    if (!trade) return;
    setDeleting(true);
    try {
      await deleteTrade(trade.id);
      onClose();
    } catch (err) {
      console.error('Erro ao deletar trade:', err);
    } finally {
      setDeleting(false);
    }
  }

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  // ─── Pill Selector Component ────────────────────────────────
  function PillSelector({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(value === opt ? '' : opt)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              value === opt
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-900/60 text-slate-400 border-slate-800/60 hover:border-slate-700 hover:text-slate-300'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }

  // ─── Star Rating Component ──────────────────────────────────
  function StarRating({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) {
    return (
      <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/60 space-y-1.5">
        <span className="text-xs text-slate-400 block">{label}</span>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              onClick={() => onChange(star)}
              className={`text-xl transition-all ${(value || 0) >= star ? 'text-amber-400' : 'text-slate-700 hover:text-slate-500'}`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Tabs Config ────────────────────────────────────────────
  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'resumo', label: 'Resumo', icon: '📊' },
    { id: 'pre', label: 'Pré-Trade', icon: '🎯' },
    { id: 'durante', label: 'Durante', icon: '⚡' },
    { id: 'pos', label: 'Pós-Trade', icon: '🔍' },
    { id: 'screenshots', label: `Prints (${images.length})`, icon: '🖼️' },
    { id: 'audio', label: 'Áudio', icon: '🎙️' },
  ];

  // ─── Save Button (reutilizado em várias abas) ───────────────
  function SaveButton() {
    return (
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-semibold hover:bg-emerald-500/20 transition-all disabled:opacity-50"
        >
          {saving ? '⏳ Salvando...' : '💾 Salvar Anotações'}
        </button>
        {saved && <span className="text-xs text-emerald-400 animate-in fade-in">✅ Salvo!</span>}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0d131f] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
        {/* ─── Header Bar ──────────────────────────────────── */}
        <div className="p-4 bg-[#090d16] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-sm font-mono flex items-center gap-1">
              ‹ Voltar
            </button>
            <div className="h-4 w-px bg-slate-800" />
            <span className="text-lg font-bold text-slate-100">Trade #{trade.tradeNumber}</span>
            <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${sideColor}`}>
              {trade.side === 'C' ? 'COMPRA' : 'VENDA'} {trade.instrument}
            </span>
            <span className="text-xs text-slate-500 font-mono hidden sm:inline">{trade.openTime} → {trade.closeTime}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className={`text-base font-bold font-mono block ${resultColor}`}>
                {(trade.points || 0) > 0 ? '+' : ''}{trade.points} pts
              </span>
              <span className={`text-xs font-mono font-bold block ${resultColor}`}>
                R$ {(trade.reais || 0) > 0 ? '+' : ''}{trade.reais?.toFixed(2)}
              </span>
            </div>

            {confirmDelete ? (
              <div className="flex items-center gap-1 animate-in fade-in">
                <button onClick={handleDeleteTrade} disabled={deleting}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all shadow-md">
                  {deleting ? 'Deletando...' : 'Confirmar'}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="p-1 text-slate-400 hover:text-slate-200 text-xs">✕</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} title="Deletar"
                className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-semibold transition-all flex items-center gap-1">
                <span>🗑️</span><span className="hidden sm:inline">Deletar</span>
              </button>
            )}

            <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl px-2">✕</button>
          </div>
        </div>

        {/* ─── Tab Navigation ──────────────────────────────── */}
        <div className="flex border-b border-slate-800/80 bg-[#090d16]/50 px-4 gap-0.5 text-xs overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-3 font-medium transition-all border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>

        {/* ─── Modal Body ──────────────────────────────────── */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">

          {/* ═══ ABA RESUMO ═══════════════════════════════════ */}
          {activeTab === 'resumo' && (
            <div className="space-y-5">
              {/* Grid 3 Colunas: Entrada | Saída | Resultado */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 space-y-2">
                  <span className="text-xs text-slate-500 block uppercase tracking-wider font-semibold">Entrada</span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-400">Preço</span>
                    <span className="text-sm font-mono font-bold text-slate-200">{trade.entryPrice.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-400">Contratos</span>
                    <span className="text-sm font-mono text-slate-200">{trade.contracts}</span>
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 space-y-2">
                  <span className="text-xs text-slate-500 block uppercase tracking-wider font-semibold">Saída</span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-400">Preço</span>
                    <span className="text-sm font-mono font-bold text-slate-200">{trade.exitPrice.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-400">Duração</span>
                    <span className="text-sm font-mono text-slate-200">{trade.duration || '—'}</span>
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 space-y-2">
                  <span className="text-xs text-slate-500 block uppercase tracking-wider font-semibold">Resultado</span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-400">Pontos</span>
                    <span className={`text-sm font-mono font-bold ${resultColor}`}>
                      {(trade.points || 0) > 0 ? '+' : ''}{trade.points} pts
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-400">Financeiro</span>
                    <span className={`text-sm font-mono font-bold ${resultColor}`}>
                      R$ {(trade.reais || 0) > 0 ? '+' : ''}{trade.reais?.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Badges MEP/MEN/Drawdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-3 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase">Duração</span>
                  <span className="text-sm font-mono font-semibold text-slate-300">{trade.duration || '—'}</span>
                </div>
                <div className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-3 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase">Máx. Favorável (MEP)</span>
                  <span className="text-sm font-mono font-semibold text-emerald-400">+{trade.mep || 0} pts</span>
                </div>
                <div className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-3 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase">Máx. Adverso (MEN)</span>
                  <span className="text-sm font-mono font-semibold text-rose-400">{trade.men || 0} pts</span>
                </div>
                <div className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-3 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase">Drawdown</span>
                  <span className="text-sm font-mono font-semibold text-slate-400">{trade.drawdown || 0} pts</span>
                </div>
              </div>

              {/* Quick Badges de Preenchimento */}
              <div className="flex flex-wrap gap-2 text-xs">
                {form.strategy && (
                  <span className="px-2.5 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-lg">📋 {form.strategy}</span>
                )}
                {form.emotionalPre && (
                  <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg">
                    {EMOTIONS_PRE.find(e => e.value === form.emotionalPre)?.emoji} {form.emotionalPre}
                  </span>
                )}
                {form.marketRegime && (
                  <span className="px-2.5 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg">🏷️ {form.marketRegime}</span>
                )}
                {form.didPartial && <span className="px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">📊 Parcial</span>}
                {form.movedStop && <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg">🔄 Moveu Stop</span>}
                {form.emotionalPost && (
                  <span className="px-2.5 py-1 bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded-lg">
                    {EMOTIONS_POST.find(e => e.value === form.emotionalPost)?.emoji} {form.emotionalPost}
                  </span>
                )}
              </div>

              <ImageDropzone tradeId={trade.id} date={date} images={images} onUploaded={() => getTradeImages(trade.id).then(setImages)} />
            </div>
          )}

          {/* ═══ ABA PRÉ-TRADE ════════════════════════════════ */}
          {activeTab === 'pre' && (
            <div className="space-y-5">
              <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">🎯 Pré-Trade — Antes de Entrar</h4>

              {/* Estratégia */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium block">Estratégia</label>
                <PillSelector options={STRATEGIES} value={form.strategy} onChange={(v) => updateForm('strategy', v)} />
                <input
                  value={form.strategy}
                  onChange={(e) => updateForm('strategy', e.target.value)}
                  placeholder="Ou digite uma estratégia personalizada..."
                  className="w-full bg-slate-900/50 border border-slate-800/60 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 mt-1"
                />
              </div>

              {/* Estado Emocional Pré */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium block">Estado Emocional</label>
                <div className="flex flex-wrap gap-1.5">
                  {EMOTIONS_PRE.map(emo => (
                    <button
                      key={emo.value}
                      onClick={() => updateForm('emotionalPre', form.emotionalPre === emo.value ? '' : emo.value)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 ${
                        form.emotionalPre === emo.value
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-md'
                          : 'bg-slate-900/60 text-slate-400 border-slate-800/60 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-base">{emo.emoji}</span> {emo.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tipo de Entrada */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium block">Tipo de Entrada</label>
                <PillSelector options={ENTRY_TYPES} value={form.entryType} onChange={(v) => updateForm('entryType', v)} />
              </div>

              {/* Nota Pré-Trade */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium block">O que eu vi/pensei antes de entrar</label>
                <textarea
                  value={form.preTradeNote}
                  onChange={(e) => updateForm('preTradeNote', e.target.value)}
                  placeholder="Leitura de tape, fluxo institucional, nível de referência, confluência..."
                  className="w-full h-24 bg-slate-900/50 border border-slate-800/60 rounded-xl p-3 text-sm text-slate-200 placeholder:text-slate-600 resize-none"
                />
              </div>

              <SaveButton />
            </div>
          )}

          {/* ═══ ABA DURANTE ═══════════════════════════════════ */}
          {activeTab === 'durante' && (
            <div className="space-y-5">
              <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">⚡ Durante o Trade</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Regime de Mercado */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-medium block">Regime de Mercado</label>
                  <PillSelector options={MARKET_REGIMES} value={form.marketRegime} onChange={(v) => updateForm('marketRegime', v)} />
                </div>

                {/* Fase do Dia */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-medium block">Fase do Dia</label>
                  <PillSelector options={DAY_PHASES} value={form.dayPhase} onChange={(v) => updateForm('dayPhase', v)} />
                </div>

                {/* Tipo de Stop */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-medium block">Tipo de Stop</label>
                  <PillSelector options={STOP_TYPES} value={form.stopType} onChange={(v) => updateForm('stopType', v)} />
                </div>

                {/* Convicção + Execução */}
                <div className="space-y-3">
                  <StarRating label="Convicção na Entrada (1-5 ★)" value={form.conviction} onChange={(v) => updateForm('conviction', v)} />
                  <StarRating label="Qualidade da Execução (1-5 ★)" value={form.execution} onChange={(v) => updateForm('execution', v)} />
                </div>
              </div>

              {/* Gestão da Operação */}
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-medium block">Gestão da Operação</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: 'didPartial' as const, icon: '📊', label: 'Parcial' },
                    { key: 'movedStop' as const, icon: '🔄', label: 'Moveu Stop' },
                    { key: 'reducedSize' as const, icon: '📉', label: 'Reduziu Mão' },
                    { key: 'exitedEarly' as const, icon: '🚪', label: 'Zerou antes do alvo' },
                  ].map(item => (
                    <button
                      key={item.key}
                      onClick={() => updateForm(item.key, !form[item.key])}
                      className={`px-3 py-2.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-2 ${
                        form[item.key]
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-900/60 text-slate-400 border-slate-800/60 hover:border-slate-700'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                        form[item.key] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600'
                      }`}>
                        {form[item.key] ? '✓' : ''}
                      </span>
                      <span>{item.icon}</span> {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Observações durante */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium block">Observações durante a operação</label>
                <textarea
                  value={form.duringTradeNote}
                  onChange={(e) => updateForm('duringTradeNote', e.target.value)}
                  placeholder="Fluxo mudou, fez parcial no alvo 1, moveu stop para BE..."
                  className="w-full h-24 bg-slate-900/50 border border-slate-800/60 rounded-xl p-3 text-sm text-slate-200 placeholder:text-slate-600 resize-none"
                />
              </div>

              <SaveButton />
            </div>
          )}

          {/* ═══ ABA PÓS-TRADE ════════════════════════════════ */}
          {activeTab === 'pos' && (
            <div className="space-y-5">
              <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">🔍 Pós-Trade — Análise e Retrospectiva</h4>

              {/* Estado Emocional Pós */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium block">Estado Emocional Pós-Trade</label>
                <div className="flex flex-wrap gap-1.5">
                  {EMOTIONS_POST.map(emo => (
                    <button
                      key={emo.value}
                      onClick={() => updateForm('emotionalPost', form.emotionalPost === emo.value ? '' : emo.value)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 ${
                        form.emotionalPost === emo.value
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-md'
                          : 'bg-slate-900/60 text-slate-400 border-slate-800/60 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-lg">{emo.emoji}</span> {emo.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Qualidade do Trade */}
              <StarRating
                label="Qualidade Geral do Trade (autoavaliação 1-5 ★)"
                value={form.tradeQuality}
                onChange={(v) => updateForm('tradeQuality', v)}
              />

              {/* O que vi NA HORA (existente whatISawNow) */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium block">O que eu vi NA HORA (leitura imediata)</label>
                <textarea
                  value={form.whatISawNow}
                  onChange={(e) => updateForm('whatISawNow', e.target.value)}
                  placeholder="Tape reading, fluxo, book, candle de contexto..."
                  className="w-full h-20 bg-slate-900/50 border border-slate-800/60 rounded-xl p-3 text-sm text-slate-200 placeholder:text-slate-600 resize-none"
                />
              </div>

              {/* O que faria diferente */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium block">O que faria diferente (hindsight)</label>
                <textarea
                  value={form.postTradeNote}
                  onChange={(e) => updateForm('postTradeNote', e.target.value)}
                  placeholder="Deveria ter esperado confirmação, parcial no alvo 1..."
                  className="w-full h-20 bg-slate-900/50 border border-slate-800/60 rounded-xl p-3 text-sm text-slate-200 placeholder:text-slate-600 resize-none"
                />
              </div>

              {/* Retrospectiva técnica */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium block">Retrospectiva técnica (o gráfico mostrou depois)</label>
                <textarea
                  value={form.retrospective}
                  onChange={(e) => updateForm('retrospective', e.target.value)}
                  placeholder="O preço foi até onde? O setup era válido? O stop estava bem posicionado?"
                  className="w-full h-20 bg-slate-900/50 border border-slate-800/60 rounded-xl p-3 text-sm text-slate-200 placeholder:text-slate-600 resize-none"
                />
              </div>

              <SaveButton />
            </div>
          )}

          {/* ═══ ABA SCREENSHOTS ═══════════════════════════════ */}
          {activeTab === 'screenshots' && (
            <ImageDropzone tradeId={trade.id} date={date} images={images} onUploaded={() => getTradeImages(trade.id).then(setImages)} />
          )}

          {/* ═══ ABA ÁUDIO ═════════════════════════════════════ */}
          {activeTab === 'audio' && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-300">🎙️ Áudio & Narração deste Trade</h4>
              <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Os áudios gravados durante o pregão são transcritos e sincronizados com os horários de cada trade.
                  Na <strong>Fase 2</strong>, a IA extrairá automaticamente informações relevantes da transcrição
                  (emoções, observações, estratégia mencionada) e preencherá os campos acima com tag 🤖.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
