import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function testFinalCleanScreenshots() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const targetDir = path.join(process.cwd(), 'data', 'images', 'final_clean_test');
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = context.pages()[0] || await context.newPage();

  async function stripSidebarAndExpand() {
    await page.evaluate(() => {
      // 1. Remove qualquer elemento lateral de navegação (que contenha 'Roadmap' ou 'Planos')
      document.querySelectorAll('div, aside, nav').forEach(el => {
        const text = el.textContent || '';
        if ((el.classList.contains('fixed') || el.className.includes('w-64') || el.className.includes('sidebar')) &&
            (text.includes('Roadmap') || text.includes('Planos') || text.includes('Afiliados')) &&
            !text.includes('Briefing Pré-Mercado') && !text.includes('Viés WIN')) {
          (el as HTMLElement).remove();
        }
      });

      // 2. Remove deslocamento à esquerda (margin/padding) no container de conteúdo
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        const pl = parseInt(style.paddingLeft || '0', 10);
        const ml = parseInt(style.marginLeft || '0', 10);
        if (pl >= 200) (el as HTMLElement).style.paddingLeft = '16px';
        if (ml >= 200) (el as HTMLElement).style.marginLeft = '0px';
      });

      // 3. Remove rodapé azul gigante
      const footers = document.querySelectorAll('footer, [class*="bg-[#0066FF]"]');
      footers.forEach(f => {
        if (f.textContent?.includes('Links Rápidos') || f.textContent?.includes('CNPJ') || f.textContent?.includes('Política')) {
          (f as HTMLElement).remove();
        }
      });

      // 4. Remove banner de cookies se existir
      const cookieBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('OK, entendi') || b.textContent?.includes('Aceitar'));
      if (cookieBtn) cookieBtn.click();
    });
    await page.waitForTimeout(500);
  }

  // 1. BRIEFING DE MERCADO
  console.log('1. Capturando Briefing...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);

  const briefingTab = page.locator('button:has-text("Briefing de Mercado"), [role="tab"]:has-text("Briefing")').first();
  if (await briefingTab.isVisible()) {
    await briefingTab.click();
    await page.waitForTimeout(2000);
  }
  await stripSidebarAndExpand();

  const briefingFile = path.join(targetDir, 'final_briefing.png');
  await page.screenshot({ path: briefingFile, fullPage: true });
  console.log('✓ Briefing capturado:', fs.statSync(briefingFile).size, 'bytes');

  // 2. GPS DE MERCADO
  console.log('2. Capturando GPS...');
  const gpsTab = page.locator('button:has-text("GPS de Mercado"), [role="tab"]:has-text("GPS")').first();
  if (await gpsTab.isVisible()) {
    await gpsTab.click();
    await page.waitForTimeout(3500);
  }
  await stripSidebarAndExpand();

  const gpsFile = path.join(targetDir, 'final_gps.png');
  await page.screenshot({ path: gpsFile, fullPage: true });
  console.log('✓ GPS capturado:', fs.statSync(gpsFile).size, 'bytes');

  // 3. RADAR DE MERCADO & TICKERS
  console.log('3. Capturando Radar (/dashboard)...');
  await page.goto('https://www.faroldomercado.com/dashboard', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(4000);
  await stripSidebarAndExpand();

  const radarFile = path.join(targetDir, 'final_radar.png');
  await page.screenshot({ path: radarFile, fullPage: true });
  console.log('✓ Radar capturado:', fs.statSync(radarFile).size, 'bytes');

  await context.close();
}

testFinalCleanScreenshots().catch(console.error);
