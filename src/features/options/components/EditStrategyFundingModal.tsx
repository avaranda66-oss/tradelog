'use client';

import React, { useState, useEffect } from 'react';
import type { EnrichedOptionStrategy } from '../calculations';
import type { CollateralMode } from '../calculations';
import { updateOptionStrategyFundingAction } from '../actions';

interface EditStrategyFundingModalProps {
  strategy: EnrichedOptionStrategy | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function EditStrategyFundingModal({
  strategy,
  isOpen,
  onClose,
  onUpdated,
}: EditStrategyFundingModalProps) {
  const [collateralMode, setCollateralMode] = useState<CollateralMode>('IDLE_CASH');
  const [fundingSplitType, setFundingSplitType] = useState<'FULL' | 'SPLIT_PCT' | 'SPLIT_REAIS'>('FULL');
  const [coveragePctVal, setCoveragePctVal] = useState<string>('100');
  const [reaisVal, setReaisVal] = useState<string>('');
  const [customPctCdiVal, setCustomPctCdiVal] = useState<string>('100');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Preenche o modal ao abrir com os valores persistidos da estratégia
  useEffect(() => {
    if (strategy) {
      const mode = strategy.collateralMode || 'IDLE_CASH';
      setCollateralMode(mode);

      if (strategy.capitalRemuneratedReais !== null && strategy.capitalRemuneratedReais !== undefined && strategy.collateralCoveragePct === null) {
        setFundingSplitType('SPLIT_REAIS');
        setReaisVal(strategy.capitalRemuneratedReais.toString());
        setCoveragePctVal('');
      } else if (strategy.collateralCoveragePct !== null && strategy.collateralCoveragePct !== undefined && strategy.collateralCoveragePct < 100) {
        setFundingSplitType('SPLIT_PCT');
        setCoveragePctVal(strategy.collateralCoveragePct.toString());
        setReaisVal('');
      } else {
        setFundingSplitType('FULL');
        setCoveragePctVal('100');
        setReaisVal('');
      }

      if (strategy.collateralYieldPctCDI !== null && strategy.collateralYieldPctCDI !== undefined) {
        setCustomPctCdiVal(strategy.collateralYieldPctCDI.toString());
      } else {
        setCustomPctCdiVal('100');
      }

      setErrorMessage(null);
    }
  }, [strategy, isOpen]);

  if (!isOpen || !strategy) return null;

  const benchmarkCapital = strategy.economicPerformance.benchmarkCapitalReais;

  // Helper para parsing seguro de números preservando zero
  const parseNumberOrNull = (val: string): number | null => {
    const trimmed = val.trim().replace(',', '.');
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return isNaN(n) ? null : n;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let finalCoveragePct: number | null = null;
      let finalReais: number | null = null;
      let finalPctCdi: number | null = null;

      if (collateralMode === 'IDLE_CASH') {
        finalCoveragePct = 0;
        finalReais = 0;
        finalPctCdi = 0;
      } else {
        if (fundingSplitType === 'FULL') {
          finalCoveragePct = 100;
          finalReais = null;
        } else if (fundingSplitType === 'SPLIT_PCT') {
          if (coveragePctVal.trim() === '') {
            setErrorMessage('Informe a cobertura da garantia (0% a 100%).');
            setIsSubmitting(false);
            return;
          }
          finalCoveragePct = parseNumberOrNull(coveragePctVal);
          if (finalCoveragePct === null || finalCoveragePct < 0 || finalCoveragePct > 100) {
            setErrorMessage('Cobertura de garantia inválida (deve estar entre 0% e 100%).');
            setIsSubmitting(false);
            return;
          }
          finalReais = null;
        } else if (fundingSplitType === 'SPLIT_REAIS') {
          if (reaisVal.trim() === '') {
            setErrorMessage('Informe o valor do capital remunerado em R$.');
            setIsSubmitting(false);
            return;
          }
          finalReais = parseNumberOrNull(reaisVal);
          if (finalReais === null || finalReais < 0 || finalReais > benchmarkCapital + 0.01) {
            setErrorMessage(`Capital remunerado inválido (deve ser entre R$ 0,00 e R$ ${benchmarkCapital.toFixed(2)}).`);
            setIsSubmitting(false);
            return;
          }
          finalCoveragePct = null;
        }

        if (collateralMode === 'CUSTOM') {
          if (customPctCdiVal.trim() === '') {
            setErrorMessage('Informe o percentual do CDI para o modo customizado.');
            setIsSubmitting(false);
            return;
          }
          finalPctCdi = parseNumberOrNull(customPctCdiVal);
          if (finalPctCdi === null || finalPctCdi < 0) {
            setErrorMessage('Percentual do CDI inválido (deve ser maior ou igual a 0%).');
            setIsSubmitting(false);
            return;
          }
        } else {
          finalPctCdi = 100;
        }
      }

      const res = await updateOptionStrategyFundingAction({
        strategyId: strategy.id,
        collateralMode,
        collateralCoveragePct: finalCoveragePct,
        capitalRemuneratedReais: finalReais,
        collateralYieldPctCDI: finalPctCdi,
      });

      if (res.success) {
        onUpdated();
        onClose();
      } else {
        setErrorMessage(res.error || 'Erro ao atualizar funding da estratégia.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro inesperado ao salvar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0b101c] border border-amber-500/40 rounded-2xl w-full max-w-lg shadow-2xl p-6 font-mono text-xs space-y-5 animate-in zoom-in-95">
        {/* Header do Modal */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-amber-300 flex items-center gap-2">
              <span>⚙️</span>
              <span>CONFIGURAR REMUNERAÇÃO DE GARANTIA</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Estrutura: <strong className="text-slate-200">{strategy.name}</strong> ({strategy.strategyType})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-base"
          >
            ✕
          </button>
        </div>

        {/* Quadro Informativo de Capital de Referência */}
        <div className="p-3 rounded-xl bg-[#070b14] border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-bold">CAPITAL DE REFERÊNCIA DO BENCHMARK</span>
            <div className="text-sm font-bold text-slate-200 mt-0.5">
              R$ {benchmarkCapital.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-1 rounded">
            Base econômica da estratégia
          </span>
        </div>

        {/* Formulário de Configuração */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Seleção do Modo de Colateral */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-300">
              Modo de Remuneração do Colateral:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCollateralMode('REMUNERATED_100_CDI')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  collateralMode === 'REMUNERATED_100_CDI'
                    ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 font-bold shadow'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs">100% CDI</div>
                <div className="text-[9px] text-slate-500 mt-0.5">Remuneração integral</div>
              </button>

              <button
                type="button"
                onClick={() => setCollateralMode('IDLE_CASH')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  collateralMode === 'IDLE_CASH'
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold shadow'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs">Caixa Parado</div>
                <div className="text-[9px] text-slate-500 mt-0.5">0% de remuneração</div>
              </button>

              <button
                type="button"
                onClick={() => setCollateralMode('CUSTOM')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  collateralMode === 'CUSTOM'
                    ? 'bg-purple-500/20 border-purple-500/60 text-purple-300 font-bold shadow'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs">Customizado</div>
                <div className="text-[9px] text-slate-500 mt-0.5">Taxa / split próprio</div>
              </button>
            </div>
          </div>

          {/* 2. Campo de % do CDI se CUSTOM */}
          {collateralMode === 'CUSTOM' && (
            <div className="p-3 bg-[#0f0e1c] border border-purple-500/30 rounded-xl space-y-1.5 animate-in fade-in">
              <label className="text-[11px] font-bold text-purple-300">
                Percentual do CDI da Garantia (%):
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={customPctCdiVal}
                onChange={(e) => setCustomPctCdiVal(e.target.value)}
                placeholder="Ex: 103.9 ou 110"
                className="w-full bg-[#070a12] border border-purple-500/40 rounded-lg px-3 py-1.5 text-purple-200 text-xs focus:outline-none focus:border-purple-400"
              />
              <p className="text-[10px] text-slate-500">
                A B3 calcula o fator diário indexado oficial como (1 + TDI × p).
              </p>
            </div>
          )}

          {/* 3. Seleção de Split de Capital (Exclusivo: Percentual OU Valor em R$) */}
          {collateralMode !== 'IDLE_CASH' && (
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <label className="text-[11px] font-bold text-slate-300">
                Base de Alocação da Garantia Remunerada:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFundingSplitType('FULL');
                    setCoveragePctVal('100');
                    setReaisVal('');
                  }}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    fundingSplitType === 'FULL'
                      ? 'bg-slate-700 border-slate-500 text-slate-100 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  100% Garantia
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFundingSplitType('SPLIT_PCT');
                    if (!coveragePctVal) setCoveragePctVal('50');
                    setReaisVal('');
                  }}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    fundingSplitType === 'SPLIT_PCT'
                      ? 'bg-slate-700 border-slate-500 text-slate-100 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  Por Cobertura (%)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFundingSplitType('SPLIT_REAIS');
                    if (!reaisVal) setReaisVal((benchmarkCapital / 2).toFixed(2));
                    setCoveragePctVal('');
                  }}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    fundingSplitType === 'SPLIT_REAIS'
                      ? 'bg-slate-700 border-slate-500 text-slate-100 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  Valor em R$
                </button>
              </div>

              {fundingSplitType === 'SPLIT_PCT' && (
                <div className="space-y-1 pt-1">
                  <label className="text-[10px] text-slate-400">Percentual de Cobertura (0% a 100%):</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max="100"
                    value={coveragePctVal}
                    onChange={(e) => setCoveragePctVal(e.target.value)}
                    className="w-full bg-[#070a12] border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-amber-400"
                    placeholder="Ex: 50 ou 0"
                  />
                </div>
              )}

              {fundingSplitType === 'SPLIT_REAIS' && (
                <div className="space-y-1 pt-1">
                  <label className="text-[10px] text-slate-400">
                    Capital Remunerado em R$ (Máximo R$ {benchmarkCapital.toFixed(2)}):
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max={benchmarkCapital}
                    value={reaisVal}
                    onChange={(e) => setReaisVal(e.target.value)}
                    className="w-full bg-[#070a12] border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-amber-400"
                    placeholder={`Ex: ${(benchmarkCapital / 2).toFixed(2)}`}
                  />
                </div>
              )}
            </div>
          )}

          {/* Mensagem de Erro do Servidor */}
          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-600/50 text-rose-300 text-xs">
              ⚠️ {errorMessage}
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>💾</span>
              <span>{isSubmitting ? 'Salvando...' : 'Salvar Remuneração'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
