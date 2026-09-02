'use client';

import React, { useState } from 'react';
import { detectStrategyRiskAndPayoff, type EnrichedOptionPosition } from '../calculations';
import { groupOptionPositionsAction } from '../actions';

interface GroupPositionsModalProps {
  selectedPositions: EnrichedOptionPosition[];
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: () => void;
}

function parseNumericInput(val: string): number | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  const parsed = Number(val.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function GroupPositionsModal({
  selectedPositions,
  isOpen,
  onClose,
  onGroupCreated,
}: GroupPositionsModalProps) {
  const [strategyName, setStrategyName] = useState('');
  const [collateralMode, setCollateralMode] = useState<'IDLE_CASH' | 'REMUNERATED_100_CDI' | 'CUSTOM'>('IDLE_CASH');
  const [collateralPctCDI, setCollateralPctCDI] = useState<string>('100');
  const [fundingType, setFundingType] = useState<'FULL' | 'SPLIT_REAIS' | 'SPLIT_PCT'>('FULL');
  const [capitalRemuneratedReaisVal, setCapitalRemuneratedReaisVal] = useState<string>('');
  const [collateralCoveragePctVal, setCollateralCoveragePctVal] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || selectedPositions.length < 2) return null;

  const underlyingTicker = selectedPositions[0].tickerUnderlying;
  const defaultName = `${underlyingTicker} — Estrutura Multi-Pernas`;
  const nameToUse = strategyName.trim() || defaultName;

  // Cálculos do Preview usando o Recognizer Canônico de Risco
  let netInitialCreditDebit = 0;
  let netPnlMtm = 0;
  let shortPutUnits = 0;
  let longCallUnits = 0;

  for (const pos of selectedPositions) {
    const isShort = pos.side === 'SELL' || pos.side === 'SHORT';
    const isLong = !isShort;

    if (isShort) {
      netInitialCreditDebit += pos.entryPrice * pos.quantity;
    } else {
      netInitialCreditDebit -= pos.entryPrice * pos.quantity;
    }

    netPnlMtm += pos.metrics.pnlMtmReais;

    if (pos.optionType === 'PUT' && isShort) {
      shortPutUnits += pos.quantity;
    }
    if (pos.optionType === 'CALL' && isLong) {
      longCallUnits += pos.quantity;
    }
  }

  const isCredit = netInitialCreditDebit >= 0;

  const riskProfile = detectStrategyRiskAndPayoff({
    legs: selectedPositions.map((p) => ({
      position: p,
      allocatedQuantity: p.quantity,
      economicRole: (p.side === 'SELL' || p.side === 'SHORT') ? 'FINANCING' : 'DIRECTIONAL',
    })),
    netInitialCreditDebitReais: netInitialCreditDebit,
  });

  const totalCapitalReserved = riskProfile.capitalReservedReais;
  const maxLossEconomic = riskProfile.maxLossEconomicReais;
  const breakEvenInferior = riskProfile.breakEvenInferior;
  const breakEvenSuperior = riskProfile.breakEvenSuperior;
  const riskQuality = riskProfile.riskRecognitionQuality;

  const putToCallRatio = longCallUnits > 0 ? shortPutUnits / longCallUnits : null;
  const roicPct = totalCapitalReserved > 0 ? (netPnlMtm / totalCapitalReserved) * 100 : 0;

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let capitalRemunerated: number | null = null;
      let coveragePct: number | null = null;

      if (collateralMode !== 'IDLE_CASH') {
        if (fundingType === 'SPLIT_REAIS') {
          capitalRemunerated = parseNumericInput(capitalRemuneratedReaisVal);
        } else if (fundingType === 'SPLIT_PCT') {
          coveragePct = parseNumericInput(collateralCoveragePctVal);
        } else if (fundingType === 'FULL') {
          coveragePct = 100;
        }
      }

      const parsedPctCDI = collateralMode === 'CUSTOM'
        ? parseNumericInput(collateralPctCDI)
        : collateralMode === 'REMUNERATED_100_CDI' ? 100 : 0;

      const res = await groupOptionPositionsAction({
        name: nameToUse,
        strategyType: 'CUSTOM_MULTI_LEG',
        book: 'HYBRID',
        portfolio: selectedPositions[0].portfolio || 'Principal',
        underlyingTicker,
        collateralMode,
        collateralYieldPctCDI: parsedPctCDI,
        capitalRemuneratedReais: capitalRemunerated,
        collateralCoveragePct: coveragePct,
        legs: selectedPositions.map((p) => ({
          positionId: p.id,
          allocatedQuantity: p.quantity,
          economicRole: (p.side === 'SELL' || p.side === 'SHORT') ? 'FINANCING' : 'DIRECTIONAL',
        })),
      });

      if (res.success) {
        onGroupCreated();
        onClose();
      } else {
        alert(res.error || 'Erro ao agrupar posições');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#090d16] border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl font-mono text-xs animate-in zoom-in-95">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#0b101c]">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-sm">🔗</span>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                AGRUPAR EM ESTRUTURA MULTI-PERNAS
              </h2>
            </div>
            <p className="text-[11px] text-slate-400">
              Unifica {selectedPositions.length} operações em uma tese econômica combinada.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleCreateGroup} className="p-5 space-y-4">
          {/* Nome da Estrutura */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300">
              Nome da Estrutura:
            </label>
            <input
              type="text"
              value={strategyName}
              onChange={(e) => setStrategyName(e.target.value)}
              placeholder={defaultName}
              className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3.5 py-2 text-slate-100 focus:outline-none text-xs font-bold"
            />
          </div>

          {/* Pernas Selecionadas */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Pernas Incluídas ({selectedPositions.length}):
            </label>
            <div className="space-y-1.5">
              {selectedPositions.map((pos) => {
                const isShort = pos.side === 'SELL' || pos.side === 'SHORT';
                return (
                  <div
                    key={pos.id}
                    className="p-2.5 rounded-xl bg-[#0b121f] border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          pos.optionType === 'PUT' ? 'bg-rose-400' : 'bg-emerald-400'
                        }`}
                      />
                      <span className="font-bold text-slate-200">{pos.tickerOption}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                          isShort
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-sky-500/15 text-sky-300'
                        }`}
                      >
                        {isShort ? 'VENDA' : 'COMPRA'} {pos.optionType}
                      </span>
                    </div>
                    <div className="text-right text-[11px]">
                      <span className="text-slate-300 font-bold">{pos.quantity}x</span>
                      <span className="text-slate-500 ml-2">@ R$ {pos.entryPrice.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Configuração de Funding & Remuneração de Garantia (Double Yield) */}
          <div className="bg-[#0b121f] border border-cyan-500/30 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
              <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
                💰 REMUNERAÇÃO DE CAIXA / GARANTIA (DOUBLE YIELD)
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-bold">
                FUNDING ENGINE
              </span>
            </div>

            {/* Modo de Remuneração */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400">Remuneração do Caixa / Colateral:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCollateralMode('IDLE_CASH')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    collateralMode === 'IDLE_CASH'
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Não Remunerado
                </button>
                <button
                  type="button"
                  onClick={() => setCollateralMode('REMUNERATED_100_CDI')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    collateralMode === 'REMUNERATED_100_CDI'
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  100% CDI
                </button>
                <button
                  type="button"
                  onClick={() => setCollateralMode('CUSTOM')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    collateralMode === 'CUSTOM'
                      ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Custom % CDI
                </button>
              </div>
            </div>

            {collateralMode === 'CUSTOM' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400">Taxa Customizada (% do CDI):</label>
                <input
                  type="text"
                  value={collateralPctCDI}
                  onChange={(e) => setCollateralPctCDI(e.target.value)}
                  placeholder="Ex: 110"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 text-xs"
                />
              </div>
            )}

            {/* Split de Capital Remunerado */}
            {collateralMode !== 'IDLE_CASH' && (
              <div className="space-y-2 pt-1 border-t border-slate-800/80">
                <label className="text-[10px] font-bold text-slate-400">Capital Efetivamente Remunerado:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFundingType('FULL')}
                    className={`p-1.5 rounded-lg border text-center transition-all ${
                      fundingType === 'FULL'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    100% Garantia
                  </button>
                  <button
                    type="button"
                    onClick={() => setFundingType('SPLIT_PCT')}
                    className={`p-1.5 rounded-lg border text-center transition-all ${
                      fundingType === 'SPLIT_PCT'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    % Cobertura
                  </button>
                  <button
                    type="button"
                    onClick={() => setFundingType('SPLIT_REAIS')}
                    className={`p-1.5 rounded-lg border text-center transition-all ${
                      fundingType === 'SPLIT_REAIS'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Valor Fixo R$
                  </button>
                </div>

                {fundingType === 'SPLIT_PCT' && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400">Cobertura da Garantia (%):</label>
                    <input
                      type="text"
                      value={collateralCoveragePctVal}
                      onChange={(e) => setCollateralCoveragePctVal(e.target.value)}
                      placeholder="Ex: 50 (para 50% do capital)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 text-xs"
                    />
                  </div>
                )}

                {fundingType === 'SPLIT_REAIS' && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400">Capital em R$ Remunerado a CDI:</label>
                    <input
                      type="text"
                      value={capitalRemuneratedReaisVal}
                      onChange={(e) => setCapitalRemuneratedReaisVal(e.target.value)}
                      placeholder={`Máx: R$ ${totalCapitalReserved.toFixed(2)}`}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 text-xs"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card de Preview Consolidado */}
          <div className="bg-[#12130e] border border-amber-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                DIAGNÓSTICO DA ESTRUTURA DETECTADA
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                CUSTOM MULTI-LEG · LIVRO HYBRID
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2 rounded-lg bg-slate-900/60">
                <div className="text-[10px] text-slate-400">Fluxo Líquido Inicial:</div>
                <div className="font-bold text-emerald-400">
                  {isCredit ? '+' : '-'}R$ {Math.abs(netInitialCreditDebit).toFixed(2)}{' '}
                  <span className="text-[10px] font-normal text-slate-400">
                    ({isCredit ? 'Crédito Inicial' : 'Débito Pago'})
                  </span>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-slate-900/60">
                <div className="text-[10px] text-slate-400">P&L MTM Consolidado:</div>
                <div className="font-bold text-teal-300">
                  +R$ {netPnlMtm.toFixed(2)}{' '}
                  <span className="text-[10px] font-normal text-teal-400/80">
                    (+{roicPct.toFixed(2)}% ROIC)
                  </span>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-slate-900/60">
                <div className="text-[10px] text-slate-400">Capital Reservado (Cash-Secured):</div>
                <div className="font-bold text-slate-100">
                  R$ {totalCapitalReserved.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="p-2 rounded-lg bg-slate-900/60">
                <div className="text-[10px] text-slate-400">Perda Máxima Econômica:</div>
                <div className="font-bold text-rose-300">
                  {maxLossEconomic !== null
                    ? `R$ ${maxLossEconomic.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : (riskProfile.maxLossType === 'UNBOUNDED' ? 'ILIMITADA (Venda Descoberta)' : 'Não Determinada')}
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-300 space-y-1 border-t border-amber-500/20 pt-2">
              {breakEvenInferior !== null && (
                <p>
                  • <strong>Break-Even Inferior no Vencimento:</strong> R$ {breakEvenInferior.toFixed(2)}
                </p>
              )}
              {breakEvenSuperior !== null && (
                <p>
                  • <strong>Break-Even Superior no Vencimento:</strong> R$ {breakEvenSuperior.toFixed(2)}
                </p>
              )}
              {putToCallRatio !== null && (
                <p>
                  • <strong>Assimetria de Risco ({putToCallRatio.toFixed(1)}:1):</strong> Downside = {shortPutUnits} ações vs Upside = {longCallUnits} ações ({putToCallRatio.toFixed(1)}x mais exposição na queda).
                </p>
              )}
            </div>
          </div>

          {/* Botões */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="py-2.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all text-xs shadow-lg active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? 'Agrupando...' : '🔗 Criar Estrutura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
