'use server';

import { db } from '@/lib/db';
import { audioRecords, tradingDays } from '@/lib/db/schema';
import { generateId, todayISO } from '@/lib/utils';
import { transcribeAudio } from '@/lib/gemini';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Salva áudio gravado no filesystem e cria registro no banco
 */
export async function saveAudioRecording(formData: FormData) {
  const file = formData.get('audio') as File;
  const dateStr = (formData.get('date') as string) || todayISO();

  if (!file) throw new Error('Nenhum arquivo de áudio');

  // Garante que o dia existe
  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  if (!day) {
    await db.insert(tradingDays).values({ id: generateId(), date: dateStr });
    day = await db.query.tradingDays.findFirst({
      where: eq(tradingDays.date, dateStr),
    });
  }
  if (!day) throw new Error('Falha ao criar dia');

  // Cria pasta de áudio do dia
  const audioDir = path.join(process.cwd(), 'data', 'audio', dateStr);
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }

  // Salva o arquivo
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `narration_${timestamp}.webm`;
  const filePath = path.join(audioDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  // Calcula duração aproximada (tamanho / bitrate estimado)
  const durationSecs = Math.round(buffer.length / 6000); // ~6KB/s para WebM/Opus

  // Cria registro no banco
  const audioId = generateId();
  await db.insert(audioRecords).values({
    id: audioId,
    tradingDayId: day.id,
    filePath: `audio/${dateStr}/${fileName}`,
    durationSecs,
    status: 'recorded',
  });

  return { id: audioId, duration: durationSecs, filePath: `audio/${dateStr}/${fileName}` };
}

/**
 * Transcreve um áudio usando Gemini API
 */
export async function transcribeAudioRecord(audioId: string) {
  const record = await db.query.audioRecords.findFirst({
    where: eq(audioRecords.id, audioId),
  });
  if (!record) throw new Error('Áudio não encontrado');

  // Atualiza status
  await db.update(audioRecords)
    .set({ status: 'transcribing' })
    .where(eq(audioRecords.id, audioId));

  try {
    const fullPath = path.join(process.cwd(), 'data', record.filePath);
    const result = await transcribeAudio(fullPath);

    await db.update(audioRecords)
      .set({
        transcription: result.transcription,
        insights: result.insights,
        status: 'done',
      })
      .where(eq(audioRecords.id, audioId));

    return result;
  } catch (error: any) {
    let errorMsg = error?.message || String(error);
    if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('API key not valid')) {
      errorMsg = 'A chave GEMINI_API_KEY no arquivo .env.local é inválida ou expirou. Por favor, atualize com uma nova chave válida do aistudio.google.com.';
    }

    await db.update(audioRecords)
      .set({
        status: 'error',
        transcription: `⚠️ Erro Gemini AI: ${errorMsg}`,
      })
      .where(eq(audioRecords.id, audioId));
    try {
      revalidatePath('/audios');
      revalidatePath('/');
    } catch {}
    throw error;
  }
}

/**
 * Tenta novamente transcrever um áudio específico
 */
export async function retryAudioTranscription(audioId: string) {
  const result = await transcribeAudioRecord(audioId);
  try {
    revalidatePath('/audios');
    revalidatePath('/database');
    revalidatePath('/');
  } catch {}
  return result;
}

/**
 * Deleta um registro de áudio e seu arquivo físico
 */
export async function deleteAudioRecord(audioId: string) {
  const record = await db.query.audioRecords.findFirst({
    where: eq(audioRecords.id, audioId),
  });

  if (record) {
    if (record.filePath) {
      const fullPath = path.join(process.cwd(), 'data', record.filePath);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch {}
      }
    }
    await db.delete(audioRecords).where(eq(audioRecords.id, audioId));
    revalidatePath('/');
    return { success: true };
  }
  return { success: false };
}

/**
 * Deleta todos os registros de áudio com erro de um dia
 */
export async function clearAudioErrors(dateStr: string) {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  if (day) {
    const errorRecords = await db.query.audioRecords.findMany({
      where: and(
        eq(audioRecords.tradingDayId, day.id),
        eq(audioRecords.status, 'error')
      ),
    });

    for (const record of errorRecords) {
      if (record.filePath) {
        const fullPath = path.join(process.cwd(), 'data', record.filePath);
        if (fs.existsSync(fullPath)) {
          try { fs.unlinkSync(fullPath); } catch {}
        }
      }
      await db.delete(audioRecords).where(eq(audioRecords.id, record.id));
    }

    revalidatePath('/');
    return { count: errorRecords.length };
  }
  return { count: 0 };
}

/**
 * Busca áudios de um dia
 */
export async function getAudiosByDate(dateStr: string) {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });
  if (!day) return [];

  return db.query.audioRecords.findMany({
    where: eq(audioRecords.tradingDayId, day.id),
  });
}
