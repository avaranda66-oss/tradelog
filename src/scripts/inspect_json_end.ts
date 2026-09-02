import { db } from '../lib/db';
import { audioRecords } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const record = await db.query.audioRecords.findFirst({
    where: eq(audioRecords.id, 'u88ogiecpv3jwz5dup997h4e'),
  });

  if (!record || !record.transcription) return;

  const text = record.transcription;
  console.log('Total len:', text.length);
  console.log('Last 500 chars:\n', text.slice(-500));
}

main().catch(console.error);
