import { db } from '../lib/db';
import { audioRecords, tradingDays } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-25'),
  });
  const audio = await db.query.audioRecords.findFirst({
    where: eq(audioRecords.tradingDayId, day!.id),
  });
  console.log('=== STATUS DO ÁUDIO ===', audio?.status);
  console.log('=== TRANSCRIÇÃO COMPLETA GERADA ===\n' + audio?.transcription);
}

main().catch(console.error);
