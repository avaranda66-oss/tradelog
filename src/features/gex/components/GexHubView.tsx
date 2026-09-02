'use client';

import { useState, useEffect } from 'react';
import type { GexRun, GexLevel, GexBacktestResult } from '@/lib/db/schema';

import type { B3FilesStatus, GexExecutionResult, TickBacktestRunEvaluation } from '../actions';
import { GexExecutionForm } from './GexExecutionForm';
import { GexResultsPanel } from './GexResultsPanel';
import { GexHistoryTable } from './GexHistoryTable';
import { GexBacktestHub } from './GexBacktestHub';
import { getGexRunDetails, getGexRunsHistory, getGexBacktestComparison } from '../actions';
import { IconTarget, IconTerminal, IconJournal } from '@/components/ui/icons';


interface GexHubViewProps {
  targetDate?: string;
  b3Status: B3FilesStatus;
  initialRuns: GexRun[];
  initialLatestRun: {
    run: GexRun | null;
    levels: GexLevel[];
    backtest: GexBacktestResult | null;
  };
  backtestComparison: {
    versionStats: Array<{
      version: string;
      label: string;
      totalRuns: number;
      avgScore: number;
      avgCwHoldingRate: number;
      avgPwHoldingRate: number;
      avgWinRate: number;
      firstTouchSuccessRate: number;
      naMoscaCount: number;
      maxBouncePts: number;
    }>;
    recentResults: any[];
  };
  initialTickEvaluations?: TickBacktestRunEvaluation[];
}

export function GexHubView({
  targetDate = '2026-08-20',
  b3Status,
  initialRuns,
  initialLatestRun,
  backtestComparison,
  initialTickEvaluations = [],
}: GexHubViewProps) {
  const [activeTab, setActiveTab] = useState<'execucao' | 'historico' | 'backtest'>('execucao');
  const [runs, setRuns] = useState<GexRun[]>(initialRuns);
  const [activeRunData, setActiveRunData] = useState<{
    run: GexRun | null;
    levels: GexLevel[];
    ntslCode: string;
  }>({
    run: initialLatestRun.run,
    levels: initialLatestRun.levels,
    ntslCode: initialLatestRun.run?.ntslCode || '',
  });

  // Sincroniza automaticamente a execução ativa ao mudar a data no topo
  useEffect(() => {
    const runsForDate = runs.filter((r) => r.date === targetDate);
    if (runsForDate.length > 0) {
      getGexRunDetails(runsForDate[0].id).then((details) => {
        if (details.run) {
          setActiveRunData({
            run: details.run,
            levels: details.levels,
            ntslCode: details.ntslCode || details.run.ntslCode || '',
          });
        }
      });
    } else {
      setActiveRunData({ run: null, levels: [], ntslCode: '' });
    }
  }, [targetDate, runs]);


  const handleExecutionComplete = (result: GexExecutionResult | GexExecutionResult[]) => {
    if (Array.isArray(result)) {
      if (result.length > 0) {
        setActiveRunData({
          run: result[0].run,
          levels: result[0].levels,
          ntslCode: result[0].ntslCode,
        });
        const newRuns = result.map((r) => r.run);
        setRuns((prev) => [
          ...newRuns,
          ...prev.filter((p) => !newRuns.some((nr) => nr.id === p.id)),
        ]);
      }
    } else {
      setActiveRunData({
        run: result.run,
        levels: result.levels,
        ntslCode: result.ntslCode,
      });
      setRuns((prev) => [result.run, ...prev.filter((r) => r.id !== result.run.id)]);
    }
  };


  const handleSelectRun = async (runId: string) => {
    const details = await getGexRunDetails(runId);
    if (details.run) {
      setActiveRunData({
        run: details.run,
        levels: details.levels,
        ntslCode: details.ntslCode || details.run.ntslCode || '',
      });
      setActiveTab('execucao');
    }
  };


  const [comparisonState, setComparisonState] = useState(backtestComparison);

  const handleRefresh = async () => {
    try {
      const updatedRuns = await getGexRunsHistory(30);
      setRuns(updatedRuns);
      const updatedComparison = await getGexBacktestComparison();
      setComparisonState(updatedComparison);
    } catch (err) {
      console.error('Erro ao atualizar histórico de GEX:', err);
    }
  };


  return (
    <div className="space-y-6">
      {/* Header Principal do Módulo */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <IconTarget className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-mono tracking-tight text-slate-100 uppercase">
                GEX QUANT & REGIÕES DO PREGÃO
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                Cálculo automatizado de Gamma Exposure, exportação NTSL para o Profit Pro e validação por backtest.
              </p>
            </div>
          </div>
        </div>

        {/* Abas de Navegação */}
        <div className="flex items-center gap-1 bg-[#0b1018] border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('execucao')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 ${
              activeTab === 'execucao'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 shadow'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>⚡</span>
            <span>EXECUTAR & NTSL</span>
          </button>
          <button
            onClick={() => setActiveTab('historico')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 ${
              activeTab === 'historico'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 shadow'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>📚</span>
            <span>BIBLIOTECA ({runs.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('backtest')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 ${
              activeTab === 'backtest'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 shadow'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>🧪</span>
            <span>BACKTEST & EFICÁCIA</span>
          </button>
        </div>
      </div>

      {/* ABA 1: EXECUÇÃO & PAINEL DE RESULTADOS */}
      {activeTab === 'execucao' && (
        <div className="space-y-6">
          <GexExecutionForm
            targetDate={targetDate}
            b3Status={b3Status}
            onExecutionComplete={handleExecutionComplete}
          />


          {activeRunData.run && (
            <div className="pt-2 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <span>📊 RESULTADO DO CÁLCULO GEX</span>
                  <span className="text-[10px] text-teal-400 font-normal">
                    (Salvo automaticamente no SQLite e no Diário de Trades)
                  </span>
                </h3>

                {/* Seletor rápido entre execuções do dia */}
                {runs.filter((r) => r.date === activeRunData.run?.date).length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 bg-[#070a12] p-1 rounded-lg border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-500 px-1.5">VISUALIZAR:</span>
                    {runs
                      .filter((r) => r.date === activeRunData.run?.date)
                      .map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleSelectRun(r.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-all flex items-center gap-1.5 border ${
                            activeRunData.run?.id === r.id
                              ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-sm'
                              : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/60'
                          }`}
                        >
                          <span>{r.asset === 'WINFUT' ? '🎯' : '🏛️'}</span>
                          <span>{r.asset} ({r.scriptName})</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <GexResultsPanel
                run={activeRunData.run}
                levels={activeRunData.levels}
                ntslCode={activeRunData.ntslCode}
              />
            </div>
          )}

        </div>
      )}

      {/* ABA 2: BIBLIOTECA & HISTÓRICO */}
      {activeTab === 'historico' && (
        <GexHistoryTable
          runs={runs}
          onSelectRun={handleSelectRun}
          onRefresh={handleRefresh}
        />
      )}

      {/* ABA 3: BACKTEST & EFICÁCIA */}
      {activeTab === 'backtest' && (
        <GexBacktestHub
          runs={runs}
          versionStats={comparisonState.versionStats}
          recentResults={comparisonState.recentResults}
          initialTickEvaluations={initialTickEvaluations}
          onRefresh={handleRefresh}
        />
      )}

    </div>
  );
}
