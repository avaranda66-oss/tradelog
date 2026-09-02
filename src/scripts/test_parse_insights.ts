import { db } from '../lib/db';
import { audioRecords, trades, tradingDays } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function testParse() {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-25'),
  });

  const audios = await db.query.audioRecords.findMany({
    where: eq(audioRecords.tradingDayId, day!.id),
  });

  for (const a of audios) {
    const insights = JSON.parse(a.insights || '{}');
    console.log('Trades field in insights:', JSON.stringify(insights.trades, null, 2));
  }
}

testParse().catch(console.error);
