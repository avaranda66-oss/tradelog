import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function main() {
  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  console.log('🌐 Abrindo Google Chrome para login no Farol do Mercado...');
  console.log('💡 Faça o login com sua conta (avaranda66@gmail.com) no navegador que foi aberto.');
  console.log('💡 Assim que você entrar, a sessão ficará salva permanentemente para as capturas automáticas.');

  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1440, height: 900 },
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  } catch {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'msedge',
      headless: false,
      viewport: { width: 1440, height: 900 },
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  await page.goto('https://www.faroldomercado.com/farol');

  console.log('⏳ Aguardando você realizar o login no navegador...');

  // Aguarda até o usuário estar logado (sair da tela de login)
  try {
    await page.waitForFunction(
      () => !document.body.innerText.includes('Acessar conta') && !document.body.innerText.includes('Não tem conta?'),
      { timeout: 180000 } // 3 minutos
    );
    console.log('✅ Login detectado com sucesso! Sessão e cookies salvos em data/playwright_profile.');
    await page.waitForTimeout(3000);
  } catch {
    console.log('ℹ️ Tempo limite ou janela fechada. A sessão atual foi preservada.');
  }

  await context.close();
  console.log('Pronto! Agora você já pode usar o botão "CAPTURAR FAROL" no TradeLog.');
}

main().catch(console.error);
