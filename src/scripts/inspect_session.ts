import { chromium } from 'playwright';
import path from 'node:path';

async function inspectSession() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const page = context.pages()[0] || await context.newPage();
  console.log('1. Navegando para https://www.faroldomercado.com/farol...');
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);

  // Inspeciona Cookies e LocalStorage
  const cookies = await context.cookies();
  console.log('Cookies count:', cookies.length, cookies.map(c => ({ name: c.name, domain: c.domain })));

  const localStorageKeys = await page.evaluate(() => {
    return Object.keys(localStorage).map(k => ({ key: k, valueSnippet: localStorage.getItem(k)?.slice(0, 50) }));
  });
  console.log('LocalStorage keys:', JSON.stringify(localStorageKeys, null, 2));

  // Verifica se na aba Briefing há algum modal/overlay bloqueando
  const modalInfo = await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="overlay"], [class*="backdrop"]'));
    return overlays.map(o => ({
      tag: o.tagName,
      className: o.className,
      text: (o as HTMLElement).innerText.slice(0, 100)
    }));
  });
  console.log('Modais/Overlays encontrados na página:', JSON.stringify(modalInfo, null, 2));

  // Clica no GPS de Mercado dentro da mesma página SPA
  console.log('2. Clicando no botão GPS de Mercado...');
  const gpsButton = page.locator('button:has-text("GPS de Mercado")').first();
  if (await gpsButton.isVisible()) {
    console.log('Botão GPS encontrado. Clicando...');
    await gpsButton.click();
    await page.waitForTimeout(4000);
    console.log('URL após clicar em GPS:', page.url());
    const gpsText = await page.evaluate(() => document.body.innerText.slice(0, 300));
    console.log('Texto do GPS:', gpsText);
  } else {
    console.log('Botão GPS NÃO está visível!');
  }

  // Clica no link Radar no menu lateral/superior
  console.log('3. Clicando no link Radar no menu...');
  const radarLink = page.locator('a:has-text("Radar"), button:has-text("Radar")').first();
  if (await radarLink.isVisible()) {
    console.log('Link Radar encontrado. Clicando...');
    await radarLink.click();
    await page.waitForTimeout(4000);
    console.log('URL após clicar em Radar:', page.url());
    const radarText = await page.evaluate(() => document.body.innerText.slice(0, 300));
    console.log('Texto do Radar:', radarText);
  }

  await context.close();
}

inspectSession().catch(console.error);
