'use server';

import { db } from '@/lib/db';
import { tradingDays, trades, tradeImages, audioRecords, videoRecords } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import { parseOBSFilename, extractTradeFrames, getVideoInfo, extractAudioFromVideo } from '@/lib/video-processor';
import { transcribeAudioRecord } from '@/features/audio/actions';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Processa vídeo do OBS: salva no filesystem, extrai screenshots
 * (se houver trades do CSV) e extrai a narração em áudio para transcrição
 * via Gemini 2.5 Flash AI mesmo se o dia não tiver trades cadastrados.
 */
export async function processOBSVideo(formData: FormData) {
  const file = formData.get('video') as File;
  let dateStr = formData.get('date') as string;
  const recordingStartTime = formData.get('startTime') as string;
  const shouldExtractAudio = formData.get('extractAudio') !== 'false';

  if (!file) throw new Error('Nenhum arquivo de vídeo enviado');

  const originalName = file.name;

  // Se a data não foi informada ou veio genérica, tenta detectar do nome do arquivo OBS (ex: 2026-07-03)
  const parsedObs = parseOBSFilename(originalName);
  if (parsedObs && parsedObs.date) {
    dateStr = parsedObs.date;
    console.log(`[Video] Data auto-detectada do nome do arquivo OBS: ${dateStr}`);
  }

  if (!dateStr) throw new Error('Data não informada e não foi possível detectar do arquivo');

  // Busca ou cria o dia no banco
  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  if (!day) {
    const newDayId = generateId();
    await db.insert(tradingDays).values({
      id: newDayId,
      date: dateStr,
    });
    day = await db.query.tradingDays.findFirst({
      where: eq(tradingDays.date, dateStr),
    });
  }

  if (!day) throw new Error('Falha ao registrar dia de operação');

  const dayTrades = await db.query.trades.findMany({
    where: eq(trades.tradingDayId, day.id),
    orderBy: trades.tradeNumber,
  });

  // Salva o arquivo de vídeo
  const videoDir = path.join(process.cwd(), 'data', 'videos', dateStr);
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

  const videoPath = path.join(videoDir, originalName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(videoPath, buffer);

  console.log(`[Video] Salvo: ${videoPath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

  // Determina horário de início da gravação
  let startTime = recordingStartTime;
  if (!startTime && parsedObs) {
    startTime = parsedObs.startTime;
    console.log(`[Video] Horário detectado do nome OBS: ${startTime}`);
  }
  if (!startTime) startTime = '09:00:00';

  // Obtém info do vídeo (duração, resolução)
  const videoInfo = await getVideoInfo(videoPath);
  console.log(`[Video] Duração: ${videoInfo.duration.toFixed(0)}s, ${videoInfo.width}x${videoInfo.height}`);

  // Extrai frames se houver trades cadastrados
  let totalFrames = 0;
  let resultsCount = 0;

  if (dayTrades.length > 0) {
    const framesDir = path.join(process.cwd(), 'data', 'images', dateStr, 'video-frames');
    const results = await extractTradeFrames(
      videoPath,
      startTime,
      dayTrades.map(t => ({
        id: t.id,
        openTime: t.openTime,
        closeTime: t.closeTime || undefined,
        tradeNumber: t.tradeNumber,
      })),
      framesDir
    );
    resultsCount = results.length;

    for (const result of results) {
      for (const frame of result.frames) {
        const relativePath = path.relative(
          path.join(process.cwd(), 'data'),
          frame.path
        ).replace(/\\/g, '/');

        const typeLabels = {
          before: '30s antes da entrada',
          entry: 'Momento da entrada',
          exit: 'Momento da saída',
        };

        let caption = `${typeLabels[frame.type]} (${Math.floor(frame.offsetSecs / 60)}:${(frame.offsetSecs % 60).toString().padStart(2, '0')} no vídeo)`;

        if (frame.type === 'entry') {
          try {
            const { analyzeTradeScreenshotVision } = await import('@/lib/vision-analysis');
            const aiAnalysis = await analyzeTradeScreenshotVision(frame.path);
            if (aiAnalysis) {
              caption += ` — 🤖 Vision AI: ${aiAnalysis}`;
            }
          } catch (err) {
            console.error('[Video] Falha na analise Vision do frame:', err);
          }
        }

        await db.insert(tradeImages).values({
          id: generateId(),
          tradeId: result.tradeId,
          filePath: relativePath,
          imageType: `video-${frame.type}`,
          caption,
        });
        totalFrames++;
      }
    }
  } else {
    console.log('[Video] 0 trades encontrados para este dia. Prosseguindo para extração e transcrição de áudio...');
  }

  // ─── Extração e Transcrição de Áudio do Vídeo ─────────────────
  let audioExtracted = false;
  let transcriptionSuccess = false;

  if (shouldExtractAudio) {
    try {
      console.log('[Video] Extraindo faixa de áudio do vídeo...');
      const audioDir = path.join(process.cwd(), 'data', 'audio', dateStr);
      if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const audioFileName = `obs_narration_${timestamp}.mp3`;
      const audioPath = path.join(audioDir, audioFileName);

      await extractAudioFromVideo(videoPath, audioPath);

      const audioStats = fs.statSync(audioPath);
      const audioId = generateId();

      await db.insert(audioRecords).values({
        id: audioId,
        tradingDayId: day.id,
        filePath: `audio/${dateStr}/${audioFileName}`,
        durationSecs: Math.round(videoInfo.duration),
        status: 'recorded',
      });
      audioExtracted = true;

      console.log(`[Video] Áudio extraído (${(audioStats.size / 1024 / 1024).toFixed(1)} MB). Transcrevendo com Gemini 2.5 Flash...`);

      try {
        await transcribeAudioRecord(audioId);
        transcriptionSuccess = true;
        console.log('[Video] Transcrição de áudio concluída com sucesso!');
      } catch (err) {
        console.error('[Video] Áudio extraído, mas falha na transcrição Gemini:', err);
      }
    } catch (err) {
      console.error('[Video] Erro ao extrair áudio do vídeo:', err);
    }
  }

  // Registra entrada na tabela videoRecords do SQLite
  const videoRecordId = generateId();
  await db.insert(videoRecords).values({
    id: videoRecordId,
    tradingDayId: day.id,
    filename: originalName,
    filePath: `videos/${dateStr}/${originalName}`,
    durationSecs: Math.round(videoInfo.duration),
    resolution: `${videoInfo.width}x${videoInfo.height}`,
  });

  return {
    id: videoRecordId,
    date: dateStr,
    videoPath: `videos/${dateStr}/${originalName}`,
    duration: videoInfo.duration,
    resolution: `${videoInfo.width}x${videoInfo.height}`,
    tradesProcessed: resultsCount,
    framesExtracted: totalFrames,
    startTime,
    audioExtracted,
    transcriptionSuccess,
  };
}

/**
 * Exclui um vídeo do disco e do banco SQLite
 */
export async function deleteVideoRecord(videoId: string) {
  const record = await db.query.videoRecords.findFirst({
    where: eq(videoRecords.id, videoId),
  });

  if (record) {
    const fullPath = path.join(process.cwd(), 'data', record.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    await db.delete(videoRecords).where(eq(videoRecords.id, videoId));
  }

  return { success: true };
}

/**
 * Lista vídeos salvos de um dia
 */
export async function getVideosByDate(dateStr: string) {
  const videoDir = path.join(process.cwd(), 'data', 'videos', dateStr);
  if (!fs.existsSync(videoDir)) return [];

  return fs.readdirSync(videoDir)
    .filter(f => ['.mp4', '.mkv', '.avi', '.mov'].includes(path.extname(f).toLowerCase()))
    .map(f => ({
      name: f,
      path: `videos/${dateStr}/${f}`,
      size: fs.statSync(path.join(videoDir, f)).size,
    }));
}
