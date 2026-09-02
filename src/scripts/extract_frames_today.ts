import { db } from '../lib/db';
import { tradingDays, trades, tradeImages, videoRecords } from '../lib/db/schema';
import { extractTradeFrames, parseOBSFilename } from '../lib/video-processor';
import { generateId } from '../lib/utils';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const dateStr = '2026-08-27';
  console.log(`[Extrator] Iniciando extração dedicada de frames para ${dateStr}...`);

  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  if (!day) {
    console.error(`[Extrator] Dia ${dateStr} não encontrado no banco.`);
    return;
  }

  const dayTrades = await db.query.trades.findMany({
    where: eq(trades.tradingDayId, day.id),
    orderBy: trades.tradeNumber,
  });

  console.log(`[Extrator] Encontrados ${dayTrades.length} trades para o dia ${dateStr}.`);
  dayTrades.forEach(t => {
    console.log(`  - Trade #${t.tradeNumber}: ${t.side === 'C' ? 'COMPRA' : 'VENDA'} ${t.instrument} | Entrada: ${t.openTime} | Saída: ${t.closeTime}`);
  });

  const videoDir = path.join(process.cwd(), 'data', 'videos', dateStr);
  if (!fs.existsSync(videoDir)) {
    console.error(`[Extrator] Diretório de vídeos não encontrado: ${videoDir}`);
    return;
  }

  const videoFiles = fs.readdirSync(videoDir).filter(f => /\.(mp4|mkv|mov|avi)$/i.test(f));
  if (videoFiles.length === 0) {
    console.error(`[Extrator] Nenhum vídeo encontrado em ${videoDir}`);
    return;
  }

  const videoName = videoFiles[0];
  const videoPath = path.join(videoDir, videoName);
  console.log(`[Extrator] Usando vídeo: ${videoPath}`);

  const parsedObs = parseOBSFilename(videoName);
  const startTime = parsedObs?.startTime || '08:59:16';
  console.log(`[Extrator] Horário de início detectado: ${startTime}`);

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

  console.log(`[Extrator] Extração concluída com ${results.length} trades processados.`);

  // Atualiza ou insere registros em tradeImages
  for (const result of results) {
    // Remove registros antigos de video frames desse trade se existirem
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
        console.log(`  + Inserido no DB: ${relativePath} (${caption})`);
      } else {
        console.log(`  = Já referenciado no DB: ${relativePath}`);
      }
    }
  }

  console.log('[Extrator] Finalizado com sucesso!');
}

main().catch(err => {
  console.error('[Extrator] Erro:', err);
});
