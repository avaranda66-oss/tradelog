'use client';

import { useState } from 'react';
import type { Trade } from '@/lib/db/schema';
import { TradeModalV2 } from '@/features/trades/components/TradeModalV2';
import { TradeReplayModal } from '@/features/video/components/TradeReplayModal';

export function TimelineClientV2({ trades, date }: { trades: Trade[]; date: string }) {
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [replayTrade, setReplayTrade] = useState<Trade | null>(null);

  if (trades.length === 0) {
    return (
      <div className="bg-[#0d131f] border border-slate-800 rounded-xl p-12 text-center text-slate-500 space-y-3">
        <span className="text-4xl block">⏱️</span>
        <p className="text-sm font-medium">Nenhuma operação registrada para este dia.</p>
        <p className="text-xs text-slate-600">Importe o CSV do Profit Pro no Dashboard para visualizar a timeline.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-mono">
      {/* Feed Vertical Conectado */}
      <div className="relative pl-6 space-y-4">
        {/* Linha vertical receptora */}
        <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-slate-800" />

        {trades.map((trade) => {
          const isPos = (trade.reais || 0) > 0;
          const isNeg = (trade.reais || 0) < 0;

          const dotBg = isPos ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : isNeg ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 'bg-slate-500';
          const resultColor = isPos ? 'text-emerald-400' : isNeg ? 'text-rose-400' : 'text-slate-400';
          const sideTag = trade.side === 'C' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20';

          const openTime = trade.openTime.includes(' ') ? trade.openTime.split(' ')[1]?.substring(0, 5) : trade.openTime.substring(0, 5);

          return (
            <div
              key={trade.id}
              onClick={() => setSelectedTrade(trade)}
              className="relative bg-[#0d131f] border border-slate-800/80 hover:border-slate-700 rounded-xl p-4 cursor-pointer transition-all duration-200 hover:scale-[1.005] hover:shadow-xl group"
            >
              {/* Círculo indicador na linha vertical */}
              <div className={`absolute -left-[19px] top-6 w-3 h-3 rounded-full border-2 border-[#070a11] ${dotBg}`} />

              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Esquerda: Horário, Sentido, Ativo, Preços */}
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-cyan-400 bg-cyan-500/5 border border-cyan-500/10 px-2 py-1 rounded">
                    {openTime}
                  </span>

                  <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${sideTag}`}>
                    {trade.side === 'C' ? 'COMPRA' : 'VENDA'}
                  </span>

                  <div>
                    <span className="text-sm font-bold text-slate-200 block">{trade.instrument}</span>
                    <span className="text-xs text-slate-500 font-mono">
                      {trade.entryPrice.toLocaleString('pt-BR')} → {trade.exitPrice.toLocaleString('pt-BR')}
                    </span>
                  </div>

                  {trade.strategy && (
                    <span className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[10px] font-bold uppercase hidden md:inline">
                      {trade.strategy}
                    </span>
                  )}
                </div>

                {/* Direita: Pontos, Financeiro, Botão Replay e CTA */}
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className={`text-sm font-bold font-mono block ${resultColor}`}>
                      {(trade.points || 0) > 0 ? '+' : ''}{trade.points} pts
                    </span>
                    <span className={`text-xs font-mono font-bold block ${resultColor}`}>
                      R$ {(trade.reais || 0) > 0 ? '+' : ''}{trade.reais?.toFixed(2)}
                    </span>
                  </div>

                  {/* Botão de Replay Direto */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReplayTrade(trade);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                    title="Assistir gravação de vídeo deste trade"
                  >
                    🎬 REPLAY
                  </button>

                  <span className="text-slate-500 group-hover:text-slate-300 transition-colors text-xs font-medium">
                    Detalhes ↗
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Expandido Inspector */}
      {selectedTrade && (
        <TradeModalV2
          trade={selectedTrade}
          date={date}
          onClose={() => setSelectedTrade(null)}
        />
      )}

      {/* Modal de Replay de Vídeo */}
      {replayTrade && (
        <TradeReplayModal
          trade={replayTrade}
          onClose={() => setReplayTrade(null)}
        />
      )}
    </div>
  );
}
