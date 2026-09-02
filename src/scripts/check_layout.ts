import { chromium } from 'playwright';
import path from 'node:path';

async function checkLayout() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = context.pages()[0] || await context.newPage();

  console.log('1. Verificando dimensões da página /farol...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);

  const dimFarol = await page.evaluate(() => {
    return {
      bodyScrollHeight: document.body.scrollHeight,
      bodyClientHeight: document.body.clientHeight,
      htmlScrollHeight: document.documentElement.scrollHeight,
      mainElement: document.querySelector('main')?.scrollHeight,
      scrollableContainers: Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
      }).map(el => ({
        tag: el.tagName,
        className: el.className,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      })),
    };
  });
  console.log('Dimensões /farol:', JSON.stringify(dimFarol, null, 2));

  console.log('2. Verificando dimensões da página /dashboard...');
  await page.goto('https://www.faroldomercado.com/dashboard', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);

  const dimDash = await page.evaluate(() => {
    return {
      bodyScrollHeight: document.body.scrollHeight,
      bodyClientHeight: document.body.clientHeight,
      htmlScrollHeight: document.documentElement.scrollHeight,
      mainElement: document.querySelector('main')?.scrollHeight,
      scrollableContainers: Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
      }).map(el => ({
        tag: el.tagName,
        className: el.className,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      })),
    };
  });
  console.log('Dimensões /dashboard:', JSON.stringify(dimDash, null, 2));

  await context.close();
}

checkLayout().catch(console.error);
