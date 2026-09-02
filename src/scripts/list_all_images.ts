import { db } from '../lib/db';
import { tradeImages, tradingDays } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function listImages() {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-25'),
  });
  if (!day) {
    console.log('Dia 2026-08-25 não encontrado');
    return;
  }
  const images = await db.query.tradeImages.findMany({
    where: eq(tradeImages.tradingDayId, day.id),
  });
  console.log('Images for 2026-08-25:');
  console.log(JSON.stringify(images, null, 2));
}

listImages().catch(console.error);
