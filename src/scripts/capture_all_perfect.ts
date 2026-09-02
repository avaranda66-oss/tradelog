import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../lib/db';
import { tradingDays, tradeImages } from '../lib/db/schema';
import { generateId } from '../lib/utils';
import { eq, and } from 'drizzle-orm';

async function captureAllPerfect(dateStr = '2026-08-25') {
  console.log(`[Farol Capture Perfect] Iniciando captura limpa e sem sidebar para ${dateStr}...`);
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

  async function collapseSidebarAndClean() {
    // 1. Clica no botão oficial "Ocultar painel" se visível
    try {
      const collapseBtn = page.locator('button:has-text("Ocultar painel"), button[aria-label*="sidebar"], button[data-sidebar="trigger"]').first();
      if (await collapseBtn.isVisible({ timeout: 1500 })) {
        await collapseBtn.click();
        await page.waitForTimeout(600);
      }
    } catch {}

    // 2. Garante via DOM que a sidebar lateral e o footer não fiquem sobre o conteúdo
    await page.evaluate(() => {
      // Oculta sidebars fixas / menus de navegação que possam sobrepor
      document.querySelectorAll('aside, [data-sidebar="sidebar"], .sidebar-expanded, [class*="w-64"][class*="fixed"]').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });

      // Oculta rodapés azuis com links
      document.querySelectorAll('footer, [class*="bg-[#0066FF]"]').forEach(el => {
        if (el.textContent?.includes('Links Rápidos') || el.textContent?.includes('CNPJ')) {
          (el as HTMLElement).style.display = 'none';
        }
      });

      // Força área principal a ocupar 100% da largura
      document.querySelectorAll('main, [data-sidebar="inset"]').forEach(el => {
        (el as HTMLElement).style.setProperty('margin-left', '0px', 'important');
        (el as HTMLElement).style.setProperty('width', '100%', 'important');
        (el as HTMLElement).style.setProperty('max-width', '100%', 'important');
      });

      // Fecha cookies
      const btns = Array.from(document.querySelectorAll('button'));
      const cookieBtn = btns.find(b => b.textContent?.includes('OK, entendi') || b.textContent?.includes('Aceitar'));
      if (cookieBtn) cookieBtn.click();
    });
    await page.waitForTimeout(600);
  }

  // ─────────────────────────────────────────────────────────
  // 1. BRIEFING DE MERCADO
  // ─────────────────────────────────────────────────────────
  console.log('1. Capturando Briefing de Mercado...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);

  const briefingBtn = page.locator('button:has-text("Briefing de Mercado"), [role="tab"]:has-text("Briefing")').first();
  if (await briefingBtn.isVisible()) {
    await briefingBtn.click();
    await page.waitForTimeout(2000);
  }

  await collapseSidebarAndClean();
  const briefingPath = path.join(imagesDir, `farol_briefing_${dateStr}.png`);
  await page.screenshot({ path: briefingPath, fullPage: true });
  console.log(`✓ Briefing salvo (${fs.statSync(briefingPath).size} bytes): ${briefingPath}`);

  // ─────────────────────────────────────────────────────────
  // 2. GPS DE MERCADO
  // ─────────────────────────────────────────────────────────
  console.log('2. Capturando GPS de Mercado...');
  const gpsBtn = page.locator('button:has-text("GPS de Mercado"), [role="tab"]:has-text("GPS")').first();
  if (await gpsBtn.isVisible()) {
    await gpsBtn.click();
    await page.waitForTimeout(4000); // Aguarda renderizar todas as tabelas
  }

  await collapseSidebarAndClean();
  const gpsPath = path.join(imagesDir, `farol_gps_${dateStr}.png`);
  await page.screenshot({ path: gpsPath, fullPage: true });
  console.log(`✓ GPS salvo (${fs.statSync(gpsPath).size} bytes): ${gpsPath}`);

  // ─────────────────────────────────────────────────────────
  // 3. RADAR & TICKERS
  // ─────────────────────────────────────────────────────────
  console.log('3. Capturando Radar de Mercado & Tickers...');
  await page.goto('https://www.faroldomercado.com/dashboard', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(4000);

  await collapseSidebarAndClean();
  const radarPath = path.join(imagesDir, `farol_radar_${dateStr}.png`);
  await page.screenshot({ path: radarPath, fullPage: true });
  console.log(`✓ Radar salvo (${fs.statSync(radarPath).size} bytes): ${radarPath}`);

  await context.close();

  // ─────────────────────────────────────────────────────────
  // 4. ATUALIZAR BANCO SQLITE COM NOVOS IDS
  // ─────────────────────────────────────────────────────────
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  if (day) {
    const items = [
      { type: 'farol-briefing', caption: 'Briefing de Mercado — Farol do Mercado', file: `images/${dateStr}/farol/farol_briefing_${dateStr}.png` },
      { type: 'farol-gps', caption: 'GPS de Mercado — Farol do Mercado', file: `images/${dateStr}/farol/farol_gps_${dateStr}.png` },
      { type: 'farol-radar', caption: 'Radar de Mercado & Tickers — Farol do Mercado', file: `images/${dateStr}/farol/farol_radar_${dateStr}.png` },
    ];

    for (const item of items) {
      const existing = await db.query.tradeImages.findFirst({
        where: and(eq(tradeImages.tradingDayId, day.id), eq(tradeImages.imageType, item.type)),
      });

      const newId = generateId();
      if (existing) {
        await db.update(tradeImages).set({
          id: newId,
          filePath: item.file,
          caption: item.caption,
        }).where(eq(tradeImages.id, existing.id));
      } else {
        await db.insert(tradeImages).values({
          id: newId,
          tradingDayId: day.id,
          filePath: item.file,
          imageType: item.type,
          caption: item.caption,
        });
      }
    }
    console.log('✓ Banco SQLite atualizado com os novos registros!');
  }
}

captureAllPerfect().catch(console.error);
