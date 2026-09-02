import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function testRadar() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = context.pages()[0] || await context.newPage();
  console.log('Navegando para https://www.faroldomercado.com/dashboard...');
  await page.goto('https://www.faroldomercado.com/dashboard', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(4000);

  // Inspeciona elementos de sidebar no dashboard
  const layoutInfo = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    const nav = document.querySelector('nav');
    const allSidebars = Array.from(document.querySelectorAll('[class*="sidebar"], [data-sidebar]'));
    return {
      aside: aside ? aside.className : 'none',
      nav: nav ? nav.className : 'none',
      allSidebars: allSidebars.map(s => ({ class: s.className, text: (s as HTMLElement).innerText.slice(0, 50) })),
      bodyText: document.body.innerText.slice(0, 300)
    };
  });
  console.log('Layout Info:', JSON.stringify(layoutInfo, null, 2));

  // Clica no botão "Ocultar painel" ou recolher sidebar se existir
  const collapseBtn = page.locator('button:has-text("Ocultar painel"), button[aria-label*="sidebar"], button[data-sidebar="trigger"]').first();
  if (await collapseBtn.isVisible()) {
    console.log('Botão de ocultar painel/sidebar encontrado. Clicando...');
    await collapseBtn.click();
    await page.waitForTimeout(1000);
  }

  // Remove apenas o menu lateral flutuante sem afetar os cards do radar
  await page.evaluate(() => {
    // Esconde apenas o menu de links (Roadmap, Planos, Farol, etc)
    const linksMenu = Array.from(document.querySelectorAll('aside, [data-sidebar="sidebar"]'));
    linksMenu.forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });

    // Remove footer
    document.querySelectorAll('footer, [class*="bg-[#0066FF]"]').forEach(el => {
      if (el.textContent?.includes('Links Rápidos') || el.textContent?.includes('CNPJ')) {
        (el as HTMLElement).style.display = 'none';
      }
    });

    // Força container principal a preencher a tela inteira
    document.querySelectorAll('main, [data-sidebar="inset"]').forEach(el => {
      (el as HTMLElement).style.setProperty('margin-left', '0px', 'important');
      (el as HTMLElement).style.setProperty('width', '100%', 'important');
      (el as HTMLElement).style.setProperty('max-width', '100%', 'important');
    });
  });
  await page.waitForTimeout(1000);

  const radarPath = path.join(process.cwd(), 'data', 'images', '2026-08-25', 'farol', 'farol_radar_2026-08-25.png');
  await page.screenshot({ path: radarPath, fullPage: true });
  console.log('Radar full screenshot salvo:', radarPath, 'Tamanho:', fs.statSync(radarPath).size);

  await context.close();
}

testRadar().catch(console.error);
