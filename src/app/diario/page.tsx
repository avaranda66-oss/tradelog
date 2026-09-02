import { db } from '@/lib/db';
import { tradingDays, trades, audioRecords, keyLevels } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { todayISO } from '@/lib/utils';
import { JournalHubView } from './JournalHubView';

export const dynamic = 'force-dynamic';

export default async function DiarioPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const requestedDate = params.date;

  let targetDate: string;

  if (requestedDate) {
    targetDate = requestedDate;
  } else {
    const recentTrade = await db
      .select({ date: tradingDays.date })
      .from(trades)
      .innerJoin(tradingDays, eq(trades.tradingDayId, tradingDays.id))
      .orderBy(desc(tradingDays.date))
      .limit(1);

    targetDate = recentTrade.length > 0 ? recentTrade[0].date : todayISO();
  }

  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, targetDate),
  });

  let dayTrades: (typeof trades.$inferSelect)[] = [];
  let dayAudios: (typeof audioRecords.$inferSelect)[] = [];
  let dayLevels: (typeof keyLevels.$inferSelect)[] = [];

  if (day) {
    dayTrades = await db.query.trades.findMany({
      where: eq(trades.tradingDayId, day.id),
      orderBy: trades.tradeNumber,
    });
    dayAudios = await db.query.audioRecords.findMany({
      where: eq(audioRecords.tradingDayId, day.id),
    });
    dayLevels = await db.query.keyLevels.findMany({
      where: eq(keyLevels.tradingDayId, day.id),
    });
  }

  // Busca histórico global para insígnias acumuladas, streaks e avaliação de dias úteis
  const historyDays = await db.query.tradingDays.findMany({
    orderBy: desc(tradingDays.date),
  });
  const allTrades = await db.query.trades.findMany();
  const allAudios = await db.query.audioRecords.findMany();

  return (
    <JournalHubView
      day={day || null}
      date={targetDate}
      trades={dayTrades}
      allTrades={allTrades}
      audios={dayAudios}
      allAudios={allAudios}
      levels={dayLevels}
      historyDays={historyDays}
    />
  );
}
