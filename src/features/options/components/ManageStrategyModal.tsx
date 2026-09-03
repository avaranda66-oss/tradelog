'use client';

import React, { useState, useEffect } from 'react';
import type { EnrichedOptionStrategy } from '../calculations';
import {
  previewScaleDownStrategyAction,
  scaleDownOptionStrategyAction,
  previewPartialCloseStrategyLegAction,
  partialCloseStrategyLegAction,
  getStrategyManeuverReceiptAction,
  type ManeuverPlan,
  type ManeuverHistoryDTO,
} from '../actions';
import { getBrazilTodayDate } from '../b3-calendar';
import { StrategyManeuverHistorySection } from './StrategyManeuverHistorySection';

interface ManageStrategyModalProps {
  strategy: EnrichedOptionStrategy | null;
  isOpen: boolean;
  initialMode?: 'SCALE_DOWN' | 'LEG_CLOSE' | 'HISTORY';
  initialLegId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ManageStrategyModal({
  strategy,
  isOpen,
  initialMode = 'SCALE_DOWN',
  initialLegId,
  onClose,
  onSuccess,
}: ManageStrategyModalProps) {
  // Navegação do modal
  const [activeTab, setActiveTab] = useState<'SCALE_DOWN' | 'LEG_CLOSE' | 'HISTORY'>(initialMode);

  // Parâmetros comuns
  const [executionDate, setExecutionDate] = useState<string>(getBrazilTodayDate());
  const [notes, setNotes] = useState<string>('');

  // Parâmetros de SCALE_DOWN
  const [scaleDownPct, setScaleDownPct] = useState<string>('50');
  const [scaleDownLegPrices, setScaleDownLegPrices] = useState<Record<string, { price: string; fees: string }>>({});

  // Parâmetros de LEG_CLOSE
  const [selectedLegId, setSelectedLegId] = useState<string>('');
  const [legCloseQty, setLegCloseQty] = useState<string>('');
  const [legClosePrice, setLegClosePrice] = useState<string>('');
  const [legCloseFees, setLegCloseFees] = useState<string>('0');

  // Estado de simulação e execução
  const [preview, setPreview] = useState<ManeuverPlan | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [staleAlert, setStaleAlert] = useState<boolean>(false);

  // Estado de Recibo Pós-Execução e Falha de Recibo (COMMITTED)
  const [committedManeuverId, setCommittedManeuverId] = useState<string | null>(null);
  const [receiptLoadError, setReceiptLoadError] = useState<string | null>(null);
  const [isRetryingReceipt, setIsRetryingReceipt] = useState<boolean>(false);
  const [receipt, setReceipt] = useState<ManeuverHistoryDTO | null>(null);
  const [refreshHistoryTrigger, setRefreshHistoryTrigger] = useState<number>(0);

  // Inicialização ao abrir o modal
  useEffect(() => {
    if (strategy && isOpen) {
      setActiveTab(initialMode);
      setExecutionDate(getBrazilTodayDate());
      setNotes('');
      setPreview(null);
      setErrorMessage(null);
      setStaleAlert(false);
      setCommittedManeuverId(null);
      setReceiptLoadError(null);
      setIsRetryingReceipt(false);
      setReceipt(null);

      // Preencher preços sugeridos para SCALE_DOWN
      const initialLegPrices: Record<string, { price: string; fees: string }> = {};
      for (const leg of strategy.legs) {
        initialLegPrices[leg.id] = {
          price: leg.position.currentPrice !== undefined && leg.position.currentPrice !== null
            ? leg.position.currentPrice.toString()
            : leg.position.entryPrice.toString(),
          fees: '0',
        };
      }
      setScaleDownLegPrices(initialLegPrices);

      // Preencher perna selecionada para LEG_CLOSE
      const defaultLeg = initialLegId
        ? strategy.legs.find((l) => l.id === initialLegId) || strategy.legs[0]
        : strategy.legs[0];

      if (defaultLeg) {
        setSelectedLegId(defaultLeg.id);
        const openQty = defaultLeg.openAllocatedQuantity ?? defaultLeg.allocatedQuantity;
        setLegCloseQty(openQty.toString());
        setLegClosePrice(
          defaultLeg.position.currentPrice !== undefined && defaultLeg.position.currentPrice !== null
            ? defaultLeg.position.currentPrice.toString()
            : defaultLeg.position.entryPrice.toString()
        );
        setLegCloseFees('0');
      }
    }
  }, [strategy, isOpen, initialMode, initialLegId]);

  if (!isOpen || !strategy) return null;

  const openLegs = strategy.legs.filter((l) => (l.openAllocatedQuantity ?? l.allocatedQuantity) > 0);

  // ─── Handlers de Invalidação Imediata de Preview ──────────────────
  const invalidatePreview = () => {
    if (preview) setPreview(null);
    if (errorMessage) setErrorMessage(null);
    if (staleAlert) setStaleAlert(false);
  };

  const handleTabChange = (tab: 'SCALE_DOWN' | 'LEG_CLOSE' | 'HISTORY') => {
    setActiveTab(tab);
    invalidatePreview();
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setExecutionDate(e.target.value);
    invalidatePreview();
  };

  const handleScaleDownPctChange = (val: string) => {
    setScaleDownPct(val);
    invalidatePreview();
  };

  const handleLegPriceChange = (legId: string, field: 'price' | 'fees', val: string) => {
    setScaleDownLegPrices((prev) => ({
      ...prev,
      [legId]: {
        ...prev[legId],
        [field]: val,
      },
    }));
    invalidatePreview();
  };

  const handleSelectLegChange = (legId: string) => {
    setSelectedLegId(legId);
    const leg = strategy.legs.find((l) => l.id === legId);
    if (leg) {
      const openQty = leg.openAllocatedQuantity ?? leg.allocatedQuantity;
      setLegCloseQty(openQty.toString());
      setLegClosePrice(
        leg.position.currentPrice !== undefined && leg.position.currentPrice !== null
          ? leg.position.currentPrice.toString()
          : leg.position.entryPrice.toString()
      );
    }
    invalidatePreview();
  };

  const handleLegCloseQtyChange = (val: string) => {
    setLegCloseQty(val);
    invalidatePreview();
  };

  const handleLegClosePriceChange = (val: string) => {
    setLegClosePrice(val);
    invalidatePreview();
  };

  const handleLegCloseFeesChange = (val: string) => {
    setLegCloseFees(val);
    invalidatePreview();
  };

  // ─── Simulação (Preview) ──────────────────────────────────────────
  const handleSimulate = async () => {
    setIsLoadingPreview(true);
    setErrorMessage(null);
    setStaleAlert(false);

    try {
      if (executionDate > getBrazilTodayDate()) {
        setErrorMessage('A data de execução não pode estar no futuro.');
        setIsLoadingPreview(false);
        return;
      }

      if (activeTab === 'SCALE_DOWN') {
        const pct = parseFloat(scaleDownPct.replace(',', '.'));
        if (isNaN(pct) || pct <= 0 || pct >= 100) {
          setErrorMessage('Informe uma porcentagem válida entre 1% e 99%.');
          setIsLoadingPreview(false);
          return;
        }

        const legInputs = [];
        for (const l of openLegs) {
          const input = scaleDownLegPrices[l.id];
          const rawPrice = input?.price?.trim() ?? '';
          if (rawPrice === '') {
            setErrorMessage(`Informe o preço de saída para a perna ${l.position.tickerOption}.`);
            setIsLoadingPreview(false);
            return;
          }
          const p = parseFloat(rawPrice.replace(',', '.'));
          if (isNaN(p) || p < 0) {
            setErrorMessage(`Preço inválido para a perna ${l.position.tickerOption}. O preço deve ser finito e não negativo (R$ 0,00 ou maior).`);
            setIsLoadingPreview(false);
            return;
          }

          const rawFees = input?.fees?.trim() ?? '';
          let f = 0;
          if (rawFees !== '') {
            f = parseFloat(rawFees.replace(',', '.'));
            if (isNaN(f) || f < 0) {
              setErrorMessage(`Custos inválidos para a perna ${l.position.tickerOption}.`);
              setIsLoadingPreview(false);
              return;
            }
          }
          legInputs.push({
            strategyLegId: l.id,
            price: p,
            feesReais: f,
          });
        }

        const res = await previewScaleDownStrategyAction({
          strategyId: strategy.id,
          percentageReduced: pct,
          executionDate,
          legs: legInputs,
          notes: notes.trim() || undefined,
        });

        if (res.success) {
          setPreview(res.plan);
        } else {
          setErrorMessage(res.error || 'Erro ao simular redução proporcional.');
        }
      } else if (activeTab === 'LEG_CLOSE') {
        const qty = parseInt(legCloseQty, 10);
        if (isNaN(qty) || qty <= 0) {
          setErrorMessage('Informe uma quantidade inteira positiva para encerrar.');
          setIsLoadingPreview(false);
          return;
        }

        const rawPrice = legClosePrice.trim();
        if (rawPrice === '') {
          setErrorMessage('Informe o preço de saída (R$ 0,00 ou maior).');
          setIsLoadingPreview(false);
          return;
        }
        const p = parseFloat(rawPrice.replace(',', '.'));
        if (isNaN(p) || p < 0) {
          setErrorMessage('Informe um preço de saída válido (R$ 0,00 ou maior).');
          setIsLoadingPreview(false);
          return;
        }

        const rawFees = legCloseFees.trim();
        let fees = 0;
        if (rawFees !== '') {
          const f = parseFloat(rawFees.replace(',', '.'));
          if (isNaN(f) || f < 0) {
            setErrorMessage('Custos devem ser um número finito não negativo.');
            setIsLoadingPreview(false);
            return;
          }
          fees = f;
        }

        const res = await previewPartialCloseStrategyLegAction({
          strategyId: strategy.id,
          strategyLegId: selectedLegId,
          quantity: qty,
          price: p,
          feesReais: fees,
          executionDate,
          notes: notes.trim() || undefined,
        });

        if (res.success) {
          setPreview(res.plan);
        } else {
          setErrorMessage(res.error || 'Erro ao simular encerramento de perna.');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro inesperado na simulação.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // ─── Execução Confirmada ──────────────────────────────────────────
  const handleConfirm = async () => {
    if (!preview) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setStaleAlert(false);

    try {
      if (preview.maneuverType === 'SCALE_DOWN') {
        const pct = preview.percentageReduced!;
        const legInputs = preview.executions.map((e) => ({
          strategyLegId: e.strategyLegId,
          price: e.price,
          feesReais: e.feesReais,
        }));

        const res = await scaleDownOptionStrategyAction({
          strategyId: strategy.id,
          percentageReduced: pct,
          executionDate: preview.executionDate,
          legs: legInputs,
          notes: notes.trim() || undefined,
          previewFingerprint: preview.previewFingerprint,
        });

        if (res.success && res.maneuverEventId) {
          setCommittedManeuverId(res.maneuverEventId);
          setPreview(null);
          setRefreshHistoryTrigger((prev) => prev + 1);

          const receiptRes = await getStrategyManeuverReceiptAction(res.maneuverEventId);
          if (receiptRes.success && receiptRes.receipt) {
            setReceipt(receiptRes.receipt);
          } else {
            setReceiptLoadError('Manejo executado e persistido no banco! Não foi possível carregar o recibo detalhado de imediato.');
          }
        } else {
          if (res.errorCode === 'STALE_MANEUVER_PREVIEW') {
            setStaleAlert(true);
            setPreview(null);
          } else {
            setErrorMessage(res.error || 'Erro ao executar redução proporcional.');
          }
        }
      } else if (preview.maneuverType === 'LEG_CLOSE') {
        const exec = preview.executions[0];
        const res = await partialCloseStrategyLegAction({
          strategyId: strategy.id,
          strategyLegId: exec.strategyLegId,
          quantity: exec.quantity,
          price: exec.price,
          feesReais: exec.feesReais,
          executionDate: preview.executionDate,
          notes: notes.trim() || undefined,
          previewFingerprint: preview.previewFingerprint,
        });

        if (res.success && res.maneuverEventId) {
          setCommittedManeuverId(res.maneuverEventId);
          setPreview(null);
          setRefreshHistoryTrigger((prev) => prev + 1);

          const receiptRes = await getStrategyManeuverReceiptAction(res.maneuverEventId);
          if (receiptRes.success && receiptRes.receipt) {
            setReceipt(receiptRes.receipt);
          } else {
            setReceiptLoadError('Manejo executado e persistido no banco! Não foi possível carregar o recibo detalhado de imediato.');
          }
        } else {
          if (res.errorCode === 'STALE_MANEUVER_PREVIEW') {
            setStaleAlert(true);
            setPreview(null);
          } else {
            setErrorMessage(res.error || 'Erro ao executar fechamento de perna.');
          }
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro inesperado na execução do manejo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetryReceipt = async () => {
    if (!committedManeuverId) return;
    setIsRetryingReceipt(true);
    setReceiptLoadError(null);
    try {
      const receiptRes = await getStrategyManeuverReceiptAction(committedManeuverId);
      if (receiptRes.success && receiptRes.receipt) {
        setReceipt(receiptRes.receipt);
      } else {
        setReceiptLoadError('Falha ao obter recibo. Clique novamente para tentar.');
      }
    } catch (err: any) {
      setReceiptLoadError(err.message || 'Erro ao carregar recibo.');
    } finally {
      setIsRetryingReceipt(false);
    }
  };

  const handleFinishAndClose = () => {
    onSuccess();
    onClose();
  };

  // ─── RENDER: RECIBO PÓS-EXECUÇÃO ──────────────────────────────────
  if (receipt) {
    const isProfit = receipt.netRealizedPnlReais >= 0;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="w-full max-w-2xl bg-[#0b111e] border border-emerald-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header de Sucesso */}
          <div className="p-6 bg-gradient-to-r from-emerald-950/60 to-slate-900 border-b border-emerald-500/30 text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 text-2xl mb-1">
              ✓
            </div>
            <h2 className="text-xl font-bold text-slate-100">Manejo Executado com Sucesso!</h2>
            <p className="text-xs text-slate-400">
              O evento foi registrado canonicamente no livro de execuções com garantia de não-duplicação.
            </p>
          </div>

          <div className="p-6 overflow-y-auto space-y-5">
            {/* Metadados e Totais */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] uppercase text-slate-400 block font-semibold">Tipo</span>
                <span className="text-xs font-bold text-amber-300">
                  {receipt.maneuverType === 'SCALE_DOWN' ? `SCALE_DOWN (-${receipt.percentageReduced}%)` : 'LEG_CLOSE'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] uppercase text-slate-400 block font-semibold">Data Execução</span>
                <span className="text-xs font-bold text-slate-200 font-mono">{receipt.executionDate}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] uppercase text-slate-400 block font-semibold">P&L Realizado</span>
                <span className={`text-xs font-bold font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isProfit ? '+' : ''}R$ {receipt.netRealizedPnlReais.toFixed(2)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] uppercase text-slate-400 block font-semibold">Cap. Liberado</span>
                <span className="text-xs font-bold font-mono text-emerald-400">
                  {receipt.auditCapitalReleasedReais !== null && receipt.auditCapitalReleasedReais !== undefined
                    ? `R$ ${receipt.auditCapitalReleasedReais.toFixed(2)}`
                    : 'N/A'}
                </span>
              </div>
            </div>

            {/* Proporção */}
            <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">Evolução de Proporção:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-300">{receipt.auditRatioBefore || 'N/A'}</span>
                <span>➔</span>
                <span className="font-mono text-amber-300 font-bold">{receipt.auditRatioAfter || 'N/A'}</span>
                {receipt.preservesOriginalRatio && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
                    ✓ Proporção preservada
                  </span>
                )}
              </div>
            </div>

            {/* Execuções Registradas */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                Execuções Concluídas ({receipt.executions.length})
              </span>
              <div className="rounded-xl border border-slate-800 overflow-hidden bg-[#070c16]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/60 text-slate-400 text-[10px] uppercase border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">Ativo</th>
                      <th className="py-2 px-2">Operação</th>
                      <th className="py-2 px-2 text-right">Qtd</th>
                      <th className="py-2 px-2 text-right">Preço</th>
                      <th className="py-2 px-2 text-right">Custos</th>
                      <th className="py-2 px-3 text-right">P&L Líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {receipt.executions.map((e) => (
                      <tr key={e.executionId}>
                        <td className="py-2 px-3 font-sans font-bold text-slate-200">{e.ticker}</td>
                        <td className="py-2 px-2">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px] font-sans">
                            {e.executionType}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-slate-300">{e.quantity.toLocaleString('pt-BR')}</td>
                        <td className="py-2 px-2 text-right text-slate-300">R$ {e.price.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right text-slate-400">R$ {e.feesReais.toFixed(2)}</td>
                        <td className={`py-2 px-3 text-right font-bold ${e.netRealizedPnlReais >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {e.netRealizedPnlReais >= 0 ? '+' : ''}R$ {e.netRealizedPnlReais.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer do Recibo */}
          <div className="p-4 bg-slate-900/80 border-t border-slate-800 flex justify-end">
            <button
              onClick={handleFinishAndClose}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm shadow-lg active:scale-95 transition-all"
            >
              Concluir e Atualizar Carteira
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── RENDER: FORMULÁRIO DE MANEJO & PREVIEW ───────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-[#0a0f1d] border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Principal */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-[#0e1626] to-slate-900 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-lg font-bold shadow-inner">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">{strategy.name}</h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                  {strategy.strategyType} · {strategy.book}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                  {strategy.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Manejo canônico de risco, redução proporcional ou encerramento por perna
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Abas de Navegação */}
        <div className="flex border-b border-slate-800 bg-[#080c18] px-4 pt-2 gap-2 text-xs">
          <button
            onClick={() => handleTabChange('SCALE_DOWN')}
            className={`px-4 py-2 font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'SCALE_DOWN'
                ? 'border-amber-400 text-amber-300 bg-[#0a0f1d]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>⚡</span>
            <span>Redução Proporcional (SCALE_DOWN)</span>
          </button>

          <button
            onClick={() => handleTabChange('LEG_CLOSE')}
            className={`px-4 py-2 font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'LEG_CLOSE'
                ? 'border-sky-400 text-sky-300 bg-[#0a0f1d]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>✂</span>
            <span>Fechar Perna (LEG_CLOSE)</span>
          </button>

          <button
            onClick={() => handleTabChange('HISTORY')}
            className={`px-4 py-2 font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'HISTORY'
                ? 'border-teal-400 text-teal-300 bg-[#0a0f1d]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>📜</span>
            <span>Histórico de Manejos</span>
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Alerta de Stale Preview */}
          {staleAlert && (
            <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center justify-between gap-3 animate-in shake">
              <div className="flex items-center gap-2">
                <span className="text-base">⚠️</span>
                <span>
                  <strong>Atenção:</strong> O estado da estrutura ou o mercado mudaram desde a última simulação. Uma nova simulação é necessária antes da confirmação.
                </span>
              </div>
              <button
                onClick={handleSimulate}
                className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0"
              >
                Atualizar Simulação
              </button>
            </div>
          )}

          {/* Mensagem de Erro Geral */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-center gap-2">
              <span>✕</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ─── ABA 1: SCALE_DOWN ─── */}
          {activeTab === 'SCALE_DOWN' && (
            <div className="space-y-4">
              {/* Controles de Porcentagem e Data */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#080d1a] border border-slate-800">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                    Porcentagem de Redução da Estrutura
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="99"
                      step="any"
                      value={scaleDownPct}
                      onChange={(e) => handleScaleDownPctChange(e.target.value)}
                      placeholder="Ex: 50"
                      className="w-24 px-3 py-1.5 rounded-lg bg-[#050811] border border-slate-700 text-slate-100 font-bold text-sm focus:border-amber-400 focus:outline-none"
                    />
                    <span className="text-slate-400 font-bold">%</span>

                    {/* Botões rápidos */}
                    <div className="flex items-center gap-1 ml-2">
                      {['25', '50', '75'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handleScaleDownPctChange(p)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all ${
                            scaleDownPct === p
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {p}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    A redução proporcional encerra contratos preservando o ratio canônico da estrutura.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                    Data do Pregão B3
                  </label>
                  <input
                    type="date"
                    value={executionDate}
                    onChange={handleDateChange}
                    max={getBrazilTodayDate()}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#050811] border border-slate-700 text-slate-100 font-mono text-xs focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Tabela de Pernas Abertas com Preços de Fechamento */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Pernas Abertas e Preços de Saída ({openLegs.length})
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Preços sugeridos baseados na cotação atual
                  </span>
                </div>

                <div className="rounded-xl border border-slate-800 overflow-hidden bg-[#070c16]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 text-slate-400 text-[10px] uppercase border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Perna / Ticker</th>
                        <th className="py-2 px-2 text-center">Lado</th>
                        <th className="py-2 px-2 text-right">Saldo Aberto</th>
                        <th className="py-2 px-3 text-right">Preço de Saída (R$)</th>
                        <th className="py-2 px-3 text-right">Custos / Taxas (R$)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {openLegs.map((leg) => {
                        const pos = leg.position;
                        const isShort = pos.side === 'SELL' || pos.side === 'SHORT';
                        const input = scaleDownLegPrices[leg.id] || { price: '', fees: '0' };

                        return (
                          <tr key={leg.id} className="hover:bg-slate-800/20">
                            <td className="py-2.5 px-3 font-sans">
                              <div className="font-bold text-slate-200">{pos.tickerOption}</div>
                              <div className="text-[10px] text-amber-400/80 font-mono">
                                Strike R$ {pos.strike.toFixed(2)} · {leg.economicRole}
                              </div>
                            </td>

                            <td className="py-2.5 px-2 text-center font-sans">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isShort ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300'
                                }`}
                              >
                                {isShort ? 'SHORT (Venda)' : 'LONG (Compra)'}
                              </span>
                            </td>

                            <td className="py-2.5 px-2 text-right text-slate-300">
                              {(leg.openAllocatedQuantity ?? leg.allocatedQuantity).toLocaleString('pt-BR')}
                            </td>

                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-slate-500 font-sans text-xs">R$</span>
                                <input
                                  type="text"
                                  value={input.price}
                                  onChange={(e) => handleLegPriceChange(leg.id, 'price', e.target.value)}
                                  placeholder="0.00"
                                  className="w-24 px-2 py-1 rounded bg-[#050811] border border-slate-700 text-right text-slate-100 font-bold focus:border-amber-400 focus:outline-none"
                                />
                              </div>
                            </td>

                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-slate-500 font-sans text-xs">R$</span>
                                <input
                                  type="text"
                                  value={input.fees}
                                  onChange={(e) => handleLegPriceChange(leg.id, 'fees', e.target.value)}
                                  placeholder="0.00"
                                  className="w-20 px-2 py-1 rounded bg-[#050811] border border-slate-700 text-right text-slate-300 focus:border-amber-400 focus:outline-none"
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── ABA 2: LEG_CLOSE ─── */}
          {activeTab === 'LEG_CLOSE' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-[#080d1a] border border-slate-800">
                {/* Seleção da Perna */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                    Selecione a Perna a Encerrar
                  </label>
                  <select
                    value={selectedLegId}
                    onChange={(e) => handleSelectLegChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#050811] border border-slate-700 text-slate-100 font-bold focus:border-sky-400 focus:outline-none"
                  >
                    {openLegs.map((leg) => {
                      const pos = leg.position;
                      const openQty = leg.openAllocatedQuantity ?? leg.allocatedQuantity;
                      return (
                        <option key={leg.id} value={leg.id}>
                          {pos.tickerOption} ({pos.side} · Strike R$ {pos.strike.toFixed(2)}) — Aberto: {openQty}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Data de Execução */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                    Data do Pregão B3
                  </label>
                  <input
                    type="date"
                    value={executionDate}
                    onChange={handleDateChange}
                    max={getBrazilTodayDate()}
                    className="w-full px-3 py-2 rounded-lg bg-[#050811] border border-slate-700 text-slate-100 font-mono text-xs focus:border-sky-400 focus:outline-none"
                  />
                </div>

                {/* Quantidade a Encerrar com botão MÁX */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                      Quantidade a Encerrar
                    </label>
                    {selectedLegId && (() => {
                      const leg = strategy.legs.find((l) => l.id === selectedLegId);
                      const maxQty = leg ? (leg.openAllocatedQuantity ?? leg.allocatedQuantity) : 0;
                      return (
                        <button
                          type="button"
                          onClick={() => handleLegCloseQtyChange(maxQty.toString())}
                          className="text-[10px] text-sky-400 hover:text-sky-300 font-bold"
                        >
                          Máx ({maxQty})
                        </button>
                      );
                    })()}
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={legCloseQty}
                    onChange={(e) => handleLegCloseQtyChange(e.target.value)}
                    placeholder="Quantidade"
                    className="w-full px-3 py-2 rounded-lg bg-[#050811] border border-slate-700 text-slate-100 font-bold focus:border-sky-400 focus:outline-none"
                  />
                </div>

                {/* Preço de Saída */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                    Preço de Saída (R$)
                  </label>
                  <input
                    type="text"
                    value={legClosePrice}
                    onChange={(e) => handleLegClosePriceChange(e.target.value)}
                    placeholder="Ex: 0.15"
                    className="w-full px-3 py-2 rounded-lg bg-[#050811] border border-slate-700 text-slate-100 font-bold focus:border-sky-400 focus:outline-none"
                  />
                </div>

                {/* Custos / Taxas */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                    Custos / Corretagem (R$)
                  </label>
                  <input
                    type="text"
                    value={legCloseFees}
                    onChange={(e) => handleLegCloseFeesChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg bg-[#050811] border border-slate-700 text-slate-100 focus:border-sky-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ─── ABA 3: HISTÓRICO ─── */}
          {activeTab === 'HISTORY' && (
            <StrategyManeuverHistorySection
              strategyId={strategy.id}
              refreshTrigger={refreshHistoryTrigger}
            />
          )}

          {/* Observações (Comum para SCALE_DOWN e LEG_CLOSE) */}
          {activeTab !== 'HISTORY' && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Notas / Motivo do Manejo (Opcional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  invalidatePreview();
                }}
                placeholder="Ex: Realização de lucro parcial no teste da barreira"
                className="w-full px-3 py-2 rounded-lg bg-[#080d1a] border border-slate-800 text-slate-200 text-xs focus:border-slate-600 focus:outline-none"
              />
            </div>
          )}

          {/* Botão de Disparo da Simulação */}
          {activeTab !== 'HISTORY' && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={handleSimulate}
                disabled={isLoadingPreview}
                className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-amber-500/30 flex items-center gap-2 shadow-md hover:border-amber-500/60 active:scale-95 transition-all disabled:opacity-50"
              >
                {isLoadingPreview ? (
                  <>
                    <span className="animate-spin">🔄</span>
                    <span>Calculando Plano Canônico...</span>
                  </>
                ) : (
                  <>
                    <span>🔍</span>
                    <span>{preview ? 'Recalcular Simulação' : 'Simular Manejo Institucional'}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* ─── PAINEL DE PREVIEW CANÔNICO ─── */}
          {preview && activeTab !== 'HISTORY' && (
            <div className="p-4 rounded-2xl bg-gradient-to-b from-[#0e172a] to-[#070d18] border border-amber-500/50 shadow-xl space-y-4 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-bold text-sm">📊 Simulação de Impacto Financeiro & Risco</span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold">
                    PREVIEW VALIDADE: ATIVA
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  SHA-256: {preview.previewFingerprint.slice(0, 8)}...{preview.previewFingerprint.slice(-8)}
                </div>
              </div>

              {/* Cards de Métricas do Preview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* P&L Realizado do Manejo */}
                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">P&L Realizado Líquido</span>
                  <div className={`text-base font-bold font-mono ${preview.netRealizedPnlReais >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {preview.netRealizedPnlReais >= 0 ? '+' : ''}R$ {preview.netRealizedPnlReais.toFixed(2)}
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Bruto: R$ {preview.grossRealizedPnlReais.toFixed(2)} · Custos: R$ {preview.feesReais.toFixed(2)}
                  </span>
                </div>

                {/* Capital Econômico Liberado / Requerido */}
                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">
                    {preview.capitalReleasedReais !== null && preview.capitalReleasedReais > 0
                      ? 'Capital Econômico Liberado'
                      : preview.additionalCapitalRequiredReais !== null && preview.additionalCapitalRequiredReais > 0
                        ? 'Capital Adicional Requerido'
                        : 'Variação de Capital'}
                  </span>
                  <div className={`text-base font-bold font-mono ${
                    preview.capitalReleasedReais !== null && preview.capitalReleasedReais > 0
                      ? 'text-emerald-400'
                      : preview.additionalCapitalRequiredReais !== null && preview.additionalCapitalRequiredReais > 0
                        ? 'text-amber-400'
                        : 'text-slate-300'
                  }`}>
                    {preview.capitalReleasedReais !== null && preview.capitalReleasedReais > 0
                      ? `R$ ${preview.capitalReleasedReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : preview.additionalCapitalRequiredReais !== null && preview.additionalCapitalRequiredReais > 0
                        ? `R$ ${preview.additionalCapitalRequiredReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : preview.capitalDeltaReais !== null
                          ? 'R$ 0,00'
                          : 'N/A'}
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    {preview.capitalReleasedReais !== null && preview.capitalReleasedReais > 0
                      ? 'Redução do capital de referência'
                      : preview.additionalCapitalRequiredReais !== null && preview.additionalCapitalRequiredReais > 0
                        ? 'Aumento do capital de referência'
                        : preview.capitalDeltaReais !== null
                          ? 'Capital de referência inalterado'
                          : 'Capital de referência não comparável'}
                  </span>
                </div>

                {/* Capital de Garantia Antes vs Depois */}
                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">Garantia (Antes ➔ Depois)</span>
                  <div className="text-xs font-bold font-mono text-slate-200 mt-1">
                    R$ {preview.beforeBenchmarkCapitalReais.toLocaleString('pt-BR')} ➔{' '}
                    <span className="text-amber-300">R$ {preview.afterBenchmarkCapitalReais.toLocaleString('pt-BR')}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Benchmark Capital Canônico
                  </span>
                </div>

                {/* Proporção & Ratios */}
                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">Proporção</span>
                  <div className="flex items-center gap-1 text-xs font-mono font-bold text-slate-200 mt-1">
                    <span>{preview.ratioBefore || 'N/A'}</span>
                    <span>➔</span>
                    <span className="text-amber-300">{preview.ratioAfter || 'N/A'}</span>
                  </div>
                  <div className="mt-1">
                    {preview.preservesPreManeuverRatio ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[9px] font-bold border border-emerald-500/30">
                        ✓ Proporção atual preservada
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[9px] font-bold border border-amber-500/30">
                        ⚠ Proporção alterada
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Painel de Risco Canônico (Antes ➔ Depois) */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                  Risco &amp; Payoff Canônico (Antes ➔ Depois)
                </span>
                {(preview.afterRisk.maxLossType === 'UNBOUNDED' || preview.afterRisk.riskRecognitionQuality === 'UNKNOWN' || preview.afterRisk.maxLossType === 'UNKNOWN') && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border-2 border-rose-500/50 text-rose-300 space-y-1 text-xs">
                    <div className="flex items-center gap-2 font-bold text-rose-200">
                      <span className="text-lg">🚨</span>
                      <span>RISCO RESIDUAL NÃO COMPARÁVEL — ATENÇÃO OPERACIONAL</span>
                    </div>
                    <p className="text-rose-300/90 pl-7">
                      A estrutura residual após o manejo possui perfil <strong>{preview.afterRisk.maxLossType}</strong> (reconhecimento: <strong>{preview.afterRisk.riskRecognitionQuality}</strong>).
                      {preview.afterRisk.maxLossType === 'UNBOUNDED'
                        ? ' A perda máxima potencial é ilimitada (risco descoberto).'
                        : ' O perfil de risco residual não pôde ser determinado com precisão canônica.'}
                    </p>
                    <p className="text-amber-300 font-semibold pl-7 flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>CDI / Alpha ficarão indisponíveis após a manobra.</span>
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {/* Card Antes */}
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-[9px] uppercase text-slate-500 font-bold block">Antes do Manejo</span>
                    <div className="text-xs font-mono text-slate-300 space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Risk Recognition</span>
                        <span className={`font-bold ${
                          preview.beforeRisk.riskRecognitionQuality === 'EXACT'
                            ? 'text-emerald-400'
                            : preview.beforeRisk.riskRecognitionQuality === 'APPROXIMATE'
                              ? 'text-sky-400'
                              : 'text-amber-400'
                        }`}>
                          {preview.beforeRisk.riskRecognitionQuality}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Max Loss Type</span>
                        <span className={`font-bold ${
                          preview.beforeRisk.maxLossType === 'FINITE'
                            ? 'text-emerald-400'
                            : preview.beforeRisk.maxLossType === 'UNBOUNDED'
                              ? 'text-rose-400'
                              : 'text-amber-400'
                        }`}>
                          {preview.beforeRisk.maxLossType}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Max Loss Econ.</span>
                        <span className="font-bold">
                          {preview.beforeRisk.maxLossEconomicReais !== null
                            ? `R$ ${preview.beforeRisk.maxLossEconomicReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                            : '∞'}
                        </span>
                      </div>
                      {preview.beforeRisk.riskProfile.breakEvenInferior !== null && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Break-Even Inf.</span>
                          <span>R$ {preview.beforeRisk.riskProfile.breakEvenInferior.toFixed(2)}</span>
                        </div>
                      )}
                      {preview.beforeRisk.riskProfile.breakEvenSuperior !== null && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Break-Even Sup.</span>
                          <span>R$ {preview.beforeRisk.riskProfile.breakEvenSuperior.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Depois */}
                  <div className={`p-3 rounded-xl border space-y-1 ${
                    preview.afterRisk.maxLossType === 'UNBOUNDED'
                      ? 'bg-rose-500/5 border-rose-500/40'
                      : preview.afterRisk.maxLossType === 'UNKNOWN'
                        ? 'bg-amber-500/5 border-amber-500/40'
                        : 'bg-emerald-500/5 border-emerald-500/30'
                  }`}>
                    <span className="text-[9px] uppercase text-slate-500 font-bold block">Após o Manejo</span>
                    <div className="text-xs font-mono text-slate-300 space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Risk Recognition</span>
                        <span className={`font-bold ${
                          preview.afterRisk.riskRecognitionQuality === 'EXACT'
                            ? 'text-emerald-400'
                            : preview.afterRisk.riskRecognitionQuality === 'APPROXIMATE'
                              ? 'text-sky-400'
                              : 'text-amber-400'
                        }`}>
                          {preview.afterRisk.riskRecognitionQuality}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Max Loss Type</span>
                        <span className={`font-bold ${
                          preview.afterRisk.maxLossType === 'FINITE'
                            ? 'text-emerald-400'
                            : preview.afterRisk.maxLossType === 'UNBOUNDED'
                              ? 'text-rose-400'
                              : 'text-amber-400'
                        }`}>
                          {preview.afterRisk.maxLossType}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Max Loss Econ.</span>
                        <span className="font-bold">
                          {preview.afterRisk.maxLossEconomicReais !== null
                            ? `R$ ${preview.afterRisk.maxLossEconomicReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                            : '∞'}
                        </span>
                      </div>
                      {preview.afterRisk.riskProfile.breakEvenInferior !== null && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Break-Even Inf.</span>
                          <span>R$ {preview.afterRisk.riskProfile.breakEvenInferior.toFixed(2)}</span>
                        </div>
                      )}
                      {preview.afterRisk.riskProfile.breakEvenSuperior !== null && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Break-Even Sup.</span>
                          <span>R$ {preview.afterRisk.riskProfile.breakEvenSuperior.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabela de Execuções Projetadas */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                  Execuções a serem enviadas atomicamente ({preview.executions.length})
                </span>
                <div className="rounded-xl border border-slate-800 overflow-hidden bg-[#050811]">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900/90 text-slate-400 text-[9px] uppercase border-b border-slate-800 font-sans">
                      <tr>
                        <th className="py-2 px-3">Ativo</th>
                        <th className="py-2 px-2">Tipo Execução</th>
                        <th className="py-2 px-2 text-right">Qtd Encerrada</th>
                        <th className="py-2 px-2 text-right">Preço</th>
                        <th className="py-2 px-2 text-right">Custos</th>
                        <th className="py-2 px-3 text-right">P&L Líquido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-[11px]">
                      {preview.executions.map((e) => (
                        <tr key={e.strategyLegId}>
                          <td className="py-2 px-3 font-sans font-bold text-slate-200">{e.ticker}</td>
                          <td className="py-2 px-2 font-sans">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px]">
                              {e.executionType}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right text-slate-200">{e.quantity.toLocaleString('pt-BR')}</td>
                          <td className="py-2 px-2 text-right text-slate-300">R$ {e.price.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right text-slate-400">R$ {e.feesReais.toFixed(2)}</td>
                          <td className={`py-2 px-3 text-right font-bold ${e.netRealizedPnlReais >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {e.netRealizedPnlReais >= 0 ? '+' : ''}R$ {e.netRealizedPnlReais.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Informação sobre Transição de Funding */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                <span>ℹ️</span>
                <span>
                  {preview.strategyWillClose
                    ? 'Este manejo encerra integralmente a estrutura. O segmento de funding atual será fechado e nenhum novo segmento será aberto.'
                    : `Um novo segmento de funding será criado com início em ${preview.executionDate} e capital remunerado recalculado proporcionalmente.`}
                </span>
              </div>
            </div>
          )}

          {/* ─── ESTADO COMMITTED (Pós-Execução com Recibo Pendente) ─── */}
          {committedManeuverId && !preview && activeTab !== 'HISTORY' && (
            <div className="p-4 rounded-2xl bg-gradient-to-b from-[#161f14] to-[#070d18] border border-emerald-500/50 shadow-xl space-y-4 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2 border-b border-emerald-500/30 pb-2.5">
                <span className="text-emerald-400 font-bold text-sm">✅ Manejo Persistido no Banco</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                  COMMITTED
                </span>
              </div>
              <p className="text-xs text-slate-300">
                A operação foi confirmada e gravada atomicamente com sucesso no banco de dados.
              </p>
              {receiptLoadError && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{receiptLoadError}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleRetryReceipt}
                  disabled={isRetryingReceipt}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-amber-500/30 flex items-center gap-2 disabled:opacity-50"
                >
                  {isRetryingReceipt ? (
                    <><span className="animate-spin">🔄</span><span>Carregando...</span></>
                  ) : (
                    <><span>🔄</span><span>Carregar Recibo Detalhado</span></>
                  )}
                </button>
                <span className="text-[10px] text-slate-500 font-mono">
                  Event ID: {committedManeuverId}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer com Botões de Ação */}
        <div className="p-4 bg-[#0c1322] border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={committedManeuverId ? handleFinishAndClose : onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
          >
            {committedManeuverId ? 'Fechar e Atualizar' : 'Fechar'}
          </button>

          {activeTab !== 'HISTORY' && !committedManeuverId && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!preview || isSubmitting || isLoadingPreview}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Executando Manejo no Banco...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Confirmar Manejo Institucional</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
