import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function testPerfectCaptures() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const targetDir = path.join(process.cwd(), 'data', 'images', 'perfect_test');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Usamos largura 1920 e altura expandida (ou captura do container principal)
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1200 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = context.pages()[0] || await context.newPage();

  // Injeta CSS para esconder o rodapé azul gigante de links rápidos e focar 100% no conteúdo financeiro
  async function hideUnnecessaryFooters() {
    await page.evaluate(() => {
      // Esconde o footer azul inferior gigante se existir
      const footers = document.querySelectorAll('footer, [class*="bg-[#0066FF]"], [class*="bg-blue-600"], [class*="bg-primary"]');
      footers.forEach(f => {
        if (f.textContent?.includes('Links Rápidos') || f.textContent?.includes('CNPJ') || f.textContent?.includes('Política')) {
          (f as HTMLElement).style.display = 'none';
        }
      });
      // Esconde banner de cookie
      const cookieBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('OK, entendi') || b.textContent?.includes('Aceitar'));
      if (cookieBtn) cookieBtn.click();
    });
  }

  // 1. BRIEFING DE MERCADO
  console.log('1. Capturando Briefing de Mercado...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);
  await hideUnnecessaryFooters();

  const briefingBtn = page.locator('button:has-text("Briefing de Mercado")').first();
  if (await briefingBtn.isVisible()) {
    await briefingBtn.click();
    await page.waitForTimeout(2000);
  }

  // Tira screenshot do container principal ou da página sem o footer
  const briefingPath = path.join(targetDir, 'perfect_briefing.png');
  const mainBriefing = page.locator('main, [class*="space-y"]').first();
  if (await mainBriefing.isVisible()) {
    await mainBriefing.screenshot({ path: briefingPath });
  } else {
    await page.screenshot({ path: briefingPath, fullPage: false });
  }
  console.log('✓ Briefing perfeito salvo:', briefingPath);

  // 2. GPS DE MERCADO
  console.log('2. Clicando e capturando GPS de Mercado...');
  const gpsBtn = page.locator('button:has-text("GPS de Mercado")').first();
  if (await gpsBtn.isVisible()) {
    await gpsBtn.click();
    await page.waitForTimeout(3000);
  }
  await hideUnnecessaryFooters();

  const gpsPath = path.join(targetDir, 'perfect_gps.png');
  const mainGps = page.locator('main, [class*="space-y"]').first();
  if (await mainGps.isVisible()) {
    await mainGps.screenshot({ path: gpsPath });
  } else {
    await page.screenshot({ path: gpsPath, fullPage: false });
  }
  console.log('✓ GPS perfeito salvo:', gpsPath);

  // 3. RADAR & TICKERS
  console.log('3. Capturando Radar de Mercado & Tickers...');
  await page.goto('https://www.faroldomercado.com/dashboard', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(4000);
  await hideUnnecessaryFooters();

  const radarPath = path.join(targetDir, 'perfect_radar.png');
  // Para o radar, queremos capturar toda a grid de ADRs, Commodities e Mercados
  const mainRadar = page.locator('main, [class*="grid"], [class*="dashboard"]').first();
  if (await mainRadar.isVisible()) {
    await mainRadar.screenshot({ path: radarPath });
  } else {
    await page.screenshot({ path: radarPath, fullPage: false });
  }
  console.log('✓ Radar perfeito salvo:', radarPath);

  await context.close();
}

testPerfectCaptures().catch(console.error);
