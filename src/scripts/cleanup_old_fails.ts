import { db } from '../lib/db';
import { tradeImages, tradingDays } from '../lib/db/schema';
import { eq, or, like } from 'drizzle-orm';

async function cleanupOldFails() {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-25'),
  });

  if (day) {
    // Remove lotes com erro (14:48 e anteriores com problema de tab)
    await db.delete(tradeImages).where(
      or(
        like(tradeImages.filePath, '%144817%'),
        like(tradeImages.caption, '%(14:48)%'),
        like(tradeImages.filePath, '%144352%')
      )
    );
    console.log('✓ Lotes antigos limpos com sucesso!');
  }
}

cleanupOldFails().catch(console.error);
