'use client';

import React, { useState } from 'react';
import type { EnrichedOptionPosition, EnrichedOptionStrategy } from '../calculations';
import { updateOptionMarketPrice, closeOptionPosition, deleteOptionPosition, ungroupOptionStrategyAction } from '../actions';
import { StrategyEconomicStorytellingCard } from './StrategyEconomicStorytellingCard';

interface OptionsPositionsTableProps {
  positions: (EnrichedOptionPosition & { allocatedQuantity: number; unallocatedQuantity: number; strategyId?: string })[];
  strategies: EnrichedOptionStrategy[];
  isNetView: boolean;
  onOpenRollModal: (position: EnrichedOptionPosition) => void;
  onOpenEditModal: (position: EnrichedOptionPosition) => void;
  onOpenDetailDrawer: (position: EnrichedOptionPosition) => void;
  onOpenGroupModal: (selectedPositions: EnrichedOptionPosition[]) => void;
  onOpenFundingModal?: (strategy: EnrichedOptionStrategy) => void;
  onRefresh: () => void;
}

export function OptionsPositionsTable({
  positions,
  strategies,
  isNetView,
  onOpenRollModal,
  onOpenEditModal,
  onOpenDetailDrawer,
  onOpenGroupModal,
  onOpenFundingModal,
  onRefresh,
}: OptionsPositionsTableProps) {
  const [viewMode, setViewMode] = useState<'STRATEGIES' | 'LEGS'>('STRATEGIES');
  const [preset, setPreset] = useState<'OPERACIONAL' | 'RENDA_CDI' | 'RISCO_GREGAS'>('OPERACIONAL');
  const [filterType, setFilterType] = useState<'ALL' | 'SELL' | 'BUY'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>('OPEN');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedStrategyIds, setExpandedStrategyIds] = useState<Set<string>>(new Set((strategies || []).map((s) => s.id)));
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editPriceVal, setEditPriceVal] = useState('');
  const [editSpotVal, setEditSpotVal] = useState('');
  const [isUngrouping, setIsUngrouping] = useState<string | null>(null);

  const toggleSelectPosition = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandStrategy = (id: string) => {
    setExpandedStrategyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleUngroup = async (strategyId: string) => {
    if (!window.confirm('Deseja realmente desagrupar esta estrutura? As operações voltarão a ser visualizadas individualmente sem alterar históricos ou preços.')) return;
    setIsUngrouping(strategyId);
    try {
      const res = await ungroupOptionStrategyAction(strategyId);
      if (res.success) {
        onRefresh();
      } else {
        alert(res.error || 'Erro ao desagrupar');
      }
    } finally {
      setIsUngrouping(null);
    }
  };

  const handleQuickUpdatePrice = async (pos: EnrichedOptionPosition) => {
    const newPrice = parseFloat(editPriceVal.replace(',', '.'));
    const newSpot = editSpotVal ? parseFloat(editSpotVal.replace(',', '.')) : undefined;

    if (isNaN(newPrice) || newPrice < 0) {
      alert('Por favor, informe um preço válido');
      return;
    }

    const res = await updateOptionMarketPrice(pos.id, newPrice, newSpot);
    if (res.success) {
      setUpdatingId(null);
      setEditPriceVal('');
      setEditSpotVal('');
      onRefresh();
    } else {
      alert('Erro ao atualizar preço da opção');
    }
  };

  const handleQuickClose = async (pos: EnrichedOptionPosition, status: 'CLOSED' | 'EXERCISED' | 'EXPIRED_WORTHLESS') => {
    const promptText = status === 'EXPIRED_WORTHLESS'
      ? 'Confirmar vencimento a pó (Preço de saída R$ 0,00)?'
      : `Informe o preço de encerramento/recompra da opção ${pos.tickerOption}:`;

    let exitPrice = 0;
    if (status !== 'EXPIRED_WORTHLESS') {
      const val = window.prompt(promptText, pos.currentPrice.toFixed(2));
      if (val === null) return;
      exitPrice = parseFloat(val.replace(',', '.')) || 0;
    }

    const res = await closeOptionPosition({
      id: pos.id,
      exitPrice,
      status,
      notes: `Encerrada manualmente como ${status}`,
    });

    if (res.success) {
      onRefresh();
    } else {
      alert(res.error || 'Erro ao encerrar posição');
    }
  };

  const handleDelete = async (pos: EnrichedOptionPosition) => {
    if (!window.confirm(`Tem certeza que deseja excluir a posição ${pos.tickerOption}?`)) return;
    const res = await deleteOptionPosition(pos.id);
    if (res.success) {
      onRefresh();
    } else {
      alert(res.error || 'Erro ao excluir posição');
    }
  };

  const filteredPositions = positions.filter((p) => {
    if (filterStatus === 'OPEN' && p.status !== 'OPEN') return false;
    if (filterStatus === 'CLOSED' && p.status === 'OPEN') return false;
    const isSell = p.side === 'SELL' || p.side === 'SHORT';
    if (filterType === 'SELL' && !isSell) return false;
    if (filterType === 'BUY' && isSell) return false;
    return true;
  });

  const selectedObjects = positions.filter((p) => selectedIds.has(p.id));

  // Posições que NÃO pertencem a nenhuma estrutura ativa (para exibição na visão por estruturas)
  const standalonePositions = filteredPositions.filter((p) => !p.strategyId || p.unallocatedQuantity > 0);

  return (
    <div className="bg-[#0b1018] border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 font-mono text-xs">
      {/* Barra de Controles e Modos de Visão */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Seletor de Modo: Estruturas vs Pernas */}
          <div className="bg-[#070a12] border border-slate-800 rounded-xl p-1 flex items-center text-xs">
            <button
              onClick={() => setViewMode('STRATEGIES')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'STRATEGIES'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📦</span>
              <span>ESTRUTURAS ({strategies.length})</span>
            </button>
            <button
              onClick={() => setViewMode('LEGS')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'LEGS'
                  ? 'bg-slate-700 text-slate-100 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📄</span>
              <span>PERNAS ISOLADAS ({filteredPositions.length})</span>
            </button>
          </div>

          {/* Presets de Colunas */}
          <div className="bg-[#070a12] border border-slate-800 rounded-xl p-1 flex items-center gap-1 text-[11px]">
            <button
              onClick={() => setPreset('OPERACIONAL')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                preset === 'OPERACIONAL'
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              OPERACIONAL
            </button>
            <button
              onClick={() => setPreset('RENDA_CDI')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                preset === 'RENDA_CDI'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              RENDA & CDI
            </button>
            <button
              onClick={() => setPreset('RISCO_GREGAS')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                preset === 'RISCO_GREGAS'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              RISCO & GREGAS
            </button>
          </div>
        </div>

        {/* Filtros de Status & Lado */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status */}
          <div className="bg-[#070a12] border border-slate-800 rounded-lg p-1 flex items-center text-[11px]">
            <button
              onClick={() => setFilterStatus('OPEN')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filterStatus === 'OPEN'
                  ? 'bg-slate-700 text-slate-100 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Abertas
            </button>
            <button
              onClick={() => setFilterStatus('CLOSED')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filterStatus === 'CLOSED'
                  ? 'bg-slate-700 text-slate-100 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Histórico
            </button>
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filterStatus === 'ALL'
                  ? 'bg-slate-700 text-slate-100 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todas
            </button>
          </div>

          {/* Lado */}
          <div className="bg-[#070a12] border border-slate-800 rounded-lg p-1 flex items-center text-[11px]">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filterType === 'ALL'
                  ? 'bg-slate-700 text-slate-100 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilterType('SELL')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filterType === 'SELL'
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Venda
            </button>
            <button
              onClick={() => setFilterType('BUY')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filterType === 'BUY'
                  ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Compra
            </button>
          </div>
        </div>
      </div>

      {/* Barra Flutuante de Agrupamento ao Selecionar Checkboxes */}
      {selectedObjects.length >= 2 && (
        <div className="p-3 bg-[#161a10] border border-amber-500/50 rounded-xl flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold">✓ {selectedObjects.length} pernas selecionadas:</span>
            <span className="text-slate-300 text-xs">
              {selectedObjects.map((p) => p.tickerOption).join(' + ')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 text-xs"
            >
              Limpar
            </button>
            <button
              onClick={() => onOpenGroupModal(selectedObjects)}
              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95"
            >
              <span>🔗</span>
              <span>Agrupar em Estrutura</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── VISÃO 1: POR ESTRUTURAS (CONSOLIDADA) ─── */}
      {viewMode === 'STRATEGIES' ? (
        <div className="space-y-4">
          {/* 1. Estruturas Agrupadas */}
          {strategies.map((strat) => {
            const isExpanded = expandedStrategyIds.has(strat.id);
            const sm = strat.metrics;
            const isProfit = sm.netPnlMtmReais >= 0;

            return (
              <div
                key={strat.id}
                className="rounded-2xl border border-amber-500/30 bg-[#080d16] overflow-hidden shadow-xl"
              >
                {/* Header da Estrutura */}
                <div className="p-4 bg-[#0c1424] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleExpandStrategy(strat.id)}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs"
                    >
                      {isExpanded ? '▼' : '►'}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-300 text-sm">{strat.name}</span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                          {strat.strategyType} · {strat.book}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 text-[10px] font-bold">
                          {strat.legs.length} Pernas
                        </span>
                      </div>
                      {preset === 'RENDA_CDI' ? (() => {
                        const ep = strat.economicPerformance;
                        const canCompare = ep.economicPerformanceQuality !== 'INSUFFICIENT_DATA' && ep.benchmarkCdiReais !== null && ep.excessReturnVsCdiReais !== null;
                        return (
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-300">
                            <span>Cap. Benchmark: <strong className="text-slate-100 font-bold">R$ {ep.benchmarkCapitalReais.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</strong></span>
                            <span className="text-slate-600">·</span>
                            <span>Cap. Remunerado: <strong className="text-purple-300 font-bold">{canCompare && ep.collateralMode !== 'IDLE_CASH' ? `R$ ${ep.capitalRemuneratedReais.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : ep.collateralMode === 'IDLE_CASH' ? 'R$ 0' : 'N/A'}</strong></span>
                            <span className="text-slate-600">·</span>
                            <span>Carry Caixa: <strong className="text-purple-300 font-bold">{canCompare ? `+R$ ${ep.collateralCarryReais.toFixed(2)}` : 'N/A'}</strong></span>
                            <span className="text-slate-600">·</span>
                            <span>Benchmark CDI: <strong className="text-slate-300 font-bold">{canCompare && ep.benchmarkCdiReais !== null ? `+R$ ${ep.benchmarkCdiReais.toFixed(2)}` : 'N/A'}</strong></span>
                            <span className="text-slate-600">·</span>
                            <span>Excesso: <strong className={canCompare && ep.excessReturnVsCdiReais !== null ? (ep.excessReturnVsCdiReais >= 0 ? "text-emerald-300 font-bold" : "text-rose-300 font-bold") : "text-slate-500"}>
                              {canCompare && ep.excessReturnVsCdiReais !== null ? `${ep.excessReturnVsCdiReais >= 0 ? '+' : ''}R$ ${ep.excessReturnVsCdiReais.toFixed(2)}` : 'N/A'}
                            </strong></span>
                            {canCompare && ep.totalReturnToCdiMultiple !== null && (
                              <>
                                <span className="text-slate-600">·</span>
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">
                                  {ep.totalReturnToCdiMultiple.toFixed(2)}× CDI
                                </span>
                              </>
                            )}
                          </div>
                        );
                      })() : (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Fluxo Inicial: <strong className="text-emerald-400">{sm.isNetCredit ? '+' : '-'}R$ {Math.abs(sm.netInitialCreditDebitReais).toFixed(2)} {sm.isNetCredit ? 'Crédito' : 'Débito'}</strong> · {strat.strategyType === 'CASH_SECURED_PUT' ? 'Capital Reservado Cash-Secured:' : 'Capital Reservado:'} <strong className="text-slate-200">R$ {sm.totalCapitalReserved.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* P&L Consolidado da Estrutura */}
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">
                        {strat.economicPerformance.resultNature === 'REALIZED' ? 'P&L REALIZADO' : 'P&L MTM ESTRUTURA'}
                      </div>
                      <div className={`text-base font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfit ? '+' : ''}R$ {sm.netPnlMtmReais.toFixed(2)}{' '}
                        <span className="text-xs font-normal text-emerald-400/80">
                          (+{sm.roicPct.toFixed(2)}% ROIC)
                        </span>
                      </div>
                    </div>

                    {/* Botão Desagrupar */}
                    <button
                      onClick={() => handleUngroup(strat.id)}
                      disabled={isUngrouping === strat.id}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-300 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-all"
                      title="Desagrupar Estrutura (Retorna as pernas para posições avulsas)"
                    >
                      <span>🔓</span>
                      <span>{isUngrouping === strat.id ? 'Desagrupando...' : 'Desagrupar'}</span>
                    </button>
                  </div>
                </div>

                {/* Tabela de Pernas Aninhadas e Storytelling Econômico */}
                {isExpanded && (
                  <div className="p-3 bg-[#060a12] space-y-3">
                    {/* Storytelling Econômico Institucional & Double Yield */}
                    <StrategyEconomicStorytellingCard
                      strategy={strat}
                      onOpenFundingModal={onOpenFundingModal}
                    />

                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-500 text-[9px] uppercase tracking-wider">
                          <th className="py-2 px-3">Perna / Papel Econômico</th>
                          <th className="py-2 px-2 text-center">Lado</th>
                          <th className="py-2 px-2 text-right">Qtd Alocada</th>
                          <th className="py-2 px-2 text-right">Strike</th>
                          <th className="py-2 px-2 text-right">Preço Entrada</th>
                          <th className="py-2 px-2 text-right">Preço Atual</th>
                          <th className="py-2 px-3 text-right">P&L MTM Perna</th>
                          <th className="py-2 px-3 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {strat.legs.map((leg) => {
                          const pos = leg.position;
                          const isShort = pos.side === 'SELL' || pos.side === 'SHORT';
                          const pnlLeg = isShort
                            ? (pos.entryPrice - pos.currentPrice) * leg.allocatedQuantity
                            : (pos.currentPrice - pos.entryPrice) * leg.allocatedQuantity;
                          const isLegProfit = pnlLeg >= 0;

                          return (
                            <tr key={leg.id} className="hover:bg-slate-800/20 transition-colors">
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      pos.optionType === 'PUT' ? 'bg-rose-400' : 'bg-emerald-400'
                                    }`}
                                  />
                                  <div>
                                    <div className="font-bold text-slate-200">{pos.tickerOption}</div>
                                    <div className="text-[10px] text-amber-400">
                                      Papel: {leg.economicRole}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-2.5 px-2 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                    isShort
                                      ? 'bg-amber-500/15 text-amber-300'
                                      : 'bg-sky-500/15 text-sky-300'
                                  }`}
                                >
                                  {isShort ? 'VENDA' : 'COMPRA'} {pos.optionType}
                                </span>
                              </td>

                              <td className="py-2.5 px-2 text-right font-bold text-slate-200">
                                {leg.allocatedQuantity.toLocaleString('pt-BR')}
                              </td>

                              <td className="py-2.5 px-2 text-right font-bold text-slate-300">
                                R$ {pos.strike.toFixed(2)}
                              </td>

                              <td className="py-2.5 px-2 text-right text-slate-400">
                                R$ {pos.entryPrice.toFixed(2)}
                              </td>

                              <td className="py-2.5 px-2 text-right font-bold text-slate-200">
                                R$ {pos.currentPrice.toFixed(2)}
                              </td>

                              <td className="py-2.5 px-3 text-right">
                                <span className={`font-bold ${isLegProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {isLegProfit ? '+' : ''}R$ {pnlLeg.toFixed(2)}
                                </span>
                              </td>

                              <td className="py-2.5 px-3 text-center">
                                <button
                                  onClick={() => onOpenDetailDrawer(pos)}
                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                                  title="Ver Detalhes da Perna"
                                >
                                  🔍
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* 2. Operações Avulsas / Não Agrupadas */}
          {standalonePositions.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <span>OPERAÇÕES ISOLADAS / AVULSAS ({standalonePositions.length})</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#070a12]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-[#090f19] text-slate-400 text-[10px] uppercase">
                      <th className="py-3 px-3 w-8"></th>
                      <th className="py-3 px-3">Ticker / Ativo</th>
                      <th className="py-3 px-2 text-center">Tipo / Lado</th>
                      <th className="py-3 px-2 text-right">Qtd</th>
                      <th className="py-3 px-2 text-right">Strike</th>
                      <th className="py-3 px-2 text-right">Preço Médio</th>
                      <th className="py-3 px-2 text-right">Preço Atual</th>
                      <th className="py-3 px-3 text-right">P&L MTM</th>
                      <th className="py-3 px-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {standalonePositions.map((pos) => {
                      const isShort = pos.side === 'SELL' || pos.side === 'SHORT';
                      const pnl = pos.metrics.pnlMtmReais;
                      const isSelected = selectedIds.has(pos.id);

                      return (
                        <tr key={pos.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectPosition(pos.id)}
                              className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-3 cursor-pointer" onClick={() => onOpenDetailDrawer(pos)}>
                            <div className="font-bold text-slate-100 flex items-center gap-1.5">
                              <span>{pos.tickerOption}</span>
                              <span className="text-[10px] text-teal-400 bg-teal-500/10 px-1 rounded">
                                {pos.tickerUnderlying}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Spot: R$ {pos.underlyingCurrentSpot?.toFixed(2) || '---'}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isShort ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300'
                              }`}
                            >
                              {isShort ? 'VENDA' : 'COMPRA'} {pos.optionType}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right font-bold text-slate-200">
                            {pos.quantity}
                          </td>
                          <td className="py-3 px-2 text-right font-bold text-slate-100">
                            R$ {pos.strike.toFixed(2)}
                          </td>
                          <td className="py-3 px-2 text-right text-slate-300">
                            R$ {pos.entryPrice.toFixed(2)}
                          </td>
                          <td className="py-3 px-2 text-right font-bold text-slate-100">
                            R$ {pos.currentPrice.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span className={`font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {pnl >= 0 ? '+' : ''}R$ {pnl.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => onOpenDetailDrawer(pos)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                                title="Detalhes"
                              >
                                🔍
                              </button>
                              <button
                                onClick={() => onOpenRollModal(pos)}
                                className="p-1.5 rounded-lg bg-sky-500/10 text-sky-300 text-xs font-bold"
                                title="Rolar"
                              >
                                🔄
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ─── VISÃO 2: PLANA (TODAS AS PERNAS ISOLADAS) ─── */
        <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-[#070a12]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#090f19] text-slate-400 text-[10px] uppercase tracking-wider">
                <th className="py-3 px-3 w-8"></th>
                <th className="py-3 px-3">Ticker / Ativo</th>
                <th className="py-3 px-2 text-center">Tipo / Lado</th>
                <th className="py-3 px-2 text-right">Qtd</th>
                <th className="py-3 px-2 text-right">Strike</th>
                <th className="py-3 px-2 text-right">Preço Médio</th>
                <th className="py-3 px-2 text-right">Preço Atual</th>

                {preset === 'OPERACIONAL' && (
                  <>
                    <th className="py-3 px-2 text-center">DTE (B3)</th>
                    <th className="py-3 px-3 text-right">P&L MTM {isNetView ? '(Líq)' : ''}</th>
                    <th className="py-3 px-2 text-right">% Capturado</th>
                    <th className="py-3 px-2 text-center">Efficiency Score</th>
                  </>
                )}

                {preset === 'RENDA_CDI' && (
                  <>
                    <th className="py-3 px-2 text-right">Capital Reservado</th>
                    <th className="py-3 px-3 text-right">P&L MTM</th>
                    <th className="py-3 px-3 text-right">CDI Realizado</th>
                    <th className="py-3 px-2 text-center">Alpha vs CDI</th>
                    <th className="py-3 px-2 text-right">Prêmio Restante</th>
                  </>
                )}

                {preset === 'RISCO_GREGAS' && (
                  <>
                    <th className="py-3 px-2 text-center">Distância Strike</th>
                    <th className="py-3 px-2 text-center">Delta</th>
                    <th className="py-3 px-2 text-center">Theta R$/dia</th>
                    <th className="py-3 px-2 text-center">Gamma</th>
                    <th className="py-3 px-2 text-center">Vega</th>
                    <th className="py-3 px-2 text-center">IV Atual</th>
                  </>
                )}

                <th className="py-3 px-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredPositions.map((pos) => {
                const m = pos.metrics;
                const isShort = pos.side === 'SELL' || pos.side === 'SHORT';
                const pnlReais = isNetView ? m.netPnlMtmReaisWithTax : m.pnlMtmReais;
                const isProfit = pnlReais >= 0;
                const isUpdating = updatingId === pos.id;
                const eff = m.efficiencyExecutable;
                const isSelected = selectedIds.has(pos.id);

                return (
                  <tr key={pos.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectPosition(pos.id)}
                        className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                      />
                    </td>

                    <td className="py-3 px-3 cursor-pointer" onClick={() => onOpenDetailDrawer(pos)}>
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            pos.optionType === 'PUT' ? 'bg-rose-400' : 'bg-emerald-400'
                          }`}
                        />
                        <div>
                          <div className="font-bold text-slate-100 flex items-center gap-1.5">
                            <span>{pos.tickerOption}</span>
                            <span className="text-[10px] text-teal-400 bg-teal-500/10 px-1.5 py-0.2 rounded">
                              {pos.tickerUnderlying}
                            </span>
                            {pos.strategyId && (
                              <span className="text-[9px] text-amber-300 bg-amber-500/15 px-1 rounded border border-amber-500/30">
                                🔗 Agrupada
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Spot: R$ {pos.underlyingCurrentSpot?.toFixed(2) || '---'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-2 text-center" onClick={() => onOpenDetailDrawer(pos)}>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isShort ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300'
                        }`}
                      >
                        {isShort ? 'VENDA' : 'COMPRA'} {pos.optionType}
                      </span>
                    </td>

                    <td className="py-3 px-2 text-right font-bold text-slate-200" onClick={() => onOpenDetailDrawer(pos)}>
                      {pos.quantity.toLocaleString('pt-BR')}
                    </td>

                    <td className="py-3 px-2 text-right font-bold text-slate-100" onClick={() => onOpenDetailDrawer(pos)}>
                      R$ {pos.strike.toFixed(2)}
                    </td>

                    <td className="py-3 px-2 text-right text-slate-300" onClick={() => onOpenDetailDrawer(pos)}>
                      R$ {pos.entryPrice.toFixed(2)}
                    </td>

                    <td className="py-3 px-2 text-right">
                      {isUpdating ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="text"
                            value={editPriceVal}
                            onChange={(e) => setEditPriceVal(e.target.value)}
                            className="w-14 bg-slate-900 border border-teal-400 rounded px-1 text-right text-xs text-teal-300"
                            autoFocus
                          />
                          <button
                            onClick={() => handleQuickUpdatePrice(pos)}
                            className="p-1 bg-teal-600 rounded text-white text-[10px]"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <span
                          onClick={() => {
                            setUpdatingId(pos.id);
                            setEditPriceVal(pos.currentPrice.toFixed(2));
                          }}
                          className="font-bold text-slate-100 cursor-pointer hover:text-teal-300"
                        >
                          R$ {pos.currentPrice.toFixed(2)} ✏️
                        </span>
                      )}
                    </td>

                    {preset === 'OPERACIONAL' && (
                      <>
                        <td className="py-3 px-2 text-center" onClick={() => onOpenDetailDrawer(pos)}>
                          <div className="font-bold text-slate-200">{m.remainingTradingDays} DU</div>
                        </td>
                        <td className="py-3 px-3 text-right" onClick={() => onOpenDetailDrawer(pos)}>
                          <div className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isProfit ? '+' : ''}R$ {pnlReais.toFixed(2)}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right" onClick={() => onOpenDetailDrawer(pos)}>
                          {isShort ? `${m.premiumCapturedPct.toFixed(1)}%` : `ROI: +${m.roiOnPremiumPct.toFixed(1)}%`}
                        </td>
                        <td className="py-3 px-2 text-center" onClick={() => onOpenDetailDrawer(pos)}>
                          {isShort && eff.efficiencyScoreDisplay !== null ? (
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-800 text-slate-300">
                              {eff.efficiencyScoreDisplay}/100 · {eff.tier}
                            </span>
                          ) : (
                            <span className="text-slate-600 text-[10px]">---</span>
                          )}
                        </td>
                      </>
                    )}

                    {preset === 'RENDA_CDI' && (
                      <>
                        <td className="py-3 px-2 text-right font-bold text-slate-200" onClick={() => onOpenDetailDrawer(pos)}>
                          R$ {m.capitalAllocated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-right" onClick={() => onOpenDetailDrawer(pos)}>
                          <div className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isProfit ? '+' : ''}R$ {m.pnlMtmReais.toFixed(2)}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right text-purple-300 font-bold" onClick={() => onOpenDetailDrawer(pos)}>
                          +R$ {m.cdiRealizedReais.toFixed(2)}
                        </td>
                        <td className="py-3 px-2 text-center" onClick={() => onOpenDetailDrawer(pos)}>
                          {m.optionPnlToCdiMultiple !== null ? `${m.optionPnlToCdiMultiple.toFixed(2)}× CDI` : '---'}
                        </td>
                        <td className="py-3 px-2 text-right text-amber-300 font-bold" onClick={() => onOpenDetailDrawer(pos)}>
                          R$ {m.remainingCaptureReais.toFixed(2)}
                        </td>
                      </>
                    )}

                    {preset === 'RISCO_GREGAS' && (
                      <>
                        <td className="py-3 px-2 text-center text-slate-400">
                          {m.discountToSpotPct !== null ? `${m.discountToSpotPct.toFixed(1)}% OTM` : 'N/D'}
                        </td>
                        <td className="py-3 px-2 text-center text-slate-400">{pos.delta ? pos.delta.toFixed(2) : 'N/D'}</td>
                        <td className="py-3 px-2 text-center text-slate-400">{pos.theta ? `R$ ${pos.theta.toFixed(2)}` : 'N/D'}</td>
                        <td className="py-3 px-2 text-center text-slate-400">{pos.gamma ? pos.gamma.toFixed(4) : 'N/D'}</td>
                        <td className="py-3 px-2 text-center text-slate-400">{pos.vega ? pos.vega.toFixed(2) : 'N/D'}</td>
                        <td className="py-3 px-2 text-center text-slate-400">{pos.iv ? `${pos.iv.toFixed(1)}%` : 'N/D'}</td>
                      </>
                    )}

                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onOpenDetailDrawer(pos)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                          title="Detalhes"
                        >
                          🔍
                        </button>
                        <button
                          onClick={() => onOpenRollModal(pos)}
                          className="p-1.5 rounded-lg bg-sky-500/10 text-sky-300 text-xs font-bold"
                          title="Rolar"
                        >
                          🔄
                        </button>
                        <button
                          onClick={() => handleQuickClose(pos, 'CLOSED')}
                          className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 text-xs font-bold"
                          title="Encerrar"
                        >
                          💰
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
