import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function debugFarol() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const outDir = path.join(process.cwd(), 'data', 'images', 'debug_farol');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = context.pages()[0] || await context.newPage();

  // Função para limpar totalmente menu lateral, rodapé, banners e modais
  async function cleanAndExpandLayout() {
    await page.evaluate(() => {
      // 1. Esconde menu lateral e gavetas
      const sidebars = document.querySelectorAll('aside, nav, [class*="sidebar"], [data-state="open"]');
      sidebars.forEach(el => {
        if (!el.textContent?.includes('Briefing de Mercado') && !el.textContent?.includes('GPS de Mercado')) {
          (el as HTMLElement).style.setProperty('display', 'none', 'important');
        }
      });

      // 2. Esconde rodapé e links de suporte
      document.querySelectorAll('footer, [class*="bg-[#0066FF]"]').forEach(el => {
        if (el.textContent?.includes('Links Rápidos') || el.textContent?.includes('CNPJ') || el.textContent?.includes('Política')) {
          (el as HTMLElement).style.setProperty('display', 'none', 'important');
        }
      });

      // 3. Força o container principal a ocupar 100% da largura
      const main = document.querySelector('main');
      if (main) {
        main.style.setProperty('margin-left', '0px', 'important');
        main.style.setProperty('padding-left', '16px', 'important');
        main.style.setProperty('padding-right', '16px', 'important');
        main.style.setProperty('max-width', '100%', 'important');
        main.style.setProperty('width', '100%', 'important');
      }

      // 4. Fecha cookies se houver
      const cookieBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('OK, entendi') || b.textContent?.includes('Aceitar'));
      if (cookieBtn) cookieBtn.click();
    });
    await page.waitForTimeout(600);
  }

  // ─────────────────────────────────────────────────────────
  // 1. BRIEFING
  // ─────────────────────────────────────────────────────────
  console.log('1. Acessando Briefing...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);

  const briefingBtn = page.locator('button:has-text("Briefing de Mercado"), [role="tab"]:has-text("Briefing")').first();
  if (await briefingBtn.isVisible()) {
    await briefingBtn.click();
    await page.waitForTimeout(2000);
  }

  await cleanAndExpandLayout();
  await page.screenshot({ path: path.join(outDir, 'clean_briefing.png'), fullPage: true });
  console.log('✓ Briefing capturado');

  // ─────────────────────────────────────────────────────────
  // 2. GPS DE MERCADO
  // ─────────────────────────────────────────────────────────
  console.log('2. Acessando GPS de Mercado...');
  // Clica no botão GPS
  const gpsBtn = page.locator('button:has-text("GPS de Mercado"), [role="tab"]:has-text("GPS")').first();
  if (await gpsBtn.isVisible()) {
    console.log('Clicando em GPS de Mercado...');
    await gpsBtn.click();
    await page.waitForTimeout(4000); // Aguarda renderizar o GPS
  }

  // Verifica o que há na tela do GPS
  const gpsHtml = await page.evaluate(() => {
    return {
      title: document.title,
      bodyTextSnippet: document.body.innerText.slice(0, 400),
      hasTables: document.querySelectorAll('table').length,
      hasCards: document.querySelectorAll('[class*="card"], [class*="border"]').length,
    };
  });
  console.log('Estado da tela GPS:', JSON.stringify(gpsHtml, null, 2));

  await cleanAndExpandLayout();
  await page.screenshot({ path: path.join(outDir, 'clean_gps.png'), fullPage: true });
  console.log('✓ GPS capturado');

  // ─────────────────────────────────────────────────────────
  // 3. RADAR
  // ─────────────────────────────────────────────────────────
  console.log('3. Acessando Radar (/dashboard)...');
  await page.goto('https://www.faroldomercado.com/dashboard', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(4000);

  await cleanAndExpandLayout();
  await page.screenshot({ path: path.join(outDir, 'clean_radar.png'), fullPage: true });
  console.log('✓ Radar capturado');

  await context.close();
}

debugFarol().catch(console.error);
