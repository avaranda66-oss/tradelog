import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function testCleanFix() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const targetDir = path.join(process.cwd(), 'data', 'images', 'clean_fix_test');
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = context.pages()[0] || await context.newPage();

  // CSS que fecha SOMENTE a barra lateral esquerda sem tocar em nenhuma cor azul nem no conteúdo
  const sidebarHideStyle = `
    /* Oculta a barra lateral de navegação esquerda */
    aside,
    [data-sidebar="sidebar"],
    div.border-r.w-64.fixed,
    div[class*="w-64"][class*="fixed"] {
      display: none !important;
      visibility: hidden !important;
      width: 0 !important;
    }

    /* Expande o conteúdo principal */
    main,
    [data-sidebar="inset"],
    .flex-1 {
      margin-left: 0 !important;
      padding-left: 16px !important;
      padding-right: 16px !important;
      width: 100% !important;
      max-width: 100% !important;
    }

    /* Oculta apenas o elemento footer real */
    footer {
      display: none !important;
    }
  `;

  // 1. BRIEFING DE MERCADO
  console.log('1. Capturando Briefing...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);

  // Fecha cookie se houver
  try {
    const cookieBtn = page.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
    if (await cookieBtn.isVisible()) await cookieBtn.click();
  } catch {}

  const briefingBtn = page.locator('button:has-text("Briefing de Mercado"), [role="tab"]:has-text("Briefing")').first();
  if (await briefingBtn.isVisible()) {
    await briefingBtn.click();
    await page.waitForTimeout(2000);
  }

  await page.addStyleTag({ content: sidebarHideStyle });
  await page.waitForTimeout(500);

  const briefingFile = path.join(targetDir, 'briefing_clean.png');
  await page.screenshot({ path: briefingFile, fullPage: true });
  console.log('✓ Briefing capturado com sucesso:', fs.statSync(briefingFile).size, 'bytes');

  // 2. GPS DE MERCADO
  console.log('2. Clicando no GPS de Mercado...');
  const gpsBtn = page.locator('button:has-text("GPS de Mercado"), [role="tab"]:has-text("GPS")').first();
  if (await gpsBtn.isVisible()) {
    await gpsBtn.click();
    await page.waitForTimeout(3500); // Aguarda renderizar as tabelas do GPS
  }

  await page.addStyleTag({ content: sidebarHideStyle });
  await page.waitForTimeout(500);

  const gpsFile = path.join(targetDir, 'gps_clean.png');
  await page.screenshot({ path: gpsFile, fullPage: true });
  console.log('✓ GPS capturado com sucesso:', fs.statSync(gpsFile).size, 'bytes');

  // 3. RADAR & TICKERS
  console.log('3. Capturando Radar (/dashboard)...');
  await page.goto('https://www.faroldomercado.com/dashboard', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(4000);

  await page.addStyleTag({ content: sidebarHideStyle });
  await page.waitForTimeout(500);

  const radarFile = path.join(targetDir, 'radar_clean.png');
  await page.screenshot({ path: radarFile, fullPage: true });
  console.log('✓ Radar capturado com sucesso:', fs.statSync(radarFile).size, 'bytes');

  await context.close();
}

testCleanFix().catch(console.error);
