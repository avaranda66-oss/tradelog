import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function testNativeSidebarToggle() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const outDir = path.join(process.cwd(), 'data', 'images', 'native_test');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = context.pages()[0] || await context.newPage();

  // 1. BRIEFING
  console.log('1. Acessando /farol...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);

  // Fecha banner de cookie se houver
  const cookieBtn = page.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
  if (await cookieBtn.isVisible()) {
    await cookieBtn.click();
    await page.waitForTimeout(500);
  }

  // Clica no botão "Ocultar painel" nativo do site
  const hidePanelBtn = page.locator('button:has-text("Ocultar painel")').first();
  if (await hidePanelBtn.isVisible()) {
    console.log('Clicando em "Ocultar painel"...');
    await hidePanelBtn.click();
    await page.waitForTimeout(1000);
  }

  // Remove apenas o footer azul no final da página (sem tocar em nenhuma div do meio)
  await page.evaluate(() => {
    const f = document.querySelector('footer');
    if (f) f.style.display = 'none';
  });

  const briefingPath = path.join(outDir, 'briefing.png');
  await page.screenshot({ path: briefingPath, fullPage: true });
  console.log('Briefing size:', fs.statSync(briefingPath).size);

  // 2. GPS
  console.log('2. Clicando em GPS...');
  const gpsBtn = page.locator('button:has-text("GPS de Mercado")').first();
  if (await gpsBtn.isVisible()) {
    await gpsBtn.click();
    await page.waitForTimeout(3500);
  }

  const gpsPath = path.join(outDir, 'gps.png');
  await page.screenshot({ path: gpsPath, fullPage: true });
  console.log('GPS size:', fs.statSync(gpsPath).size);

  // 3. RADAR
  console.log('3. Acessando /dashboard...');
  await page.goto('https://www.faroldomercado.com/dashboard', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(4000);

  const hidePanelRadar = page.locator('button:has-text("Ocultar painel")').first();
  if (await hidePanelRadar.isVisible()) {
    console.log('Clicando em "Ocultar painel" no Radar...');
    await hidePanelRadar.click();
    await page.waitForTimeout(1000);
  }

  await page.evaluate(() => {
    const f = document.querySelector('footer');
    if (f) f.style.display = 'none';
  });

  const radarPath = path.join(outDir, 'radar.png');
  await page.screenshot({ path: radarPath, fullPage: true });
  console.log('Radar size:', fs.statSync(radarPath).size);

  await context.close();
}

testNativeSidebarToggle().catch(console.error);
