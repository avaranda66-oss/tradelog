import { db } from '@/lib/db';
import { trades, tradingDays } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { TimelineClientV2 } from './TimelineClientV2';

export const dynamic = 'force-dynamic';

export default async function OperacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const requestedDate = params.date;

  let day;
  let dayTrades: (typeof trades.$inferSelect)[] = [];

  if (requestedDate) {
    day = await db.query.tradingDays.findFirst({
      where: eq(tradingDays.date, requestedDate),
    });
  }

  if (!day) {
    const recentTrade = await db
      .select({ tradingDayId: trades.tradingDayId })
      .from(trades)
      .innerJoin(tradingDays, eq(trades.tradingDayId, tradingDays.id))
      .orderBy(desc(tradingDays.date))
      .limit(1);

    if (recentTrade.length > 0 && recentTrade[0].tradingDayId) {
      day = await db.query.tradingDays.findFirst({
        where: eq(tradingDays.id, recentTrade[0].tradingDayId),
      });
    }
  }

  if (day) {
    dayTrades = await db.query.trades.findMany({
      where: eq(trades.tradingDayId, day.id),
      orderBy: trades.tradeNumber,
    });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            ⏱️ Timeline de Operações
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Feed vertical detalhado trade a trade para {day?.date || 'o dia selecionado'}
          </p>
        </div>

        {day && (
          <span className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
            Total: {dayTrades.length} trades
          </span>
        )}
      </div>

      <TimelineClientV2 trades={dayTrades} date={day?.date || ''} />
    </div>
  );
}
