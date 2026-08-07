'use client';

import { useState, useEffect } from 'react';
import type { Trade, TradeImage } from '@/lib/db/schema';
import { updateTradeNotes, deleteTrade } from '@/features/trades/actions';
import { getTradeImages } from '@/features/images/actions';
import { ImageDropzone } from '@/features/images/components/ImageDropzone';
import { StrategySelector } from '@/components/ui/StrategySelector';
import { IconArrowUp, IconArrowDown, IconCheck } from '@/components/ui/icons';

const STRATEGIES = ['Rompimento', 'Pullback', 'VWAP Revert', 'Fluxo', 'Scalp', 'Momentum', 'Contra-Tendência', 'Abertura'];
const ENTRY_TYPES = ['Breakout', 'Pullback', 'Reversão', 'Scalp', 'Momentum', 'Contra-Tendência'];
const MARKET_REGIMES = ['Tendência', 'Range', 'Chop', 'Volatilidade', 'Abertura'];
const DAY_PHASES = ['Pré-Abertura', 'Abertura', 'Meio Pregão', 'Final Pregão'];
const STOP_TYPES = ['Técnico', 'Financeiro', 'Temporal', 'Trail', 'Breakeven'];

const sideLabels: Record<string, { text: string; color: string; Icon: typeof IconArrowUp }> = {
  C: { text: 'COMPRA', color: 'text-teal-400 border-teal-500/40 bg-teal-500/10', Icon: IconArrowUp },
  V: { text: 'VENDA', color: 'text-rose-400 border-rose-500/40 bg-rose-500/10', Icon: IconArrowDown },
};

