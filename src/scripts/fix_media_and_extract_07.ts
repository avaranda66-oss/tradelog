import { db } from '../lib/db';
import { tradingDays, videoRecords, trades, tradeImages } from '../lib/db/schema';
import { generateId } from '../lib/utils';
import { extractTradeFrames, getVideoInfo } from '../lib/video-processor';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  console.log('=== FIX MEDIA & EXTRACT FRAMES FOR 07/08 ===');

  // 1. Garante que o vídeo do dia 11 está na pasta data/videos/2026-08-11/
  const video11Src = 'd:\\estudos\\2026-08-11 09-00-23.mp4';
  const video11DestDir = path.join(process.cwd(), 'data', 'videos', '2026-08-11');
  const video11DestPath = path.join(video11DestDir, '2026-08-11 09-00-23.mp4');

  if (!fs.existsSync(video11DestDir)) {
    fs.mkdirSync(video11DestDir, { recursive: true });
  }

  if (fs.existsSync(video11Src)) {
    if (!fs.existsSync(video11DestPath) || fs.statSync(video11DestPath).size === 0) {
      console.log(`[Copiar] Copiando vídeo do dia 11 para ${video11DestPath}...`);
      fs.copyFileSync(video11Src, video11DestPath);
      console.log('✔ Vídeo do dia 11 copiado com sucesso!');
    } else {
      console.log('✔ Vídeo do dia 11 já existe na pasta data/videos/2026-08-11!');
    }
  } else {
    console.warn('⚠️ Arquivo fonte d:\\estudos\\2026-08-11 09-00-23.mp4 não encontrado.');
  }

  // 2. Garante que o vídeo do dia 07 está na pasta data/videos/2026-08-07/
  const video07Src = 'd:\\estudos\\2026-08-07 09-04-54.mp4';
  const video07DestDir = path.join(process.cwd(), 'data', 'videos', '2026-08-07');
  const video07DestPath = path.join(video07DestDir, '2026-08-07 09-04-54.mp4');

  if (!fs.existsSync(video07DestDir)) {
    fs.mkdirSync(video07DestDir, { recursive: true });
  }

  if (fs.existsSync(video07Src)) {
    if (!fs.existsSync(video07DestPath) || fs.statSync(video07DestPath).size === 0) {
      console.log(`[Copiar] Copiando vídeo do dia 07 para ${video07DestPath}...`);
      fs.copyFileSync(video07Src, video07DestPath);
      console.log('✔ Vídeo do dia 07 copiado com sucesso!');
    } else {
      console.log('✔ Vídeo do dia 07 já existe na pasta data/videos/2026-08-07!');
    }
  }

  // 3. Verifica / Registra no SQLite videoRecords do dia 07
  const day07 = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-07'),
  });

  if (!day07) {
    throw new Error('Dia 2026-08-07 não encontrado no banco!');
  }

  let video07Record = await db.query.videoRecords.findFirst({
    where: eq(videoRecords.tradingDayId, day07.id),
  });

  if (!video07Record && fs.existsSync(video07DestPath)) {
    console.log('[SQLite] Registrando videoRecord para 07/08/2026...');
    const info07 = await getVideoInfo(video07DestPath);
    const newVidId = generateId();
    await db.insert(videoRecords).values({
      id: newVidId,
      tradingDayId: day07.id,
      filename: '2026-08-07 09-04-54.mp4',
      filePath: 'videos/2026-08-07/2026-08-07 09-04-54.mp4',
      durationSecs: Math.round(info07.duration),
      resolution: `${info07.width}x${info07.height}`,
    });
    console.log('✔ Registro do vídeo de 07/08 adicionado no banco!');
  }

  // 4. Extrai os prints das entradas do vídeo do dia 07 e insere em trade_images
  const trades07 = await db.query.trades.findMany({
    where: eq(trades.tradingDayId, day07.id),
    orderBy: trades.tradeNumber,
  });

  console.log(`Encontrados ${trades07.length} trades para 07/08/2026.`);

  if (trades07.length > 0 && fs.existsSync(video07DestPath)) {
    const framesDir = path.join(process.cwd(), 'data', 'images', '2026-08-07', 'video-frames');
    console.log(`[FFmpeg] Extraindo frames de entrada do vídeo ${video07DestPath}...`);

    const results = await extractTradeFrames(
      video07DestPath,
      '09:04:54',
      trades07.map(t => ({
        id: t.id,
        openTime: t.openTime,
        closeTime: t.closeTime || undefined,
        tradeNumber: t.tradeNumber,
      })),
      framesDir
    );

    console.log(`✔ Extração de frames concluída para ${results.length} trades!`);

    for (const res of results) {
      for (const frame of res.frames) {
        const relativePath = path.relative(
          path.join(process.cwd(), 'data'),
          frame.path
        ).replace(/\\/g, '/');

        const typeLabels = {
          before: '30s antes da entrada',
          entry: 'Momento da entrada',
          exit: 'Momento da saída',
        };

        const caption = `${typeLabels[frame.type]} (${Math.floor(frame.offsetSecs / 60)}:${(frame.offsetSecs % 60).toString().padStart(2, '0')} no vídeo OBS)`;

        // Verifica se imagem já existe para não duplicar
        const existing = await db.query.tradeImages.findFirst({
          where: eq(tradeImages.filePath, relativePath),
        });

        if (!existing) {
          await db.insert(tradeImages).values({
            id: generateId(),
            tradeId: res.tradeId,
            filePath: relativePath,
            imageType: `video-${frame.type}`,
            caption,
          });
          console.log(`  + Salva em trade_images: ${relativePath}`);
        }
      }
    }
  }

  // 5. Garante também que o videoRecord do dia 11 está correto no banco
  const day11 = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-11'),
  });

  if (day11 && fs.existsSync(video11DestPath)) {
    let video11Record = await db.query.videoRecords.findFirst({
      where: eq(videoRecords.tradingDayId, day11.id),
    });

    if (!video11Record) {
      console.log('[SQLite] Registrando videoRecord para 11/08/2026...');
      const info11 = await getVideoInfo(video11DestPath);
      await db.insert(videoRecords).values({
        id: generateId(),
        tradingDayId: day11.id,
        filename: '2026-08-11 09-00-23.mp4',
        filePath: 'videos/2026-08-11/2026-08-11 09-00-23.mp4',
        durationSecs: Math.round(info11.duration),
        resolution: `${info11.width}x${info11.height}`,
      });
      console.log('✔ Registro do vídeo de 11/08 adicionado no banco!');
    }
  }

  console.log('=== PROCESSAMENTO FINALIZADO COM SUCESSO ===');
}

main().catch(console.error);
