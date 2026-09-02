import { db } from '../lib/db';
import { tradeImages, tradingDays } from '../lib/db/schema';
import { eq, or, like } from 'drizzle-orm';

async function cleanupOldTests() {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-25'),
  });

  if (day) {
    // Remove registros antigos de farol-gps-flow ou testes anteriores
    await db.delete(tradeImages).where(
      or(
        eq(tradeImages.imageType, 'farol-gps-flow'),
        like(tradeImages.filePath, '%farol_gps_flow%')
      )
    );
    console.log('✓ Registros duplicados limpos do SQLite!');
  }
}

cleanupOldTests().catch(console.error);
