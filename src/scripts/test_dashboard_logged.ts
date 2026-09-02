import { chromium } from 'playwright';
import path from 'node:path';

async function testDashboard() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = context.pages()[0] || await context.newPage();
  console.log('Navigating to https://www.faroldomercado.com/dashboard...');
  await page.goto('https://www.faroldomercado.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  console.log('Current Dashboard URL:', page.url());
  const bodyText = await page.evaluate(() => document.body.innerText || '');
  console.log('Dashboard Text Snippet:', bodyText.slice(0, 400));
  await page.screenshot({ path: path.join(process.cwd(), 'data', 'images', 'test_radar_logged_in.png'), fullPage: true });

  await context.close();
}

testDashboard().catch(console.error);
