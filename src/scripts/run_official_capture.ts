import { captureFarolMarket } from '../lib/farol-playwright';

async function main() {
  console.log('Disparando captura oficial das 4 telas...');
  const res = await captureFarolMarket({ date: '2026-08-25', headless: true });
  console.log('Resultado da captura:', JSON.stringify(res, null, 2));
}

main().catch(console.error);
