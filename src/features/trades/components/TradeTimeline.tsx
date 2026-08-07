import type { Trade } from '@/lib/db/schema';

export function TradeTimeline({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return null;

  // Calcula acumulado de pontos
  let accumulated = 0;
  const points = trades.map(t => {
    accumulated += t.reais || 0;
    return { ...t, accumulated };
  });

  const maxAccum = Math.max(...points.map(p => Math.abs(p.accumulated)), 1);

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-300">⏱️ Timeline de Operações</h3>

      <div className="relative">
        {/* Linha central (zero) */}
        <div className="absolute left-16 right-0 top-1/2 h-px bg-slate-700/50" />

        {/* Trades */}
        <div className="flex items-end gap-1" style={{ height: '120px' }}>
          {points.map((t, i) => {
            const isPos = (t.reais || 0) > 0;
            const isNeg = (t.reais || 0) < 0;
            const height = Math.max(Math.abs(t.reais || 0) / maxAccum * 50, 4);
            const time = t.openTime.includes(' ')
              ? t.openTime.split(' ')[1]?.substring(0, 5)
              : t.openTime.substring(0, 5);

            return (
              <div key={t.id} className="flex-1 flex flex-col items-center gap-1 group relative">
                {/* Barra */}
                <div className="flex-1 flex items-end justify-center w-full">
                  <div
                    className={`w-full max-w-8 rounded-t transition-all group-hover:opacity-100 ${
                      isPos ? 'bg-emerald-500/40 border border-emerald-500/30' :
                      isNeg ? 'bg-rose-500/40 border border-rose-500/30' :
                      'bg-slate-600/40 border border-slate-600/30'
                    }`}
                    style={{ height: `${height}px` }}
                  />
                </div>

                {/* Labels */}
                <div className="text-center space-y-0.5">
                  <span className={`text-[10px] font-mono font-bold block ${
                    isPos ? 'text-emerald-400' : isNeg ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {(t.reais || 0) > 0 ? '+' : ''}{t.reais?.toFixed(0)}
                  </span>
                  <span className="text-[9px] text-slate-600 block">{time}</span>
                  <span className={`text-[9px] px-1 rounded ${
                    t.side === 'C' ? 'text-emerald-500' : 'text-rose-500'
                  }`}>
                    {t.side}
                  </span>
                </div>

                {/* Tooltip on hover */}
                <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                  <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl">
                    <div className="font-medium text-slate-200">Trade {t.tradeNumber}</div>
                    <div className="text-slate-400">{t.instrument} · {t.duration}</div>
                    <div className={`font-mono font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                      R$ {(t.reais || 0) > 0 ? '+' : ''}{t.reais?.toFixed(2)}
                    </div>
                    <div className="text-slate-500 text-[10px] mt-1">
                      Acumulado: R$ {t.accumulated > 0 ? '+' : ''}{t.accumulated.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Linha de acumulado */}
        <div className="mt-2 flex items-center justify-between px-2">
          <span className="text-[10px] text-slate-600">Primeiro trade</span>
          <span className={`text-xs font-mono font-bold ${
            accumulated >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            Acumulado: R$ {accumulated > 0 ? '+' : ''}{accumulated.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
