import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function testGpsTabSwitch() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = context.pages()[0] || await context.newPage();
  console.log('1. Navegando para /farol...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);

  // Fecha cookie
  try {
    const cookieBtn = page.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
    if (await cookieBtn.isVisible()) await cookieBtn.click();
  } catch {}

  console.log('2. Acionando clique explícito no GPS de Mercado...');
  // Clica no GPS de Mercado garantindo disparo de evento
  const clicked = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[role="tab"], button'));
    const gpsTab = tabs.find(t => t.textContent?.includes('GPS de Mercado'));
    if (gpsTab) {
      (gpsTab as HTMLElement).click();
      return true;
    }
    return false;
  });
  console.log('Clique via DOM disparado:', clicked);

  // Também dispara via Playwright locator com force
  const gpsLocator = page.locator('[role="tab"], button').filter({ hasText: 'GPS de Mercado' }).first();
  if (await gpsLocator.isVisible()) {
    await gpsLocator.click({ force: true });
  }

  console.log('3. Aguardando ativação do GPS de Mercado...');
  // Aguarda até a aba GPS ter data-state="active" ou o texto "Viés WIN" aparecer
  await page.waitForFunction(() => {
    const tabs = Array.from(document.querySelectorAll('[role="tab"], button'));
    const gpsTab = tabs.find(t => t.textContent?.includes('GPS de Mercado'));
    return gpsTab?.getAttribute('data-state') === 'active' || document.body.innerText.includes('Viés WIN');
  }, { timeout: 10000 });

  await page.waitForTimeout(3000); // Aguarda renderização completa de todas as tabelas

  const tabState = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[role="tab"], button'));
    const gpsTab = tabs.find(t => t.textContent?.includes('GPS de Mercado'));
    const briefingTab = tabs.find(t => t.textContent?.includes('Briefing de Mercado'));
    return {
      gpsState: gpsTab?.getAttribute('data-state'),
      briefingState: briefingTab?.getAttribute('data-state'),
      bodySnippet: document.body.innerText.slice(0, 300)
    };
  });
  console.log('Estado das abas:', JSON.stringify(tabState, null, 2));

  // Injeta o CSS limpo sem sidebar
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
  await page.waitForTimeout(500);

  const outPath = path.join(process.cwd(), 'data', 'images', 'gps_switch_test.png');
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('✓ Screenshot do GPS salvo:', outPath, 'Tamanho:', fs.statSync(outPath).size, 'bytes');

  await context.close();
}

testGpsTabSwitch().catch(console.error);
