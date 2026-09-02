import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function fixGpsIsolated() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = context.pages()[0] || await context.newPage();

  console.log('1. Navegando diretamente para /farol...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);

  // Fecha cookie
  try {
    const cookieBtn = page.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
    if (await cookieBtn.isVisible()) await cookieBtn.click();
  } catch {}

  console.log('2. Clicando no botão GPS de Mercado...');
  // Clica no botão GPS de Mercado
  const gpsTab = page.locator('button:has-text("GPS de Mercado")').first();
  await gpsTab.click();
  await page.waitForTimeout(4000); // Aguarda renderizar o GPS

  // Injeta o CSS limpo APENAS após a renderização do GPS
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
  await page.addStyleTag({ content: SIDEBAR_HIDE_CSS });
  await page.waitForTimeout(1000);

  const gpsPath = path.join(process.cwd(), 'data', 'images', '2026-08-25', 'farol', 'farol_gps_2026-08-25.png');
  await page.screenshot({ path: gpsPath, fullPage: true });
  console.log('✓ GPS salvo:', gpsPath, 'Tamanho:', fs.statSync(gpsPath).size, 'bytes');

  await context.close();
}

fixGpsIsolated().catch(console.error);
