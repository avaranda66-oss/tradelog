import { db } from '@/lib/db';
import { tradingDays, trades, audioRecords, keyLevels, tradeImages } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { todayISO, generateId } from '@/lib/utils';
import { StudioView } from './StudioView';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

export default async function HomePage({
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

  // Busca registro no banco ou inicializa dia se inexistente
  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, targetDate),
  });

  if (!day) {
    const newDayId = generateId();
    const now = new Date().toISOString();
    await db.insert(tradingDays).values({
      id: newDayId,
      date: targetDate,
      wakeUpTime: '',
      sleepQuality: null,
      mentalState: '',
      generalBias: '',
      macroCalendar: '',
      overnightNote: '',
      personalNote: '',
      honestPhrase: '',
      retrospective: '',
      emotionalPost: '',
      farolBias: '',
      farolKeyLevels: '',
      farolNews: '',
      farolInsights: '',
      totalPoints: 0,
      totalReais: 0,
      tradesRight: 0,
      tradesWrong: 0,
      preMarketDone: false,
      overtrading: false,
      createdAt: now,
      updatedAt: now,
    });

    day = await db.query.tradingDays.findFirst({
      where: eq(tradingDays.date, targetDate),
    });
  }

  if (!day) throw new Error('Falha ao carregar dia');

  let dayTrades = await db.query.trades.findMany({
    where: eq(trades.tradingDayId, day.id),
    orderBy: trades.tradeNumber,
  });

  let dayAudios = await db.query.audioRecords.findMany({
    where: eq(audioRecords.tradingDayId, day.id),
  });

  let dayLevels = await db.query.keyLevels.findMany({
    where: eq(keyLevels.tradingDayId, day.id),
  });

  // Checa existência de vídeos no disco
  const videoDir = path.join(process.cwd(), 'data', 'videos', targetDate);
  const hasVideo = fs.existsSync(videoDir) && fs.readdirSync(videoDir).length > 0;

  // Checa contagem de screenshots extraídos
  let imageCount = 0;
  if (dayTrades.length > 0) {
    const allImages = await db.query.tradeImages.findMany();
    const tradeIds = new Set(dayTrades.map(t => t.id));
    imageCount = allImages.filter(img => tradeIds.has(img.tradeId || '')).length;
  }

  // Busca todos os dias cadastrados no histórico para cálculo de streaks e insígnias
  const historyDays = await db.query.tradingDays.findMany({
    orderBy: desc(tradingDays.date),
  });

  return (
    <StudioView
      day={day}
      date={targetDate}
      tradeCount={dayTrades.length}
      hasCsv={dayTrades.length > 0}
      hasVideo={hasVideo}
      hasAudio={dayAudios.length > 0}
      dayAudios={dayAudios}
      dayLevels={dayLevels}
      dayTrades={dayTrades}
      imageCount={imageCount}
      historyDays={historyDays}
    />
  );
}
