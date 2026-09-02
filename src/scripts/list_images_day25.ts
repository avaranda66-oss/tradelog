import { db } from '../lib/db';
import { tradeImages, trades, tradingDays } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function listAllImagesDay25() {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-25'),
  });

  if (day) {
    const dayTrades = await db.query.trades.findMany({
      where: eq(trades.tradingDayId, day.id),
    });
    const tradeIds = new Set(dayTrades.map(t => t.id));

    const allImages = await db.query.tradeImages.findMany();
    const dayImages = allImages.filter(img => (img.tradeId && tradeIds.has(img.tradeId)) || img.tradingDayId === day.id);

    console.log(`Total de imagens do dia 25: ${dayImages.length}`);
    for (const img of dayImages) {
      console.log(`- ID: ${img.id}, type: ${img.imageType}, tradeId: ${img.tradeId}, dayId: ${img.tradingDayId}, path: ${img.filePath}, caption: ${img.caption}`);
    }
  }
}

listAllImagesDay25().catch(console.error);
