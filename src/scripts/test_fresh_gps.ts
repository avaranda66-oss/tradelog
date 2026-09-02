import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function testFreshGps() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const SIDEBAR_HIDE_CSS = `
    aside,
    [data-sidebar="sidebar"],
    div.border-r.w-64.fixed,
    div[class*="w-64"][class*="fixed"] {
      display: none !important;
      visibility: hidden !important;
      width: 0 !important;
    }
    main,
    [data-sidebar="inset"],
    .flex-1 {
      margin-left: 0 !important;
      padding-left: 16px !important;
      padding-right: 16px !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    footer {
      display: none !important;
    }
  `;

  // ─────────────────────────────────────────────────────────
  // 1. BRIEFING DE MERCADO
  // ─────────────────────────────────────────────────────────
  const page1 = context.pages()[0] || await context.newPage();
  console.log('1. Acessando Briefing...');
  await page1.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page1.waitForTimeout(3000);

  try {
    const cookieBtn = page1.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
    if (await cookieBtn.isVisible()) await cookieBtn.click();
  } catch {}

  await page1.addStyleTag({ content: SIDEBAR_HIDE_CSS });
  await page1.waitForTimeout(500);

  const briefingPath = path.join(process.cwd(), 'data', 'images', 'test_fresh_briefing.png');
  await page1.screenshot({ path: briefingPath, fullPage: true });
  console.log('✓ Briefing salvo:', briefingPath, 'Tamanho:', fs.statSync(briefingPath).size, 'bytes');
  await page1.close();

  // ─────────────────────────────────────────────────────────
  // 2. GPS DE MERCADO (Página Nova / Fresh Context)
  // ─────────────────────────────────────────────────────────
  const page2 = await context.newPage();
  console.log('2. Acessando GPS de Mercado em página limpa...');
  await page2.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page2.waitForTimeout(3000);

  try {
    const cookieBtn = page2.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
    if (await cookieBtn.isVisible()) await cookieBtn.click();
  } catch {}

  console.log('Clicando em GPS de Mercado...');
  const gpsBtn = page2.locator('button:has-text("GPS de Mercado")').first();
  await gpsBtn.click();
  await page2.waitForTimeout(4000); // Aguarda renderizar as tabelas

  const gpsSnippet = await page2.evaluate(() => document.body.innerText.slice(0, 300));
  console.log('Texto do GPS:', gpsSnippet);

  await page2.addStyleTag({ content: SIDEBAR_HIDE_CSS });
  await page2.waitForTimeout(500);

  const gpsPath = path.join(process.cwd(), 'data', 'images', 'test_fresh_gps.png');
  await page2.screenshot({ path: gpsPath, fullPage: true });
  console.log('✓ GPS salvo:', gpsPath, 'Tamanho:', fs.statSync(gpsPath).size, 'bytes');
  await page2.close();

  // ─────────────────────────────────────────────────────────
  // 3. RADAR & TICKERS
  // ─────────────────────────────────────────────────────────
  const page3 = await context.newPage();
  console.log('3. Acessando Radar (/dashboard)...');
  await page3.goto('https://www.faroldomercado.com/dashboard', { waitUntil: 'networkidle', timeout: 35000 });
  await page3.waitForTimeout(4000);

  try {
    const cookieBtn = page3.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
    if (await cookieBtn.isVisible()) await cookieBtn.click();
  } catch {}

  await page3.addStyleTag({ content: SIDEBAR_HIDE_CSS });
  await page3.waitForTimeout(500);

  const radarPath = path.join(process.cwd(), 'data', 'images', 'test_fresh_radar.png');
  await page3.screenshot({ path: radarPath, fullPage: true });
  console.log('✓ Radar salvo:', radarPath, 'Tamanho:', fs.statSync(radarPath).size, 'bytes');
  await page3.close();

  await context.close();
}

testFreshGps().catch(console.error);
