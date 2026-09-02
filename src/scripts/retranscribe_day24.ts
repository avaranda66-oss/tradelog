import { db } from '../lib/db';
import { audioRecords, tradingDays } from '../lib/db/schema';
import { transcribeAudioRecord } from '../features/audio/actions';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('--- Buscando áudio do dia 2026-08-24 ---');
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-24'),
  });

  if (!day) {
    console.error('Dia 2026-08-24 não encontrado.');
    return;
  }

  const audio = await db.query.audioRecords.findFirst({
    where: eq(audioRecords.tradingDayId, day.id),
  });

  if (!audio) {
    console.error('Nenhum áudio encontrado para 2026-08-24.');
    return;
  }

  console.log(`🎙️ Áudio encontrado: ID ${audio.id} (${audio.filePath})`);
  console.log('⏳ Iniciando transcrição com chunking de 10 min e normalização...');

  const result = await transcribeAudioRecord(audio.id, true);

  console.log('✅ TRANSCRIÇÃO 2026-08-24 CONCLUÍDA:');
  console.log(result.transcription);
}

main().catch(console.error);
