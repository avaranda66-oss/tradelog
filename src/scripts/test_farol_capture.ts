import { captureFarolMarket } from '../lib/farol-playwright';

async function main() {
  console.log('--- Testando Captura Playwright do Farol do Mercado ---');
  const result = await captureFarolMarket({ date: '2026-08-25', headless: true });
  console.log('Resultado da captura:', JSON.stringify(result, null, 2));
}

main().catch(console.error);
