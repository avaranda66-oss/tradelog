import { db } from '@/lib/db';
import { trades, tradingDays } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { todayISO } from '@/lib/utils';
import { TimelineClientV2 } from './TimelineClientV2';

export const dynamic = 'force-dynamic';

export default async function OperacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const targetDate = params.date || todayISO();

  // Busca o dia exato selecionado
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, targetDate),
  });

  // Busca APENAS os trades pertencentes a este dia específico
  let dayTrades: (typeof trades.$inferSelect)[] = [];
  if (day) {
    dayTrades = await db.query.trades.findMany({
      where: eq(trades.tradingDayId, day.id),
      orderBy: trades.tradeNumber,
    });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div>
          <h1 className="text-xl font-mono font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
            EXECUTION TIMELINE // OPERAÇÕES & TRADES
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Feed de execuções registradas para {targetDate}
          </p>
        </div>

        <span className="text-xs font-mono bg-[#070a10] border border-slate-800/80 px-3 py-1.5 rounded-md text-slate-300 tabular-nums">
          TOTAL: {dayTrades.length} TRADES
        </span>
      </div>

      {dayTrades.length === 0 ? (
        <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-12 text-center text-slate-500 space-y-2 font-mono">
          <p className="text-sm font-bold text-slate-400">NENHUM TRADE REGISTRADO PARA {targetDate}</p>
          <p className="text-xs text-slate-600">
            Nenhuma operação foi importada ou executada nesta data.
          </p>
        </div>
      ) : (
        <TimelineClientV2 trades={dayTrades} date={targetDate} />
      )}
    </div>
  );
}
