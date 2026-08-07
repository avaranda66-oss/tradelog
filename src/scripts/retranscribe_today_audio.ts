import { db } from '../lib/db';
import { audioRecords } from '../lib/db/schema';
import { transcribeAudioRecord } from '../features/audio/actions';
import { eq } from 'drizzle-orm';

async function main() {
  const records = await db.query.audioRecords.findMany({
    orderBy: (audioRecords, { desc }) => [desc(audioRecords.createdAt)],
  });

  console.log(`🎙️ Encontrados ${records.length} registros de áudio no banco.`);

  for (const r of records) {
    console.log(`Transcrevendo áudio ID ${r.id} (${r.filePath})...`);
    try {
      await transcribeAudioRecord(r.id);
      console.log(`✅ Sucesso na transcrição do áudio ${r.id}!`);
    } catch (err: any) {
      console.error(`❌ Erro no áudio ${r.id}:`, err.message || err);
    }
  }
}

main().catch(console.error);
