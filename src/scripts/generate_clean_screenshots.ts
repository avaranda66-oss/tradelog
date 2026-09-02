import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../lib/db';
import { tradingDays, tradeImages } from '../lib/db/schema';
import { generateId } from '../lib/utils';
import { eq, and } from 'drizzle-orm';

async function generateCleanScreenshots(dateStr = '2026-08-25') {
  console.log(`[Farol Fix] Gerando screenshots nítidos e 100% logados para ${dateStr}...`);
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const imagesDir = path.join(process.cwd(), 'data', 'images', dateStr, 'farol');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = context.pages()[0] || await context.newPage();

  // ─────────────────────────────────────────────────────────
  // 1. BRIEFING DE MERCADO
  // ─────────────────────────────────────────────────────────
  console.log('1. Acessando https://www.faroldomercado.com/farol (Briefing)...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);

  // Fecha cookie banner se existir (clica no botão, sem esconder classes Tailwind!)
  try {
    const cookieBtn = page.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
    if (await cookieBtn.isVisible({ timeout: 2000 })) {
      await cookieBtn.click();
      await page.waitForTimeout(800);
    }
  } catch {}

  const briefingBtn = page.locator('button:has-text("Briefing de Mercado"), [role="tab"]:has-text("Briefing")').first();
  if (await briefingBtn.isVisible()) {
    await briefingBtn.click();
    await page.waitForTimeout(2000);
  }

  const briefingPath = path.join(imagesDir, `farol_briefing_${dateStr}.png`);
  await page.screenshot({ path: briefingPath, fullPage: true });
  console.log('✓ Briefing capturado com sucesso:', briefingPath);

  // ─────────────────────────────────────────────────────────
  // 2. GPS DE MERCADO
  // ─────────────────────────────────────────────────────────
  console.log('2. Clicando na aba GPS de Mercado...');
  const gpsBtn = page.locator('button:has-text("GPS de Mercado"), [role="tab"]:has-text("GPS")').first();
  if (await gpsBtn.isVisible()) {
    await gpsBtn.click();
    await page.waitForTimeout(3500); // Aguarda carregar dados do GPS
  }

  const gpsPath = path.join(imagesDir, `farol_gps_${dateStr}.png`);
  await page.screenshot({ path: gpsPath, fullPage: true });
  console.log('✓ GPS capturado com sucesso:', gpsPath);

  // ─────────────────────────────────────────────────────────
  // 3. RADAR & TICKERS
  // ─────────────────────────────────────────────────────────
  console.log('3. Acessando https://www.faroldomercado.com/dashboard (Radar)...');
  await page.goto('https://www.faroldomercado.com/dashboard', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(4000);

  try {
    const cookieBtn = page.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
    if (await cookieBtn.isVisible({ timeout: 2000 })) {
      await cookieBtn.click();
      await page.waitForTimeout(800);
    }
  } catch {}

  const radarPath = path.join(imagesDir, `farol_radar_${dateStr}.png`);
  await page.screenshot({ path: radarPath, fullPage: true });
  console.log('✓ Radar capturado com sucesso:', radarPath);

  await context.close();

  // ─────────────────────────────────────────────────────────
  // 4. ATUALIZAR BANCO SQLITE
  // ─────────────────────────────────────────────────────────
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  if (day) {
    // Remove qualquer registro inválido ou antigo
    await db.delete(tradeImages).where(
      and(eq(tradeImages.tradingDayId, day.id), eq(tradeImages.imageType, 'farol-gex'))
    );

    const items = [
      { type: 'farol-briefing', caption: 'Briefing de Mercado — Farol do Mercado', file: `images/${dateStr}/farol/farol_briefing_${dateStr}.png` },
      { type: 'farol-gps', caption: 'GPS de Mercado — Farol do Mercado', file: `images/${dateStr}/farol/farol_gps_${dateStr}.png` },
      { type: 'farol-radar', caption: 'Radar de Mercado & Tickers — Farol do Mercado', file: `images/${dateStr}/farol/farol_radar_${dateStr}.png` },
    ];

    for (const item of items) {
      const existing = await db.query.tradeImages.findFirst({
        where: and(eq(tradeImages.tradingDayId, day.id), eq(tradeImages.imageType, item.type)),
      });

      if (existing) {
        await db.update(tradeImages).set({
          filePath: item.file,
          caption: item.caption,
        }).where(eq(tradeImages.id, existing.id));
      } else {
        await db.insert(tradeImages).values({
          id: generateId(),
          tradingDayId: day.id,
          filePath: item.file,
          imageType: item.type,
          caption: item.caption,
        });
      }
    }
    console.log('✓ Banco SQLite atualizado com os 3 arquivos definitivos.');
  }
}

generateCleanScreenshots().catch(console.error);
