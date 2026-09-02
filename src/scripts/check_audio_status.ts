import { db } from '../lib/db';
import { audioRecords, tradingDays } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-10'),
  });

  if (!day) {
    console.log('Dia 2026-08-10 não encontrado');
    return;
  }

  const audios = await db.query.audioRecords.findMany({
    where: eq(audioRecords.tradingDayId, day.id),
  });

  console.log('--- STATUS DOS ÁUDIOS DO DIA 10/08/2026 ---');
  for (const a of audios) {
    console.log(`ID: ${a.id}`);
    console.log(`Status: ${a.status}`);
    console.log(`Arquivo: ${a.filePath}`);
    console.log(`Duração: ${a.durationSecs}s (${Math.floor((a.durationSecs || 0)/60)}m ${(a.durationSecs || 0)%60}s)`);
    console.log(`Transcrição len: ${a.transcription ? a.transcription.length : 0}`);
    if (a.transcription) {
      console.log(`Primeiros 200 chars: ${a.transcription.slice(0, 200)}...`);
    }
  }
}

main().catch(console.error);
