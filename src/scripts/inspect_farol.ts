import { chromium } from 'playwright';
import path from 'node:path';

async function inspect() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = context.pages()[0] || await context.newPage();
  console.log('Navigating to https://www.faroldomercado.com/farol...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const url = page.url();
  console.log('Current URL:', url);

  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a, [role="tab"]')).map(el => ({
      tag: el.tagName,
      text: el.textContent?.trim().replace(/\s+/g, ' ') || '',
      href: (el as any).href || '',
    })).filter(b => b.text.length > 0);
  });
  console.log('Found interactive elements:', JSON.stringify(buttons, null, 2));

  // Test clicking GPS de Mercado
  console.log('Testing click on GPS de Mercado...');
  const gpsBtn = page.locator('button:has-text("GPS de Mercado"), [role="tab"]:has-text("GPS de Mercado")').first();
  if (await gpsBtn.isVisible()) {
    console.log('GPS de Mercado button is visible! Clicking...');
    await gpsBtn.click();
    await page.waitForTimeout(3000);
    const gpsScreenshot = path.join(process.cwd(), 'data', 'images', 'test_gps_clicked.png');
    await page.screenshot({ path: gpsScreenshot, fullPage: true });
    console.log('Screenshot of GPS tab saved to', gpsScreenshot);
  } else {
    console.log('GPS button not found with primary locator, searching all text containing GPS...');
    const allGps = page.locator('text=GPS').first();
    if (await allGps.isVisible()) {
      await allGps.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(process.cwd(), 'data', 'images', 'test_gps_clicked.png'), fullPage: true });
    }
  }

  // Test clicking Briefing de Mercado
  console.log('Testing click on Briefing de Mercado...');
  const briefingBtn = page.locator('button:has-text("Briefing"), [role="tab"]:has-text("Briefing")').first();
  if (await briefingBtn.isVisible()) {
    console.log('Briefing button is visible! Clicking...');
    await briefingBtn.click();
    await page.waitForTimeout(3000);
    const briefingScreenshot = path.join(process.cwd(), 'data', 'images', 'test_briefing_clicked.png');
    await page.screenshot({ path: briefingScreenshot, fullPage: true });
    console.log('Screenshot of Briefing tab saved to', briefingScreenshot);
  }

  await context.close();
}

inspect().catch(console.error);
