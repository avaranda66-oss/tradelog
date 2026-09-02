'use client';

import React, { useState } from 'react';
import type { OptionsPortfolioSummary, ActionFeedItem } from '../actions';
import { syncYahooSpotPricesAction } from '../actions';

interface OptionsKpiCardsProps {
  summary: OptionsPortfolioSummary;
  isNetView: boolean;
  onToggleNetView: (isNet: boolean) => void;
  onOpenCalculator: () => void;
  onOpenNewPosition: () => void;
  onRefresh: () => void;
  onSelectActionItem?: (item: ActionFeedItem) => void;
}

export function OptionsKpiCards({
  summary,
  isNetView,
  onToggleNetView,
  onOpenCalculator,
  onOpenNewPosition,
  onRefresh,
  onSelectActionItem,
}: OptionsKpiCardsProps) {
  const [isSyncingYahoo, setIsSyncingYahoo] = useState(false);

  const inc = summary.incomeBook;
  const dir = summary.directionalBook;
  const hyb = summary.hybridBook;

  const totalNetPnl = inc.netPnlReaisWithTax + (dir.pnlMtmReais * 0.85) + (hyb?.netPnlReaisWithTax ?? (hyb ? hyb.optionPnlReais * 0.85 : 0));
  const displayPnl = isNetView ? totalNetPnl : summary.totalPnlMtmReais;
  const displayRoicPct = summary.totalCapitalAllocated > 0 ? (displayPnl / summary.totalCapitalAllocated) * 100 : 0;

  const displayIncomePnl = isNetView ? inc.netPnlReaisWithTax : inc.optionPnlReais;
  const displayHybridPnl = isNetView ? (hyb?.netPnlReaisWithTax ?? (hyb ? hyb.optionPnlReais * 0.85 : 0)) : (hyb?.optionPnlReais ?? 0);
  const displayDirectionalPnl = isNetView ? dir.pnlMtmReais * 0.85 : dir.pnlMtmReais;

  // Benchmark CDI & Alpha Consolidados da Garantia Total da Carteira
  const displayTotalCdi = isNetView ? summary.totalNetCdiBenchmarkReais : summary.totalCdiRealizedReais;
  const displayTotalAlpha = isNetView ? summary.totalNetAlphaReais : summary.totalAlphaReais;
  const displayTotalCdiMultiple = isNetView ? summary.totalNetCdiMultiple : summary.totalCdiMultiple;

  const displayIncomeCdi = isNetView ? inc.netCdiBenchmarkReais : inc.benchmarkCdiReais;
  const displayHybridCdi = isNetView ? hyb?.netCdiBenchmarkReais ?? 0 : hyb?.benchmarkCdiReais ?? 0;

  const isPositive = displayPnl >= 0;
  const isAlphaPositive = displayTotalAlpha >= 0;

  const handleSyncYahoo = async () => {
    setIsSyncingYahoo(true);
    try {
      const res = await syncYahooSpotPricesAction();
      if (res.success) {
        onRefresh();
      } else {
        alert(res.error || 'Erro ao sincronizar Yahoo Finance');
      }
    } finally {
      setIsSyncingYahoo(false);
    }
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* 1. Header de Controles & Ações Rápidas */}
      <div className="bg-[#0b1018] border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-400 animate-pulse" />
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              CARTEIRA DE OPÇÕES & BENCHMARK CDI (B3)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-[10px] font-bold">
              {summary.openPositionsCount} Abertas · {summary.closedPositionsCount} Histórico
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Remuneração de Capital com Venda de Puts, Calls Cobertas e Gestão de Alpha vs CDI Realizado.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor Bruto vs Líquido Estimado */}
          <div className="bg-[#070a12] border border-slate-800 rounded-xl p-1 flex items-center text-xs">
            <button
              onClick={() => onToggleNetView(false)}
              className={`px-3 py-1.5 rounded-lg transition-all font-bold ${
                !isNetView ? 'bg-slate-700 text-slate-100 shadow' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              BRUTO
            </button>
            <button
              onClick={() => onToggleNetView(true)}
              className={`px-3 py-1.5 rounded-lg transition-all font-bold flex items-center gap-1.5 ${
                isNetView ? 'bg-emerald-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Líquido estimado com 15% de IR sobre opções e 22,5% sobre benchmark de renda fixa"
            >
              <span>LÍQUIDO ESTIMADO</span>
            </button>
          </div>

          {/* Botão Sincronizar Yahoo */}
          <button
            onClick={handleSyncYahoo}
            disabled={isSyncingYahoo}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
              isSyncingYahoo
                ? 'bg-teal-500/20 text-teal-300 border-teal-500/30 cursor-not-allowed'
                : 'bg-[#0f1b2b] hover:bg-[#16273e] text-teal-300 border-teal-500/40'
            }`}
            title="Atualiza Spot ao vivo via Yahoo Finance"
          >
            <span className={isSyncingYahoo ? 'animate-spin' : ''}>🔄</span>
            <span>{isSyncingYahoo ? 'SINCRONIZANDO...' : 'YAHOO SPOT LIVE'}</span>
          </button>

          {/* Botão Calculadora */}
          <button
            onClick={onOpenCalculator}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 flex items-center gap-2 transition-all shadow-md active:scale-95"
          >
            <span>🧮</span>
            <span>CALCULADORA PRÉ-TRADE</span>
          </button>

          {/* Botão Nova Operação */}
          <button
            onClick={onOpenNewPosition}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white border border-teal-400/40 flex items-center gap-2 transition-all shadow-lg hover:shadow-teal-500/20 active:scale-95"
          >
            <span>➕</span>
            <span>NOVA OPERAÇÃO</span>
          </button>
        </div>
      </div>

      {/* 2. Action Feed: Fila de Manejo & Ações Sugeridas */}
      {summary.actionFeedItems.length > 0 ? (
        <div className="space-y-2">
          {summary.actionFeedItems.map((item) => (
            <div
              key={item.positionId}
              onClick={() => onSelectActionItem && onSelectActionItem(item)}
              className="bg-[#12130e] border border-amber-500/40 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg cursor-pointer hover:border-amber-400 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-lg bg-amber-500/20 text-amber-300 text-base">⚡</span>
                <div>
                  <div className="font-bold text-amber-300 text-xs flex items-center gap-2">
                    <span>{item.title}</span>
                    <span className="text-[10px] text-slate-400 font-normal">({item.scoreBasis})</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">{item.details}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
                  Liberável: R$ {item.capitalReservedLiberavel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-amber-400 font-bold hover:underline">Ver Diagnóstico →</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* 3. Grid dos 4 Cards Mestres de KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Capital em Garantia */}
        <div className="bg-[#070d18] border border-slate-800/80 rounded-xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              CAPITAL EM GARANTIA
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800/60 text-slate-300 text-[10px] font-bold">
              TOTAL CARTEIRA
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold text-slate-100 tracking-tight">
              R$ {summary.totalCapitalAllocated.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5">
              <span>Renda: <strong className="text-teal-300 font-bold">R$ {inc.capitalAllocated.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</strong></span>
              {hyb.capitalAllocated > 0 && (
                <span>· Estruturas: <strong className="text-amber-300 font-bold">R$ {hyb.capitalAllocated.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</strong></span>
              )}
              {dir.capitalAtRisk > 0 && (
                <span>· Direcional: <strong className="text-sky-300 font-bold">R$ {dir.capitalAtRisk.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</strong></span>
              )}
            </div>
          </div>
          <p className="text-[10px] text-slate-500 italic">
            Total em garantia cash-secured (Puts) e prêmios alocados.
          </p>
        </div>

        {/* Card 2: P&L MTM Consolidado */}
        <div className="bg-[#07131b] border border-teal-500/30 rounded-xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">
              P&L MTM CONSOLIDADO
            </span>
            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
              isPositive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
            }`}>
              {displayRoicPct >= 0 ? `+${displayRoicPct.toFixed(2)}%` : `${displayRoicPct.toFixed(2)}%`} ROIC
            </span>
          </div>
          <div className="space-y-1">
            <div className={`text-2xl font-bold tracking-tight ${
              isPositive ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {displayPnl >= 0 ? '+' : ''}R$ {displayPnl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5">
              <span>Renda: <strong className="text-emerald-300 font-bold">{displayIncomePnl >= 0 ? '+' : ''}{displayIncomePnl.toFixed(2)}</strong></span>
              {(hyb?.optionPnlReais ?? 0) !== 0 && (
                <span>· Estruturas: <strong className="text-amber-300 font-bold">{displayHybridPnl >= 0 ? '+' : ''}{displayHybridPnl.toFixed(2)}</strong></span>
              )}
              {dir.pnlMtmReais !== 0 && (
                <span>· Direcional: <strong className="text-sky-300 font-bold">{displayDirectionalPnl >= 0 ? '+' : ''}{displayDirectionalPnl.toFixed(2)}</strong></span>
              )}
            </div>
          </div>
          <p className="text-[10px] text-slate-500 italic">
            {isNetView ? 'Lucro líquido estimado (15% IR sobre ganho).' : 'Lucro mark-to-market total antes de tributos.'}
          </p>
        </div>

        {/* Card 3: Benchmark CDI — Capital Elegível */}
        <div className="bg-[#0f0e1c] border border-purple-500/30 rounded-xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
              BENCHMARK CDI — CAPITAL ELEGÍVEL
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              summary.portfolioBenchmarkQuality === 'OFFICIAL_DI'
                ? 'bg-purple-500/15 text-purple-300'
                : summary.portfolioBenchmarkQuality === 'PARTIAL_ESTIMATE'
                ? 'bg-amber-500/15 text-amber-300'
                : summary.portfolioBenchmarkQuality === 'ESTIMATED'
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-slate-800 text-slate-500'
            }`}>
              {summary.portfolioBenchmarkQuality === 'OFFICIAL_DI'
                ? 'B3 OFICIAL'
                : summary.portfolioBenchmarkQuality === 'PARTIAL_ESTIMATE'
                ? 'CDI PARCIAL ⚠️'
                : summary.portfolioBenchmarkQuality === 'ESTIMATED'
                ? 'CDI ESTIMADO ⚠️'
                : 'N/A'}
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold text-purple-300 tracking-tight">
              {summary.portfolioBenchmarkEligibleCount === 0 ? (
                <span className="text-slate-500 text-lg">N/A</span>
              ) : (
                `R$ ${summary.portfolioBenchmarkCdiReais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </div>
            {summary.portfolioBenchmarkEligibleCount > 0 ? (
              <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5">
                <span>Renda: <strong className="text-purple-200 font-bold">R$ {summary.incomeBook.benchmarkCdiReais.toFixed(2)}</strong></span>
                {summary.hybridBook.benchmarkCdiReais > 0 && (
                  <span>· Estruturas: <strong className="text-amber-200 font-bold">R$ {summary.hybridBook.benchmarkCdiReais.toFixed(2)}</strong></span>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">
                Nenhuma posição elegível ao benchmark CDI.
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 italic">
            {summary.portfolioBenchmarkEligibleCount > 0
              ? `Sobre R$ ${summary.portfolioBenchmarkEligibleCapital.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de capital elegível · ${summary.portfolioBenchmarkEligibleCount} ${summary.portfolioBenchmarkEligibleCount === 1 ? 'operação incluída' : 'operações incluídas'} · ${summary.portfolioExcludedFromBenchmarkCount} ${summary.portfolioExcludedFromBenchmarkCount === 1 ? 'direcional excluída' : 'direcionais excluídas'}`
              : 'Apenas posições direcionais/débito sem garantia alocada.'}
          </p>
        </div>

        {/* Card 4: Valor Gerado Acima do CDI (Double Yield Institucional) */}
        {(() => {
          const canShowPortfolioEconomicComparison =
            summary.portfolioBenchmarkEligibleCount > 0 &&
            summary.portfolioEconomicPerformanceQuality !== 'INSUFFICIENT_DATA';

          return (
            <div className="bg-[#12100a] border border-amber-500/40 rounded-xl p-4 space-y-2 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                  {summary.portfolioEconomicPerformanceQuality === 'FULL'
                    ? 'VALOR GERADO ACIMA DO CDI'
                    : summary.portfolioEconomicPerformanceQuality === 'PARTIAL'
                    ? 'VALOR ESTIMADO ACIMA DO CDI'
                    : 'VALOR ACIMA DO CDI'}
                </span>
                <div className="flex items-center gap-1.5">
                  {summary.portfolioEconomicPerformanceQuality === 'FULL' && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                      Double Yield Institucional
                    </span>
                  )}
                  {summary.portfolioEconomicPerformanceQuality === 'PARTIAL' && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold" title="Parte da carteira possui funding não informado">
                      Funding Parcial ⚠️
                    </span>
                  )}
                  {summary.portfolioEconomicPerformanceQuality === 'INSUFFICIENT_DATA' && (
                    <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-bold">
                      Inconclusivo
                    </span>
                  )}
                  {canShowPortfolioEconomicComparison && summary.portfolioTotalReturnToCdiMultiple !== null && (
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                      summary.portfolioTotalReturnToCdiMultiple >= 1.5
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {summary.portfolioTotalReturnToCdiMultiple.toFixed(2)}× CDI
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <div className={`text-2xl font-bold tracking-tight ${
                  canShowPortfolioEconomicComparison && summary.portfolioExcessReturnVsCdiReais >= 0
                    ? 'text-amber-400'
                    : 'text-slate-400'
                }`}>
                  {!canShowPortfolioEconomicComparison ? (
                    <span className="text-slate-500 text-lg">N/A</span>
                  ) : (
                    `${summary.portfolioExcessReturnVsCdiReais >= 0 ? '+' : ''}R$ ${summary.portfolioExcessReturnVsCdiReais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  )}
                </div>
                <div className="text-[11px] text-slate-400">
                  {!canShowPortfolioEconomicComparison ? (
                    <span className="text-slate-500 italic">
                      {summary.portfolioBenchmarkEligibleCount === 0
                        ? 'Sem posições elegíveis para apuração de excesso vs CDI.'
                        : 'Dados temporais insuficientes para apurar comparação econômica vs CDI.'}
                    </span>
                  ) : (
                    <span>
                      Excesso econômico vs CDI: <strong className={summary.portfolioExcessReturnVsCdiReais >= 0 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                        {summary.portfolioExcessReturnVsCdiReais >= 0
                          ? `+R$ ${summary.portfolioExcessReturnVsCdiReais.toFixed(2)} acima do CDI elegível`
                          : `R$ ${summary.portfolioExcessReturnVsCdiReais.toFixed(2)} abaixo do CDI elegível`}
                      </strong>
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-slate-500 italic">
                {summary.portfolioEconomicPerformanceQuality === 'FULL'
                  ? 'Excesso econômico do universo elegível sobre o mesmo capital aplicado ao CDI.'
                  : summary.portfolioEconomicPerformanceQuality === 'PARTIAL'
                  ? 'Parte do capital possui funding não informado; resultado baseado nas premissas disponíveis.'
                  : 'Dados insuficientes para uma comparação econômica consistente.'}
                {isNetView && ' (Narrativa de Double Yield e Múltiplos CDI calculada sobre a base bruta institucional).'}
              </p>
            </div>
          );
        })()}
      </div>

      {/* 4. Faixa de Contexto Quantitativo Diário */}
      <div className="bg-[#070a12] border border-slate-800/80 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
        <div className="flex items-center gap-4 flex-wrap">
          <span>Theta Total: <strong className={summary.totalThetaReaisPerDay >= 0 ? "text-emerald-300" : "text-rose-300"}>
            {summary.totalThetaReaisPerDay !== 0 ? `${summary.totalThetaReaisPerDay >= 0 ? '+' : ''}R$ ${summary.totalThetaReaisPerDay.toFixed(2)}/dia` : 'R$ 0,00/dia'}
          </strong></span>
          <span className="text-slate-700">|</span>
          <span>Delta Total: <strong className={summary.totalDeltaEquivUnits >= 0 ? "text-sky-300" : "text-amber-300"}>
            {summary.totalDeltaEquivUnits !== 0 ? `${summary.totalDeltaEquivUnits >= 0 ? '+' : ''}${summary.totalDeltaEquivUnits.toFixed(0)} ações` : 'Delta Neutro (0)'}
          </strong></span>
          <span className="text-slate-700">|</span>
          <span>Série DI: <strong className="text-purple-300">B3 Oficial</strong></span>
          <span className="text-slate-700">|</span>
          <span>Selic Meta Base: <strong className="text-amber-300">14,00% a.a.</strong></span>
        </div>
        <div className="text-slate-500 text-[10px]">
          Fórmulas B3 / Taxa DI em base 252 DU
        </div>
      </div>
    </div>
  );
}
