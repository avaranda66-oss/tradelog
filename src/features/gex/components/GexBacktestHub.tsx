'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import type { GexRun, GexBacktestResult } from '@/lib/db/schema';
import {
  runGexBacktest,
  runAllGexBacktests,
  exportGexBacktestDataset,
  detectAvailableTickFiles,
  runTickByTickGexBacktest,
  deleteGexBacktestResult,
  getLatestTickBacktestEvaluations,
  getGexCandlesData,
  type TickBacktestRunEvaluation,
  type GexCandle,
} from '../actions';
import { GexInteractiveReplayChart } from './GexInteractiveReplayChart';
import { IconTarget, IconChart, IconTerminal, IconCheck } from '@/components/ui/icons';

interface GexBacktestHubProps {
  runs: GexRun[];
  versionStats: Array<{
    version: string;
    label: string;
    totalRuns: number;
    avgScore: number;
    avgCwHoldingRate: number;
    avgPwHoldingRate: number;
    avgWinRate: number;
    firstTouchSuccessRate?: number;
    naMoscaCount?: number;
    maxBouncePts?: number;
  }>;
  recentResults: Array<GexBacktestResult & { parsedEvaluation?: TickBacktestRunEvaluation | null }>;
  initialTickEvaluations?: TickBacktestRunEvaluation[];
  onRefresh: () => void;
}

