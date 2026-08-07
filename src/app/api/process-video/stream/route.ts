import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tradingDays, trades, tradeImages, audioRecords, videoRecords } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import { parseOBSFilename, extractTradeFrames, getVideoInfo, extractAudioFromVideo } from '@/lib/video-processor';
import { transcribeAudioRecord } from '@/features/audio/actions';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';

export const maxDuration = 300; // 5 minutos de timeout

export async function POST(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(step: string, percent: number, status: 'pending' | 'active' | 'done' | 'error', details?: any) {
        const payload = JSON.stringify({ step, percent, status, details });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }

      try {
        const body = await req.json();
        const { path: pathInput, date: inputDate, startTime: inputStartTime, extractAudio = true } = body;

        if (!pathInput) {
          sendEvent('erro', 0, 'error', { message: 'Caminho do arquivo não informado' });
          controller.close();
          return;
        }

        const cleanPath = String(pathInput).trim().replace(/^["']|["']$/g, '');
        if (!fs.existsSync(cleanPath)) {
          sendEvent('erro', 0, 'error', { message: `Arquivo não encontrado: ${cleanPath}` });
          controller.close();
          return;
        }

        // ETAPA 1: Registro do Vídeo no Disco (25%)
        sendEvent('video_copy', 15, 'active', { message: 'Copiando e validando vídeo no disco local...' });
        const originalName = path.basename(cleanPath);
        let dateStr = inputDate;

        const parsedObs = parseOBSFilename(originalName);
        if (parsedObs && parsedObs.date) dateStr = parsedObs.date;
        if (!dateStr) dateStr = new Date().toISOString().slice(0, 10);

        let day = await db.query.tradingDays.findFirst({ where: eq(tradingDays.date, dateStr) });
        if (!day) {
          const newDayId = generateId();
          await db.insert(tradingDays).values({ id: newDayId, date: dateStr });
          day = await db.query.tradingDays.findFirst({ where: eq(tradingDays.date, dateStr) });
        }
        if (!day) throw new Error('Falha ao registrar dia no SQLite');

        const videoDir = path.join(process.cwd(), 'data', 'videos', dateStr);
        if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

        const targetVideoPath = path.join(videoDir, originalName);
        if (path.resolve(cleanPath) !== path.resolve(targetVideoPath)) {
          fs.copyFileSync(cleanPath, targetVideoPath);
        }

        const fileStats = fs.statSync(targetVideoPath);
        const videoInfo = await getVideoInfo(targetVideoPath);
        const sizeMB = (fileStats.size / 1024 / 1024).toFixed(1);

        sendEvent('video_copy', 25, 'done', {
          message: `Vídeo registrado (${sizeMB} MB, ${Math.floor(videoInfo.duration / 60)}min)`,
          duration: videoInfo.duration,
          resolution: `${videoInfo.width}x${videoInfo.height}`,
        });

        // ETAPA 2: Extração de Áudio MP3 (50%)
        let audioExtracted = false;
        let audioRecordId = '';
        if (extractAudio) {
          sendEvent('audio_extract', 35, 'active', { message: 'Extraindo faixa de áudio MP3 da gravação...' });
          const audioDir = path.join(process.cwd(), 'data', 'audio', dateStr);
          if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const audioFileName = `obs_narration_${timestamp}.mp3`;
          const audioPath = path.join(audioDir, audioFileName);

          await extractAudioFromVideo(targetVideoPath, audioPath);
          const audioStats = fs.statSync(audioPath);
          const audioSizeMB = (audioStats.size / 1024 / 1024).toFixed(1);
          audioRecordId = generateId();

          await db.insert(audioRecords).values({
            id: audioRecordId,
            tradingDayId: day.id,
            filePath: `audio/${dateStr}/${audioFileName}`,
            durationSecs: Math.round(videoInfo.duration),
            status: 'recorded',
          });
          audioExtracted = true;

          sendEvent('audio_extract', 50, 'done', { message: `Faixa de áudio extraída com sucesso (${audioSizeMB} MB)` });
        } else {
          sendEvent('audio_extract', 50, 'done', { message: 'Extração de áudio ignorada pelo usuário' });
        }

        // ETAPA 3: Transcrição AI Gemini (75%)
        let transcriptionSuccess = false;
        if (audioExtracted && audioRecordId) {
          sendEvent('transcription', 60, 'active', { message: 'Transcrevendo narração via Gemini 1.5 Flash AI...' });
          try {
            await transcribeAudioRecord(audioRecordId);
            transcriptionSuccess = true;
            sendEvent('transcription', 75, 'done', { message: 'Transcrição e análise emocional Gemini AI concluídas!' });
          } catch (err: any) {
            console.error('[Stream] Erro na transcrição Gemini:', err);
            sendEvent('transcription', 75, 'done', { message: `Áudio salvo. Erro na AI Gemini: ${err.message || String(err)}` });
          }
        } else {
          sendEvent('transcription', 75, 'done', { message: 'Sem áudio para transcrição' });
        }

        // ETAPA 4: Frames dos Trades (100%)
        sendEvent('frames', 85, 'active', { message: 'Extraindo screenshots dos trades...' });
        const dayTrades = await db.query.trades.findMany({
          where: eq(trades.tradingDayId, day.id),
          orderBy: trades.tradeNumber,
        });

        let startTime = inputStartTime;
        if (!startTime && parsedObs) startTime = parsedObs.startTime;
        if (!startTime) startTime = '09:00:00';

        let totalFrames = 0;
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

          for (const r of results) {
            for (const f of r.frames) {
              const relativePath = path.relative(path.join(process.cwd(), 'data'), f.path).replace(/\\/g, '/');
              await db.insert(tradeImages).values({
                id: generateId(),
                tradeId: r.tradeId,
                filePath: relativePath,
                imageType: `video-${f.type}`,
                caption: `Captura ${f.type} (${Math.floor(f.offsetSecs / 60)}m no vídeo)`,
              });
              totalFrames++;
            }
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

        sendEvent('complete', 100, 'done', {
          message: `Processamento 100% Concluído! Duração: ${Math.floor(videoInfo.duration / 60)}min. Screenshots: ${totalFrames}. Áudio: ${audioExtracted ? 'OK' : 'N/A'}`,
          videoRecordId,
          totalFrames,
          transcriptionSuccess,
        });

        controller.close();
      } catch (err: any) {
        sendEvent('error', 0, 'error', { message: err.message || String(err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
