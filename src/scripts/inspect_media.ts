import { db } from '../lib/db';
import { tradingDays, videoRecords, trades, tradeImages } from '../lib/db/schema';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  console.log('=== TRADING DAYS ===');
  const days = await db.query.tradingDays.findMany();
  console.log(days.map(d => ({ id: d.id, date: d.date })));

  console.log('=== VIDEO RECORDS IN DB ===');
  const videos = await db.query.videoRecords.findMany();
  console.log(videos);

  console.log('=== TRADES & IMAGES ===');
  const allTrades = await db.query.trades.findMany();
  const allImages = await db.query.tradeImages.findMany();
  console.log(`Total trades: ${allTrades.length}, Total images: ${allImages.length}`);

  for (const day of days) {
    const dTrades = allTrades.filter(t => t.tradingDayId === day.id);
    const dTradeIds = new Set(dTrades.map(t => t.id));
    const dImages = allImages.filter(img => dTradeIds.has(img.tradeId || ''));
    console.log(`Date: ${day.date} -> Trades: ${dTrades.length}, Images attached to trades: ${dImages.length}`);
    for (const t of dTrades) {
      const tImgs = allImages.filter(img => img.tradeId === t.id);
      console.log(`  Trade #${t.tradeNumber} (${t.openTime} - ${t.closeTime}): ${tImgs.length} images ->`, tImgs.map(i => i.filePath));
    }
  }

  console.log('=== CHECK DISK VIDEOS ===');
  const checkPaths = [
    path.join(process.cwd(), 'data', 'videos'),
    path.join(process.cwd(), 'public', 'videos'),
    'd:\\estudos\\2026-08-11 09-00-23.mp4',
    'd:\\estudos\\2026-08-10 08-55-57.mp4',
    'd:\\estudos\\2026-08-07 09-00-00.mp4',
  ];

  for (const p of checkPaths) {
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        console.log(`DIR EXISTS: ${p}`);
        const items = fs.readdirSync(p);
        console.log(`  Items:`, items);
        for (const item of items) {
          const subP = path.join(p, item);
          if (fs.statSync(subP).isDirectory()) {
            console.log(`  SUBDIR ${item}:`, fs.readdirSync(subP));
          } else {
            console.log(`  FILE ${item}: ${fs.statSync(subP).size} bytes`);
          }
        }
      } else {
        console.log(`FILE EXISTS: ${p} (${stat.size} bytes)`);
      }
    } else {
      console.log(`NOT FOUND: ${p}`);
    }
  }

  console.log('=== MP4 FILES IN D:\\ESTUDOS ===');
  if (fs.existsSync('d:\\estudos')) {
    const files = fs.readdirSync('d:\\estudos').filter(f => f.endsWith('.mp4'));
    console.log('D:\\estudos mp4 files:', files);
  }
}

main().catch(console.error);
