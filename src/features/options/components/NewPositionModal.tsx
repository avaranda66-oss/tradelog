'use client';

import React, { useState } from 'react';
import { createOptionPosition } from '../actions';

interface NewPositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPositionCreated: () => void;
}

export function NewPositionModal({
  isOpen,
  onClose,
  onPositionCreated,
}: NewPositionModalProps) {
  if (!isOpen) return null;

  const [portfolio, setPortfolio] = useState('BTG Principal');
  const [side, setSide] = useState<'SELL' | 'BUY'>('SELL');
  const [optionType, setOptionType] = useState<'PUT' | 'CALL'>('PUT');
  const [tickerUnderlying, setTickerUnderlying] = useState('');
  const [tickerOption, setTickerOption] = useState('');
  const [quantity, setQuantity] = useState('500');
  const [strike, setStrike] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [spotPrice, setSpotPrice] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [expirationDate, setExpirationDate] = useState('');
  const [delta, setDelta] = useState('');
  const [pop, setPop] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numStrike = parseFloat(strike.replace(',', '.')) || 0;
    const numEntryPrice = parseFloat(entryPrice.replace(',', '.')) || 0;
    const numCurrentPrice = currentPrice ? parseFloat(currentPrice.replace(',', '.')) : numEntryPrice;
    const numQty = parseInt(quantity, 10) || 0;
    const numSpot = spotPrice ? parseFloat(spotPrice.replace(',', '.')) : undefined;
    const numDelta = delta ? parseFloat(delta.replace(',', '.')) : undefined;
    const numPop = pop ? parseFloat(pop.replace(',', '.')) : undefined;

    if (!tickerOption || !tickerUnderlying || numStrike <= 0 || numEntryPrice <= 0 || numQty <= 0 || !expirationDate) {
      alert('Por favor, preencha todos os campos obrigatórios (*)');
      return;
    }

    setIsSaving(true);
    try {
      const res = await createOptionPosition({
        portfolio,
        tickerUnderlying: tickerUnderlying.toUpperCase().trim(),
        tickerOption: tickerOption.toUpperCase().trim(),
        optionType,
        side,
        strategyType: side === 'SELL' ? (optionType === 'PUT' ? 'VENDA_PUT' : 'VENDA_CALL') : (optionType === 'PUT' ? 'COMPRA_PUT' : 'COMPRA_CALL'),
        quantity: numQty,
        strike: numStrike,
        entryPrice: numEntryPrice,
        currentPrice: numCurrentPrice,
        underlyingEntrySpot: numSpot,
        underlyingCurrentSpot: numSpot,
        entryDate,
        expirationDate,
        allocatedCapital: 0, // Auto-calculado
        status: 'OPEN',
        delta: numDelta,
        pop: numPop,
        notes,
      });

      if (res.success) {
        onPositionCreated();
        onClose();
      } else {
        alert(res.error || 'Erro ao registrar operação');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#0b1018] border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto font-mono text-xs">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">➕</span>
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                NOVA OPERAÇÃO DE OPÇÃO
              </h2>
              <p className="text-[11px] text-slate-400">
                Cadastre uma Venda de Put, Venda de Call ou Compra direcional.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Lado & Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">LADO *</label>
              <div className="grid grid-cols-2 gap-1 bg-[#070a12] p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className={`py-1 rounded text-center transition-all ${
                    side === 'SELL' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-500'
                  }`}
                >
                  VENDA
                </button>
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className={`py-1 rounded text-center transition-all ${
                    side === 'BUY' ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30' : 'text-slate-500'
                  }`}
                >
                  COMPRA
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">TIPO *</label>
              <div className="grid grid-cols-2 gap-1 bg-[#070a12] p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setOptionType('PUT')}
                  className={`py-1 rounded text-center transition-all ${
                    optionType === 'PUT' ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30' : 'text-slate-500'
                  }`}
                >
                  PUT
                </button>
                <button
                  type="button"
                  onClick={() => setOptionType('CALL')}
                  className={`py-1 rounded text-center transition-all ${
                    optionType === 'CALL' ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30' : 'text-slate-500'
                  }`}
                >
                  CALL
                </button>
              </div>
            </div>
          </div>

          {/* Tickers */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">ATIVO / AÇÃO *</label>
              <input
                type="text"
                required
                value={tickerUnderlying}
                onChange={(e) => setTickerUnderlying(e.target.value)}
                placeholder="ex: ITUB4"
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-bold focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">CÓDIGO OPÇÃO *</label>
              <input
                type="text"
                required
                value={tickerOption}
                onChange={(e) => setTickerOption(e.target.value)}
                placeholder="ex: ITUGU393"
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-teal-300 font-bold focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">CARTEIRA</label>
              <input
                type="text"
                value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)}
                placeholder="BTG Principal"
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-300 focus:border-teal-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Preços e Quantidade */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">QUANTIDADE *</label>
              <input
                type="text"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="500"
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-2.5 py-2 text-slate-100 font-bold focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">STRIKE (R$) *</label>
              <input
                type="text"
                required
                value={strike}
                onChange={(e) => setStrike(e.target.value)}
                placeholder="39.33"
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-2.5 py-2 text-amber-300 font-bold focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">PRÊMIO ENTRADA *</label>
              <input
                type="text"
                required
                value={entryPrice}
                onChange={(e) => {
                  setEntryPrice(e.target.value);
                  if (!currentPrice) setCurrentPrice(e.target.value);
                }}
                placeholder="1.04"
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-2.5 py-2 text-emerald-300 font-bold focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">PREÇO ATUAL</label>
              <input
                type="text"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                placeholder="0.29"
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-2.5 py-2 text-slate-200 focus:border-teal-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">DATA DE ENTRADA *</label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">DATA VENCIMENTO *</label>
              <input
                type="date"
                required
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">SPOT DA AÇÃO (R$)</label>
              <input
                type="text"
                value={spotPrice}
                onChange={(e) => setSpotPrice(e.target.value)}
                placeholder="40.34"
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-teal-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Gregas Opcionais */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">DELTA (Δ)</label>
              <input
                type="text"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="-0.17"
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-300 focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">POP (% PROBABILIDADE)</label>
              <input
                type="text"
                value={pop}
                onChange={(e) => setPop(e.target.value)}
                placeholder="96"
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-300 focus:border-teal-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-bold">NOTAS E RACIONAL DO TRADE</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: Venda de Put na região de suporte para remuneração de caixa"
              className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-300 focus:border-teal-400 focus:outline-none"
            />
          </div>

          {/* Botão Salvar */}
          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3 rounded-xl font-bold uppercase bg-teal-600 hover:bg-teal-500 text-white transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 mt-4"
          >
            <span>💾</span>
            <span>{isSaving ? 'REGISTRANDO...' : 'CADASTRAR OPERAÇÃO DE OPÇÃO'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
