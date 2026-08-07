import { db } from '@/lib/db';
import { audioRecords, tradingDays, trades } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { todayISO } from '@/lib/date-utils';
import { AudioStudioClientV2 } from './AudioStudioClientV2';

export const dynamic = 'force-dynamic';

export default async function AudiosPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const requestedDate = params.date || todayISO();

  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, requestedDate),
  });

  if (!day) {
    const recentDay = await db.query.tradingDays.findFirst({
      orderBy: desc(tradingDays.date),
    });
    if (recentDay) day = recentDay;
  }

  let audios: (typeof audioRecords.$inferSelect)[] = [];
  let dayTrades: (typeof trades.$inferSelect)[] = [];

  if (day) {
    audios = await db.query.audioRecords.findMany({
      where: eq(audioRecords.tradingDayId, day.id),
      orderBy: desc(audioRecords.createdAt),
    });

    dayTrades = await db.query.trades.findMany({
      where: eq(trades.tradingDayId, day.id),
      orderBy: trades.tradeNumber,
    });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          🎙️ Estúdio de Gravação & Transcrição
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Grave sua voz ao vivo ou gerencie transcrições IA com timestamps para o dia {day?.date || requestedDate}
        </p>
      </div>

      <AudioStudioClientV2
        date={day?.date || requestedDate}
        audios={audios}
        trades={dayTrades}
      />
    </div>
  );
}
