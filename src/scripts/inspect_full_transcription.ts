import { db } from '../lib/db';
import { audioRecords } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const record = await db.query.audioRecords.findFirst({
    where: eq(audioRecords.id, 'u88ogiecpv3jwz5dup997h4e'),
  });

  if (!record) return;

  console.log('--- INSIGHTS & SEGMENTOS CAPTURADOS ---');
  console.log(record.transcription);
}

main().catch(console.error);