function PillSelector({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const selectedList = value ? value.split(/\s*\|\s*/).filter(Boolean) : [];
  return (
    <div className="flex flex-wrap gap-1 font-mono">
      {options.map(opt => {
        const isSelected = selectedList.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => {
              if (isSelected) {
                const updated = selectedList.filter(s => s !== opt).join(' | ');
                onChange(updated);
              } else {
                const updated = [...selectedList, opt].join(' | ');
                onChange(updated);
              }
            }}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all flex items-center gap-1 ${
              isSelected
                ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 shadow-[0_0_8px_rgba(45,212,191,0.2)]'
                : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:border-slate-700 hover:text-slate-400'
            }`}
          >
            {isSelected && <span className="text-teal-400 font-bold">✓</span>}
            <span>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

function StarRating({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-2 font-mono">
      <span className="text-[10px] uppercase text-slate-400 w-20 font-bold">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button key={star} type="button" onClick={() => onChange(star)}
            className={`text-sm transition-all ${
              (value || 0) >= star ? 'text-amber-400 font-bold' : 'text-slate-600'
            }`}>
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

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

  const side = sideLabels[trade.side] || { text: trade.side, color: 'text-slate-400 border-slate-700 bg-slate-900', Icon: IconArrowUp };
  const isPositive = (trade.reais || 0) > 0;
  const isNegative = (trade.reais || 0) < 0;
  const resultColor = isPositive ? 'text-teal-400' : isNegative ? 'text-rose-400' : 'text-slate-400';

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

  return (
    <div className={`group rounded-lg border transition-all duration-200 ${
      expanded
        ? 'bg-[#0b1018] border-slate-700/80 shadow-xl'
        : 'bg-[#0b1018] border-slate-800/80 hover:border-slate-700/80'
    }`}>
      {/* Header do Card */}
      <div className="p-3.5 flex items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-500 font-bold">#{trade.tradeNumber}</span>
          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold font-mono flex items-center gap-1 ${side.color}`}>
            <side.Icon width={10} height={10} />
            {side.text}
          </span>
          <span className="text-xs font-bold text-slate-200 font-mono">{trade.instrument}</span>
          <span className="text-xs text-slate-500 font-mono tabular-nums hidden sm:inline">{openTimeFormatted}</span>
          {trade.duration && (
            <span className="text-xs text-slate-600 font-mono hidden md:inline">({trade.duration})</span>
          )}
          {form.strategy && (
            <span className="px-1.5 py-0.5 bg-teal-500/10 text-teal-400 rounded text-[9px] font-bold border border-teal-500/20 font-mono uppercase hidden lg:inline">
              {form.strategy}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right font-mono tabular-nums">
            <span className={`text-xs font-bold block ${resultColor}`}>
              {(trade.points || 0) > 0 ? '+' : ''}{trade.points} pts
            </span>
            <span className={`text-[10px] font-bold block ${resultColor}`}>
              R$ {(trade.reais || 0) > 0 ? '+' : ''}{trade.reais?.toFixed(2)}
            </span>
          </div>

          {confirmDelete ? (
            <div className="flex items-center gap-1 font-mono text-[10px]" onClick={(e) => e.stopPropagation()}>
              <button onClick={handleDeleteTrade} disabled={deleting}
                className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold transition-all">
                {deleting ? '…' : 'CONFIRMAR'}
              </button>
              <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                className="px-1 text-slate-400 hover:text-slate-200 text-xs">✕</button>
            </div>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              title="Deletar" className="px-1.5 py-0.5 text-slate-500 hover:text-rose-400 font-mono text-[10px]">DEL</button>
          )}

          {onOpenModal && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenModal(trade); }}
              title="Abrir Inspector completo"
              className="px-1.5 py-0.5 text-slate-500 hover:text-teal-400 font-mono text-[10px]"
            >
              INSPECT ↗
            </button>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-slate-500 hover:text-slate-300 font-mono text-xs transition-transform"
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Conteúdo Expandido Inline */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-800/80 pt-3 font-mono">
          {/* Mini-Tabs inline */}
          <div className="flex gap-1 bg-[#070a10] p-1 rounded-md border border-slate-800/80 text-xs">
            {[
              { id: 'info' as const, label: 'INFO & PRINTS' },
              { id: 'pre' as const, label: 'PRÉ-TRADE' },
              { id: 'durante' as const, label: 'DURANTE' },
              { id: 'pos' as const, label: 'PÓS-TRADE' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setInlineTab(tab.id)}
                type="button"
                className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
                  inlineTab === tab.id
                    ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: Info */}
          {inlineTab === 'info' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-[#070a10] p-3 rounded-md border border-slate-800/80 font-mono tabular-nums">
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">PREÇO ENTRADA</span>
                  <span className="font-semibold text-slate-300">{trade.entryPrice.toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">PREÇO SAÍDA</span>
                  <span className="font-semibold text-slate-300">{trade.exitPrice.toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">CONTRATOS</span>
                  <span className="font-semibold text-slate-300">{trade.contracts}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">MEP / MEN</span>
                  <span className="font-semibold text-teal-400">+{trade.mep || 0}</span> / <span className="font-semibold text-rose-400">{trade.men || 0}</span>
                </div>
              </div>

              <ImageDropzone tradeId={trade.id} date={date} images={images} onUploaded={() => getTradeImages(trade.id).then(setImages)} />
            </div>
          )}

          {/* Tab: Pré-Trade */}
          {inlineTab === 'pre' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-bold">Estratégia / Setup (Multi-Seleção & CRUD)</label>
                <StrategySelector value={form.strategy} onChange={(v) => updateForm('strategy', v)} />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-bold">Tipo de Entrada</label>
                <PillSelector options={ENTRY_TYPES} value={form.entryType} onChange={(v) => updateForm('entryType', v)} />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-bold">Tese do Trade (O que pensei antes)</label>
                <textarea value={form.preTradeNote} onChange={(e) => updateForm('preTradeNote', e.target.value)}
                  placeholder="Confluência, leitura de fluxo, nível GEX…"
                  className="w-full bg-[#070a10] border border-slate-800/80 rounded-md p-2 text-xs text-slate-200 resize-none h-16 focus:outline-none focus:border-teal-500/60 font-sans" />
              </div>

              <SaveButton />
            </div>
          )}

          {/* Tab: Durante */}
          {inlineTab === 'durante' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-bold">Regime de Mercado</label>
                  <PillSelector options={MARKET_REGIMES} value={form.marketRegime} onChange={(v) => updateForm('marketRegime', v)} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-bold">Fase do Pregão</label>
                  <PillSelector options={DAY_PHASES} value={form.dayPhase} onChange={(v) => updateForm('dayPhase', v)} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-bold">Tipo de Stop</label>
                <PillSelector options={STOP_TYPES} value={form.stopType} onChange={(v) => updateForm('stopType', v)} />
              </div>

              {/* Gestão da Operação */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-bold">Gestão da Operação</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono">
                  {([
                    { key: 'didPartial' as const, label: 'PARCIAL' },
                    { key: 'movedStop' as const, label: 'MOVEU STOP' },
                    { key: 'reducedSize' as const, label: 'REDUZIU MÃO' },
                    { key: 'exitedEarly' as const, label: 'SAIU CEDO' },
                  ]).map(item => (
                    <button key={item.key} type="button" onClick={() => updateForm(item.key, !form[item.key])}
                      className={`px-2 py-1.5 rounded-md text-[10px] font-bold border transition-all flex items-center justify-between ${
                        form[item.key]
                          ? 'bg-teal-500/15 text-teal-400 border-teal-500/30'
                          : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:border-slate-700'
                      }`}>
                      <span>{item.label}</span>
                      <span>{form[item.key] ? '[✓]' : '[○]'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#070a10] p-2.5 rounded-md border border-slate-800/80">
                <StarRating label="Convicção" value={form.conviction} onChange={(v) => updateForm('conviction', v)} />
                <StarRating label="Execução" value={form.execution} onChange={(v) => updateForm('execution', v)} />
              </div>

              <SaveButton />
            </div>
          )}

          {/* Tab: Pós-Trade */}
          {inlineTab === 'pos' && (
            <div className="space-y-3 font-mono">
              <StarRating label="Qualidade" value={form.tradeQuality} onChange={(v) => updateForm('tradeQuality', v)} />

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-bold">O que vi NA HORA</label>
                <textarea value={form.whatISawNow} onChange={(e) => updateForm('whatISawNow', e.target.value)}
                  placeholder="Tape reading, fluxo de agressão, book de ofertas…"
                  className="w-full bg-[#070a10] border border-slate-800/80 rounded-md p-2 text-xs text-slate-200 resize-none h-14 focus:outline-none focus:border-teal-500/60 font-sans" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-bold">O que faria diferente</label>
                <textarea value={form.postTradeNote} onChange={(e) => updateForm('postTradeNote', e.target.value)}
                  placeholder="Deveria ter esperado confirmação do pullback…"
                  className="w-full bg-[#070a10] border border-slate-800/80 rounded-md p-2 text-xs text-slate-200 resize-none h-14 focus:outline-none focus:border-teal-500/60 font-sans" />
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
      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 font-mono text-[10px]">
        <button onClick={handleSave} disabled={saving} type="button"
          className="px-3 py-1 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-md font-bold transition-all disabled:opacity-50 flex items-center gap-1">
          {saved ? (
            <>
              <IconCheck className="text-slate-950" />
              <span>SALVO</span>
            </>
          ) : saving ? (
            'SALVANDO…'
          ) : (
            'SALVAR NOTAS'
          )}
        </button>
      </div>
    );
  }
}

export default TradeCard;
