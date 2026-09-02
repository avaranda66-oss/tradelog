import { db } from '../lib/db';
import { tradeImages, tradingDays } from '../lib/db/schema';
import { eq, and } from 'drizzle-orm';

async function main() {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-10'),
  });

  if (!day) {
    console.log('Dia 10/08/2026 não encontrado no SQLite');
    return;
  }

  const sessionImages = await db.query.tradeImages.findMany({
    where: eq(tradeImages.tradingDayId, day.id),
  });

  console.log(`--- POST-SESSION PRINTS DO DIA 10/08/2026 (${sessionImages.length}) ---`);
  for (const img of sessionImages) {
    console.log(`ID: ${img.id} | Path: ${img.filePath} | Type: ${img.imageType} | Caption: ${img.caption}`);
  }
}

main().catch(console.error);
