import { db } from '../lib/db';
import { tradeImages, tradingDays } from '../lib/db/schema';
import { eq, or, like, not } from 'drizzle-orm';

async function removeMalformedGps() {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-25'),
  });

  if (day) {
    // Remove registros antigos com horário 14:43 ou 14:45 que falharam
    await db.delete(tradeImages).where(
      or(
        like(tradeImages.filePath, '%144352%'),
        like(tradeImages.caption, '%(14:43)%'),
        like(tradeImages.caption, '%(14:45)%')
      )
    );
    console.log('✓ Lotes antigos com erro limpos com sucesso!');
  }
}

removeMalformedGps().catch(console.error);
