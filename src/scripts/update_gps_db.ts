import { db } from '../lib/db';
import { tradeImages, tradingDays } from '../lib/db/schema';
import { generateId } from '../lib/utils';
import { eq, and } from 'drizzle-orm';

async function updateGpsDb(dateStr = '2026-08-25') {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  if (day) {
    const existing = await db.query.tradeImages.findFirst({
      where: and(eq(tradeImages.tradingDayId, day.id), eq(tradeImages.imageType, 'farol-gps')),
    });

    const newId = generateId();
    if (existing) {
      await db.update(tradeImages).set({
        id: newId,
        filePath: `images/${dateStr}/farol/farol_gps_${dateStr}.png`,
        caption: 'GPS de Mercado — Farol do Mercado',
      }).where(eq(tradeImages.id, existing.id));
    } else {
      await db.insert(tradeImages).values({
        id: newId,
        tradingDayId: day.id,
        filePath: `images/${dateStr}/farol/farol_gps_${dateStr}.png`,
        imageType: 'farol-gps',
        caption: 'GPS de Mercado — Farol do Mercado',
      });
    }
    console.log(`✓ GPS atualizado no banco SQLite com novo ID: ${newId}`);
  }
}

updateGpsDb().catch(console.error);
