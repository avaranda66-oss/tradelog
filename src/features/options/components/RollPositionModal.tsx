'use client';

import React, { useState } from 'react';
import type { EnrichedOptionPosition } from '../calculations';
import { rollOptionPosition } from '../actions';

interface RollPositionModalProps {
  position: EnrichedOptionPosition | null;
  isOpen: boolean;
  onClose: () => void;
  onRolled: () => void;
}

export function RollPositionModal({
  position,
  isOpen,
  onClose,
  onRolled,
}: RollPositionModalProps) {
  if (!isOpen || !position) return null;

  const [recompraPrice, setRecompraPrice] = useState(position.currentPrice.toFixed(2));
  const [newOptionTicker, setNewOptionTicker] = useState('');
  const [newStrike, setNewStrike] = useState(position.strike.toFixed(2));
  const [newEntryPrice, setNewEntryPrice] = useState('1.10');
  const [newExpirationDate, setNewExpirationDate] = useState('2026-10-16');
  const [isRolling, setIsRolling] = useState(false);

  const handleConfirmRoll = async () => {
    const numRecompra = parseFloat(recompraPrice.replace(',', '.')) || 0;
    const numNewStrike = parseFloat(newStrike.replace(',', '.')) || 0;
    const numNewPrice = parseFloat(newEntryPrice.replace(',', '.')) || 0;

    if (!newOptionTicker || numNewStrike <= 0 || numNewPrice <= 0) {
      alert('Por favor, informe o ticker e dados da nova opção de rolagem');
      return;
    }

    setIsRolling(true);
    try {
      const res = await rollOptionPosition({
        currentPositionId: position.id,
        recompraPrice: numRecompra,
        newOptionTicker: newOptionTicker.toUpperCase().trim(),
        newStrike: numNewStrike,
        newEntryPrice: numNewPrice,
        newExpirationDate,
      });

      if (res.success) {
        onRolled();
        onClose();
      } else {
        alert('Erro ao realizar rolagem');
      }
    } finally {
      setIsRolling(false);
    }
  };

  const lucroCicloAtual = (position.entryPrice - (parseFloat(recompraPrice.replace(',', '.')) || 0)) * position.quantity;
  const novoCredito = (parseFloat(newEntryPrice.replace(',', '.')) || 0) * position.quantity;
  const resultadoLiquidoRolagem = novoCredito - ((parseFloat(recompraPrice.replace(',', '.')) || 0) * position.quantity);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#0b1018] border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔄</span>
            <div>
              <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wider">
                ROLAGEM DE OPÇÃO (MANEJO ATIVO)
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Encerra o ciclo de {position.tickerOption} e abre o próximo vencimento.
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

        {/* Resumo da Posição Atual */}
        <div className="bg-[#070a12] border border-slate-800 rounded-xl p-3 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between text-slate-400">
            <span>Posição Atual:</span>
            <span className="font-bold text-slate-200">{position.tickerOption} ({position.side} {position.optionType})</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Preço Entrada:</span>
            <span className="font-bold text-slate-200">R$ {position.entryPrice.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Lucro no Ciclo Atual:</span>
            <span className="font-bold text-emerald-400">+R$ {lucroCicloAtual.toFixed(2)}</span>
          </div>
        </div>

        {/* Inputs da Nova Rolagem */}
        <div className="space-y-3 font-mono text-xs">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-bold">PREÇO DE RECOMPRA DA ATUAL (R$)</label>
            <input
              type="text"
              value={recompraPrice}
              onChange={(e) => setRecompraPrice(e.target.value)}
              className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-bold focus:border-teal-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">NOVO TICKER OPÇÃO</label>
              <input
                type="text"
                value={newOptionTicker}
                onChange={(e) => setNewOptionTicker(e.target.value)}
                placeholder="ex: ITUGV393"
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-teal-300 font-bold focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">NOVO STRIKE (R$)</label>
              <input
                type="text"
                value={newStrike}
                onChange={(e) => setNewStrike(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-amber-300 font-bold focus:border-teal-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">NOVO PRÊMIO RECEBIDO (R$)</label>
              <input
                type="text"
                value={newEntryPrice}
                onChange={(e) => setNewEntryPrice(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-emerald-300 font-bold focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold">NOVO VENCIMENTO</label>
              <input
                type="date"
                value={newExpirationDate}
                onChange={(e) => setNewExpirationDate(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-teal-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Resumo Financeiro da Rolagem */}
        <div className="bg-[#0e1626] border border-teal-500/30 rounded-xl p-3 text-xs font-mono space-y-1">
          <div className="flex items-center justify-between text-slate-300">
            <span>Novo Crédito Recebido:</span>
            <span className="font-bold text-emerald-400">+R$ {novoCredito.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-300 border-t border-slate-800 pt-1">
            <span>Caixa Líquido da Rolagem:</span>
            <span className={`font-bold ${resultadoLiquidoRolagem >= 0 ? 'text-teal-300' : 'text-rose-400'}`}>
              {resultadoLiquidoRolagem >= 0 ? '+' : ''}R$ {resultadoLiquidoRolagem.toFixed(2)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleConfirmRoll}
          disabled={isRolling}
          className="w-full py-2.5 rounded-xl font-mono text-xs font-bold uppercase bg-sky-600 hover:bg-sky-500 text-white transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
        >
          <span>🔄</span>
          <span>{isRolling ? 'EXECUTANDO ROLAGEM...' : 'CONFIRMAR ROLAGEM DE CICLO'}</span>
        </button>
      </div>
    </div>
  );
}
