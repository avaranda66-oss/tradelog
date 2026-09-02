'use client';

import React, { useState } from 'react';
import type { EnrichedOptionPosition } from '../calculations';

interface OptionDetailDrawerProps {
  position: EnrichedOptionPosition | null;
  isOpen: boolean;
  isNetView: boolean;
  onClose: () => void;
  onOpenRollModal: (position: EnrichedOptionPosition) => void;
  onQuickClose: (position: EnrichedOptionPosition) => void;
}

export function OptionDetailDrawer({
  position,
  isOpen,
  isNetView,
  onClose,
  onOpenRollModal,
  onQuickClose,
}: OptionDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'EXIT' | 'EXERCISE' | 'CDI' | 'TAX'>('EXIT');

  if (!isOpen || !position) return null;

  const m = position.metrics;
  const isShort = position.side === 'SELL' || position.side === 'SHORT';
  const effExec = m.efficiencyExecutable;
  const effMtm = m.efficiencyMtm;

  const displayPnl = isNetView ? m.netPnlMtmReaisWithTax : m.pnlMtmReais;
  const isProfit = displayPnl >= 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-xl bg-[#090d16] border-l border-slate-800 h-full flex flex-col shadow-2xl font-mono text-xs animate-in slide-in-from-right duration-200">
        {/* Header do Drawer */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#0b101c]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  position.optionType === 'PUT' ? 'bg-rose-400' : 'bg-emerald-400'
                }`}
              />
              <span className="font-bold text-slate-100 text-sm">{position.tickerOption}</span>
              <span className="px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/20 text-teal-300 text-[10px] font-bold">
                {position.tickerUnderlying}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold">
                {isShort ? 'VENDA' : 'COMPRA'} {position.optionType}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Strike R$ {position.strike.toFixed(2)} · {m.elapsedTradingDays} DU decorridos de {m.totalTradingDaysAtEntry} DU
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Abas de Navegação */}
        <div className="flex items-center border-b border-slate-800 bg-[#070a12] px-3">
          <button
            onClick={() => setActiveTab('EXIT')}
            className={`py-3 px-3.5 border-b-2 font-bold transition-all ${
              activeTab === 'EXIT'
                ? 'border-teal-400 text-teal-300 bg-teal-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🎯 Diagnóstico Saída
          </button>
          <button
            onClick={() => setActiveTab('EXERCISE')}
            className={`py-3 px-3.5 border-b-2 font-bold transition-all ${
              activeTab === 'EXERCISE'
                ? 'border-amber-400 text-amber-300 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            💵 Cenário Exercício
          </button>
          <button
            onClick={() => setActiveTab('CDI')}
            className={`py-3 px-3.5 border-b-2 font-bold transition-all ${
              activeTab === 'CDI'
                ? 'border-purple-400 text-purple-300 bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🏦 Benchmark CDI
          </button>
          <button
            onClick={() => setActiveTab('TAX')}
            className={`py-3 px-3.5 border-b-2 font-bold transition-all ${
              activeTab === 'TAX'
                ? 'border-emerald-400 text-emerald-300 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚖️ Fiscal
          </button>
        </div>

        {/* Conteúdo das Abas */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* ABA 1: DIAGNÓSTICO DE SAÍDA */}
          {activeTab === 'EXIT' && (
            <div className="space-y-4 animate-in fade-in">
              {/* Box P&L MTM vs Saída Estimada */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0b1322] border border-teal-500/30 rounded-xl p-3.5 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">P&L MTM</div>
                  <div className={`text-xl font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isProfit ? '+' : ''}R$ {m.pnlMtmReais.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Mark: R$ {m.markPrice.toFixed(2)} ({m.premiumCapturedPct.toFixed(1)}% capturado)
                  </div>
                </div>

                <div className="bg-[#0f172a] border border-slate-700/60 rounded-xl p-3.5 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">P&L ESTIMADO SE ENCERRAR AGORA</div>
                  <div className="text-xl font-bold text-teal-300">
                    +R$ {m.pnlEstimatedExitReais.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Cotação Saída: R$ {m.estimatedExitPrice.toFixed(2)} ({m.exitQuote.basis})
                  </div>
                </div>
              </div>

              {/* Box Lucro Adicional Máximo & Retorno Residual */}
              {isShort && (
                <div className="bg-[#0b1018] border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-bold">Prêmio Restante a Capturar:</span>
                    <span className="text-amber-300 font-bold">R$ {m.remainingCaptureReais.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>Capital Reservado Liberável:</span>
                    <span className="text-slate-100 font-bold">
                      R$ {m.capitalAllocated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-1">
                    <div
                      className="bg-teal-400 h-full rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, m.premiumCapturedPct))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{m.premiumCapturedPct.toFixed(1)}% já monetizado</span>
                    <span>{(100 - m.premiumCapturedPct).toFixed(1)}% restante</span>
                  </div>
                </div>
              )}

              {/* Efficiency Score Card */}
              {isShort && (
                <div className="bg-[#12130e] border border-amber-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                        EFFICIENCY SCORE (SAÍDA EXECUTÁVEL)
                      </span>
                      <div className="text-2xl font-bold text-amber-300">
                        {effExec.efficiencyScoreDisplay !== null ? `${effExec.efficiencyScoreDisplay} / 100` : 'N/D'}
                        <span className="text-xs font-normal text-amber-400/80 ml-2">
                          ({effExec.tier})
                        </span>
                      </div>
                    </div>
                    <div className="text-right space-y-0.5">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">HARVEST RATIO</div>
                      <div className="text-base font-bold text-teal-300">
                        {effExec.harvestRatio !== null ? `${effExec.harvestRatio.toFixed(2)}×` : 'N/D'}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-300 space-y-1 border-t border-amber-500/20 pt-2">
                    <p>
                      • Você monetizou <strong>{m.premiumCapturedPct.toFixed(1)}%</strong> do prêmio em apenas <strong>{(m.timeConsumedPct * 100).toFixed(1)}%</strong> do tempo total.
                    </p>
                    <p>
                      • O prêmio restante de R$ {m.remainingCaptureReais.toFixed(2)} remunera apenas <strong>{effExec.residualVsProjectedCdiRatio ? `${effExec.residualVsProjectedCdiRatio.toFixed(2)}×` : '---'}</strong> o CDI projetado para os {m.remainingTradingDays} DU restantes.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA 2: CENÁRIO DE EXERCÍCIO */}
          {activeTab === 'EXERCISE' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-[#0b1018] border border-slate-800 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  CASH-SECURED / COMPRA COM DESCONTO
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">Strike de Exercício:</span>
                    <span className="font-bold text-slate-100">R$ {position.strike.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">Prêmio de Entrada Recebido:</span>
                    <span className="font-bold text-emerald-400">-R$ {position.entryPrice.toFixed(2)} / ação</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-amber-500/15 border border-amber-500/30">
                    <span className="text-amber-300 font-bold">Preço Efetivo de Aquisição (Break-Even):</span>
                    <span className="font-bold text-amber-300">
                      R$ {m.effectiveAcquisitionPrice?.toFixed(2) || position.strike.toFixed(2)} / ação
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">Desembolso Real de Caixa:</span>
                    <span className="font-bold text-slate-100">
                      R$ {m.maxLossReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {m.discountToSpotPct !== null && m.discountToSpotPct > 0 && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                      ✓ Se for exercido, você compra {position.tickerUnderlying} com {m.discountToSpotPct.toFixed(1)}% de desconto em relação ao Spot atual!
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: BENCHMARK CDI */}
          {activeTab === 'CDI' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-[#0b1018] border border-slate-800 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center justify-between">
                  <span>ACUMULAÇÃO DIÁRIA DA TAXA DI (B3)</span>
                  <span className="text-[10px] text-slate-400">Série Oficial B3</span>
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">Capital Comprometido:</span>
                    <span className="font-bold text-slate-100">
                      R$ {m.capitalAllocated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-purple-500/15 border border-purple-500/30">
                    <span className="text-purple-300 font-bold">CDI Realizado ({m.elapsedTradingDays} DU):</span>
                    <span className="font-bold text-purple-300">
                      +R$ {m.cdiRealizedReais.toFixed(2)} ({(m.cdiRealizedYieldDecimal * 100).toFixed(3)}%)
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">CDI Projetado até Vencimento ({m.remainingTradingDays} DU):</span>
                    <span className="font-bold text-slate-200">
                      +R$ {m.cdiProjectedReais.toFixed(2)} (Proxy Selic 14% a.a.)
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-amber-500/15 border border-amber-500/30">
                    <span className="text-amber-300 font-bold">Múltiplo de Remuneração (P&L / CDI):</span>
                    <span className="font-bold text-amber-300">
                      {m.optionPnlToCdiMultiple !== null ? `${m.optionPnlToCdiMultiple.toFixed(2)}× CDI` : '---'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA 4: FISCAL ESTIMADO */}
          {activeTab === 'TAX' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-[#0b1018] border border-slate-800 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  MODELAGEM TRIBUTÁRIA ESTIMADA
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">Alíquota IR Opções (Swing Trade B3):</span>
                    <span className="font-bold text-slate-100">15% sobre o ganho líquido</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">P&L MTM Líquido Estimado:</span>
                    <span className="font-bold text-emerald-400">+R$ {m.netPnlMtmReaisWithTax.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">Alíquota Benchmark Renda Fixa:</span>
                    <span className="font-bold text-slate-100">22,5% (Curto prazo &lt; 180d)</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-purple-500/15 border border-purple-500/30">
                    <span className="text-purple-300 font-bold">CDI Líquido Estimado:</span>
                    <span className="font-bold text-purple-300">+R$ {m.netCdiBenchmarkReais.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-emerald-500/15 border border-emerald-500/30">
                    <span className="text-emerald-300 font-bold">Alpha Líquido Real:</span>
                    <span className="font-bold text-emerald-300">+R$ {m.netAlphaReais.toFixed(2)}</span>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 italic mt-2">
                  * Aviso Legal: O valor líquido é uma estimativa marginal. A apuração oficial do imposto de renda de bolsa é mensal e consolida compensação de prejuízos acumulados, custos operacionais e retenção de IRRF.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer com Botões de Ação */}
        <div className="p-4 border-t border-slate-800 bg-[#0b101c] flex items-center justify-end gap-3">
          {position.status === 'OPEN' && (
            <>
              <button
                onClick={() => onOpenRollModal(position)}
                className="py-2.5 px-4 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 font-bold transition-all text-xs"
              >
                🔄 Simular Rolagem
              </button>
              <button
                onClick={() => onQuickClose(position)}
                className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all text-xs shadow-lg active:scale-95"
              >
                💰 {isShort ? 'Recomprar Posição' : 'Encerrar Operação'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
