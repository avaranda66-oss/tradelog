'use client';

import { useState, useEffect } from 'react';
import type { Trade, TradeImage } from '@/lib/db/schema';
import { updateTradeNotes, deleteTrade } from '@/features/trades/actions';
import { getTradeImages } from '@/features/images/actions';
import { ImageDropzone } from '@/features/images/components/ImageDropzone';
import { IconChart, IconTarget, IconScale, IconCamera, IconMic, IconCheck } from '@/components/ui/icons';

const EMOTIONS_PRE = [
  { value: 'confiante', label: 'CONFIANTE' },
  { value: 'neutro', label: 'NEUTRO' },
  { value: 'ansioso', label: 'ANSIOSO' },
  { value: 'fomo', label: 'FOMO' },
  { value: 'revenge', label: 'REVENGE' },
  { value: 'medo', label: 'MEDO' },
  { value: 'euforia', label: 'EUFORIA' },
];

const EMOTIONS_POST = [
  { value: 'calmo', label: 'CALMO' },
  { value: 'satisfeito', label: 'SATISFEITO' },
  { value: 'neutro', label: 'NEUTRO' },
  { value: 'frustrado', label: 'FRUSTRADO' },
  { value: 'aliviado', label: 'ALIVIADO' },
  { value: 'arrependido', label: 'ARREPENDIDO' },
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

  const [form, setForm] = useState({
    conviction: trade?.conviction ?? null as number | null,
    execution: trade?.execution ?? null as number | null,
    whatISawNow: trade?.whatISawNow || '',
    retrospective: trade?.retrospective || '',
    strategy: trade?.strategy || '',
    emotionalPre: trade?.emotionalPre || '',
    entryType: trade?.entryType || '',
    preTradeNote: trade?.preTradeNote || '',
    marketRegime: trade?.marketRegime || '',
    dayPhase: trade?.dayPhase || '',
    stopType: trade?.stopType || '',
    didPartial: trade?.didPartial ?? false,
    movedStop: trade?.movedStop ?? false,
    reducedSize: trade?.reducedSize ?? false,
    exitedEarly: trade?.exitedEarly ?? false,
    duringTradeNote: trade?.duringTradeNote || '',
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
  const sideColor = trade.side === 'C' ? 'bg-teal-500/10 text-teal-400 border-teal-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30';
  const resultColor = isPositive ? 'text-teal-400' : isNegative ? 'text-rose-400' : 'text-slate-400';

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

  function PillSelector({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
    return (
      <div className="flex flex-wrap gap-1 font-mono">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(value === opt ? '' : opt)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
              value === opt
                ? 'bg-teal-500/15 text-teal-400 border-teal-500/30'
                : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:border-slate-700 hover:text-slate-400'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }

  function StarRating({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) {
    return (
      <div className="bg-[#070a10] p-2.5 rounded-md border border-slate-800/80 space-y-1 font-mono">
        <span className="text-[10px] text-slate-400 font-bold uppercase block">{label}</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              className={`text-sm transition-all ${(value || 0) >= star ? 'text-amber-400 font-bold' : 'text-slate-700 hover:text-slate-500'}`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'resumo', label: 'RESUMO' },
    { id: 'pre', label: 'PRÉ-TRADE' },
    { id: 'durante', label: 'DURANTE' },
    { id: 'pos', label: 'PÓS-TRADE' },
    { id: 'screenshots', label: `PRINTS (${images.length})` },
    { id: 'audio', label: 'ÁUDIO' },
  ];

  function SaveButton() {
    return (
      <div className="flex items-center gap-3 pt-2 font-mono">
        <button
          onClick={handleSave}
          disabled={saving}
          type="button"
          className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-md font-bold text-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          {saved ? (
            <>
              <IconCheck className="text-slate-950" />
              <span>NOTAS SALVAS</span>
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 font-mono">
      <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in">
        {/* Header Bar */}
        <div className="p-3.5 bg-[#070a10] border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onClose} type="button" className="text-slate-400 hover:text-slate-200 text-xs font-mono flex items-center gap-1">
              ‹ VOLTAR
            </button>
            <div className="h-3.5 w-px bg-slate-800" />
            <span className="text-xs font-bold text-slate-100">TRADE #{trade.tradeNumber}</span>
            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${sideColor}`}>
              {trade.side === 'C' ? 'BUY' : 'SELL'} {trade.instrument}
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums hidden sm:inline">{trade.openTime} → {trade.closeTime}</span>
          </div>

          <div className="flex items-center gap-4 tabular-nums">
            <div className="text-right">
              <span className={`text-xs font-bold block ${resultColor}`}>
                {(trade.points || 0) > 0 ? '+' : ''}{trade.points} pts
              </span>
              <span className={`text-[10px] font-bold block ${resultColor}`}>
                R$ {(trade.reais || 0) > 0 ? '+' : ''}{trade.reais?.toFixed(2)}
              </span>
            </div>

            {confirmDelete ? (
              <div className="flex items-center gap-1 text-[10px]">
                <button onClick={handleDeleteTrade} disabled={deleting} type="button"
                  className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold transition-all">
                  {deleting ? '…' : 'CONFIRMAR'}
                </button>
                <button onClick={() => setConfirmDelete(false)} type="button" className="px-1 text-slate-400 hover:text-slate-200 text-xs">✕</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} title="Deletar" type="button"
                className="px-2 py-0.5 text-slate-500 hover:text-rose-400 font-mono text-[10px]">
                DEL
              </button>
            )}

            <button onClick={onClose} type="button" className="text-slate-500 hover:text-slate-200 text-sm px-1">✕</button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800/80 bg-[#070a10] px-3 gap-0.5 text-xs overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
              className={`px-3 py-2.5 font-mono text-[10px] font-bold transition-all border-b-2 -mb-px whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-teal-400 text-teal-400 bg-teal-500/10'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">

          {/* ABA RESUMO */}
          {activeTab === 'resumo' && (
            <div className="space-y-4 font-mono tabular-nums">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-[#070a10] border border-slate-800/80 rounded-md p-3 space-y-1.5">
                  <span className="text-[9px] text-slate-500 block uppercase font-bold">PREÇO ENTRADA</span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-slate-400">Preço</span>
                    <span className="text-xs font-bold text-slate-200">{trade.entryPrice.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-slate-400">Contratos</span>
                    <span className="text-xs text-slate-200">{trade.contracts}</span>
                  </div>
                </div>

                <div className="bg-[#070a10] border border-slate-800/80 rounded-md p-3 space-y-1.5">
                  <span className="text-[9px] text-slate-500 block uppercase font-bold">PREÇO SAÍDA</span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-slate-400">Preço</span>
                    <span className="text-xs font-bold text-slate-200">{trade.exitPrice.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-slate-400">Duração</span>
                    <span className="text-xs text-slate-200">{trade.duration || '—'}</span>
                  </div>
                </div>

                <div className="bg-[#070a10] border border-slate-800/80 rounded-md p-3 space-y-1.5">
                  <span className="text-[9px] text-slate-500 block uppercase font-bold">RESULTADO</span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-slate-400">Pontos</span>
                    <span className={`text-xs font-bold ${resultColor}`}>
                      {(trade.points || 0) > 0 ? '+' : ''}{trade.points} pts
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-slate-400">Financeiro</span>
                    <span className={`text-xs font-bold ${resultColor}`}>
                      R$ {(trade.reais || 0) > 0 ? '+' : ''}{trade.reais?.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Badges MEP/MEN/Drawdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-[#070a10] border border-slate-800/80 rounded-md p-2 text-center">
                  <span className="text-[9px] text-slate-500 block uppercase">DURAÇÃO</span>
                  <span className="text-xs font-bold text-slate-300">{trade.duration || '—'}</span>
                </div>
                <div className="bg-[#070a10] border border-slate-800/80 rounded-md p-2 text-center">
                  <span className="text-[9px] text-slate-500 block uppercase">MEP (MÁX. FAVORÁVEL)</span>
                  <span className="text-xs font-bold text-teal-400">+{trade.mep || 0} pts</span>
                </div>
                <div className="bg-[#070a10] border border-slate-800/80 rounded-md p-2 text-center">
                  <span className="text-[9px] text-slate-500 block uppercase">MEN (MÁX. ADVERSO)</span>
                  <span className="text-xs font-bold text-rose-400">{trade.men || 0} pts</span>
                </div>
                <div className="bg-[#070a10] border border-slate-800/80 rounded-md p-2 text-center">
                  <span className="text-[9px] text-slate-500 block uppercase">DRAWDOWN</span>
                  <span className="text-xs font-bold text-slate-400">{trade.drawdown || 0} pts</span>
                </div>
              </div>

              <ImageDropzone tradeId={trade.id} date={date} images={images} onUploaded={() => getTradeImages(trade.id).then(setImages)} />
            </div>
          )}

          {/* ABA PRÉ-TRADE */}
          {activeTab === 'pre' && (
            <div className="space-y-4 font-mono">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Estratégia / Setup</label>
                <PillSelector options={STRATEGIES} value={form.strategy} onChange={(v) => updateForm('strategy', v)} />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Estado Emocional Pré-Trade</label>
                <div className="flex flex-wrap gap-1 font-mono">
                  {EMOTIONS_PRE.map(emo => (
                    <button
                      key={emo.value}
                      type="button"
                      onClick={() => updateForm('emotionalPre', form.emotionalPre === emo.value ? '' : emo.value)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                        form.emotionalPre === emo.value
                          ? 'bg-teal-500/15 text-teal-400 border-teal-500/30'
                          : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      {emo.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Tipo de Entrada</label>
                <PillSelector options={ENTRY_TYPES} value={form.entryType} onChange={(v) => updateForm('entryType', v)} />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Tese do Trade (Antes de entrar)</label>
                <textarea
                  value={form.preTradeNote}
                  onChange={(e) => updateForm('preTradeNote', e.target.value)}
                  placeholder="Tape reading, fluxo institucional, nível GEX…"
                  className="w-full h-20 bg-[#070a10] border border-slate-800/80 rounded-md p-2.5 text-xs text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-teal-500/60 font-sans"
                />
              </div>

              <SaveButton />
            </div>
          )}

          {/* ABA DURANTE */}
          {activeTab === 'durante' && (
            <div className="space-y-4 font-mono">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Regime de Mercado</label>
                  <PillSelector options={MARKET_REGIMES} value={form.marketRegime} onChange={(v) => updateForm('marketRegime', v)} />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Fase do Pregão</label>
                  <PillSelector options={DAY_PHASES} value={form.dayPhase} onChange={(v) => updateForm('dayPhase', v)} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Tipo de Stop</label>
                <PillSelector options={STOP_TYPES} value={form.stopType} onChange={(v) => updateForm('stopType', v)} />
              </div>

              {/* Gestão da Operação */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Gestão da Operação</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[10px]">
                  {[
                    { key: 'didPartial' as const, label: 'PARCIAL' },
                    { key: 'movedStop' as const, label: 'MOVEU STOP' },
                    { key: 'reducedSize' as const, label: 'REDUZIU MÃO' },
                    { key: 'exitedEarly' as const, label: 'SAIU CEDO' },
                  ].map(item => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => updateForm(item.key, !form[item.key])}
                      className={`px-2 py-1.5 rounded-md font-bold border transition-all flex items-center justify-between ${
                        form[item.key]
                          ? 'bg-teal-500/15 text-teal-400 border-teal-500/30'
                          : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <span>{item.label}</span>
                      <span>{form[item.key] ? '[✓]' : '[○]'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <StarRating label="Convicção (1-5 ★)" value={form.conviction} onChange={(v) => updateForm('conviction', v)} />
                <StarRating label="Execução (1-5 ★)" value={form.execution} onChange={(v) => updateForm('execution', v)} />
              </div>

              <SaveButton />
            </div>
          )}

          {/* ABA PÓS-TRADE */}
          {activeTab === 'pos' && (
            <div className="space-y-4 font-mono">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Estado Emocional Pós-Trade</label>
                <div className="flex flex-wrap gap-1 font-mono">
                  {EMOTIONS_POST.map(emo => (
                    <button
                      key={emo.value}
                      type="button"
                      onClick={() => updateForm('emotionalPost', form.emotionalPost === emo.value ? '' : emo.value)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                        form.emotionalPost === emo.value
                          ? 'bg-teal-500/15 text-teal-400 border-teal-500/30'
                          : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      {emo.label}
                    </button>
                  ))}
                </div>
              </div>

              <StarRating label="Qualidade do Trade (1-5 ★)" value={form.tradeQuality} onChange={(v) => updateForm('tradeQuality', v)} />

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">O que vi NA HORA</label>
                <textarea
                  value={form.whatISawNow}
                  onChange={(e) => updateForm('whatISawNow', e.target.value)}
                  placeholder="Tape reading, fluxo, book de ofertas…"
                  className="w-full h-16 bg-[#070a10] border border-slate-800/80 rounded-md p-2 text-xs text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-teal-500/60 font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">O que faria diferente</label>
                <textarea
                  value={form.postTradeNote}
                  onChange={(e) => updateForm('postTradeNote', e.target.value)}
                  placeholder="Deveria ter esperado confirmação…"
                  className="w-full h-16 bg-[#070a10] border border-slate-800/80 rounded-md p-2 text-xs text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-teal-500/60 font-sans"
                />
              </div>

              <SaveButton />
            </div>
          )}

          {/* ABA SCREENSHOTS */}
          {activeTab === 'screenshots' && (
            <ImageDropzone tradeId={trade.id} date={date} images={images} onUploaded={() => getTradeImages(trade.id).then(setImages)} />
          )}

          {/* ABA ÁUDIO */}
          {activeTab === 'audio' && (
            <div className="space-y-3 font-mono">
              <h4 className="text-xs font-bold text-slate-300 uppercase">NARRAÇÕES & TRANSCRIÇÕES DO TRADE</h4>
              <div className="bg-[#070a10] border border-slate-800/80 rounded-md p-3">
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  Áudios de voz gravados durante o pregão são associados ao horário desta operação para análise automatizada de contexto.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default TradeModalV2;
