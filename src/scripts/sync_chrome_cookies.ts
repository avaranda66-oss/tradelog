import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

export function copyFileShare(src: string, dest: string) {
  try {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    const buf = fs.readFileSync(src);
    fs.writeFileSync(dest, buf);
    return true;
  } catch (err: any) {
    console.warn(`[Sync Profile] Não foi possível copiar ${src}: ${err.message}`);
    return false;
  }
}

export function syncChromeProfile5ToPlaywright() {
  const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Usuario\\AppData\\Local';
  const chromeData = path.join(localAppData, 'Google', 'Chrome', 'User Data');
  const targetDir = path.join(process.cwd(), 'data', 'playwright_profile');

  if (!fs.existsSync(chromeData)) {
    console.warn('Chrome User Data não encontrado em:', chromeData);
    return false;
  }

  // 1. Local State (necessário para decrypt de cookies)
  const localStateSrc = path.join(chromeData, 'Local State');
  const localStateDest = path.join(targetDir, 'Local State');
  copyFileShare(localStateSrc, localStateDest);

  // 2. Profile 5 -> Default no destino
  const profile5Src = path.join(chromeData, 'Profile 5');
  const targetDefault = path.join(targetDir, 'Default');

  const files = [
    ['Network', 'Cookies'],
    ['Network', 'Cookies-journal'],
    ['Preferences'],
    ['Secure Preferences'],
  ];

  for (const f of files) {
    const src = path.join(profile5Src, ...f);
    const dest = path.join(targetDefault, ...f);
    if (fs.existsSync(src)) {
      copyFileShare(src, dest);
    }
  }

  // Copia pastas de Storage
  const storageDirs = ['Local Storage', 'Session Storage', 'IndexedDB'];
  for (const s of storageDirs) {
    const srcDir = path.join(profile5Src, s);
    const destDir = path.join(targetDefault, s);
    if (fs.existsSync(srcDir)) {
      try {
        fs.cpSync(srcDir, destDir, { recursive: true, force: true, errorOnExist: false });
      } catch {}
    }
  }

  console.log('Sincronização do Perfil 5 (avaranda66@gmail.com) concluída.');
  return true;
}

async function test() {
  syncChromeProfile5ToPlaywright();
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');

  console.log('Testando navegação no Farol com perfil sincronizado...');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.faroldomercado.com/farol', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const text = await page.evaluate(() => document.body.innerText || '');
  console.log('=== PÁGINA /farol ===');
  console.log(text.slice(0, 400));
  await page.screenshot({ path: path.join(process.cwd(), 'data', 'images', 'test_farol_sync.png'), fullPage: true });

  await page.goto('https://www.faroldomercado.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  const dashText = await page.evaluate(() => document.body.innerText || '');
  console.log('=== PÁGINA /dashboard ===');
  console.log(dashText.slice(0, 400));
  await page.screenshot({ path: path.join(process.cwd(), 'data', 'images', 'test_dash_sync.png'), fullPage: true });

  await context.close();
}

if (require.main === module) {
  test().catch(console.error);
}
