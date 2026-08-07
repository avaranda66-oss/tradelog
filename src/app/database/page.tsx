import { db } from '@/lib/db';
import { tradingDays, trades, tradeImages, audioRecords, videoRecords } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { DatabaseClientView } from './DatabaseClientView';

export const dynamic = 'force-dynamic';

export default async function DatabaseExplorerPage() {
  const allDays = await db.query.tradingDays.findMany({
    orderBy: desc(tradingDays.date),
  });

  const allTrades = await db.query.trades.findMany({
    orderBy: desc(trades.createdAt),
    limit: 100,
  });

  const allVideos = await db.query.videoRecords.findMany({
    orderBy: desc(videoRecords.createdAt),
  });

  const allAudios = await db.query.audioRecords.findMany({
    orderBy: desc(audioRecords.createdAt),
  });

  const allImages = await db.query.tradeImages.findMany({
    orderBy: desc(tradeImages.createdAt),
    limit: 100,
  });

  return (
    <DatabaseClientView
      days={allDays}
      trades={allTrades}
      videos={allVideos}
      audios={allAudios}
      images={allImages}
    />
  );
}
