'use client';

import { useState } from 'react';
import type { Trade, TradingDay } from '@/lib/db/schema';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts';

import { AiCoachReport } from '@/features/dashboard/components/AiCoachReport';
import { IconChart, IconTarget, IconTerminal } from '@/components/ui/icons';

interface AnalyticsClientV2Props {
  trades: Trade[];
  days: TradingDay[];
}

export function AnalyticsClientV2({ trades, days }: AnalyticsClientV2Props) {
  const [activeTab, setActiveTab] = useState<'geral' | 'eficiencia' | 'setups' | 'fisiologia' | 'lados'>('geral');

  const totalTrades = trades.length;
  const wins = trades.filter(t => (t.reais || 0) > 0);
  const losses = trades.filter(t => (t.reais || 0) < 0);

  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  const totalReais = trades.reduce((acc, t) => acc + (t.reais || 0), 0);
  const totalGain = wins.reduce((acc, t) => acc + (t.reais || 0), 0);
  const totalLoss = Math.abs(losses.reduce((acc, t) => acc + (t.reais || 0), 0));
  const profitFactor = totalLoss > 0 ? (totalGain / totalLoss).toFixed(2) : 'N/A';

  const maxWin = wins.length > 0 ? Math.max(...wins.map(t => t.reais || 0)) : 0;
  const maxLoss = losses.length > 0 ? Math.min(...losses.map(t => t.reais || 0)) : 0;

  // ─── 1. CÁLCULO DE EFICIÊNCIA DE CAPTURA MEP / MEN ───────────────────────────
  const tradesWithMep = trades.filter(t => t.mep && t.mep > 0);
  const totalMepPoints = tradesWithMep.reduce((acc, t) => acc + (t.mep || 0), 0);
  const totalCapturedPoints = tradesWithMep.filter(t => (t.points || 0) > 0).reduce((acc, t) => acc + (t.points || 0), 0);
  const overallMepCaptureRatio = totalMepPoints > 0 ? ((totalCapturedPoints / totalMepPoints) * 100).toFixed(1) : '0.0';

  // Dados para Scatter Plot MEP vs MEN
  const scatterData = trades.map((t, idx) => ({
    id: t.id,
    tradeNum: `#${t.tradeNumber || idx + 1}`,
    mep: Math.abs(t.mep || 0),
    men: Math.abs(t.men || 0),
    reais: t.reais || 0,
    points: t.points || 0,
    side: t.side,
    movedStop: t.movedStop,
  }));

  // ─── 2. CUSTO FINANCEIRO DE MOVER O STOP ────────────────────────────────────
  const tradesMovedStop = trades.filter(t => t.movedStop === true);
  const movedStopLosses = tradesMovedStop.filter(t => (t.reais || 0) < 0);
  const totalCostMovedStop = Math.abs(movedStopLosses.reduce((acc, t) => acc + (t.reais || 0), 0));

  // ─── 3. CÁLCULO DE PERFORMANCE POR TAG / ESTRATÉGIA (#RegiãoADR, #VWAP, etc.) ──
  const tagPerformanceMap: Record<string, { count: number; wins: number; PnL: number; points: number }> = {};

  // Pega estratégias declaradas e tags registradas no dia
  trades.forEach(t => {
    const tradeTags: string[] = [];
    if (t.strategy) tradeTags.push(t.strategy.startsWith('#') ? t.strategy : `#${t.strategy}`);
    
    // Tenta correlacionar com as tags do dia do trade
    const dayOfTrade = days.find(d => d.id === t.tradingDayId);
    if (dayOfTrade?.strategyTags) {
      try {
        const parsed = JSON.parse(dayOfTrade.strategyTags);
        if (Array.isArray(parsed)) {
          parsed.forEach((tag: string) => {
            if (!tradeTags.includes(tag)) tradeTags.push(tag);
          });
        }
      } catch {}
    }

    if (tradeTags.length === 0) tradeTags.push('#Geral');

    tradeTags.forEach(tag => {
      if (!tagPerformanceMap[tag]) {
        tagPerformanceMap[tag] = { count: 0, wins: 0, PnL: 0, points: 0 };
      }
      tagPerformanceMap[tag].count += 1;
      if ((t.reais || 0) > 0) tagPerformanceMap[tag].wins += 1;
      tagPerformanceMap[tag].PnL += (t.reais || 0);
      tagPerformanceMap[tag].points += (t.points || 0);
    });
  });

  const tagPerformanceList = Object.entries(tagPerformanceMap).map(([tag, data]) => ({
    tag,
    count: data.count,
    winRate: (data.wins / data.count) * 100,
    PnL: data.PnL,
    points: data.points,
  })).sort((a, b) => b.PnL - a.PnL);

  // ─── 4. CÁLCULO DO READINESS SCORE (PRONTIDÃO FISIOLÓGICA) ───────────────────
  let totalReadiness = 0;
  let readinessCount = 0;

  days.forEach(d => {
    if (d.sleepQuality || d.mentalState) {
      const sqScore = (d.sleepQuality || 3) * 20; // 20 a 100
      let mentalScore = 60;
      if (d.mentalState === 'Focado') mentalScore = 100;
      if (d.mentalState === 'Descansado') mentalScore = 85;
      if (d.mentalState === 'Neutro') mentalScore = 60;
      if (d.mentalState === 'Cansado') mentalScore = 40;
      if (d.mentalState === 'Ansioso') mentalScore = 20;

      const dayScore = Math.round(sqScore * 0.5 + mentalScore * 0.5);
      totalReadiness += dayScore;
      readinessCount += 1;
    }
  });

  const avgReadinessScore = readinessCount > 0 ? Math.round(totalReadiness / readinessCount) : 75;

  // Mock de relatório AI Coach
  const sampleCoachReport = {
    disciplineScore: winRate >= 60 ? 88 : 72,
    fomoAlert: losses.length > 2,
    revengeTrading: false,
    planCompliance: winRate >= 50 ? 90 : 65,
    keyStrengths: [
      'Execução alinhada ao plano de risco',
      `Taxa de captura de MEP registrada em ${overallMepCaptureRatio}%`,
    ],
    areasToImprove: [
      `Custo de mover stop identificado em R$ ${totalCostMovedStop.toFixed(2)}`,
      'Aguardar o teste das médias de 20 e VWAP antes de antecipar a entrada',
    ],
    coachFeedback:
      winRate >= 50
        ? 'Sessão positiva com boa leitura técnica do mercado. Mantenha a disciplina de operar somente com sinal confirmado.'
        : 'Sessão com necessidade de maior paciência. Evite antecipar entradas sem a confirmação de volume.',
  };

  // Dados para Curva de Equity Histórica
  let accum = 0;
  const equityData = [...trades].reverse().map((t, idx) => {
    accum += t.reais || 0;
    return {
      name: `#${idx + 1}`,
      valor: accum,
      trade: t,
    };
  });

  return (
    <div className="space-y-5 font-mono">
      {/* Diagnóstico AI Coach */}
      <AiCoachReport report={sampleCoachReport} />

      {/* Abas Superiores */}
      <div className="flex border-b border-slate-800/80 bg-[#070a10] rounded-md p-1 gap-1 flex-wrap max-w-2xl text-xs">
        {[
          { id: 'geral', label: 'VISÃO GERAL' },
          { id: 'eficiencia', label: 'EFICIÊNCIA MEP/MEN' },
          { id: 'setups', label: 'SETUPS & TAGS (#ADR/VWAP)' },
          { id: 'fisiologia', label: 'FISIOLOGIA & PRONTIDÃO' },
          { id: 'lados', label: 'COMPRA VS VENDA' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            type="button"
            className={`px-3 py-1.5 rounded font-bold transition-all ${
              activeTab === t.id
                ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* KPI Cards Globais */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 tabular-nums">
        <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">RESULTADO ACUMULADO</span>
          <span className={`text-base font-bold font-mono ${totalReais >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
            R$ {totalReais > 0 ? '+' : ''}{totalReais.toFixed(2)}
          </span>
        </div>

        <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">TAXA DE ACERTO</span>
          <span className="text-base font-bold font-mono text-teal-400">{winRate.toFixed(1)}%</span>
        </div>

        <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">EFICIÊNCIA MEP (CAPTURA)</span>
          <span className="text-base font-bold font-mono text-emerald-400">{overallMepCaptureRatio}%</span>
        </div>

        <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">CUSTO MOVER STOP</span>
          <span className="text-base font-bold font-mono text-rose-400">R$ -{totalCostMovedStop.toFixed(2)}</span>
        </div>

        <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">PRONTIDÃO FISIOLÓGICA</span>
          <span className="text-base font-bold font-mono text-amber-400">{avgReadinessScore}/100</span>
        </div>
      </div>

      {/* ─── ABA 1: VISÃO GERAL ─────────────────────────────────────────────────── */}
      {activeTab === 'geral' && (
        <div className="space-y-5">
          {/* Gráfico da Curva de Equity Histórica */}
          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2.5">
              <IconChart className="text-teal-400" />
              <h3 className="text-[10px] font-bold tracking-[0.25em] text-slate-300 uppercase">
                EQUITY CURVE · EVOLUÇÃO PATRIMONIAL ACUMULADA
              </h3>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityData}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#070a14', borderColor: '#334155', borderRadius: 8, fontSize: 12, color: '#f8fafc' }}
                    itemStyle={{ color: '#2dd4bf', fontWeight: 'bold' }}
                    labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                    formatter={(v: any) => [`R$ ${Number(v).toFixed(2)}`, 'Acumulado']}
                  />

                  <Area type="monotone" dataKey="valor" stroke="#2dd4bf" strokeWidth={2} fillOpacity={1} fill="url(#equityGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sequência de Resultados (Win/Loss Streaks) */}
          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2.5">
              <IconTarget className="text-teal-400" />
              <h3 className="text-[10px] font-bold tracking-[0.25em] text-slate-300 uppercase">
                WIN / LOSS STREAK · SEQUÊNCIA DE EXECUÇÃO
              </h3>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {trades.slice(0, 30).map((t) => (
                <div
                  key={t.id}
                  title={`Trade #${t.tradeNumber}: R$ ${t.reais?.toFixed(2)}`}
                  className={`w-6 h-6 rounded border flex items-center justify-center text-[10px] font-mono font-bold ${
                    (t.reais || 0) > 0
                      ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
                      : (t.reais || 0) < 0
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  {(t.reais || 0) > 0 ? 'W' : (t.reais || 0) < 0 ? 'L' : '-'}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA 2: EFICIÊNCIA MEP/MEN (CAPTURA X CALOR) ────────────────────────── */}
      {activeTab === 'eficiencia' && (
        <div className="space-y-5">
          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  🎯 SCATTER PLOT: MEP (MÁXIMA A FAVOR) VS MEN (MÁXIMA CONTRA)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Mede a eficiência de captura do trade. Quanto mais perto da extremidade inferior direita (MEP alto, MEN baixo), mais perfeito o trade.
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 block font-bold">TAXA GERAL DE CAPTURA</span>
                <span className="text-sm font-bold text-emerald-400">{overallMepCaptureRatio}%</span>
              </div>
            </div>

            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    type="number"
                    dataKey="mep"
                    name="MEP (Pts)"
                    unit=" pts"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    label={{ value: 'MEP (Pontos a favor)', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="men"
                    name="MEN (Pts)"
                    unit=" pts"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    label={{ value: 'MEN (Pontos contra)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
                  />
                  <ZAxis type="number" dataKey="reais" range={[60, 400]} name="PnL R$" />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3', stroke: '#475569' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const isWin = (data.reais || 0) >= 0;
                        return (
                          <div className="bg-[#070a14] border border-slate-700/90 rounded-xl p-3 shadow-2xl font-mono text-xs space-y-1.5 min-w-[170px] select-none">
                            <div className="text-[10px] text-slate-400 font-bold border-b border-slate-800 pb-1 flex items-center justify-between gap-3">
                              <span className="text-slate-200">{data.tradeNum || 'TRADE'}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${isWin ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                                {isWin ? 'GAIN' : 'LOSS'}
                              </span>
                            </div>
                            <div className="space-y-1 text-[11px]">
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">MEP (Máx. Favor):</span>
                                <span className="text-teal-300 font-bold">+{data.mep} pts</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">MEN (Máx. Contra):</span>
                                <span className="text-rose-300 font-bold">-{data.men} pts</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Resultado:</span>
                                <span className={`font-bold ${data.points >= 0 ? 'text-teal-300' : 'text-rose-300'}`}>
                                  {data.points > 0 ? '+' : ''}{data.points} pts
                                </span>
                              </div>
                              <div className="flex justify-between gap-3 border-t border-slate-800/80 pt-1 mt-1">
                                <span className="text-slate-400 font-bold">PnL:</span>
                                <span className={`font-bold ${isWin ? 'text-teal-400' : 'text-rose-400'}`}>
                                  {isWin ? '+' : ''}R$ {Number(data.reais || 0).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  <Scatter name="Trades" data={scatterData}>
                    {scatterData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.reais >= 0 ? '#2dd4bf' : '#fb7185'} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Card de Alerta de Violação de Stop / Mover Stop */}
          <div className="bg-[#0b1018] border border-rose-500/20 rounded-xl p-4 space-y-2">
            <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
              <span>⚠️ DETECTOR DE VIOLAÇÃO DE PLANO (MOVER STOP)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono tabular-nums">
              <div>
                <span className="text-slate-500 text-[10px] block font-bold">TRADES COM STOP MOVIDO:</span>
                <span className="text-slate-200 font-bold text-sm">{tradesMovedStop.length} trade(s)</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block font-bold">TAXA DE LOSS AO MOVER STOP:</span>
                <span className="text-rose-400 font-bold text-sm">
                  {tradesMovedStop.length > 0 ? ((movedStopLosses.length / tradesMovedStop.length) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block font-bold">PREJUÍZO ACUMULADO POR MOVER STOP:</span>
                <span className="text-rose-400 font-bold text-sm">R$ -{totalCostMovedStop.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA 3: SETUPS & TAGS (#RegiãoADR / #VWAP / #Rompimento) ──────────────── */}
      {activeTab === 'setups' && (
        <div className="space-y-4">
          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                🏷️ DESEMPENHO POR TAG DE CONTEXTO E ESTRATÉGIA (#ADR, #VWAP, #ROMPIMENTO)
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">ORDENADO POR PNL R$</span>
            </div>

            <div className="space-y-2">
              {tagPerformanceList.map(item => (
                <div
                  key={item.tag}
                  className="bg-[#070a10] border border-slate-800/60 rounded-lg p-3 flex items-center justify-between gap-4 text-xs font-mono tabular-nums"
                >
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-bold">
                      {item.tag}
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      {item.count} trade(s) operado(s)
                    </span>
                  </div>

                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase font-bold">WIN RATE</span>
                      <span className="font-bold text-teal-400">{item.winRate.toFixed(0)}%</span>
                    </div>

                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase font-bold">PONTOS</span>
                      <span className={`font-bold ${item.points >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
                        {item.points > 0 ? '+' : ''}{item.points} pts
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase font-bold">PNL R$</span>
                      <span className={`font-bold text-sm ${item.PnL >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
                        R$ {item.PnL > 0 ? '+' : ''}{item.PnL.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {tagPerformanceList.length === 0 && (
                <p className="text-xs text-slate-500 italic p-4 text-center">
                  Nenhuma tag de estratégia registrada ainda.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA 4: FISIOLOGIA & PRONTIDÃO ──────────────────────────────────────── */}
      {activeTab === 'fisiologia' && (
        <div className="space-y-4 font-mono">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-3 shadow-xl">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                🧠 ÍNDICE DE PRONTIDÃO FISIOLÓGICA (READINESS SCORE)
              </h3>
              <div className="text-center py-6 space-y-2">
                <span className="text-5xl font-extrabold text-amber-400 block">{avgReadinessScore}</span>
                <span className="text-xs text-slate-400 uppercase tracking-wider block font-bold">ESCALA DE 0 A 100</span>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  {avgReadinessScore >= 80
                    ? '🟢 Excelente prontidão fisiológica. Condição física e mental ideal para operar lote cheio.'
                    : avgReadinessScore >= 60
                    ? '🟡 Prontidão moderada. Opere focado e evite antecipar entradas fora do plano.'
                    : '🔴 Prontidão baixa. Cuidado com overtrading e redução de disciplina!'}
                </p>
              </div>
            </div>

            <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-3 shadow-xl">
              <h3 className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                😴 SONO & ESTUDO MATINAL (MÉDIAS REGISTRADAS)
              </h3>
              <div className="space-y-3 text-xs tabular-nums pt-2">
                <div className="flex justify-between border-b border-slate-800/60 pb-2">
                  <span className="text-slate-400">Qualidade Média do Sono (1-5):</span>
                  <span className="text-teal-400 font-bold">
                    {(days.reduce((acc, d) => acc + (d.sleepQuality || 3), 0) / Math.max(1, days.length)).toFixed(1)} / 5.0
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-2">
                  <span className="text-slate-400">Total de Dias Auditados com Sono:</span>
                  <span className="text-slate-200 font-bold">{days.filter(d => d.sleepQuality).length} dia(s)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status de Rotina Matinal:</span>
                  <span className="text-emerald-400 font-bold">Auditado via SQLite</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA 5: COMPRA VS VENDA ────────────────────────────────────────────── */}
      {activeTab === 'lados' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono">
          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-3 shadow-xl">
            <h3 className="text-xs font-bold text-teal-400 uppercase tracking-wider">LONG // OPERAÇÕES DE COMPRA</h3>
            <div className="space-y-2 text-xs tabular-nums">
              <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                <span className="text-slate-500">TOTAL DE COMPRAS:</span>
                <span className="text-slate-200 font-bold">{trades.filter(t => t.side === 'C').length}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                <span className="text-slate-500">RESULTADO COMPRAS:</span>
                <span className="text-teal-400 font-bold">
                  R$ {trades.filter(t => t.side === 'C').reduce((acc, t) => acc + (t.reais || 0), 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">PONTOS COMPRAS:</span>
                <span className="text-teal-400 font-bold">
                  {trades.filter(t => t.side === 'C').reduce((acc, t) => acc + (t.points || 0), 0)} pts
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-3 shadow-xl">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider">SHORT // OPERAÇÕES DE VENDA</h3>
            <div className="space-y-2 text-xs tabular-nums">
              <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                <span className="text-slate-500">TOTAL DE VENDAS:</span>
                <span className="text-slate-200 font-bold">{trades.filter(t => t.side === 'V').length}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                <span className="text-slate-500">RESULTADO VENDAS:</span>
                <span className="text-rose-400 font-bold">
                  R$ {trades.filter(t => t.side === 'V').reduce((acc, t) => acc + (t.reais || 0), 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">PONTOS VENDAS:</span>
                <span className="text-rose-400 font-bold">
                  {trades.filter(t => t.side === 'V').reduce((acc, t) => acc + (t.points || 0), 0)} pts
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnalyticsClientV2;
