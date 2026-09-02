import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function diagnoseGps() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const outDir = path.join(process.cwd(), 'data', 'images', 'diagnose_gps');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = context.pages()[0] || await context.newPage();

  page.on('console', msg => console.log('[Browser Console]:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[Browser Page Error]:', err.message));

  console.log('1. Navegando para /farol...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);

  // Fecha cookie
  try {
    const cookieBtn = page.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
    if (await cookieBtn.isVisible()) await cookieBtn.click();
  } catch {}

  // Localiza botões de abas no topo
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, [role="tab"]')).map(b => ({
      text: (b as HTMLElement).innerText.trim(),
      role: b.getAttribute('role'),
      ariaSelected: b.getAttribute('aria-selected'),
      className: b.className
    }));
  });
  console.log('Botões de abas encontrados:', JSON.stringify(buttons.filter(b => b.text.includes('Briefing') || b.text.includes('GPS')), null, 2));

  // Tira print antes do clique no GPS
  await page.screenshot({ path: path.join(outDir, '01_before_gps_click.png') });

  // Clica no GPS de Mercado
  console.log('2. Clicando no GPS...');
  const gpsTab = page.locator('button:has-text("GPS de Mercado"), [role="tab"]:has-text("GPS")').first();
  await gpsTab.click();

  // Espera 1s, 2s, 4s e tira prints
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '02_gps_after_1s.png') });

  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, '03_gps_after_3s.png') });

  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, '04_gps_after_5s.png') });

  const innerText = await page.evaluate(() => document.body.innerText);
  console.log('Texto do body após clicar no GPS:', innerText.slice(0, 500));

  await context.close();
}

diagnoseGps().catch(console.error);
