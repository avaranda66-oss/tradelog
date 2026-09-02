import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function inspectGpsScroll() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const targetDir = path.join(process.cwd(), 'data', 'images', 'gps_full_test');
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);

  // Fecha cookie
  try {
    const cookieBtn = page.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
    if (await cookieBtn.isVisible()) await cookieBtn.click();
  } catch {}

  const gpsBtn = page.locator('button:has-text("GPS de Mercado"), [role="tab"]:has-text("GPS")').first();
  if (await gpsBtn.isVisible()) {
    await gpsBtn.click();
    await page.waitForTimeout(4000);
  }

  // Oculta sidebar e expande
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

  // Inspeciona altura total e elementos scrolláveis
  const metrics = await page.evaluate(() => {
    const docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight
    );
    const scrollContainers = Array.from(document.querySelectorAll('*')).filter(el => {
      const style = window.getComputedStyle(el);
      return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
    }).map(el => ({
      tag: el.tagName,
      className: el.className,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));

    return { docHeight, scrollContainers };
  });

  console.log('Métricas de Scroll do GPS:', JSON.stringify(metrics, null, 2));

  // Opção A: Captura com Viewport expandido de altura total (ex: 1920 x docHeight)
  const fullHeight = Math.max(metrics.docHeight, 2400);
  await page.setViewportSize({ width: 1920, height: fullHeight });
  await page.waitForTimeout(1500);

  const fullScreenshotPath = path.join(targetDir, 'gps_ultra_full.png');
  await page.screenshot({ path: fullScreenshotPath, fullPage: true });
  console.log('✓ Opção A (Ultra Full) salva:', fullScreenshotPath, 'Tamanho:', fs.statSync(fullScreenshotPath).size, 'bytes');

  // Opção B: Captura Parte 1 (Topo/Ranges) e Parte 2 (Tabelas/Níveis/Fluxo)
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const part1Path = path.join(targetDir, 'gps_part1_ranges.png');
  await page.screenshot({ path: part1Path });
  console.log('✓ Opção B - Parte 1 salva:', part1Path);

  await page.evaluate(() => window.scrollBy(0, 900));
  await page.waitForTimeout(800);
  const part2Path = path.join(targetDir, 'gps_part2_tabelas.png');
  await page.screenshot({ path: part2Path });
  console.log('✓ Opção B - Parte 2 salva:', part2Path);

  await context.close();
}

inspectGpsScroll().catch(console.error);
