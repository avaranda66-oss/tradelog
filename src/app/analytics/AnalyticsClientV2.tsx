'use client';

import { useState } from 'react';
import type { Trade, TradingDay } from '@/lib/db/schema';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

import { AiCoachReport } from '@/features/dashboard/components/AiCoachReport';

export function AnalyticsClientV2({ trades, days }: { trades: Trade[]; days: TradingDay[] }) {
  const [activeTab, setActiveTab] = useState<'geral' | 'horarios' | 'lados' | 'emocional'>('geral');

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

  // Mock de relatório AI Coach estruturado
  const sampleCoachReport = {
    disciplineScore: winRate >= 60 ? 88 : 72,
    fomoAlert: losses.length > 2,
    revengeTrading: false,
    planCompliance: winRate >= 50 ? 90 : 65,
    keyStrengths: [
      'Execução alinhada ao plano de risco',
      'Boa relação risco-retorno (Payoff registrado)',
    ],
    areasToImprove: [
      'Manter o controle de boletagem em dias de volatilidade alta',
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
    <div className="space-y-6">
      {/* Diagnóstico AI Coach Claude Cookbooks */}
      <AiCoachReport report={sampleCoachReport} />
      {/* Abas Superiores */}
      <div className="flex border-b border-slate-800 bg-[#0d131f] rounded-xl p-1 gap-1 max-w-xl">
        {[
          { id: 'geral', label: 'Visão Geral' },
          { id: 'horarios', label: 'PnL por Horário' },
          { id: 'lados', label: 'Compra vs Venda' },
          { id: 'emocional', label: 'Emocional & Execução' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === t.id
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* KPI Cards Globais */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-[#0d131f] border border-slate-800/80 rounded-xl p-4">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Resultado Acumulado</span>
          <span className={`text-lg font-bold font-mono ${totalReais >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            R$ {totalReais > 0 ? '+' : ''}{totalReais.toFixed(2)}
          </span>
        </div>

        <div className="bg-[#0d131f] border border-slate-800/80 rounded-xl p-4">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Total de Trades</span>
          <span className="text-lg font-bold font-mono text-slate-200">{totalTrades}</span>
        </div>

        <div className="bg-[#0d131f] border border-slate-800/80 rounded-xl p-4">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Taxa de Acerto</span>
          <span className="text-lg font-bold font-mono text-cyan-400">{winRate.toFixed(1)}%</span>
        </div>

        <div className="bg-[#0d131f] border border-slate-800/80 rounded-xl p-4">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Fator de Lucro (Payoff)</span>
          <span className="text-lg font-bold font-mono text-amber-400">{profitFactor}</span>
        </div>

        <div className="bg-[#0d131f] border border-slate-800/80 rounded-xl p-4">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Maior Ganho / Perda</span>
          <div className="flex gap-2 text-xs font-mono font-bold mt-1">
            <span className="text-emerald-400">+{maxWin.toFixed(0)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-rose-400">{maxLoss.toFixed(0)}</span>
          </div>
        </div>
      </div>

      {activeTab === 'geral' && (
        <div className="space-y-6">
          {/* Gráfico da Curva de Equity Histórica */}
          <div className="bg-[#0d131f] border border-slate-800/80 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">📈 Evolução da Curva de Patrimônio</h3>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityData}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#090d16', borderColor: '#1e293b', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any) => [`R$ ${Number(v).toFixed(2)}`, 'Acumulado']}
                  />
                  <Area type="monotone" dataKey="valor" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#equityGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Círculos de Sequência de Resultados (Win/Loss Streaks) */}
          <div className="bg-[#0d131f] border border-slate-800/80 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">🔴🟢 Sequência de Resultados Recentes</h3>
            <div className="flex gap-2 flex-wrap">
              {trades.slice(0, 30).map((t) => (
                <div
                  key={t.id}
                  title={`Trade #${t.tradeNumber}: R$ ${t.reais?.toFixed(2)}`}
                  className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                    (t.reais || 0) > 0
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : (t.reais || 0) < 0
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                      : 'bg-slate-700 border-slate-600 text-slate-400'
                  }`}
                >
                  {(t.reais || 0) > 0 ? 'W' : (t.reais || 0) < 0 ? 'L' : '-'}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'lados' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0d131f] border border-slate-800/80 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-emerald-400">🟢 Operações de Compra</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Total de Compras:</span>
                <span className="font-mono text-slate-200 font-bold">{trades.filter(t => t.side === 'C').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Resultado Compras:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  R$ {trades.filter(t => t.side === 'C').reduce((acc, t) => acc + (t.reais || 0), 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#0d131f] border border-slate-800/80 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-rose-400">🔴 Operações de Venda</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Total de Vendas:</span>
                <span className="font-mono text-slate-200 font-bold">{trades.filter(t => t.side === 'V').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Resultado Vendas:</span>
                <span className="font-mono text-rose-400 font-bold">
                  R$ {trades.filter(t => t.side === 'V').reduce((acc, t) => acc + (t.reais || 0), 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
