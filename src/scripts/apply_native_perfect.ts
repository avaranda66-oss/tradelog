import fs from 'node:fs';
import path from 'node:path';
import { db } from '../lib/db';
import { tradingDays, tradeImages } from '../lib/db/schema';
import { generateId } from '../lib/utils';
import { eq, and } from 'drizzle-orm';

async function applyNativePerfect(dateStr = '2026-08-25') {
  const srcDir = path.join(process.cwd(), 'data', 'images', 'native_test');
  const dstDir = path.join(process.cwd(), 'data', 'images', dateStr, 'farol');
  if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });

  const files = [
    { src: 'briefing.png', dst: `farol_briefing_${dateStr}.png`, type: 'farol-briefing', caption: 'Briefing de Mercado — Farol do Mercado' },
    { src: 'gps.png', dst: `farol_gps_${dateStr}.png`, type: 'farol-gps', caption: 'GPS de Mercado — Farol do Mercado' },
    { src: 'radar.png', dst: `farol_radar_${dateStr}.png`, type: 'farol-radar', caption: 'Radar de Mercado & Tickers — Farol do Mercado' },
  ];

  for (const f of files) {
    const srcPath = path.join(srcDir, f.src);
    const dstPath = path.join(dstDir, f.dst);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, dstPath);
      console.log(`Copiado ${f.src} -> ${dstPath} (${fs.statSync(dstPath).size} bytes)`);
    }
  }

  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  if (day) {
    for (const f of files) {
      const existing = await db.query.tradeImages.findFirst({
        where: and(eq(tradeImages.tradingDayId, day.id), eq(tradeImages.imageType, f.type)),
      });

      const newId = generateId();
      if (existing) {
        await db.update(tradeImages).set({
          id: newId,
          filePath: `images/${dateStr}/farol/${f.dst}`,
          caption: f.caption,
        }).where(eq(tradeImages.id, existing.id));
      } else {
        await db.insert(tradeImages).values({
          id: newId,
          tradingDayId: day.id,
          filePath: `images/${dateStr}/farol/${f.dst}`,
          imageType: f.type,
          caption: f.caption,
        });
      }
    }
    console.log('✓ Banco SQLite atualizado com os 3 prints 100% perfeitos!');
  }
}

applyNativePerfect().catch(console.error);
