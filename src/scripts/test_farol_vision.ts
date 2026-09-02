import { analyzeFarolScreenshotsVision } from '../lib/farol-vision';

async function run() {
  console.log('Testando Farol Vision AI com screenshots de 2026-08-27...');
  try {
    const result = await analyzeFarolScreenshotsVision('2026-08-27');
    console.log('\n================ RESULTADO DA ANÁLISE ================');
    console.log(JSON.stringify(result, null, 2));
    console.log('======================================================\n');
  } catch (err: any) {
    console.error('Erro detalhado:', err);
  }
}

run();
