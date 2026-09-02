'use client';

import React from 'react';
import type { EnrichedOptionStrategy } from '../calculations';

interface StrategyEconomicStorytellingCardProps {
  strategy: EnrichedOptionStrategy;
  onOpenFundingModal?: (strategy: EnrichedOptionStrategy) => void;
}

export function StrategyEconomicStorytellingCard({
  strategy,
  onOpenFundingModal,
}: StrategyEconomicStorytellingCardProps) {
  const ep = strategy.economicPerformance;
  const sm = strategy.metrics;

  const canCompareToCdi = ep.economicPerformanceQuality !== 'INSUFFICIENT_DATA';
  const isMtm = ep.resultNature === 'MTM';
  const isPositivePnl = ep.optionPnlReais >= 0;
  const isPositiveExcess = ep.excessReturnVsCdiReais >= 0;
  const isAssumedFunding = ep.qualityNotes?.includes('ASSUMED_FULL_COLLATERAL_COVERAGE');

  // Narrativa temporal e de realização
  const timeContextText = isMtm
    ? `Desde ${ep.startDate} (${ep.elapsedDU} DU decorridos), o resultado em aberto até agora:`
    : `Durante a operação entre ${ep.startDate} e ${ep.valuationDate} (${ep.elapsedDU} DU decorridos), o resultado realizado:`;

  return (
    <div className="bg-[#0a0f1d] border border-amber-500/25 rounded-xl p-4 my-3 shadow-2xl space-y-4 font-mono text-xs">
      {/* 1. Header do Card: Modo de Funding, Qualidades & Botão de Edição */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-amber-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
            <span>⚡</span>
            <span>DIAGNÓSTICO ECONÔMICO & DOUBLE YIELD</span>
          </span>

          {/* Badge de Modo de Colateral */}
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
            ep.collateralMode === 'REMUNERATED_100_CDI'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : ep.collateralMode === 'CUSTOM'
              ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}>
            {ep.collateralMode === 'REMUNERATED_100_CDI'
              ? '100% CDI'
              : ep.collateralMode === 'CUSTOM'
              ? `${ep.collateralPctCdi}% CDI`
              : 'Caixa Não Remunerado'}
          </span>

          {/* Badges Dimensionais de Qualidade */}
          <div className="flex items-center gap-1.5 flex-wrap text-[9px]">
            {/* Economia */}
            <span
              className={`px-1.5 py-0.5 rounded border ${
                ep.economicPerformanceQuality === 'FULL'
                  ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300'
                  : ep.economicPerformanceQuality === 'PARTIAL'
                  ? 'bg-amber-950/60 border-amber-700/50 text-amber-300'
                  : 'bg-rose-950/60 border-rose-700/50 text-rose-300'
              }`}
              title="Qualidade global do modelo econômico"
            >
              ECONOMIA: {ep.economicPerformanceQuality}
            </span>

            {/* CDI */}
            <span
              className={`px-1.5 py-0.5 rounded border ${
                ep.benchmarkQuality === 'OFFICIAL_DI'
                  ? 'bg-purple-950/60 border-purple-700/50 text-purple-300'
                  : ep.benchmarkQuality === 'PARTIAL_ESTIMATE'
                  ? 'bg-amber-950/60 border-amber-700/50 text-amber-300'
                  : ep.benchmarkQuality === 'ESTIMATED'
                  ? 'bg-amber-950/60 border-amber-700/50 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title="Origem dos fatores da taxa DI"
            >
              CDI: {ep.benchmarkQuality === 'OFFICIAL_DI' ? 'B3 OFICIAL' : ep.benchmarkQuality === 'PARTIAL_ESTIMATE' ? 'PARCIAL' : 'ESTIMADO'}
            </span>

            {/* Risco */}
            <span
              className={`px-1.5 py-0.5 rounded border ${
                ep.riskRecognitionQuality === 'EXACT'
                  ? 'bg-sky-950/60 border-sky-700/50 text-sky-300'
                  : ep.riskRecognitionQuality === 'APPROXIMATE'
                  ? 'bg-amber-950/60 border-amber-700/50 text-amber-300'
                  : 'bg-rose-950/60 border-rose-700/50 text-rose-300'
              }`}
              title="Classificação analítica da curva de payoff"
            >
              RISCO: {ep.riskRecognitionQuality}
            </span>

            {/* Período / Anualização */}
            {ep.annualizationQuality === 'VERY_SHORT_PERIOD' && (
              <span
                className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-400"
                title="Período inferior a 21 DU; projeções anualizadas são indicativas"
              >
                PERÍODO CURTO ({ep.elapsedDU} DU)
              </span>
            )}
          </div>
        </div>

        {/* Botão de Edição de Remuneração / Funding */}
        {onOpenFundingModal && (
          <button
            onClick={() => onOpenFundingModal(strategy)}
            className="px-3 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
            title="Alterar modo de remuneração e cobertura de garantia desta estrutura"
          >
            <span>⚙️</span>
            <span>Configurar Funding</span>
          </button>
        )}
      </div>

      {/* 2. Grid de Métricas Principais Reconciliadas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* P&L das Opções */}
        <div className="bg-[#070b14] border border-slate-800/80 rounded-lg p-3 space-y-1">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            {isMtm ? 'P&L OPÇÕES (MTM)' : 'P&L OPÇÕES (REALIZADO)'}
          </div>
          <div className={`text-base font-bold ${isPositivePnl ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPositivePnl ? '+' : ''}R$ {ep.optionPnlReais.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500">
            {ep.optionReturnOnBenchmarkCapitalPct !== null
              ? `${ep.optionReturnOnBenchmarkCapitalPct >= 0 ? '+' : ''}${ep.optionReturnOnBenchmarkCapitalPct.toFixed(2)}% s/ garantia`
              : 'Resultado derivativo'}
          </div>
        </div>

        {/* Carrego do Caixa / CDI */}
        <div className="bg-[#070b14] border border-slate-800/80 rounded-lg p-3 space-y-1">
          <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">
            CARREGO CAIXA (CDI)
          </div>
          <div className="text-base font-bold text-purple-300">
            {!canCompareToCdi ? (
              <span className="text-slate-500 text-sm">N/A</span>
            ) : (
              `+R$ ${ep.collateralCarryReais.toFixed(2)}`
            )}
          </div>
          <div className="text-[10px] text-slate-500">
            {!canCompareToCdi ? (
              'Dados temporais insuficientes'
            ) : ep.collateralMode === 'IDLE_CASH' ? (
              'Caixa não remunerado'
            ) : (
              `Sobre R$ ${ep.capitalRemuneratedReais.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
            )}
          </div>
        </div>

        {/* Retorno Econômico Total */}
        <div className="bg-[#070b14] border border-slate-800/80 rounded-lg p-3 space-y-1">
          <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
            RETORNO ECONÔMICO TOTAL
          </div>
          <div className={`text-base font-bold ${ep.totalEconomicReturnReais >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
            {ep.totalEconomicReturnReais >= 0 ? '+' : ''}R$ {ep.totalEconomicReturnReais.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500">
            {!canCompareToCdi ? (
              'P&L opções (sem carry)'
            ) : ep.totalEconomicReturnPct !== null ? (
              `${ep.totalEconomicReturnPct >= 0 ? '+' : ''}${ep.totalEconomicReturnPct.toFixed(2)}% no período`
            ) : (
              'Double Yield consolidado'
            )}
          </div>
        </div>

        {/* Custo de Oportunidade (Se fosse só CDI) */}
        <div className="bg-[#070b14] border border-slate-800/80 rounded-lg p-3 space-y-1">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            SE FOSSE SÓ CDI
          </div>
          <div className="text-base font-bold text-slate-300">
            {!canCompareToCdi ? (
              <span className="text-slate-500 text-sm">N/A</span>
            ) : (
              `+R$ ${ep.benchmarkCdiReais.toFixed(2)}`
            )}
          </div>
          <div className="text-[10px] text-slate-500">
            {!canCompareToCdi
              ? 'Benchmark temporal indisponível'
              : ep.cdiPeriodReturnPct !== null
              ? `${ep.cdiPeriodReturnPct.toFixed(2)}% taxa DI no período`
              : 'Custo de oportunidade'}
          </div>
        </div>

        {/* Valor Gerado Acima do CDI */}
        <div className="bg-[#070b14] border border-amber-500/30 rounded-lg p-3 space-y-1">
          <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
            {!canCompareToCdi
              ? 'COMPARAÇÃO VS CDI'
              : ep.economicPerformanceQuality === 'PARTIAL'
              ? 'VALOR ESTIMADO ACIMA CDI'
              : 'VALOR GERADO ACIMA CDI'}
          </div>
          <div className={`text-base font-bold ${
            !canCompareToCdi
              ? 'text-slate-500'
              : isPositiveExcess
              ? 'text-emerald-400'
              : 'text-rose-400'
          }`}>
            {!canCompareToCdi ? (
              <span className="text-slate-500 text-sm">N/A</span>
            ) : (
              `${isPositiveExcess ? '+' : ''}R$ ${ep.excessReturnVsCdiReais.toFixed(2)}`
            )}
          </div>
          <div className="text-[10px] text-slate-500">
            {!canCompareToCdi
              ? 'Comparação não disponível'
              : ep.excessPeriodPctPoints !== null
              ? `${ep.excessPeriodPctPoints >= 0 ? '+' : ''}${ep.excessPeriodPctPoints.toFixed(2)} p.p. vs CDI`
              : 'Alpha econômico'}
          </div>
        </div>
      </div>

      {/* 3. Storytelling Humano Institucional & Múltiplos */}
      <div className="bg-[#080d1a] border border-slate-800 rounded-xl p-3.5 space-y-2.5">
        <div className="text-slate-300 leading-relaxed text-xs">
          {!canCompareToCdi ? (
            <span>
              {ep.qualityNotes?.includes('CLOSED_AT_REQUIRED')
                ? 'Data de encerramento da operação ausente no registro histórico.'
                : 'Dados temporais ou base de capital insuficientes para uma comparação consistente com o CDI.'}{' '}
              As opções {isMtm ? 'estão registrando' : 'registraram'}{' '}
              <strong className={isPositivePnl ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {isPositivePnl ? '+' : ''}R$ {ep.optionPnlReais.toFixed(2)}
              </strong>.
            </span>
          ) : (
            <>
              {isAssumedFunding && (
                <span className="text-amber-300 font-bold block mb-1">
                  ⚠️ Assumindo remuneração integral da garantia (funding não informado na criação da estrutura):
                </span>
              )}
              <span>{timeContextText} </span>
              {isPositivePnl ? (
                <span>
                  as opções <strong className="text-emerald-400 font-bold">{isMtm ? 'estão gerando' : 'geraram'} +R$ {ep.optionPnlReais.toFixed(2)}</strong>
                </span>
              ) : (
                <span>
                  as opções <strong className="text-rose-400 font-bold">{isMtm ? 'estão registrando' : 'registraram'} R$ {ep.optionPnlReais.toFixed(2)}</strong>
                </span>
              )}
              {ep.collateralCarryReais > 0 ? (
                <span>
                  , somados a <strong className="text-purple-300 font-bold">+R$ {ep.collateralCarryReais.toFixed(2)} de carrego de caixa</strong> aplicado em garantia, totalizando{' '}
                  <strong className="text-amber-300 font-bold">R$ {ep.totalEconomicReturnReais.toFixed(2)} de retorno econômico</strong>.
                </span>
              ) : (
                <span>
                  {' '}com garantia não remunerada (0% carry de caixa).
                </span>
              )}
            </>
          )}
        </div>

        {/* Faixa de Múltiplos e Dias Equivalentes (somente se canCompareToCdi) */}
        {canCompareToCdi && (
          <div className="flex flex-wrap items-center gap-4 text-xs pt-1 border-t border-slate-800/60">
            {/* Múltiplo Opções / CDI */}
            {ep.optionPnlToCdiMultiple !== null && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Opções / CDI:</span>
                <strong className="text-amber-400 font-bold">{ep.optionPnlToCdiMultiple.toFixed(2)}×</strong>
              </div>
            )}

            {/* Múltiplo Total / CDI */}
            {ep.totalReturnToCdiMultiple !== null && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Total / CDI:</span>
                <strong className="text-amber-300 font-bold">{ep.totalReturnToCdiMultiple.toFixed(2)}×</strong>
              </div>
            )}

            {/* Dias Úteis Equivalentes de CDI (apenas se positivo e válido) */}
            {ep.optionPnlEquivalentCdiDU !== null && ep.optionPnlEquivalentCdiDU > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Equivalência:</span>
                <strong className="text-purple-300 font-bold">≈ {ep.optionPnlEquivalentCdiDU.toFixed(0)} DU de CDI</strong>
              </div>
            )}

            {/* Eficiência por R$ 1.000 de Risco */}
            {ep.maxLossType === 'FINITE' && ep.extraProfitPer1000RiskReais !== null && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">
                  {isMtm ? 'Excesso vs CDI / R$ 1k risco:' : 'Adicional / R$ 1k risco:'}
                </span>
                <strong className="text-emerald-300 font-bold">
                  {ep.extraProfitPer1000RiskReais >= 0 ? '+' : ''}R$ {ep.extraProfitPer1000RiskReais.toFixed(2)}
                </strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Diagnóstico de Curva de Risco & Salvaguardas */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Perda Máxima Econômica */}
          <div>
            <span className="text-slate-500">Perda Máxima: </span>
            {ep.maxLossType === 'FINITE' && ep.maxLossEconomicReais !== null ? (
              <strong className="text-rose-400 font-bold">
                R$ {ep.maxLossEconomicReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>
            ) : ep.maxLossType === 'UNBOUNDED' ? (
              <strong className="text-rose-400 font-bold">Ilimitada ⚠️</strong>
            ) : (
              <strong className="text-slate-500">Não determinada para esta combinação</strong>
            )}
          </div>

          {/* Break-Evens da Estrutura */}
          {sm.breakEvenInferior !== null && (
            <div>
              <span className="text-slate-500">BE Inferior: </span>
              <strong className="text-slate-200">R$ {sm.breakEvenInferior.toFixed(2)}</strong>
            </div>
          )}
          {sm.breakEvenSuperior !== null && (
            <div>
              <span className="text-slate-500">BE Superior: </span>
              <strong className="text-slate-200">R$ {sm.breakEvenSuperior.toFixed(2)}</strong>
            </div>
          )}
        </div>

        {/* Notas de Transparência Institucional */}
        <div className="text-[10px] text-slate-500 italic space-x-2">
          <span>
            {!canCompareToCdi
              ? 'Benchmark CDI indisponível para esta estratégia.'
              : ep.benchmarkQuality === 'OFFICIAL_DI'
              ? 'Benchmark CDI apurado com observações oficiais B3.'
              : ep.benchmarkQuality === 'PARTIAL_ESTIMATE'
              ? 'Benchmark CDI parcialmente estimado; consulte os indicadores de qualidade.'
              : ep.benchmarkQuality === 'ESTIMATED'
              ? 'Benchmark CDI estimado com taxa de referência.'
              : 'Benchmark CDI não disponível.'}
          </span>
          <span>·</span>
          <span>Risco econômico baseado no padrão de payoff reconhecido.</span>
          {ep.annualizationQuality === 'VERY_SHORT_PERIOD' && (
            <>
              <span>·</span>
              <span>Ritmo anualizado é meramente indicativo devido ao período decorrido &lt; 21 DU.</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
