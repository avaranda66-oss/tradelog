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
} from 'recharts';

import { AiCoachReport } from '@/features/dashboard/components/AiCoachReport';
import { IconChart, IconTarget } from '@/components/ui/icons';

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
    <div className="space-y-5 font-mono">
      {/* Diagnóstico AI Coach Claude Cookbooks */}
      <AiCoachReport report={sampleCoachReport} />

      {/* Abas Superiores */}
      <div className="flex border-b border-slate-800/80 bg-[#070a10] rounded-md p-1 gap-1 max-w-xl text-xs">
        {[
          { id: 'geral', label: 'VISÃO GERAL' },
          { id: 'horarios', label: 'PNL POR HORÁRIO' },
          { id: 'lados', label: 'COMPRA VS VENDA' },
          { id: 'emocional', label: 'EMOCIONAL & EXECUÇÃO' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            type="button"
            className={`flex-1 py-1.5 rounded font-bold transition-all ${
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
          <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">TOTAL DE TRADES</span>
          <span className="text-base font-bold font-mono text-slate-200">{totalTrades}</span>
        </div>

        <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">TAXA DE ACERTO</span>
          <span className="text-base font-bold font-mono text-teal-400">{winRate.toFixed(1)}%</span>
        </div>

        <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">PAYOFF</span>
          <span className="text-base font-bold font-mono text-slate-200">{profitFactor}</span>
        </div>

        <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">MAIOR GANHO / PERDA</span>
          <div className="flex gap-2 text-xs font-mono font-bold">
            <span className="text-teal-400">+{maxWin.toFixed(0)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-rose-400">{maxLoss.toFixed(0)}</span>
          </div>
        </div>
      </div>

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
                    contentStyle={{ backgroundColor: '#070a10', borderColor: '#1e293b', borderRadius: 6, fontSize: 12 }}
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

      {activeTab === 'lados' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-teal-400 uppercase tracking-wider">LONG // OPERAÇÕES DE COMPRA</h3>
            <div className="space-y-2 text-xs font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-500">TOTAL DE COMPRAS:</span>
                <span className="text-slate-200 font-bold">{trades.filter(t => t.side === 'C').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">RESULTADO COMPRAS:</span>
                <span className="text-teal-400 font-bold">
                  R$ {trades.filter(t => t.side === 'C').reduce((acc, t) => acc + (t.reais || 0), 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider">SHORT // OPERAÇÕES DE VENDA</h3>
            <div className="space-y-2 text-xs font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-500">TOTAL DE VENDAS:</span>
                <span className="text-slate-200 font-bold">{trades.filter(t => t.side === 'V').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">RESULTADO VENDAS:</span>
                <span className="text-rose-400 font-bold">
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

export default AnalyticsClientV2;
