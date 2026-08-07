import { db } from '@/lib/db';
import { trades, tradingDays } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { AnalyticsClientV2 } from './AnalyticsClientV2';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const allTrades = await db.query.trades.findMany({
    orderBy: desc(trades.openTime),
  });

  const allDays = await db.query.tradingDays.findMany({
    orderBy: desc(tradingDays.date),
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          📈 Dashboard de Analytics & Performance
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Análise estatística completa de curva de patrimônio, horários, taxas de acerto e consistência
        </p>
      </div>

      <AnalyticsClientV2 trades={allTrades} days={allDays} />
    </div>
  );
}
