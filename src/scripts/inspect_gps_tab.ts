import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function inspectGpsTab() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
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

  const gpsTab = page.locator('button:has-text("GPS de Mercado"), [role="tab"]:has-text("GPS")').first();
  await gpsTab.click();
  await page.waitForTimeout(3500);

  const gpsDetails = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const gpsTabEl = tabs.find(t => t.textContent?.includes('GPS'));
    const panels = Array.from(document.querySelectorAll('[role="tabpanel"], [data-state="active"]'));
    return {
      gpsTabActive: gpsTabEl?.getAttribute('data-state'),
      panelsCount: panels.length,
      panels: panels.map(p => ({
        tag: p.tagName,
        className: p.className,
        height: (p as HTMLElement).clientHeight,
        scrollHeight: (p as HTMLElement).scrollHeight,
        textSnippet: (p as HTMLElement).innerText.slice(0, 300)
      })),
      allTables: Array.from(document.querySelectorAll('table')).map(t => ({
        rows: t.rows.length,
        text: (t as HTMLElement).innerText.slice(0, 200)
      })),
      bodyText: document.body.innerText.slice(0, 800)
    };
  });

  console.log('GPS Details:', JSON.stringify(gpsDetails, null, 2));

  // Tira print sem footer e sem sidebar
  await page.evaluate(() => {
    document.querySelectorAll('aside, [class*="sidebar"], [class*="w-64"][class*="fixed"]').forEach(el => el.remove());
    document.querySelectorAll('footer').forEach(el => el.remove());
  });

  const gpsPath = path.join(process.cwd(), 'data', 'images', 'final_clean_test', 'gps_perfect.png');
  await page.screenshot({ path: gpsPath, fullPage: true });
  console.log('✓ GPS screenshot salvo:', fs.statSync(gpsPath).size, 'bytes');

  await context.close();
}

inspectGpsTab().catch(console.error);
