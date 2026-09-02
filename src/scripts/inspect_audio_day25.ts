import { db } from '../lib/db';
import { audioRecords, trades, tradingDays } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function inspectAudioAndTrades() {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-25'),
  });

  console.log('Trading Day 2026-08-25:', day);

  if (day) {
    const dayTrades = await db.query.trades.findMany({
      where: eq(trades.tradingDayId, day.id),
    });
    console.log(`\nTrades no banco para o dia 2026-08-25 (${dayTrades.length} trades):`);
    console.log(JSON.stringify(dayTrades, null, 2));

    const audios = await db.query.audioRecords.findMany({
      where: eq(audioRecords.tradingDayId, day.id),
    });
    console.log(`\nÁudios gravados para o dia (${audios.length} áudios):`);
    for (const a of audios) {
      console.log(`Audio ID: ${a.id}, Status: ${a.status}`);
      console.log('Insights:', a.insights);
    }
  }
}

inspectAudioAndTrades().catch(console.error);
