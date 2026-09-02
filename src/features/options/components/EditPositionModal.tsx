'use client';

import React, { useState, useEffect } from 'react';
import type { EnrichedOptionPosition } from '../calculations';
import { updateOptionPosition } from '../actions';

interface EditPositionModalProps {
  position: EnrichedOptionPosition | null;
  isOpen: boolean;
  onClose: () => void;
  onPositionUpdated: () => void;
}

export function EditPositionModal({
  position,
  isOpen,
  onClose,
  onPositionUpdated,
}: EditPositionModalProps) {
  if (!isOpen || !position) return null;

  const [tickerUnderlying, setTickerUnderlying] = useState(position.tickerUnderlying);
  const [tickerOption, setTickerOption] = useState(position.tickerOption);
  const [side, setSide] = useState<'SELL' | 'BUY'>(position.side as any);
  const [optionType, setOptionType] = useState<'PUT' | 'CALL'>(position.optionType as any);
  const [quantity, setQuantity] = useState(position.quantity.toString());
  const [strike, setStrike] = useState(position.strike.toFixed(2));
  const [entryPrice, setEntryPrice] = useState(position.entryPrice.toFixed(2));
  const [currentPrice, setCurrentPrice] = useState(position.currentPrice.toFixed(2));
  const [spotPrice, setSpotPrice] = useState(position.underlyingCurrentSpot ? position.underlyingCurrentSpot.toFixed(2) : '');
  const [entryDate, setEntryDate] = useState(position.entryDate);
  const [expirationDate, setExpirationDate] = useState(position.expirationDate);
  const [allocatedCapital, setAllocatedCapital] = useState(position.allocatedCapital.toString());
  const [notes, setNotes] = useState(position.notes || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (position) {
      setTickerUnderlying(position.tickerUnderlying);
      setTickerOption(position.tickerOption);
      setSide(position.side as any);
      setOptionType(position.optionType as any);
      setQuantity(position.quantity.toString());
      setStrike(position.strike.toFixed(2));
      setEntryPrice(position.entryPrice.toFixed(2));
      setCurrentPrice(position.currentPrice.toFixed(2));
      setSpotPrice(position.underlyingCurrentSpot ? position.underlyingCurrentSpot.toFixed(2) : '');
      setEntryDate(position.entryDate);
      setExpirationDate(position.expirationDate);
      setAllocatedCapital(position.allocatedCapital.toString());
      setNotes(position.notes || '');
    }
  }, [position]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numStrike = parseFloat(strike.replace(',', '.')) || 0;
    const numEntryPrice = parseFloat(entryPrice.replace(',', '.')) || 0;
    const numCurrentPrice = parseFloat(currentPrice.replace(',', '.')) || 0;
    const numQty = parseInt(quantity, 10) || 0;
    const numSpot = spotPrice ? parseFloat(spotPrice.replace(',', '.')) : undefined;
    const numCapital = allocatedCapital ? parseFloat(allocatedCapital.replace(',', '.')) : undefined;

    if (!tickerOption || numStrike <= 0 || numEntryPrice <= 0 || numQty <= 0) {
      alert('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateOptionPosition(position.id, {
        tickerUnderlying: tickerUnderlying.toUpperCase().trim(),
        tickerOption: tickerOption.toUpperCase().trim(),
        side,
        optionType,
        quantity: numQty,
        strike: numStrike,
        entryPrice: numEntryPrice,
        currentPrice: numCurrentPrice,
        underlyingCurrentSpot: numSpot,
        entryDate,
        expirationDate,
        allocatedCapital: numCapital,
        notes,
      });

      if (res.success) {
        onPositionUpdated();
        onClose();
      } else {
        alert(res.error || 'Erro ao atualizar posição');
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
            <span className="text-xl">✏️</span>
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                EDITAR OPERAÇÃO DE OPÇÃO
              </h2>
              <p className="text-[11px] text-slate-400">
                Ajuste o Strike, Preço Médio, Cotação Atual, Spot da Ação e Garantia.
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
          {/* Tickers */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">ATIVO / AÇÃO (ex: LREN3)</label>
              <input
                type="text"
                required
                value={tickerUnderlying}
                onChange={(e) => setTickerUnderlying(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-bold focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">CÓDIGO OPÇÃO (ex: LRENV104)</label>
              <input
                type="text"
                required
                value={tickerOption}
                onChange={(e) => setTickerOption(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-teal-300 font-bold focus:border-teal-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Strike, Quantidade, Preços */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-amber-400 uppercase font-bold">STRIKE (R$) *</label>
              <input
                type="text"
                required
                value={strike}
                onChange={(e) => setStrike(e.target.value)}
                placeholder="ex: 10.42"
                className="w-full bg-[#070a12] border border-amber-500/50 rounded-lg px-2.5 py-2 text-amber-300 font-bold focus:border-amber-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">QUANTIDADE</label>
              <input
                type="text"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-2.5 py-2 text-slate-100 font-bold focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">PREÇO MÉDIO</label>
              <input
                type="text"
                required
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-2.5 py-2 text-emerald-300 font-bold focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">PREÇO ATUAL</label>
              <input
                type="text"
                required
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-2.5 py-2 text-slate-200 focus:border-teal-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Spot da Ação e Capital Alocado */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-teal-400 uppercase font-bold">SPOT DA AÇÃO (R$) (ex: 11.21)</label>
              <input
                type="text"
                value={spotPrice}
                onChange={(e) => setSpotPrice(e.target.value)}
                placeholder="ex: 11.21"
                className="w-full bg-[#070a12] border border-teal-500/40 rounded-lg px-3 py-2 text-teal-300 font-bold focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">GARANTIA ALOCADA (R$)</label>
              <input
                type="text"
                value={allocatedCapital}
                onChange={(e) => setAllocatedCapital(e.target.value)}
                placeholder="Strike x Qtd"
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-teal-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">DATA DE ENTRADA</label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">DATA DE VENCIMENTO</label>
              <input
                type="date"
                required
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-teal-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-bold">NOTAS</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-300 focus:border-teal-400 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3 rounded-xl font-bold uppercase bg-teal-600 hover:bg-teal-500 text-white transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 mt-4"
          >
            <span>💾</span>
            <span>{isSaving ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES DA POSIÇÃO'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
