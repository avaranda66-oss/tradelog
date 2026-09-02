'use client';

import React, { useEffect, useState } from 'react';
import { getStrategyManeuverHistoryAction, type ManeuverHistoryDTO } from '../actions';

interface StrategyManeuverHistorySectionProps {
  strategyId: string;
  refreshTrigger?: number;
}

export function StrategyManeuverHistorySection({
  strategyId,
  refreshTrigger = 0,
}: StrategyManeuverHistorySectionProps) {
  const [history, setHistory] = useState<ManeuverHistoryDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadHistory() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getStrategyManeuverHistoryAction(strategyId);
        if (!isMounted) return;
        if (res.success && res.history) {
          setHistory(res.history);
        } else {
          setError(res.error || 'Não foi possível carregar o histórico de manejos.');
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || 'Erro ao carregar histórico.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadHistory();
    return () => {
      isMounted = false;
    };
  }, [strategyId, refreshTrigger]);

  if (isLoading) {
    return (
      <div className="p-4 rounded-xl bg-[#0a0f1d] border border-slate-800 text-center text-slate-400 text-xs">
        <div className="inline-block animate-spin mr-2">⏳</div> Carregando histórico de manejos...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
        {error}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-[#0a0f1d]/50 border border-slate-800/80 text-center text-slate-500 text-xs italic">
        Nenhum evento de manejo registrado para esta estrutura.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5">
          <span>📜</span>
          <span>Histórico Canônico de Manejos ({history.length})</span>
        </div>
        <span className="text-[10px] text-slate-500">Ordenado pelo mais recente</span>
      </div>

      <div className="space-y-2.5">
        {history.map((item) => {
          const isScaleDown = item.maneuverType === 'SCALE_DOWN';
          const isProfit = item.netRealizedPnlReais >= 0;

          return (
            <div
              key={item.maneuverEventId}
              className="p-3.5 rounded-xl bg-[#080d1a] border border-slate-800 hover:border-slate-700/80 transition-all text-xs space-y-2.5"
            >
              {/* Header do Card de Manejo */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      isScaleDown
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                    }`}
                  >
                    {isScaleDown ? `SCALE_DOWN (-${item.percentageReduced}%)` : 'LEG_CLOSE'}
                  </span>

                  <span className="text-slate-400 font-mono text-[11px]">
                    {item.executionDate}
                  </span>

                  {item.createdAt && (
                    <span className="text-slate-600 text-[10px]">
                      {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {/* Resumo Financeiro do Evento */}
                <div className="flex items-center gap-3">
                  {item.auditCapitalReleasedReais !== null && item.auditCapitalReleasedReais !== undefined && (
                    <div className="text-right">
                      <span className="text-[9px] uppercase text-slate-500 block">Cap. Liberado</span>
                      <span className="text-slate-300 font-bold font-mono">
                        R$ {item.auditCapitalReleasedReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  <div className="text-right">
                    <span className="text-[9px] uppercase text-slate-500 block">P&L Realizado</span>
                    <span className={`font-bold font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isProfit ? '+' : ''}R$ {item.netRealizedPnlReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Informações de Ratio e Auditoria */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span>Proporção:</span>
                  <span className="text-slate-300 font-mono">{item.auditRatioBefore || 'N/A'}</span>
                  <span>➔</span>
                  <span className="text-amber-300 font-mono font-bold">{item.auditRatioAfter || 'N/A'}</span>
                  {item.preservesOriginalRatio && (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 text-[10px] font-bold border border-emerald-500/20">
                      ✓ Proporção preservada
                    </span>
                  )}
                </div>

                {item.unitsReduced !== null && item.unitsReduced !== undefined && (
                  <div className="text-slate-400 text-[10px]">
                    Unidades base reduzidas: <strong className="text-slate-200">{item.unitsReduced}</strong>
                  </div>
                )}
              </div>

              {/* Tabela de Execuções Atômicas */}
              <div className="overflow-x-auto rounded-lg border border-slate-800/80 bg-[#050811]">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-[9px] uppercase">
                      <th className="py-1.5 px-2.5">Ativo</th>
                      <th className="py-1.5 px-2">Ação</th>
                      <th className="py-1.5 px-2 text-right">Qtd</th>
                      <th className="py-1.5 px-2 text-right">Preço</th>
                      <th className="py-1.5 px-2 text-right">Custos</th>
                      <th className="py-1.5 px-2.5 text-right">P&L Líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 font-mono">
                    {item.executions.map((exec) => {
                      const execProfit = exec.netRealizedPnlReais >= 0;
                      return (
                        <tr key={exec.executionId} className="hover:bg-slate-800/20">
                          <td className="py-1.5 px-2.5 font-sans font-bold text-slate-200">
                            {exec.ticker}
                          </td>
                          <td className="py-1.5 px-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-sans font-bold ${
                                exec.executionType === 'BUY_TO_CLOSE'
                                  ? 'bg-sky-500/10 text-sky-300'
                                  : 'bg-amber-500/10 text-amber-300'
                              }`}
                            >
                              {exec.executionType}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-300">
                            {exec.quantity.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-300">
                            R$ {exec.price.toFixed(2)}
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-400">
                            R$ {exec.feesReais.toFixed(2)}
                          </td>
                          <td className={`py-1.5 px-2.5 text-right font-bold ${execProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {execProfit ? '+' : ''}R$ {exec.netRealizedPnlReais.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
