import { db } from '../lib/db';
import { audioRecords, tradingDays } from '../lib/db/schema';
import { reSyncAudioTradeConfluence } from '../features/audio/actions';
import { eq } from 'drizzle-orm';

async function syncDay25() {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-25'),
  });

  if (day) {
    const audios = await db.query.audioRecords.findMany({
      where: eq(audioRecords.tradingDayId, day.id),
    });

    for (const a of audios) {
      console.log(`Sincronizando confluência para áudio ${a.id}...`);
      const res = await reSyncAudioTradeConfluence(a.id);
      console.log('Resultado confluência:', JSON.stringify(res.confluenceTrades, null, 2));
    }
  }
}

syncDay25().catch(console.error);
