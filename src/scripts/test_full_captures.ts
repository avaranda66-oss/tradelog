import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function testFullCaptures() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const targetDir = path.join(process.cwd(), 'data', 'images', 'perfect_test2');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = context.pages()[0] || await context.newPage();

  async function cleanPage() {
    await page.evaluate(() => {
      // Remove rodapé azul gigante de links e termos
      document.querySelectorAll('footer, [class*="bg-[#0066FF]"]').forEach(el => {
        if (el.textContent?.includes('Links Rápidos') || el.textContent?.includes('CNPJ')) {
          (el as HTMLElement).style.display = 'none';
        }
      });
      // Fecha cookie
      const btns = Array.from(document.querySelectorAll('button'));
      const cookieBtn = btns.find(b => b.textContent?.includes('OK, entendi') || b.textContent?.includes('Aceitar'));
      if (cookieBtn) cookieBtn.click();
    });
    await page.waitForTimeout(500);
  }

  // 1. BRIEFING
  console.log('Capturando Briefing...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);
  await cleanPage();

  const briefingBtn = page.locator('button:has-text("Briefing de Mercado")').first();
  if (await briefingBtn.isVisible()) {
    await briefingBtn.click();
    await page.waitForTimeout(2500);
  }
  await cleanPage();

  const briefingPath = path.join(targetDir, 'briefing_full.png');
  await page.screenshot({ path: briefingPath, fullPage: true });
  console.log('Briefing full size:', fs.statSync(briefingPath).size);

  // 2. GPS
  console.log('Capturando GPS...');
  const gpsBtn = page.locator('button:has-text("GPS de Mercado")').first();
  if (await gpsBtn.isVisible()) {
    await gpsBtn.click();
    await page.waitForTimeout(3500);
  }
  await cleanPage();

  const gpsPath = path.join(targetDir, 'gps_full.png');
  await page.screenshot({ path: gpsPath, fullPage: true });
  console.log('GPS full size:', fs.statSync(gpsPath).size);

  // 3. RADAR
  console.log('Capturando Radar...');
  await page.goto('https://www.faroldomercado.com/dashboard', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(4000);
  await cleanPage();

  const radarPath = path.join(targetDir, 'radar_full.png');
  await page.screenshot({ path: radarPath, fullPage: true });
  console.log('Radar full size:', fs.statSync(radarPath).size);

  await context.close();
}

testFullCaptures().catch(console.error);
