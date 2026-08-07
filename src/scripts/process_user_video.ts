import { processOBSVideoFromLocalPath } from '../features/video/actions';

async function main() {
  const videoPath = 'd:\\estudos\\2026-08-07 09-04-54.mp4';
  console.log(`🎬 Iniciando processamento direto do vídeo gigante (2.56GB): ${videoPath}`);

  const result = await processOBSVideoFromLocalPath({
    localFilePath: videoPath,
    date: '2026-08-07',
    shouldExtractAudio: true,
  });

  console.log('✅ Vídeo processado com sucesso no SQLite!');
  console.log('Detalhes:', JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('❌ Erro no processamento:', err);
});
