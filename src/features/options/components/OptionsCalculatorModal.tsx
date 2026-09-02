'use client';

import React, { useState, useEffect } from 'react';
import { createOptionPosition } from '../actions';
import { simulateOptionTradeCdi } from '../calculations';

interface OptionsCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPositionCreated: () => void;
}

export function OptionsCalculatorModal({
  isOpen,
  onClose,
  onPositionCreated,
}: OptionsCalculatorModalProps) {
  const [side, setSide] = useState<'SELL' | 'BUY'>('SELL');
  const [optionType, setOptionType] = useState<'PUT' | 'CALL'>('PUT');
  const [tickerUnderlying, setTickerUnderlying] = useState('LREN3');
  const [tickerOption, setTickerOption] = useState('LRENV104');
  const [spotPrice, setSpotPrice] = useState('11.21');
  const [strike, setStrike] = useState('10.42');
  const [premium, setPremium] = useState('0.50');
  const [quantity, setQuantity] = useState('500');
  const [busDays, setBusDays] = useState('32');
  const [expirationDate, setExpirationDate] = useState('2026-10-16');
  const [cdiRateAnnual, setCdiRateAnnual] = useState('14.0');
  const [customCapital, setCustomCapital] = useState('');
  const [isFetchingSpot, setIsFetchingSpot] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Auto-busca Spot do Yahoo Finance ao trocar ativo
  const fetchLiveSpot = async (symbol: string) => {
    if (!symbol) return;
    setIsFetchingSpot(true);
    try {
      const clean = symbol.toUpperCase().trim();
      const s = clean.endsWith('.SA') ? clean : `${clean}.SA`;
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=1d&range=1d`);
      const data = await res.json();
      const p = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (p && typeof p === 'number') {
        setSpotPrice(p.toFixed(2));
      }
    } catch {
      // ignora erro silenciosamente
    } finally {
      setIsFetchingSpot(false);
    }
  };

  if (!isOpen) return null;

  const numStrike = parseFloat(strike.replace(',', '.')) || 0;
  const numPremium = parseFloat(premium.replace(',', '.')) || 0;
  const numQty = parseInt(quantity, 10) || 0;
  const numBusDays = parseInt(busDays, 10) || 1;
  const numSpot = parseFloat(spotPrice.replace(',', '.')) || 0;
  const numCdi = (parseFloat(cdiRateAnnual.replace(',', '.')) || 14.0) / 100.0;
  const numCapital = customCapital ? parseFloat(customCapital.replace(',', '.')) : undefined;

  const sim = simulateOptionTradeCdi({
    side,
    optionType,
    strike: numStrike,
    premium: numPremium,
    quantity: numQty,
    busDays: numBusDays,
    underlyingSpot: numSpot,
    customAllocatedCapital: numCapital,
    cdiRateAnnual: numCdi,
  });

  const handleSaveToPortfolio = async () => {
    if (!tickerOption || numStrike <= 0 || numPremium <= 0 || numQty <= 0) {
      alert('Por favor, preencha os campos obrigatórios da operação');
      return;
    }

    setIsSaving(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const res = await createOptionPosition({
        portfolio: 'Principal',
        tickerUnderlying: tickerUnderlying.toUpperCase().trim(),
        tickerOption: tickerOption.toUpperCase().trim(),
        optionType,
        side,
        strategyType: side === 'SELL' ? (optionType === 'PUT' ? 'VENDA_PUT' : 'VENDA_CALL') : (optionType === 'PUT' ? 'COMPRA_PUT' : 'COMPRA_CALL'),
        quantity: numQty,
        strike: numStrike,
        entryPrice: numPremium,
        currentPrice: numPremium,
        underlyingEntrySpot: numSpot,
        underlyingCurrentSpot: numSpot,
        entryDate: todayStr,
        expirationDate,
        allocatedCapital: sim.capital,
        status: 'OPEN',
        cdiRateAnnual: numCdi,
        breakEven: sim.breakEven,
        notes: `Simulação pré-trade: Yield ${sim.yieldPeriodPct.toFixed(2)}% (${sim.pctOfCdi.toFixed(0)}% do CDI)`,
      });

      if (res.success) {
        onPositionCreated();
        onClose();
      } else {
        alert(res.error || 'Erro ao salvar operação');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#0b1018] border border-slate-800 rounded-2xl w-full max-w-4xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header do Modal */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-lg">
              🧮
            </span>
            <div>
              <h2 className="text-base font-mono font-bold text-slate-100 uppercase tracking-wider">
                CALCULADORA PRÉ-TRADE & SIMULADOR CDI
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Simule taxa do período, taxa ao ano, equivalência vs CDI e desembolso real caso exercido.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Form Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Lado Esquerdo: Parâmetros de Entrada */}
          <div className="space-y-4 bg-[#070a12] border border-slate-800/80 rounded-xl p-4">
            <h3 className="text-xs font-mono font-bold text-teal-400 uppercase tracking-wider">
              1. DADOS DA OPERAÇÃO
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {/* Lado */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold">LADO</label>
                <div className="grid grid-cols-2 gap-1 bg-[#0b1018] p-1 rounded-lg border border-slate-800 text-xs font-mono font-bold">
                  <button
                    type="button"
                    onClick={() => setSide('SELL')}
                    className={`py-1 rounded text-center transition-all ${
                      side === 'SELL' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-500'
                    }`}
                  >
                    VENDA
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide('BUY')}
                    className={`py-1 rounded text-center transition-all ${
                      side === 'BUY' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'text-slate-500'
                    }`}
                  >
                    COMPRA
                  </button>
                </div>
              </div>

              {/* Tipo de Opção */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold">TIPO</label>
                <div className="grid grid-cols-2 gap-1 bg-[#0b1018] p-1 rounded-lg border border-slate-800 text-xs font-mono font-bold">
                  <button
                    type="button"
                    onClick={() => setOptionType('PUT')}
                    className={`py-1 rounded text-center transition-all ${
                      optionType === 'PUT' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-slate-500'
                    }`}
                  >
                    PUT
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptionType('CALL')}
                    className={`py-1 rounded text-center transition-all ${
                      optionType === 'CALL' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-500'
                    }`}
                  >
                    CALL
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Ticker Ação */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono text-slate-400 uppercase font-bold">ATIVO / AÇÃO</label>
                  <button
                    type="button"
                    onClick={() => fetchLiveSpot(tickerUnderlying)}
                    className="text-[10px] text-teal-400 hover:underline flex items-center gap-1 font-mono"
                  >
                    <span>{isFetchingSpot ? '...' : '🌐 Yahoo Spot'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={tickerUnderlying}
                  onChange={(e) => setTickerUnderlying(e.target.value)}
                  onBlur={() => fetchLiveSpot(tickerUnderlying)}
                  placeholder="ex: LREN3"
                  className="w-full bg-[#0b1018] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 font-bold focus:border-teal-400 focus:outline-none"
                />
              </div>

              {/* Ticker Opção */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold">CÓDIGO OPÇÃO</label>
                <input
                  type="text"
                  value={tickerOption}
                  onChange={(e) => setTickerOption(e.target.value)}
                  placeholder="ex: LRENV104"
                  className="w-full bg-[#0b1018] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-teal-300 font-bold focus:border-teal-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* Spot Atual da Ação */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-teal-400 uppercase font-bold">SPOT AÇÃO (R$)</label>
                <input
                  type="text"
                  value={spotPrice}
                  onChange={(e) => setSpotPrice(e.target.value)}
                  placeholder="11.21"
                  className="w-full bg-[#0b1018] border border-teal-500/40 rounded-lg px-2.5 py-2 text-xs font-mono text-teal-300 font-bold focus:border-teal-400 focus:outline-none"
                />
              </div>

              {/* Strike */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-amber-400 uppercase font-bold">STRIKE (R$)</label>
                <input
                  type="text"
                  value={strike}
                  onChange={(e) => setStrike(e.target.value)}
                  placeholder="10.42"
                  className="w-full bg-[#0b1018] border border-amber-500/40 rounded-lg px-2.5 py-2 text-xs font-mono text-amber-300 font-bold focus:border-teal-400 focus:outline-none"
                />
              </div>

              {/* Prêmio */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-emerald-400 uppercase font-bold">PRÊMIO (R$)</label>
                <input
                  type="text"
                  value={premium}
                  onChange={(e) => setPremium(e.target.value)}
                  placeholder="0.50"
                  className="w-full bg-[#0b1018] border border-emerald-500/40 rounded-lg px-2.5 py-2 text-xs font-mono text-emerald-300 font-bold focus:border-teal-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* Quantidade */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold">QUANTIDADE</label>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="500"
                  className="w-full bg-[#0b1018] border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono text-slate-100 font-bold focus:border-teal-400 focus:outline-none"
                />
              </div>

              {/* Dias Úteis */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold">DIAS ÚTEIS (DU)</label>
                <input
                  type="text"
                  value={busDays}
                  onChange={(e) => setBusDays(e.target.value)}
                  placeholder="32"
                  className="w-full bg-[#0b1018] border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono text-slate-100 focus:border-teal-400 focus:outline-none"
                />
              </div>

              {/* Taxa CDI */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold">CDI ANUAL (%)</label>
                <input
                  type="text"
                  value={cdiRateAnnual}
                  onChange={(e) => setCdiRateAnnual(e.target.value)}
                  placeholder="14.0"
                  className="w-full bg-[#0b1018] border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono text-purple-300 focus:border-teal-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Vencimento Data */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-slate-400 uppercase font-bold">DATA DE VENCIMENTO</label>
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full bg-[#0b1018] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:border-teal-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Lado Direito: Resultados Matemáticos, Custo Efetivo & Comparativo CDI */}
          <div className="space-y-4 bg-[#070a12] border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                <span>2. DIAGNÓSTICO FINANCEIRO & CDI</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-extrabold">
                  {sim.pctOfCdi.toFixed(0)}% DO CDI
                </span>
              </h3>

              {/* KPI Banner Central */}
              <div className="bg-[#0f1422] border border-teal-500/30 rounded-xl p-3 text-center space-y-1">
                <div className="text-[10px] font-mono text-slate-400 uppercase">
                  {side === 'SELL' ? 'PRÊMIO TOTAL RECEBIDO (LUCRO BRUTO)' : 'CUSTO TOTAL / RISCO MÁXIMO'}
                </div>
                <div className="text-2xl font-mono font-extrabold text-emerald-400">
                  R$ {sim.totalPremiumReais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="text-xs font-normal text-slate-400 ml-2">
                    (Líq 15% IR: R$ {sim.netPremiumReais.toFixed(2)})
                  </span>
                </div>
                <div className="text-xs font-mono text-teal-300">
                  Yield no Período: <span className="font-bold">+{sim.yieldPeriodPct.toFixed(2)}%</span> (+{sim.annualizedYieldPct.toFixed(1)}% a.a.)
                </div>
              </div>

              {/* Destaque: Custo Efetivo de Exercício */}
              {side === 'SELL' && optionType === 'PUT' && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1 text-xs font-mono">
                  <div className="flex items-center justify-between text-amber-300 font-bold">
                    <span>💵 Se For Exercido (Desembolso Real):</span>
                    <span>R$ {sim.effectiveExerciseTotalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300 text-[11px]">
                    <span>Preço Efetivo por Ação (Strike - Prêmio):</span>
                    <span className="font-bold text-slate-100">R$ {sim.effectiveCostPerShare.toFixed(2)}</span>
                  </div>
                  {sim.discountToSpotPct > 0 && (
                    <div className="text-[10px] text-emerald-400 font-bold">
                      ✓ Você compra {tickerUnderlying} com -{sim.discountToSpotPct.toFixed(1)}% de desconto sobre o Spot atual (R$ {numSpot.toFixed(2)})!
                    </div>
                  )}
                </div>
              )}

              {/* Tabela de Comparação Direta com CDI */}
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between p-2 rounded-lg bg-[#0b1018] border border-slate-800/60">
                  <span className="text-slate-400">Garantia Notional Total:</span>
                  <span className="font-bold text-slate-100">
                    R$ {sim.capital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-[#0b1018] border border-purple-500/30">
                  <span className="text-purple-300 font-bold">Rendimento 100% CDI no Período:</span>
                  <span className="font-bold text-purple-300">
                    +R$ {sim.cdiProfitReais.toFixed(2)} ({sim.cdiYieldPeriodPct.toFixed(2)}%)
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-[#0b1018] border border-amber-500/30">
                  <span className="text-amber-300 font-bold">Alpha Excedente ao CDI (R$):</span>
                  <span className="font-bold text-amber-400">
                    +R$ {sim.alphaReais.toFixed(2)} (Líq IR: +R$ {sim.netAlphaReais.toFixed(2)})
                  </span>
                </div>
              </div>
            </div>

            {/* Botão de Ação: Salvar na Carteira */}
            <div className="pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleSaveToPortfolio}
                disabled={isSaving}
                className={`w-full py-3 rounded-xl font-mono text-xs font-bold tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-2 border ${
                  isSaving
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/30 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-500 text-white border-teal-400/40 hover:shadow-teal-500/25 active:scale-95'
                }`}
              >
                <span>🚀</span>
                <span>{isSaving ? 'SALVANDO...' : 'SALVAR OPERAÇÃO NA CARTEIRA'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
