import { db } from '../lib/db';
import { audioRecords } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const record = await db.query.audioRecords.findFirst({
    where: eq(audioRecords.id, 'u88ogiecpv3jwz5dup997h4e'),
  });

  if (!record) {
    console.log('Registro não encontrado');
    return;
  }

  console.log('--- RECORD DETAILS ---');
  console.log('ID:', record.id);
  console.log('Status:', record.status);
  console.log('Insights length:', record.insights ? record.insights.length : 0);
  console.log('Insights preview:', record.insights);
  console.log('Transcription length:', record.transcription ? record.transcription.length : 0);
  console.log('Transcription preview (first 500 chars):\n', record.transcription?.slice(0, 500));
}

main().catch(console.error);
