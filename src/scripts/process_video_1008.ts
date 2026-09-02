import { processOBSVideoFromLocalPath } from '../features/video/actions';

async function main() {
  const videoPath = 'd:\\estudos\\2026-08-10 08-55-57.mp4';
  console.log(`🎬 Iniciando processamento direto do vídeo gigante (2.95 GB): ${videoPath}`);

  const result = await processOBSVideoFromLocalPath({
    localFilePath: videoPath,
    date: '2026-08-10',
    shouldExtractAudio: true,
  });

  console.log('✅ Vídeo de 10/08/2026 processado com sucesso e salvo no SQLite!');
  console.log('Detalhes:', JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('❌ Erro no processamento do vídeo:', err);
});
