import { db } from '../lib/db';
import { trades, tradingDays } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function listDayTrades() {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-25'),
  });

  if (day) {
    const allTrades = await db.query.trades.findMany({
      where: eq(trades.tradingDayId, day.id),
    });
    console.log('Trades do dia 25:', JSON.stringify(allTrades, null, 2));
  }
}

listDayTrades().catch(console.error);
