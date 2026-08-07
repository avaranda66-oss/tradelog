import type { Trade } from '@/lib/db/schema';
import { IconChart } from '@/components/ui/icons';

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
    <section aria-label="Timeline de trades" className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-3 shadow-xl font-mono">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <IconChart className="text-teal-400" />
          <h3 className="text-[10px] font-bold tracking-[0.25em] text-slate-300 uppercase">
            EXECUTION TIMELINE · CRONOGRAMA DO PREGÃO
          </h3>
        </div>
        <span className="text-[9px] text-slate-600 tabular-nums">{trades.length} OPS</span>
      </div>

      <div className="relative pt-2">
        {/* Linha central (zero) */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-800/80" />

        {/* Trades */}
        <div className="flex items-end gap-1.5" style={{ height: '120px' }}>
          {points.map((t) => {
            const isPos = (t.reais || 0) > 0;
            const isNeg = (t.reais || 0) < 0;
            const height = Math.max(Math.abs(t.reais || 0) / maxAccum * 55, 6);
            const time = t.openTime.includes(' ')
              ? t.openTime.split(' ')[1]?.substring(0, 5)
              : t.openTime.substring(0, 5);

            return (
              <div key={t.id} className="flex-1 flex flex-col items-center gap-1 group relative">
                {/* Barra */}
                <div className="flex-1 flex items-end justify-center w-full">
                  <div
                    className={`w-full max-w-6 rounded-sm transition-all ${
                      isPos ? 'bg-teal-500/40 border border-teal-500/60' :
                      isNeg ? 'bg-rose-500/40 border border-rose-500/60' :
                      'bg-slate-700/40 border border-slate-600/60'
                    }`}
                    style={{ height: `${height}px` }}
                  />
                </div>

                {/* Labels */}
                <div className="text-center space-y-0.5 tabular-nums">
                  <span className={`text-[10px] font-mono font-bold block ${
                    isPos ? 'text-teal-400' : isNeg ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {(t.reais || 0) > 0 ? '+' : ''}{t.reais?.toFixed(0)}
                  </span>
                  <span className="text-[9px] text-slate-600 block">{time}</span>
                </div>

                {/* Tooltip on hover */}
                <div className="absolute bottom-full mb-2 hidden group-hover:block z-20">
                  <div className="bg-[#070a10] border border-slate-700 rounded-md px-3 py-2 text-xs whitespace-nowrap shadow-2xl">
                    <div className="font-bold text-slate-200">Trade #{t.tradeNumber} ({t.side})</div>
                    <div className="text-slate-500 text-[10px]">{t.instrument} · {t.duration || 'N/A'}</div>
                    <div className={`font-mono font-bold ${isPos ? 'text-teal-400' : 'text-rose-400'}`}>
                      R$ {(t.reais || 0) > 0 ? '+' : ''}{t.reais?.toFixed(2)}
                    </div>
                    <div className="text-slate-500 text-[9px] mt-0.5">
                      Acumulado: R$ {t.accumulated > 0 ? '+' : ''}{t.accumulated.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Linha de acumulado */}
        <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px] tabular-nums">
          <span className="text-slate-600">ACUMULADO DO PREGÃO</span>
          <span className={`font-mono font-bold ${
            accumulated >= 0 ? 'text-teal-400' : 'text-rose-400'
          }`}>
            R$ {accumulated > 0 ? '+' : ''}{accumulated.toFixed(2)}
          </span>
        </div>
      </div>
    </section>
  );
}

export default TradeTimeline;
