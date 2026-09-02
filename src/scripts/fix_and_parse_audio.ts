import { db } from '../lib/db';
import { audioRecords } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

function parseAudioTimestampToSeconds(timestampStr: string): number {
  if (!timestampStr) return 0;
  const parts = timestampStr.split(':').map(Number);
  if (parts.length === 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
  if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  return 0;
}

function calculateMarketTimeFromStart(startMarketTime: string, offsetSecs: number): string {
  const parts = startMarketTime.split(':').map(Number);
  let h = parts[0] ?? 8;
  let m = parts[1] ?? 55;
  let s = parts[2] ?? 57;

  let totalSecs = h * 3600 + m * 60 + s + offsetSecs;
  const newH = Math.floor(totalSecs / 3600) % 24;
  const newM = Math.floor((totalSecs % 3600) / 60);

  return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
}

function repairAndParseJSON(jsonStr: string): any {
  let cleaned = jsonStr.trim();
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace !== -1) {
    cleaned = cleaned.substring(firstBrace);
  }

  // Tenta parse direto
  try {
    return JSON.parse(cleaned);
  } catch {}

  // Tenta cortar no último '}' e fechar
  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace !== -1) {
    const truncated = cleaned.substring(0, lastBrace + 1);
    try {
      return JSON.parse(truncated + ']}');
    } catch {}
    try {
      return JSON.parse(truncated + '}');
    } catch {}
    try {
      return JSON.parse(truncated);
    } catch {}
  }

  throw new Error('Não foi possível reparar a estrutura JSON');
}

async function main() {
  const record = await db.query.audioRecords.findFirst({
    where: eq(audioRecords.id, 'u88ogiecpv3jwz5dup997h4e'),
  });

  if (!record || !record.transcription) {
    console.log('Sem transcrição para reparar');
    return;
  }

  console.log('Reparando JSON truncado...');
  const parsed = repairAndParseJSON(record.transcription);
  console.log('✅ Sucesso! Segmentos extraídos:', parsed.segments?.length);

  const startMarketTime = '08:55:57';

  if (parsed.segments && Array.isArray(parsed.segments)) {
    parsed.segments = parsed.segments.map((s: any) => {
      const offsetSecs = parseAudioTimestampToSeconds(s.audio_timestamp);
      const calculatedMarketTime = calculateMarketTimeFromStart(startMarketTime, offsetSecs);
      return {
        ...s,
        market_time: calculatedMarketTime,
      };
    });
  }

  let formattedText = parsed.transcription || '';
  if (parsed.segments && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
    formattedText = parsed.segments.map((s: any) => {
      const timeHeader = `⏱️ **[${s.audio_timestamp} | Pregão ${s.market_time}]**`;
      const content = s.raw_text || s.ai_analysis || s.text || '';
      return `${timeHeader}\n${content}`;
    }).join('\n\n');
  }

  const newInsights = JSON.stringify({
    trades: parsed.trades_mentioned || [],
    emotion: parsed.emotional_state || '',
    observations: parsed.key_observations || [],
    segments: parsed.segments || [],
    aiSummary: parsed.ai_summary || '',
    startMarketTime,
  });

  await db.update(audioRecords)
    .set({
      transcription: formattedText,
      insights: newInsights,
      status: 'done',
    })
    .where(eq(audioRecords.id, record.id));

  console.log('✅ Banco de dados SQLite atualizado com sucesso! Componente de 2 colunas recuperado!');
}

main().catch(console.error);
