'use client';

import { useState, useEffect } from 'react';
import type { Trade, TradeImage } from '@/lib/db/schema';
import { updateTradeNotes, deleteTrade } from '@/features/trades/actions';
import { getTradeImages } from '@/features/images/actions';
import { ImageDropzone } from '@/features/images/components/ImageDropzone';

// ─── Opções (mesmas do TradeModalV2) ─────────────────────────
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

const sideLabels: Record<string, { text: string; color: string }> = {
  C: { text: 'COMPRA', color: 'text-emerald-400 bg-emerald-400/10' },
  V: { text: 'VENDA', color: 'text-rose-400 bg-rose-400/10' },
};

// ─── Sub-components ──────────────────────────────────────────
function PillSelector({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(value === opt ? '' : opt)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
            value === opt
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-950/60 text-slate-500 border-slate-800/60 hover:border-slate-700 hover:text-slate-400'
          }`}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function StarRating({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-20">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button key={star} onClick={() => onChange(star)}
            className={`text-lg transition-all duration-150 hover:scale-125 ${
              (value || 0) >= star ? 'text-amber-400' : 'text-slate-600'
            }`}>
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────
interface TradeCardProps {
  trade: Trade;
  date: string;
  onOpenModal?: (trade: Trade) => void;
}

export function TradeCard({ trade, date, onOpenModal }: TradeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [inlineTab, setInlineTab] = useState<'info' | 'pre' | 'durante' | 'pos'>('info');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [images, setImages] = useState<TradeImage[]>([]);

  // Form state (todos os campos)
  const [form, setForm] = useState({
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

  const side = sideLabels[trade.side] || { text: trade.side, color: 'text-slate-400' };
  const isPositive = (trade.reais || 0) > 0;
  const isNegative = (trade.reais || 0) < 0;
  const resultColor = isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-slate-400';

  const openTimeFormatted = trade.openTime.includes(' ')
    ? trade.openTime.split(' ')[1]?.substring(0, 8)
    : trade.openTime;

  useEffect(() => {
    if (expanded) {
      getTradeImages(trade.id).then(setImages);
    }
  }, [expanded, trade.id]);

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSave() {
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

  async function handleDeleteTrade(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    setDeleted(true);
    try {
      await deleteTrade(trade.id);
    } catch (err) {
      console.error('Erro ao deletar trade:', err);
      setDeleted(false);
    } finally {
      setDeleting(false);
    }
  }

  if (deleted) return null;

  // Badges rápidos das anotações
  const hasAnnotations = form.strategy || form.emotionalPre || form.marketRegime || form.didPartial || form.movedStop || form.emotionalPost;

  return (
    <div className={`group rounded-xl border transition-all duration-300 hover:shadow-lg hover:shadow-slate-900/50 ${
      expanded
        ? 'bg-slate-900/90 border-slate-700/80 shadow-md'
        : 'bg-slate-900/50 border-slate-800/50 hover:border-slate-700/50 hover:bg-slate-900/70'
    }`}>
      {/* ─── Header do Card ──────────────────────────────── */}
      <div className="p-4 flex items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-500 font-bold">#{trade.tradeNumber}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${side.color}`}>{side.text}</span>
          <span className="text-sm font-semibold text-slate-200">{trade.instrument}</span>
          <span className="text-xs text-slate-500 font-mono hidden sm:inline">{openTimeFormatted}</span>
          {trade.duration && (
            <span className="text-xs text-slate-600 font-mono hidden md:inline">({trade.duration})</span>
          )}
          {/* Mini badges de anotações preenchidas */}
          {hasAnnotations && (
            <div className="flex gap-1 ml-1 hidden lg:flex">
              {form.strategy && <span className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded text-[9px] font-bold border border-cyan-500/15">{form.strategy}</span>}
              {form.emotionalPre && <span className="text-[11px]">{EMOTIONS_PRE.find(e => e.value === form.emotionalPre)?.emoji}</span>}
              {form.didPartial && <span className="text-[9px] px-1 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/15">Parcial</span>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right font-mono">
            <span className={`text-sm font-bold block ${resultColor}`}>
              {(trade.points || 0) > 0 ? '+' : ''}{trade.points} pts
            </span>
            <span className={`text-xs font-semibold block ${resultColor}`}>
              R$ {(trade.reais || 0) > 0 ? '+' : ''}{trade.reais?.toFixed(2)}
            </span>
          </div>

          {/* Botão Deletar */}
          {confirmDelete ? (
            <div className="flex items-center gap-1 animate-in fade-in" onClick={(e) => e.stopPropagation()}>
              <button onClick={handleDeleteTrade} disabled={deleting}
                className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold transition-all">
                {deleting ? '...' : 'Confirmar'}
              </button>
              <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                className="p-1 text-slate-400 hover:text-slate-200 text-xs">✕</button>
            </div>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              title="Deletar" className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors text-xs">🗑️</button>
          )}

          {/* Botão Abrir Modal (Inspector completo) */}
          {onOpenModal && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenModal(trade); }}
              title="Abrir Inspector completo"
              className="p-1.5 text-slate-500 hover:text-cyan-400 transition-colors text-xs"
            >
              ↗️
            </button>
          )}

          {/* Flechinha Expand/Collapse INLINE */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-slate-500 hover:text-slate-300 transition-all"
            title={expanded ? 'Recolher' : 'Expandir inline'}
          >
            <span className={`transition-transform duration-200 inline-block text-xs ${expanded ? 'rotate-180' : ''}`}>▼</span>
          </button>
        </div>
      </div>

      {/* ─── Conteúdo Expandido Inline ───────────────────── */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-800/50 pt-3 animate-in fade-in">

          {/* Mini-Tabs inline */}
          <div className="flex gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/40">
            {[
              { id: 'info' as const, label: '📊 Info', },
              { id: 'pre' as const, label: '🎯 Pré' },
              { id: 'durante' as const, label: '⚡ Durante' },
              { id: 'pos' as const, label: '🔍 Pós' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setInlineTab(tab.id)}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                  inlineTab === tab.id
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ─── Tab: Info ─────────────────────────────────── */}
          {inlineTab === 'info' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-950/50 p-3 rounded-lg border border-slate-800/30">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Entrada</span>
                  <span className="font-mono font-semibold text-slate-300">{trade.entryPrice.toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Saída</span>
                  <span className="font-mono font-semibold text-slate-300">{trade.exitPrice.toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Contratos</span>
                  <span className="font-mono font-semibold text-slate-300">{trade.contracts}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">MEP / MEN</span>
                  <span className="font-mono font-semibold text-emerald-400">+{trade.mep || 0}</span> / <span className="font-mono font-semibold text-rose-400">{trade.men || 0}</span>
                </div>
              </div>

              <ImageDropzone tradeId={trade.id} date={date} images={images} onUploaded={() => getTradeImages(trade.id).then(setImages)} />
            </div>
          )}

          {/* ─── Tab: Pré-Trade ────────────────────────────── */}
          {inlineTab === 'pre' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">Estratégia</label>
                <PillSelector options={STRATEGIES} value={form.strategy} onChange={(v) => updateForm('strategy', v)} />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">Estado Emocional</label>
                <div className="flex flex-wrap gap-1">
                  {EMOTIONS_PRE.map(emo => (
                    <button key={emo.value}
                      onClick={() => updateForm('emotionalPre', form.emotionalPre === emo.value ? '' : emo.value)}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-all flex items-center gap-1 ${
                        form.emotionalPre === emo.value
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-slate-950/60 text-slate-500 border-slate-800/60 hover:border-slate-700'
                      }`}>
                      <span>{emo.emoji}</span> {emo.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">Tipo de Entrada</label>
                <PillSelector options={ENTRY_TYPES} value={form.entryType} onChange={(v) => updateForm('entryType', v)} />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">O que pensei antes de entrar</label>
                <textarea value={form.preTradeNote} onChange={(e) => updateForm('preTradeNote', e.target.value)}
                  placeholder="Confluência, leitura de fluxo, nível..."
                  className="w-full bg-slate-950/50 border border-slate-800/50 rounded-lg p-2.5 text-xs text-slate-200 resize-none h-16 focus:border-emerald-500/50" />
              </div>

              <SaveButton />
            </div>
          )}

          {/* ─── Tab: Durante ──────────────────────────────── */}
          {inlineTab === 'durante' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 font-medium">Regime de Mercado</label>
                  <PillSelector options={MARKET_REGIMES} value={form.marketRegime} onChange={(v) => updateForm('marketRegime', v)} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 font-medium">Fase do Dia</label>
                  <PillSelector options={DAY_PHASES} value={form.dayPhase} onChange={(v) => updateForm('dayPhase', v)} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">Tipo de Stop</label>
                <PillSelector options={STOP_TYPES} value={form.stopType} onChange={(v) => updateForm('stopType', v)} />
              </div>

              {/* Gestão da Operação */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">Gestão da Operação</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {([
                    { key: 'didPartial' as const, icon: '📊', label: 'Parcial' },
                    { key: 'movedStop' as const, icon: '🔄', label: 'Moveu Stop' },
                    { key: 'reducedSize' as const, icon: '📉', label: 'Reduziu Mão' },
                    { key: 'exitedEarly' as const, icon: '🚪', label: 'Saiu cedo' },
                  ]).map(item => (
                    <button key={item.key} onClick={() => updateForm(item.key, !form[item.key])}
                      className={`px-2 py-2 rounded-lg text-[11px] font-medium border transition-all flex items-center gap-1.5 ${
                        form[item.key]
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-950/60 text-slate-500 border-slate-800/60 hover:border-slate-700'
                      }`}>
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[8px] ${
                        form[item.key] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600'
                      }`}>{form[item.key] ? '✓' : ''}</span>
                      {item.icon} {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/30 p-3 rounded-lg border border-slate-800/30">
                <StarRating label="Convicção" value={form.conviction} onChange={(v) => updateForm('conviction', v)} />
                <StarRating label="Execução" value={form.execution} onChange={(v) => updateForm('execution', v)} />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">Observações durante</label>
                <textarea value={form.duringTradeNote} onChange={(e) => updateForm('duringTradeNote', e.target.value)}
                  placeholder="Fez parcial, moveu stop, fluxo mudou..."
                  className="w-full bg-slate-950/50 border border-slate-800/50 rounded-lg p-2.5 text-xs text-slate-200 resize-none h-16 focus:border-emerald-500/50" />
              </div>

              <SaveButton />
            </div>
          )}

          {/* ─── Tab: Pós-Trade ────────────────────────────── */}
          {inlineTab === 'pos' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">Estado Emocional Pós-Trade</label>
                <div className="flex flex-wrap gap-1">
                  {EMOTIONS_POST.map(emo => (
                    <button key={emo.value}
                      onClick={() => updateForm('emotionalPost', form.emotionalPost === emo.value ? '' : emo.value)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all flex items-center gap-1 ${
                        form.emotionalPost === emo.value
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-slate-950/60 text-slate-500 border-slate-800/60 hover:border-slate-700'
                      }`}>
                      <span className="text-sm">{emo.emoji}</span> {emo.label}
                    </button>
                  ))}
                </div>
              </div>

              <StarRating label="Qualidade" value={form.tradeQuality} onChange={(v) => updateForm('tradeQuality', v)} />

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">O que vi NA HORA</label>
                <textarea value={form.whatISawNow} onChange={(e) => updateForm('whatISawNow', e.target.value)}
                  placeholder="Tape reading, fluxo, book..."
                  className="w-full bg-slate-950/50 border border-slate-800/50 rounded-lg p-2.5 text-xs text-slate-200 resize-none h-14 focus:border-emerald-500/50" />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">O que faria diferente</label>
                <textarea value={form.postTradeNote} onChange={(e) => updateForm('postTradeNote', e.target.value)}
                  placeholder="Deveria ter esperado confirmação, parcial no alvo 1..."
                  className="w-full bg-slate-950/50 border border-slate-800/50 rounded-lg p-2.5 text-xs text-slate-200 resize-none h-14 focus:border-emerald-500/50" />
              </div>

              <SaveButton />
            </div>
          )}
        </div>
      )}
    </div>
  );

  function SaveButton() {
    return (
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition-all border border-emerald-500/20 disabled:opacity-50">
          {saving ? '⏳ Salvando...' : '💾 Salvar'}
        </button>
        {saved && <span className="text-xs text-emerald-400 animate-in fade-in">✅ Salvo!</span>}
      </div>
    );
  }
}
