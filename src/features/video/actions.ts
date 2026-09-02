'use server';

import { db } from '@/lib/db';
import { tradingDays, trades, tradeImages, audioRecords, videoRecords, tradeAnnotations, type TradeAnnotation } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';

import { parseOBSFilename, extractTradeFrames, getVideoInfo, extractAudioFromVideo, calculateVideoOffset } from '@/lib/video-processor';
import { transcribeAudioRecord } from '@/features/audio/actions';
import { analyzeFrameWithGeminiVision, analyzeMultiFrameSequenceWithGeminiVision } from '@/lib/gemini';

import { eq } from 'drizzle-orm';


import { revalidatePath } from 'next/cache';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Função central de processamento de arquivo de vídeo no disco local
 */
export async function processOBSVideoFromLocalPath({
  localFilePath,
  date,
  startTime: inputStartTime,
  shouldExtractAudio = true,
}: {
  localFilePath: string;
  date?: string;
  startTime?: string;
  shouldExtractAudio?: boolean;
}) {
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`Arquivo não encontrado no disco: ${localFilePath}`);
  }

  const originalName = path.basename(localFilePath);
  let dateStr = date;

  // Auto-detecta data do nome do arquivo OBS (ex: 2026-08-07 09-04-54.mp4)
  const parsedObs = parseOBSFilename(originalName);
  if (parsedObs && parsedObs.date) {
    dateStr = parsedObs.date;
    console.log(`[Video] Data auto-detectada do arquivo OBS: ${dateStr}`);
  }

  if (!dateStr) {
    dateStr = new Date().toISOString().slice(0, 10);
  }

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

  // Copia o arquivo para a pasta de data do app (se já não estiver lá)
  const videoDir = path.join(process.cwd(), 'data', 'videos', dateStr);
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

  const targetVideoPath = path.join(videoDir, originalName);
  if (path.resolve(localFilePath) !== path.resolve(targetVideoPath)) {
    console.log(`[Video] Copiando vídeo gigante do disco (${localFilePath} -> ${targetVideoPath})...`);
    fs.copyFileSync(localFilePath, targetVideoPath);
  }

  const fileStats = fs.statSync(targetVideoPath);
  console.log(`[Video] Salvo localmente: ${targetVideoPath} (${(fileStats.size / 1024 / 1024).toFixed(1)} MB)`);

  // Horário de início da gravação
  let startTime = inputStartTime;
  if (!startTime && parsedObs) {
    startTime = parsedObs.startTime;
    console.log(`[Video] Horário detectado do nome OBS: ${startTime}`);
  }
  if (!startTime) startTime = '09:00:00';

  // Info do vídeo
  const videoInfo = await getVideoInfo(targetVideoPath);
  console.log(`[Video] Duração: ${videoInfo.duration.toFixed(0)}s, ${videoInfo.width}x${videoInfo.height}`);

  // Extração de frames se houver trades
  let totalFrames = 0;
  let resultsCount = 0;

  if (dayTrades.length > 0) {
    const framesDir = path.join(process.cwd(), 'data', 'images', dateStr, 'video-frames');
    const results = await extractTradeFrames(
      targetVideoPath,
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
  }

  // Extração de áudio & Transcrição Gemini AI
  let audioExtracted = false;
  let transcriptionSuccess = false;

  if (shouldExtractAudio) {
    try {
      console.log('[Video] Extraindo faixa de áudio do vídeo...');
      const audioDir = path.join(process.cwd(), 'data', 'audio', dateStr);
      if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

      const formattedStartTime = startTime.replace(/:/g, '-');
      const audioFileName = `obs_narration_${dateStr}_${formattedStartTime}.mp3`;
      const audioPath = path.join(audioDir, audioFileName);

      await extractAudioFromVideo(targetVideoPath, audioPath);

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

      console.log(`[Video] Áudio extraído (${(audioStats.size / 1024 / 1024).toFixed(1)} MB). Transcrevendo com Gemini AI...`);

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
 * Processa vídeo do OBS enviado por FormData (pequenos a gigantes >4GB)
 */
export async function processOBSVideo(formData: FormData) {
  const file = formData.get('video') as File;
  let dateStr = formData.get('date') as string;
  const recordingStartTime = formData.get('startTime') as string;
  const shouldExtractAudio = formData.get('extractAudio') !== 'false';

  if (!file) throw new Error('Nenhum arquivo de vídeo enviado');

  const originalName = file.name;
  const parsedObs = parseOBSFilename(originalName);
  if (parsedObs && parsedObs.date) {
    dateStr = parsedObs.date;
  }
  if (!dateStr) throw new Error('Data não informada');

  const videoDir = path.join(process.cwd(), 'data', 'videos', dateStr);
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

  const tempVideoPath = path.join(videoDir, originalName);

  // Usa streaming via pipeline para suportar arquivos de qualquer tamanho (ex: vídeos OBS de 4GB+)
  const fileStream = Readable.fromWeb(file.stream() as any);
  const writeStream = fs.createWriteStream(tempVideoPath);
  await pipeline(fileStream, writeStream);

  return processOBSVideoFromLocalPath({
    localFilePath: tempVideoPath,
    date: dateStr,
    startTime: recordingStartTime,
    shouldExtractAudio,
  });
}

/**
 * Action exposta para o cliente processar via caminho de arquivo no disco local (sem limite HTTP)
 */
export async function processVideoFromPathAction(formData: FormData) {
  const pathInput = formData.get('path') as string;
  const dateInput = formData.get('date') as string;
  const startTime = formData.get('startTime') as string;
  const extractAudio = formData.get('extractAudio') !== 'false';

  if (!pathInput) throw new Error('Caminho do arquivo não informado');

  // Limpa aspas do caminho se coladas pelo usuário
  let cleanPath = pathInput.trim().replace(/^["']|["']$/g, '');

  if (!fs.existsSync(cleanPath)) {
    const filename = path.basename(cleanPath);
    const searchDirs = [
      path.join(process.env.USERPROFILE || 'C:\\Users\\Usuario', 'Videos'),
      path.join(process.env.USERPROFILE || 'C:\\Users\\Usuario', 'Videos', 'Captures'),
      path.join(process.env.USERPROFILE || 'C:\\Users\\Usuario', 'Desktop'),
      path.join(process.env.USERPROFILE || 'C:\\Users\\Usuario', 'Downloads'),
      'C:\\OBS',
      'D:\\Videos',
      path.join(process.cwd(), 'data', 'videos'),
      path.join(process.cwd(), 'data', 'videos', dateInput || ''),
    ];

    let foundPath = '';
    for (const dir of searchDirs) {
      if (fs.existsSync(dir)) {
        const candidate = path.join(dir, filename);
        if (fs.existsSync(candidate)) {
          foundPath = candidate;
          break;
        }
      }
    }

    if (foundPath) {
      console.log(`[Video] Arquivo auto-localizado no disco: ${foundPath}`);
      cleanPath = foundPath;
    }
  }

  return processOBSVideoFromLocalPath({
    localFilePath: cleanPath,
    date: dateInput,
    startTime,
    shouldExtractAudio: extractAudio,
  });
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

/**
 * Extrai áudio MP3 de um vídeo gravado do OBS e realiza a transcrição com Gemini AI
 */
export async function extractAndTranscribeVideoAudioAction(dateStr: string) {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });
  if (!day) throw new Error(`Dia de operação não encontrado para a data ${dateStr}`);

  const video = await db.query.videoRecords.findFirst({
    where: eq(videoRecords.tradingDayId, day.id),
  });
  if (!video) throw new Error(`Nenhum vídeo OBS encontrado para o dia ${dateStr}`);

  const videoPath = path.join(process.cwd(), 'data', video.filePath);
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Arquivo de vídeo não encontrado no disco: ${videoPath}`);
  }

  let audioRecord = await db.query.audioRecords.findFirst({
    where: eq(audioRecords.tradingDayId, day.id),
  });

  if (!audioRecord || !fs.existsSync(path.join(process.cwd(), 'data', audioRecord.filePath))) {
    const audioDir = path.join(process.cwd(), 'data', 'audio', dateStr);
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

    const parsedObs = parseOBSFilename(video.filename);
    const startTimeStr = (parsedObs?.startTime || '09-00-00').replace(/:/g, '-');
    const audioFileName = `obs_narration_${dateStr}_${startTimeStr}.mp3`;
    const audioPath = path.join(audioDir, audioFileName);

    console.log(`[VideoAction] Extraindo áudio via ffmpeg para ${audioPath}...`);
    await extractAudioFromVideo(videoPath, audioPath);

    const videoInfo = await getVideoInfo(videoPath);
    const audioId = generateId();

    await db.insert(audioRecords).values({
      id: audioId,
      tradingDayId: day.id,
      filePath: `audio/${dateStr}/${audioFileName}`,
      durationSecs: Math.round(videoInfo.duration),
      status: 'recorded',
    });

    audioRecord = await db.query.audioRecords.findFirst({
      where: eq(audioRecords.id, audioId),
    });
  }

  if (!audioRecord) throw new Error('Falha ao obter registro de áudio');

  console.log(`[VideoAction] Transcrevendo áudio ${audioRecord.id} com Gemini AI...`);
  const result = await transcribeAudioRecord(audioRecord.id, true);

  try {
    revalidatePath('/');
    revalidatePath('/audios');
    revalidatePath('/database');
    revalidatePath('/operacoes');
  } catch {}

  return { success: true, audioId: audioRecord.id, transcription: result.transcription };
}

export interface TradeVideoReplayData {
  hasVideo: boolean;
  videoUrl?: string;
  videoFilename?: string;
  videoStartTime?: string;
  durationSecs?: number;
  entryOffsetSecs?: number;
  beforeOffsetSecs?: number;
  exitOffsetSecs?: number;
  postOffsetSecs?: number;
  trade: {
    id: string;
    tradeNumber: number;
    instrument: string;
    side: string;
    entryPrice: number;
    exitPrice: number;
    openTime: string;
    closeTime: string;
    points: number | null;
    reais: number | null;
    strategy: string | null;
  };
}

/**
 * Obtém dados completos e offsets temporais de um trade para reprodução em vídeo
 */
export async function getTradeVideoReplayData(tradeId: string): Promise<TradeVideoReplayData> {
  const trade = await db.query.trades.findFirst({
    where: eq(trades.id, tradeId),
  });

  if (!trade) {
    throw new Error(`Trade não encontrado: ${tradeId}`);
  }

  const tradeInfo = {
    id: trade.id,
    tradeNumber: trade.tradeNumber,
    instrument: trade.instrument,
    side: trade.side,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    openTime: trade.openTime,
    closeTime: trade.closeTime,
    points: trade.points,
    reais: trade.reais,
    strategy: trade.strategy,
  };

  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.id, trade.tradingDayId || ''),
  });

  if (!day) {
    return { hasVideo: false, trade: tradeInfo };
  }

  // Busca o registro de vídeo do dia
  let video = await db.query.videoRecords.findFirst({
    where: eq(videoRecords.tradingDayId, day.id),
  });

  // Se não estiver na tabela, procura na pasta de vídeos do dia
  if (!video) {
    const videoDir = path.join(process.cwd(), 'data', 'videos', day.date);
    if (fs.existsSync(videoDir)) {
      const files = fs.readdirSync(videoDir).filter(f => ['.mp4', '.mkv', '.avi', '.mov'].includes(path.extname(f).toLowerCase()));
      if (files.length > 0) {
        const foundName = files[0];
        video = {
          id: generateId(),
          tradingDayId: day.id,
          filename: foundName,
          filePath: `videos/${day.date}/${foundName}`,
          durationSecs: 0,
          resolution: '1920x1080',
          createdAt: new Date().toISOString(),
        };
      }
    }
  }

  if (!video) {
    return { hasVideo: false, trade: tradeInfo };
  }

  // Detecção do horário de início da gravação
  const parsedObs = parseOBSFilename(video.filename);
  let startTime = parsedObs?.startTime || '09:00:00';

  const entryOffset = Math.max(0, calculateVideoOffset(startTime, trade.openTime));
  const beforeOffset = Math.max(0, entryOffset - 30); // 30s antes da entrada
  const exitOffset = Math.max(entryOffset + 1, calculateVideoOffset(startTime, trade.closeTime));
  const postOffset = exitOffset + 300; // +5 minutos de pós-trade para estudo de violinada

  return {
    hasVideo: true,
    videoUrl: `/api/files/${video.filePath.replace(/\\/g, '/')}`,
    videoFilename: video.filename,
    videoStartTime: startTime,
    durationSecs: video.durationSecs || undefined,
    entryOffsetSecs: entryOffset,
    beforeOffsetSecs: beforeOffset,
    exitOffsetSecs: exitOffset,
    postOffsetSecs: postOffset,
    trade: tradeInfo,
  };
}

/**
 * Busca todas as anotações e insights timestamped de um trade específico
 */
export async function getTradeAnnotations(tradeId: string): Promise<TradeAnnotation[]> {
  try {
    const list = await db
      .select()
      .from(tradeAnnotations)
      .where(eq(tradeAnnotations.tradeId, tradeId));

    // Ordena por timestampSecs ascendente
    return list.sort((a, b) => a.timestampSecs - b.timestampSecs);
  } catch (err) {
    console.error('[Annotations] Erro ao buscar anotações:', err);
    return [];
  }
}

/**
 * Salva ou atualiza uma anotação em um segundo/frame exato do trade
 */
export async function saveTradeAnnotation(data: {
  id?: string;
  tradeId: string;
  timestampSecs: number;
  formattedTime: string;
  clockTime?: string;
  text: string;
  tag?: string;
  drawingData?: string;
  author?: 'user' | 'ai';
}): Promise<TradeAnnotation> {
  const trade = await db.query.trades.findFirst({
    where: eq(trades.id, data.tradeId),
  });

  const annotationId = data.id || generateId();
  const now = new Date().toISOString();

  const newRecord = {
    id: annotationId,
    tradeId: data.tradeId,
    tradingDayId: trade?.tradingDayId || null,
    timestampSecs: data.timestampSecs,
    formattedTime: data.formattedTime,
    clockTime: data.clockTime || null,
    text: data.text,
    tag: data.tag || 'insight',
    drawingData: data.drawingData || null,
    author: data.author || 'user',
    createdAt: now,
  };

  if (data.id) {
    await db
      .update(tradeAnnotations)
      .set({
        text: data.text,
        tag: data.tag || 'insight',
        drawingData: data.drawingData !== undefined ? data.drawingData : undefined,
      })
      .where(eq(tradeAnnotations.id, data.id));
  } else {
    await db.insert(tradeAnnotations).values(newRecord);
  }

  revalidatePath('/diario');
  revalidatePath('/operacoes');

  return newRecord as TradeAnnotation;
}

/**
 * Remove uma anotação pelo ID
 */
export async function deleteTradeAnnotation(id: string): Promise<void> {
  await db.delete(tradeAnnotations).where(eq(tradeAnnotations.id, id));
  revalidatePath('/diario');
  revalidatePath('/operacoes');
}

/**
 * Gera um insight analítico inteligente de AI sobre o trade naquele segundo/frame usando Gemini Vision
 */
export async function generateAIFrameInsight({
  tradeId,
  timestampSecs,
  formattedTime,
  clockTime,
  imageBase64,
  focusArea = 'general',
  customPrompt,
}: {
  tradeId: string;
  timestampSecs: number;
  formattedTime: string;
  clockTime?: string;
  imageBase64?: string;
  focusArea?: 'general' | 'tape' | 'book' | 'chart' | 'zoom';
  customPrompt?: string;
}): Promise<TradeAnnotation> {
  const trade = await db.query.trades.findFirst({
    where: eq(trades.id, tradeId),
  });

  if (!trade) {
    throw new Error('Trade não encontrado');
  }

  let aiText = '';

  if (imageBase64) {
    try {
      aiText = await analyzeFrameWithGeminiVision({
        imageBase64,
        tradeInfo: {
          tradeNumber: trade.tradeNumber,
          instrument: trade.instrument,
          side: trade.side,
          entryPrice: trade.entryPrice,
          exitPrice: trade.exitPrice,
          points: trade.points || 0,
          openTime: trade.openTime,
          closeTime: trade.closeTime,
          strategy: trade.strategy,
          marketRegime: trade.marketRegime,
          conviction: trade.conviction,
          execution: trade.execution,
        },
        frameTime: {
          formattedTime,
          clockTime,
        },
        focusArea,
        customQuestion: customPrompt,
      });
    } catch (err) {
      console.error('[Vision Action] Falha ao analisar com Gemini Vision:', err);
      aiText = `[Leitura AI @ ${clockTime || formattedTime}]: Trade #${trade.tradeNumber} (${trade.side === 'C' ? 'Compra' : 'Venda'} ${trade.instrument}). Contexto: ${trade.strategy || 'Estratégia'} em regime de ${trade.marketRegime || 'mercado'}. Convicção: ${trade.conviction || 3}/5, Execução: ${trade.execution || 3}/5. Observação: Monitorar fluxo institucional e absorção no book de ofertas.`;
    }
  } else {
    aiText = `[Leitura AI @ ${clockTime || formattedTime}]: Trade #${trade.tradeNumber} (${trade.side === 'C' ? 'Compra' : 'Venda'} ${trade.instrument}). Contexto: ${trade.strategy || 'Estratégia'} em regime de ${trade.marketRegime || 'mercado'}. Convicção: ${trade.conviction || 3}/5, Execução: ${trade.execution || 3}/5.`;
  }

  const tagMap: Record<string, string> = {
    tape: 'tape',
    book: 'tape',
    chart: 'entry',
    zoom: 'insight',
    general: 'insight',
  };

  return saveTradeAnnotation({
    tradeId,
    timestampSecs,
    formattedTime,
    clockTime,
    text: aiText,
    tag: tagMap[focusArea] || 'insight',
    author: 'ai',
  });
}

/**
 * Analisa uma sequência cronológica multi-segundos de frames da operação (Pré, Entrada, Durante, Saída e Pós)
 */
export async function generateAIMultiFrameInsight({
  tradeId,
  frames,
  customPrompt,
}: {
  tradeId: string;
  frames: Array<{
    label: string;
    clockTime: string;
    formattedTime: string;
    timestampSecs: number;
    imageBase64: string;
  }>;
  customPrompt?: string;
}): Promise<TradeAnnotation> {
  const trade = await db.query.trades.findFirst({
    where: eq(trades.id, tradeId),
  });

  if (!trade) {
    throw new Error('Trade não encontrado');
  }

  const aiAnalysis = await analyzeMultiFrameSequenceWithGeminiVision({
    frames,
    tradeInfo: {
      tradeNumber: trade.tradeNumber,
      instrument: trade.instrument,
      side: trade.side,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      points: trade.points || 0,
      openTime: trade.openTime,
      closeTime: trade.closeTime,
      strategy: trade.strategy,
      marketRegime: trade.marketRegime,
      conviction: trade.conviction,
      execution: trade.execution,
    },
    customQuestion: customPrompt,
  });

  const firstFrame = frames[0] || { timestampSecs: 0, formattedTime: '00:00.0', clockTime: trade.openTime };

  return saveTradeAnnotation({
    tradeId,
    timestampSecs: firstFrame.timestampSecs,
    formattedTime: firstFrame.formattedTime,
    clockTime: firstFrame.clockTime,
    text: `🎬 [DEBRIEFING COMPLETO DO TRADE — SEQUÊNCIA MULTI-FRAMES]:\n\n${aiAnalysis}`,
    tag: 'insight',
    author: 'ai',
  });
}

/**
 * Extrai exclusivamente os frames (prints) das operações a partir do vídeo existente no disco,
 * sem reprocessar áudio, sem consumir tokens de transcrição e sem recriar o dia.
 */
export async function reextractTradeFramesAction(dateStr: string) {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });
  if (!day) throw new Error(`Dia de operação não encontrado para a data ${dateStr}`);

  const dayTrades = await db.query.trades.findMany({
    where: eq(trades.tradingDayId, day.id),
    orderBy: trades.tradeNumber,
  });
  if (dayTrades.length === 0) {
    throw new Error(`Nenhum trade registrado para o dia ${dateStr}`);
  }

  // Localiza o vídeo gravado do dia
  const videoDir = path.join(process.cwd(), 'data', 'videos', dateStr);
  let videoPath = '';
  let videoFilename = '';

  const videoRecord = await db.query.videoRecords.findFirst({
    where: eq(videoRecords.tradingDayId, day.id),
  });

  if (videoRecord && fs.existsSync(path.join(process.cwd(), 'data', videoRecord.filePath))) {
    videoPath = path.join(process.cwd(), 'data', videoRecord.filePath);
    videoFilename = videoRecord.filename;
  } else if (fs.existsSync(videoDir)) {
    const files = fs.readdirSync(videoDir).filter(f => /\.(mp4|mkv|mov|avi)$/i.test(f));
    if (files.length > 0) {
      videoFilename = files[0];
      videoPath = path.join(videoDir, videoFilename);
    }
  }

  if (!videoPath || !fs.existsSync(videoPath)) {
    throw new Error(`Nenhum arquivo de vídeo encontrado para o dia ${dateStr}`);
  }

  const parsedObs = parseOBSFilename(videoFilename);
  const startTime = parsedObs?.startTime || '09:00:00';

  const framesDir = path.join(process.cwd(), 'data', 'images', dateStr, 'video-frames');
  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir, { recursive: true });
  }

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

  let totalInserted = 0;
  for (const result of results) {
    const existingImages = await db.query.tradeImages.findMany({
      where: eq(tradeImages.tradeId, result.tradeId),
    });

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

      const caption = `${typeLabels[frame.type]} (${Math.floor(frame.offsetSecs / 60)}:${(frame.offsetSecs % 60).toString().padStart(2, '0')} no vídeo)`;
      const imageType = `video-${frame.type}`;

      const alreadyExists = existingImages.find(img => img.imageType === imageType || img.filePath === relativePath);

      if (!alreadyExists) {
        await db.insert(tradeImages).values({
          id: generateId(),
          tradeId: result.tradeId,
          filePath: relativePath,
          imageType,
          caption,
        });
        totalInserted++;
      }
    }
  }

  try {
    revalidatePath('/');
    revalidatePath('/operacoes');
    revalidatePath('/diario');
  } catch {}

  return {
    success: true,
    tradesProcessed: results.length,
    framesExtracted: results.reduce((acc, r) => acc + r.frames.length, 0),
    newImagesInserted: totalInserted,
  };
}
