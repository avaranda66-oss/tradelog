import { db } from '@/lib/db';
import { tradingDays, trades } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { InteractiveCalendarView } from '@/features/dashboard/components/InteractiveCalendarView';

export const dynamic = 'force-dynamic';

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const requestedDate = params.date;

  const allDays = await db.query.tradingDays.findMany({
    orderBy: desc(tradingDays.date),
  });

  const allTrades = await db.query.trades.findMany();

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 pb-16 animate-in fade-in">
      <InteractiveCalendarView
        tradingDaysData={allDays}
        tradesData={allTrades}
        currentDateStr={requestedDate}
      />
    </div>
  );
}
