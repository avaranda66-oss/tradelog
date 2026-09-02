'use server';

import { db } from '@/lib/db';
import { audioRecords, tradingDays, trades, videoRecords } from '@/lib/db/schema';
import { generateId, todayISO } from '@/lib/utils';
import { transcribeAudio, synthesizeAudioTradeConfluence } from '@/lib/gemini';
import { parseOBSFilename } from '@/lib/video-processor';
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
export async function transcribeAudioRecord(audioId: string, forceRetry = false) {
  const record = await db.query.audioRecords.findFirst({
    where: eq(audioRecords.id, audioId),
  });
  if (!record) throw new Error('Áudio não encontrado');

  // Previne chamadas duplicadas à API se o áudio já estiver sendo processado
  if (record.status === 'transcribing' && !forceRetry) {
    console.log(`[Audio] Áudio ${audioId} já está em transcrever no momento. Ignorando chamada duplicada.`);
    return { transcription: record.transcription || '', insights: record.insights || '{}' };
  }

  // Se já foi concluído e não é forceRetry, retorna o resultado salvo
  if (record.status === 'done' && !forceRetry && record.transcription) {
    return { transcription: record.transcription, insights: record.insights || '{}' };
  }

  // Atualiza status para transcribing
  await db.update(audioRecords)
    .set({ status: 'transcribing' })
    .where(eq(audioRecords.id, audioId));

  try {
    const fullPath = path.join(process.cwd(), 'data', record.filePath);
    
    // Extrai a hora de início real da gravação do pregão (ex: 09:04:54)
    let startMarketTime = '09:04:54';

    // 1. Tenta buscar no vídeo registrado para este dia no banco (obtém do nome do OBS "2026-08-07 09-04-54.mp4")
    if (record.tradingDayId) {
      const video = await db.query.videoRecords.findFirst({
        where: eq(videoRecords.tradingDayId, record.tradingDayId),
      });
      if (video?.filename) {
        const parsedVideo = parseOBSFilename(video.filename);
        if (parsedVideo?.startTime) {
          startMarketTime = parsedVideo.startTime;
          console.log(`[Audio] Horário de início do pregão obtido do vídeo OBS (${video.filename}): ${startMarketTime}`);
        }
      }
    }

    // 2. Se não encontrou no vídeo, tenta parsear do nome do arquivo de áudio
    if (startMarketTime === '09:04:54' && record.filePath) {
      const parsedAudio = parseOBSFilename(path.basename(record.filePath));
      if (parsedAudio?.startTime) {
        startMarketTime = parsedAudio.startTime;
        console.log(`[Audio] Horário de início obtido do arquivo de áudio: ${startMarketTime}`);
      }
    }

    // Busca dados do dia e trades para alimentar o Gemini com o contexto real
    let dayContext = '';
    if (record.tradingDayId) {
      const day = await db.query.tradingDays.findFirst({
        where: eq(tradingDays.id, record.tradingDayId),
      });
      const dayTrades = await db.query.trades.findMany({
        where: eq(trades.tradingDayId, record.tradingDayId),
      });

      if (day) {
        dayContext += `Dia: ${day.date} | Acordou: ${day.wakeUpTime || '—'} | Viés: ${day.generalBias || '—'} | Calendário: ${day.macroCalendar || '—'}\n`;
      }
      if (dayTrades && dayTrades.length > 0) {
        dayContext += `Trades Executados no Dia:\n` + dayTrades.map(t => 
          `• Trade #${t.tradeNumber} [${t.side === 'C' ? 'COMPRA' : 'VENDA'}]: Horário ${t.openTime} -> ${t.closeTime}, Entrada: ${t.entryPrice}, Saída: ${t.exitPrice}, Resultado: ${t.points} pts (R$ ${t.reais})`
        ).join('\n');
      }
    }

    const result = await transcribeAudio(fullPath, startMarketTime, dayContext);

    // Confluência profunda e auditoria dos trades do CSV com as falas do áudio
    let finalInsightsObj: any = {};
    try {
      finalInsightsObj = JSON.parse(result.insights || '{}');
    } catch {}

    if (record.tradingDayId) {
      const dayTrades = await db.query.trades.findMany({
        where: eq(trades.tradingDayId, record.tradingDayId),
      });
      const segments = finalInsightsObj.segments || [];
      if (dayTrades.length > 0 && segments.length > 0) {
        try {
          const confluence = await synthesizeAudioTradeConfluence({
            dayTrades,
            segments,
            startMarketTime,
          });
          finalInsightsObj.confluenceTrades = confluence.confluenceTrades;
          finalInsightsObj.confluenceSummary = confluence.sessionSummary;
        } catch (err) {
          console.error('[Audio Actions] Erro na confluência de trades:', err);
        }
      }
    }

    const finalInsightsJson = JSON.stringify(finalInsightsObj);

    await db.update(audioRecords)
      .set({
        transcription: result.transcription,
        insights: finalInsightsJson,
        status: 'done',
      })
      .where(eq(audioRecords.id, audioId));

    return {
      transcription: result.transcription,
      insights: finalInsightsJson,
    };
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
 * Re-sincroniza a confluência entre os trades do CSV e a narração de áudio existente
 */
export async function reSyncAudioTradeConfluence(audioId: string) {
  const record = await db.query.audioRecords.findFirst({
    where: eq(audioRecords.id, audioId),
  });
  if (!record || !record.tradingDayId) throw new Error('Áudio não encontrado');

  const dayTrades = await db.query.trades.findMany({
    where: eq(trades.tradingDayId, record.tradingDayId),
  });

  let insightsObj: any = {};
  try {
    insightsObj = JSON.parse(record.insights || '{}');
  } catch {}

  // Busca todos os áudios do dia para unificar segmentos se houver múltiplas gravações
  const allDayAudios = await db.query.audioRecords.findMany({
    where: eq(audioRecords.tradingDayId, record.tradingDayId),
  });

  const combinedSegments: any[] = [];
  for (const aud of allDayAudios) {
    try {
      const parsed = JSON.parse(aud.insights || '{}');
      if (Array.isArray(parsed.segments)) {
        combinedSegments.push(...parsed.segments);
      }
    } catch {}
  }

  const segmentsToUse = combinedSegments.length > 0 ? combinedSegments : (insightsObj.segments || []);
  const startMarketTime = insightsObj.startMarketTime || '09:00:00';

  const confluence = await synthesizeAudioTradeConfluence({
    dayTrades,
    segments: segmentsToUse,
    startMarketTime,
  });

  insightsObj.confluenceTrades = confluence.confluenceTrades;
  insightsObj.confluenceSummary = confluence.sessionSummary;

  const updatedInsightsJson = JSON.stringify(insightsObj);

  await db.update(audioRecords)
    .set({
      insights: updatedInsightsJson,
    })
    .where(eq(audioRecords.id, audioId));

  try {
    revalidatePath('/audios');
    revalidatePath('/database');
    revalidatePath('/');
  } catch {}

  return {
    success: true,
    confluenceTrades: confluence.confluenceTrades,
    insights: updatedInsightsJson,
  };
}

/**
 * Tenta novamente transcrever um áudio específico
 */
export async function retryAudioTranscription(audioId: string) {
  const result = await transcribeAudioRecord(audioId, true);
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