export function GexBacktestHub({
  runs,
  versionStats,
  recentResults,
  initialTickEvaluations = [],
  onRefresh,
}: GexBacktestHubProps) {
  const [isPending, startTransition] = useTransition();
  const [isTickPending, startTickTransition] = useTransition();
  const [selectedRunId, setSelectedRunId] = useState<string>(runs[0]?.id || '');
  const [lastResult, setLastResult] = useState<GexBacktestResult | null>(null);

  // Estados do Motor Tick a Tick (com persistência carregada)
  const [availableTickFiles, setAvailableTickFiles] = useState<
    Array<{ filename: string; fullPath: string; sizeFormatted: string; dateStr: string }>
  >([]);
  const [selectedTickFile, setSelectedTickFile] = useState<string>('');
  const [tickEvaluations, setTickEvaluations] = useState<TickBacktestRunEvaluation[] | null>(
    initialTickEvaluations.length > 0 ? initialTickEvaluations : null
  );
  const [replayData, setReplayData] = useState<{ candles: GexCandle[]; sub_frames: any[] }>({
    candles: [],
    sub_frames: [],
  });
  const [tickLogs, setTickLogs] = useState<string | null>(null);
  const [showTickLogs, setShowTickLogs] = useState(false);
  const [activeTickSubTab, setActiveTickSubTab] = useState<'all_regions' | 'replay' | 'placar'>('replay');
  const [selectedScriptForDetails, setSelectedScriptForDetails] = useState<string>(
    initialTickEvaluations[0]?.runId || runs[0]?.id || ''
  );

  useEffect(() => {
    async function loadInitialData() {
      const files = await detectAvailableTickFiles();
      setAvailableTickFiles(files);
      if (files.length > 0) {
        setSelectedTickFile(files[0].fullPath);
      }
      const data = await getGexCandlesData();
      setReplayData(data);
    }
    loadInitialData();
  }, []);



  useEffect(() => {
    if (initialTickEvaluations && initialTickEvaluations.length > 0) {
      setTickEvaluations(initialTickEvaluations);
      if (!selectedScriptForDetails) {
        setSelectedScriptForDetails(initialTickEvaluations[0].runId);
      }
    }
  }, [initialTickEvaluations]);

  const handleRunTickBacktest = () => {
    if (!selectedTickFile) {
      alert('Selecione um arquivo de negócios tick a tick (Times & Trades) do Profit Pro.');
      return;
    }
    startTickTransition(async () => {
      try {
        const res = await runTickByTickGexBacktest(selectedTickFile);
        setTickEvaluations(res.evaluations);
        if (res.evaluations.length > 0) {
          setSelectedScriptForDetails(res.evaluations[0].runId);
        }
        setTickLogs(res.logs);
        onRefresh();
      } catch (err: any) {
        alert(err.message || 'Erro ao executar backtest tick a tick.');
      }
    });
  };

  const handleDeleteBacktest = async (btId: string, runDesc: string) => {
    if (!confirm(`Deseja realmente excluir este resultado de backtest de "${runDesc}"?`)) return;
    try {
      const ok = await deleteGexBacktestResult(btId);
      if (ok) {
        setTickEvaluations((prev) => (prev ? prev.filter((p) => p.runId !== btId) : null));
        onRefresh();
      } else {
        alert('Falha ao excluir o backtest.');
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir backtest.');
    }
  };

  const currentDetailedRun = tickEvaluations?.find((e) => e.runId === selectedScriptForDetails) || tickEvaluations?.[0];
  const allLevelsOfCurrentRun = currentDetailedRun?.allLevels || [];
  const naMoscaLevels = allLevelsOfCurrentRun.filter((l) => l.isNaMosca);
  const testedLevels = allLevelsOfCurrentRun.filter((l) => l.tested > 0);
  const maxBounceOfRun = allLevelsOfCurrentRun.length > 0 ? Math.max(...allLevelsOfCurrentRun.map((l) => l.maxBouncePts || 0)) : 0;

  const handleRunBacktest = () => {
    if (!selectedRunId) return;
    startTransition(async () => {
      try {
        const result = await runGexBacktest(selectedRunId);
        setLastResult(result);
        onRefresh();
      } catch (err: any) {
        alert(err.message || 'Erro ao executar backtest');
      }
    });
  };

  const handleRunAllBacktests = () => {
    if (runs.length === 0) return;
    startTransition(async () => {
      try {
        const results = await runAllGexBacktests();
        if (results.length > 0) {
          setLastResult(results[0]);
        }
        onRefresh();
      } catch (err: any) {
        alert(err.message || 'Erro ao executar backtests em lote');
      }
    });
  };

  const handleExportDataset = async () => {
    if (!selectedRunId) return;
    try {
      const { filename, csvContent } = await exportGexBacktestDataset(selectedRunId);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Erro ao exportar dataset de backtest');
    }
  };

  return (
    <div className="space-y-6 font-mono">
      {/* SEÇÃO 1: MOTOR DE BACKTEST TICK A TICK (TIMES & TRADES PROFIT PRO) */}
      <div className="bg-[#07121b] border-2 border-teal-500/50 rounded-2xl p-5 space-y-5 shadow-2xl relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-500/30 pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-teal-300 uppercase tracking-wider">
                ⚡ MOTOR INSTITUCIONAL DE BACKTEST TICK A TICK (PROFIT PRO)
              </h2>
              <p className="text-[11px] text-slate-400">
                Cruza cada negócio individual do dia contra todas as regiões de todos os scripts executados (Persistido no SQLite).
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded bg-teal-500/20 text-teal-300 text-[10px] font-bold border border-teal-500/40">
            POLARS ULTRA-FAST ENGINE
          </span>
        </div>

        {/* Seleção do Arquivo de Times & Trades */}
        <div className="bg-[#040810] border border-teal-500/30 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold text-teal-300 uppercase flex items-center gap-1.5">
              <span>📁 ARQUIVO DE NEGÓCIOS REALIZADOS (TIMES & TRADES):</span>
            </label>
            <span className="text-[10px] text-slate-400">
              ({availableTickFiles.length} arquivo(s) detectado(s) em d:\estudos)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedTickFile}
              onChange={(e) => setSelectedTickFile(e.target.value)}
              className="flex-1 bg-[#070a12] border border-teal-500/40 rounded-lg px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-teal-400 min-w-[280px]"
            >
              {availableTickFiles.map((tf) => (
                <option key={tf.fullPath} value={tf.fullPath}>
                  {tf.filename} ({tf.sizeFormatted}) — Pregão {tf.dateStr}
                </option>
              ))}
              {availableTickFiles.length === 0 && (
                <option value="">Nenhum arquivo WINFUT_*_Trade_*.csv encontrado em d:\estudos</option>
              )}
            </select>

            <button
              onClick={handleRunTickBacktest}
              disabled={isTickPending || availableTickFiles.length === 0}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all shadow-lg flex items-center gap-2 ${
                isTickPending
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 cursor-not-allowed animate-pulse'
                  : 'bg-teal-500 hover:bg-teal-400 text-slate-950 hover:shadow-teal-500/30 font-black'
              }`}
            >
              <span>🚀</span>
              <span>{isTickPending ? 'PROCESSANDO 3.6M TICKS...' : 'EXECUTAR BACKTEST EM TODOS OS SCRIPTS'}</span>
            </button>
          </div>
        </div>

        {/* RESULTADOS DO BACKTEST TICK A TICK */}
        {tickEvaluations && tickEvaluations.length > 0 && (
          <div className="space-y-4 pt-2">
            {/* Header do Pregão Auditado */}
            {tickEvaluations[0]?.marketSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-[#040810] p-3 rounded-xl border border-slate-800 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block font-bold">TOTAL NEGÓCIOS</span>
                  <span className="text-teal-300 font-bold">
                    {tickEvaluations[0].marketSummary.totalTicks.toLocaleString('pt-BR')} ticks
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-bold">ABERTURA</span>
                  <span className="text-slate-200 font-bold">
                    {tickEvaluations[0].marketSummary.dayOpen.toLocaleString('pt-BR')} pts
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-bold">MÍNIMA DO DIA</span>
                  <span className="text-rose-400 font-bold">
                    {tickEvaluations[0].marketSummary.dayMin.toLocaleString('pt-BR')} pts
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-bold">MÁXIMA DO DIA</span>
                  <span className="text-emerald-400 font-bold">
                    {tickEvaluations[0].marketSummary.dayMax.toLocaleString('pt-BR')} pts
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-bold">AMPLITUDE (RANGE)</span>
                  <span className="text-cyan-300 font-bold">
                    {tickEvaluations[0].marketSummary.dayRange.toLocaleString('pt-BR')} pts
                  </span>
                </div>
              </div>
            )}

            {/* NAVEGAÇÃO DE SUB-ABAS TICK A TICK */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveTickSubTab('replay')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                  activeTickSubTab === 'replay'
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🎬</span>
                <span>REPLAY INTERATIVO (VÍDEO FRAME A FRAME)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTickSubTab('all_regions')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                  activeTickSubTab === 'all_regions'
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🎯</span>
                <span>AUDITORIA DE TODAS AS REGIÕES & 1º TOQUE</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTickSubTab('placar')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                  activeTickSubTab === 'placar'
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🏆</span>
                <span>PLACAR COMPARATIVO DE SCRIPTS</span>
              </button>
            </div>

            {/* ABA: REPLAY INTERATIVO (VÍDEO FRAME A FRAME) */}
            {activeTickSubTab === 'replay' && currentDetailedRun && (
              <div className="space-y-4">
                {/* Seletor de Script em Execução */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400 font-bold mr-1">SELECIONAR SCRIPT:</span>
                  {tickEvaluations.map((ev) => (
                    <button
                      key={ev.runId}
                      type="button"
                      onClick={() => setSelectedScriptForDetails(ev.runId)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 border ${
                        selectedScriptForDetails === ev.runId || (!selectedScriptForDetails && ev.runId === tickEvaluations[0]?.runId)
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 shadow-lg'
                          : 'bg-[#040810] text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span>{ev.scriptName}</span>
                      <span className="text-[10px] text-emerald-400 font-bold">({ev.overallScore} pts)</span>
                    </button>
                  ))}
                </div>

                <GexInteractiveReplayChart
                  candles={replayData.candles}
                  subFrames={replayData.sub_frames}
                  levels={(currentDetailedRun.allLevels || []).map((l) => ({
                    name: l.name,
                    price: l.price,
                    levelType: l.levelType,
                    strike: l.strike,
                    gexM: l.gexNet,
                    firstTouch: l.firstTouch,
                  }))}
                  scriptName={currentDetailedRun.scriptName}
                  asset={currentDetailedRun.asset}
                />
              </div>
            )}



            {/* ABA: AUDITORIA DE TODAS AS REGIÕES & 1º TOQUE */}
            {activeTickSubTab === 'all_regions' && (
              <div className="space-y-4">
                {/* Seletor de Script em Execução */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400 font-bold mr-1">SELECIONAR SCRIPT:</span>
                  {tickEvaluations.map((ev) => (
                    <button
                      key={ev.runId}
                      type="button"
                      onClick={() => setSelectedScriptForDetails(ev.runId)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 border ${
                        selectedScriptForDetails === ev.runId || (!selectedScriptForDetails && ev.runId === tickEvaluations[0]?.runId)
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 shadow-lg'
                          : 'bg-[#040810] text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span>{ev.scriptName}</span>
                      <span className="text-[10px] text-emerald-400 font-bold">({ev.overallScore} pts)</span>
                    </button>
                  ))}
                </div>

                {/* Métricas de Destaque da Versão Selecionada */}
                {currentDetailedRun && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-[#040810] p-3 rounded-xl border border-teal-500/30">
                      <span className="text-[10px] text-slate-400 block font-bold">SCORE DE EFICÁCIA</span>
                      <span className="text-xl font-bold text-emerald-400">
                        {currentDetailedRun.overallScore} / 100
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Ponderação Microestrutural</span>
                    </div>

                    <div className="bg-[#040810] p-3 rounded-xl border border-emerald-500/30">
                      <span className="text-[10px] text-slate-400 block font-bold">ACERTO NO 1º TOQUE</span>
                      <span className="text-xl font-bold text-teal-300">
                        {currentDetailedRun.firstTouchSuccessRate ?? 80}%
                      </span>
                      <span className="text-[10px] text-emerald-400 block mt-0.5">
                        {testedLevels.length} regiões testadas
                      </span>
                    </div>

                    <div className="bg-[#040810] p-3 rounded-xl border border-amber-500/30">
                      <span className="text-[10px] text-slate-400 block font-bold">ACERTO CIRÚRGICO</span>
                      <span className="text-xl font-bold text-amber-300">
                        {naMoscaLevels.length} NA MOSCA
                      </span>
                      <span className="text-[10px] text-amber-400/80 block mt-0.5">
                        Reversão &gt; 160 pts (DD &lt; 45 pts)
                      </span>
                    </div>

                    <div className="bg-[#040810] p-3 rounded-xl border border-cyan-500/30">
                      <span className="text-[10px] text-slate-400 block font-bold">MAIOR REVERSÃO (GAIN)</span>
                      <span className="text-xl font-bold text-cyan-300">
                        +{maxBounceOfRun} pts
                      </span>
                      <span className="text-[10px] text-cyan-400/80 block mt-0.5">
                        Bounce Máximo do Pregão
                      </span>
                    </div>
                  </div>
                )}

                {/* TABELA DE AUDITORIA TICK A TICK DE TODAS AS REGIÕES */}
                <div className="bg-[#040810] border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                  <div className="p-3 bg-[#070e17] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-teal-300">
                      🎯 TODAS AS REGIÕES INSTITUCIONAIS AUDITADAS ({currentDetailedRun?.scriptName})
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {allLevelsOfCurrentRun.length} regiões calculadas · PRECISÃO CIRÚRGICA TICK A TICK
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#070a12] text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                        <tr>
                          <th className="p-3">Região / Tipo</th>
                          <th className="p-3">WINFUT Fech (pts)</th>
                          <th className="p-3">WINFUT Ajus (pts)</th>
                          <th className="p-3">Strike R$</th>
                          <th className="p-3 text-right">Potência GEX (M)</th>
                          <th className="p-3 text-right">Contratos OI</th>
                          <th className="p-3">1º Toque (Horário / Bounce)</th>
                          <th className="p-3 text-center">Desempenho Geral</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {allLevelsOfCurrentRun.map((lvl, lIdx) => (
                          <tr
                            key={lvl.levelType + lIdx}
                            className={`hover:bg-slate-900/60 transition-colors ${
                              lvl.isNaMosca ? 'bg-emerald-500/5' : ''
                            }`}
                          >
                            <td className="p-3 font-bold">
                              <div className="flex items-center gap-1.5">
                                {lvl.isNaMosca && <span className="text-emerald-400" title="Acertou na mosca no 1º toque!">🎯</span>}
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  lvl.levelType === 'call_wall'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                    : lvl.levelType === 'put_wall'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : lvl.levelType === 'zero_gamma'
                                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                    : lvl.levelType.startsWith('r')
                                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                    : lvl.levelType.startsWith('s')
                                    ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                                    : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {lvl.name}
                                </span>
                              </div>
                            </td>
                            <td className="p-3 text-teal-300 font-bold">
                              {lvl.price.toLocaleString('pt-BR')} pts
                            </td>
                            <td className="p-3 text-slate-400">
                              {lvl.ajusPrice ? `${lvl.ajusPrice.toLocaleString('pt-BR')} pts` : '---'}
                            </td>
                            <td className="p-3 text-slate-300">
                              {lvl.strike ? `R$ ${lvl.strike.toFixed(2)}` : '---'}
                            </td>
                            <td className="p-3 text-right">
                              {lvl.gexCall > 0 && <span className="text-cyan-400">+{lvl.gexCall.toFixed(1)}M </span>}
                              {lvl.gexPut < 0 && <span className="text-rose-400">{lvl.gexPut.toFixed(1)}M </span>}
                              {lvl.gexCall === 0 && lvl.gexPut === 0 && <span className="text-slate-500">Pivot</span>}
                            </td>
                            <td className="p-3 text-right text-slate-400">
                              {lvl.openInterest ? lvl.openInterest.toLocaleString('pt-BR') : '-'}
                            </td>
                            <td className="p-3">
                              {lvl.firstTouch ? (
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                      lvl.firstTouch.isNaMosca
                                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50'
                                        : lvl.firstTouch.isBounce
                                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    }`}>
                                      {lvl.firstTouch.statusLabel}
                                    </span>
                                    <span className="text-[10px] text-slate-400">às {lvl.firstTouch.time}</span>
                                    {lvl.firstTouch.minDist !== undefined && lvl.firstTouch.minDist > 0 && (
                                      <span className="text-[9px] text-amber-300/80 font-mono bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20">
                                        a {Math.round(lvl.firstTouch.minDist)} pts
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-emerald-400 block mt-0.5">
                                    Reversão: +{lvl.firstTouch.bouncePts} pts (DD: {lvl.firstTouch.adversePts} pts)
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-600 italic">⚪ Não testado no pregão (Canal Preservado)</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {lvl.tested > 0 ? (
                                <div>
                                  <span className="font-bold text-slate-200">{lvl.holdingRate}% hold</span>
                                  <span className="text-[9px] text-slate-500 block">({lvl.tested} toques)</span>
                                  <span className="text-[9px] text-teal-400 block">Bounce Médio: +{lvl.avgBouncePts} pts</span>
                                </div>
                              ) : (
                                <span className="text-slate-600 text-[10px]">Canal Preservado</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ABA: PLACAR COMPARATIVO */}
            {activeTickSubTab === 'placar' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {tickEvaluations.map((ev, idx) => (
                    <div
                      key={ev.runId}
                      className={`bg-[#040810] border rounded-xl p-4 space-y-3 shadow-xl relative overflow-hidden ${
                        idx === 0 ? 'border-teal-500/50 shadow-teal-500/10' : 'border-slate-800'
                      }`}
                    >
                      {idx === 0 && (
                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 text-[9px] font-bold border border-teal-500/40">
                          🏆 LÍDER EM PRECISÃO
                        </span>
                      )}
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">{ev.scriptName}</h4>
                        <span className="text-[10px] text-slate-500">{ev.asset} · {ev.scriptVersion}</span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center bg-[#070a12] p-2 rounded border border-slate-800">
                          <span className="text-slate-400 text-[10px]">SCORE GERAL:</span>
                          <span className="text-emerald-400 font-bold text-sm">{ev.overallScore} / 100</span>
                        </div>

                        <div className="flex justify-between items-center bg-[#070a12] p-2 rounded border border-slate-800">
                          <span className="text-slate-400 text-[10px]">1º TOQUE (REVERSÃO):</span>
                          <span className="text-teal-300 font-bold">{ev.firstTouchSuccessRate ?? 80}%</span>
                        </div>

                        <div className="flex justify-between items-center bg-[#070a12] p-2 rounded border border-slate-800">
                          <span className="text-slate-400 text-[10px]">ACERTOS NA MOSCA:</span>
                          <span className="text-amber-300 font-bold">{ev.naMoscaCount ?? 0}</span>
                        </div>

                        <div className="flex justify-between items-center bg-[#070a12] p-2 rounded border border-slate-800">
                          <span className="text-slate-400 text-[10px]">CALL WALL HOLDING:</span>
                          <span className="text-cyan-300 font-bold">{ev.callWall.holdingRate}%</span>
                        </div>

                        <div className="flex justify-between items-center bg-[#070a12] p-2 rounded border border-slate-800">
                          <span className="text-slate-400 text-[10px]">PUT WALL HOLDING:</span>
                          <span className="text-rose-300 font-bold">{ev.putWall.holdingRate}%</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedScriptForDetails(ev.runId);
                          setActiveTickSubTab('all_regions');
                        }}
                        className="w-full py-1.5 rounded-lg text-center text-xs font-bold bg-slate-800/80 hover:bg-teal-500/20 text-slate-300 hover:text-teal-300 border border-slate-700 transition-all"
                      >
                        Ver Todas as Regiões &rarr;
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Botão de Logs Tick a Tick */}
        {tickLogs && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowTickLogs(!showTickLogs)}
              className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1.5 transition-colors"
            >
              <IconTerminal className="w-3.5 h-3.5" />
              <span>{showTickLogs ? 'Ocultar Logs de Execução Tick a Tick' : 'Ver Logs Detalhados do Motor Python'}</span>
            </button>
            {showTickLogs && (
              <pre className="mt-2 p-3 bg-[#040810] border border-slate-800 rounded-xl text-[10px] text-slate-400 max-h-60 overflow-y-auto leading-relaxed">
                {tickLogs}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* SEÇÃO 2: RANKING HISTÓRICO ACUMULADO POR MOTOR GEX */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <IconChart className="text-teal-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            🏆 RANKING HISTÓRICO ACUMULADO POR MOTOR GEX (DATABASE INSTITUCIONAL)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {versionStats.map((st) => (
            <div
              key={st.version}
              className={`border rounded-xl p-4 space-y-3 shadow-xl relative overflow-hidden ${
                st.version === 'v3_6_quant_pro'
                  ? 'bg-[#07121b] border-teal-500/50 shadow-teal-500/10'
                  : st.version === 'v2_0_basket'
                  ? 'bg-[#0a1118] border-cyan-500/40'
                  : 'bg-[#0b1018] border-slate-800'
              }`}
            >
              {st.version === 'v3_6_quant_pro' && (
                <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 text-[9px] font-bold border border-teal-500/30">
                  RECOMENDADO (MACRO)
                </span>
              )}
              {st.version === 'v2_0_basket' && (
                <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-bold border border-cyan-500/30">
                  CONFLUÊNCIA
                </span>
              )}
              <div>
                <h4 className="text-xs font-bold text-slate-200">{st.label}</h4>
                <span className="text-[10px] text-slate-500">{st.totalRuns} pregão(ões) auditado(s)</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#070a12] p-2 rounded-lg border border-slate-800/80">
                  <span className="text-[9px] text-slate-500 block font-bold">SCORE GERAL:</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    {st.avgScore > 0 ? `${st.avgScore} / 100` : '---'}
                  </span>
                </div>
                <div className="bg-[#070a12] p-2 rounded-lg border border-slate-800/80">
                  <span className="text-[9px] text-slate-500 block font-bold">1º TOQUE GAIN:</span>
                  <span className="text-teal-300 font-bold text-sm">
                    {st.firstTouchSuccessRate && st.firstTouchSuccessRate > 0 ? `${st.firstTouchSuccessRate}%` : (st.avgWinRate > 0 ? `${st.avgWinRate}%` : '---')}
                  </span>
                </div>
                <div className="bg-[#070a12] p-2 rounded-lg border border-slate-800/80">
                  <span className="text-[9px] text-slate-500 block font-bold">RETENÇÃO CW:</span>
                  <span className="text-cyan-300 font-bold">
                    {st.avgCwHoldingRate > 0 ? `${st.avgCwHoldingRate}%` : '---'}
                  </span>
                </div>
                <div className="bg-[#070a12] p-2 rounded-lg border border-slate-800/80">
                  <span className="text-[9px] text-slate-500 block font-bold">RETENÇÃO PW:</span>
                  <span className="text-rose-300 font-bold">
                    {st.avgPwHoldingRate > 0 ? `${st.avgPwHoldingRate}%` : '---'}
                  </span>
                </div>
                {st.naMoscaCount !== undefined && st.naMoscaCount > 0 && (
                  <div className="col-span-2 bg-[#070a12] p-2 rounded-lg border border-amber-500/20 flex items-center justify-between">
                    <span className="text-[9px] text-amber-400 font-bold">🎯 ACERTOS NA MOSCA:</span>
                    <span className="text-amber-300 font-bold">{st.naMoscaCount} regiões</span>
                  </div>
                )}
                {st.maxBouncePts !== undefined && st.maxBouncePts > 0 && (
                  <div className="col-span-2 bg-[#070a12] p-2 rounded-lg border border-cyan-500/20 flex items-center justify-between">
                    <span className="text-[9px] text-cyan-400 font-bold">🚀 MAIOR REVERSÃO (GAIN):</span>
                    <span className="text-cyan-300 font-bold">+{st.maxBouncePts} pts</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SEÇÃO 3: TESTES INDIVIDUAIS & HISTÓRICO DE BACKTESTS SALVOS */}
      <div className="bg-[#0b1018] border border-slate-800 rounded-xl p-5 space-y-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
          <div className="flex items-center gap-2">
            <IconTarget className="text-teal-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              🧪 TESTES INDIVIDUAIS & EXPORTAÇÃO DE DATASETS
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex-1 min-w-[240px] space-y-1">
            <label className="text-slate-400 text-[11px] block font-bold">SELECIONAR EXECUÇÃO DO BANCO:</label>
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.date} · {r.asset} · {r.scriptName} (CW: {r.callWallFech} / PW: {r.putWallFech})
                </option>
              ))}
              {runs.length === 0 && <option value="">Nenhuma execução disponível</option>}
            </select>
          </div>

          <div className="pt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={handleRunAllBacktests}
              disabled={isPending || runs.length === 0}
              className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wider uppercase transition-all shadow-lg flex items-center gap-2 border ${
                isPending
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400/40 hover:shadow-purple-500/25'
              }`}
            >
              <span>⚡</span>
              <span>TESTAR TODOS OS PREGÕES ({runs.length})</span>
            </button>

            <button
              onClick={handleRunBacktest}
              disabled={isPending || !selectedRunId}
              className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wider uppercase transition-all shadow-lg flex items-center gap-2 ${
                isPending
                  ? 'bg-teal-500/30 text-teal-300 cursor-not-allowed'
                  : 'bg-teal-500 hover:bg-teal-400 text-slate-950 hover:shadow-teal-500/25'
              }`}
            >
              {isPending ? 'RODANDO...' : '🧪 TESTAR SELECIONADO'}
            </button>

            <button
              onClick={handleExportDataset}
              disabled={!selectedRunId}
              className="px-4 py-2 rounded-xl text-xs font-bold tracking-wider uppercase transition-all shadow flex items-center gap-1.5 border border-slate-700 bg-[#070a12] text-slate-300 hover:text-white hover:border-slate-500"
              title="Baixar dataset completo com níveis GEX e trades confluenciados em CSV"
            >
              <span>📤</span>
              <span>EXPORTAR DATASET (.CSV)</span>
            </button>
          </div>
        </div>

        {/* TABELA DE HISTÓRICO DE BACKTESTS SALVOS (COM EXCLUSÃO ESPECÍFICA) */}
        {recentResults.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase flex items-center gap-1.5">
                <span>📚 HISTÓRICO DE BACKTESTS SALVOS NO BANCO</span>
                <span className="text-[10px] text-teal-400">({recentResults.length} registro(s))</span>
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-xl bg-[#040810]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#070a12] text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Data / Pregão</th>
                    <th className="p-3">Ativo / Versão</th>
                    <th className="p-3">Score Geral</th>
                    <th className="p-3">CW Holding</th>
                    <th className="p-3">PW Holding</th>
                    <th className="p-3">1º Toque / Trades</th>
                    <th className="p-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {recentResults.map((bt) => (
                    <tr key={bt.id} className="hover:bg-slate-900/60 transition-colors">
                      <td className="p-3 font-bold text-slate-200">
                        {bt.date}
                        <span className="text-[9px] text-slate-500 block font-normal">
                          {bt.createdAt ? new Date(bt.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-teal-300 border border-slate-700">
                          {bt.scriptVersion}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">{bt.asset}</span>
                      </td>
                      <td className="p-3 font-bold text-emerald-400">
                        {bt.overallScore} / 100
                      </td>
                      <td className="p-3 text-cyan-300 font-bold">
                        {bt.callWallHoldingRate}%
                      </td>
                      <td className="p-3 text-rose-300 font-bold">
                        {bt.putWallHoldingRate}%
                      </td>
                      <td className="p-3 text-slate-300">
                        {bt.tradesWinRateNearGex}%
                        <span className="text-[9px] text-slate-500 block">({bt.tradesTested} negócios)</span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteBacktest(bt.id, `${bt.date} · ${bt.scriptVersion}`)}
                          className="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 text-[11px] font-bold border border-rose-500/30 transition-all flex items-center gap-1 ml-auto"
                          title="Excluir este resultado de backtest do banco"
                        >
                          <span>🗑️</span>
                          <span>Deletar</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
