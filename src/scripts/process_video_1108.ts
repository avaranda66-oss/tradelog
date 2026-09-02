import { processOBSVideoFromLocalPath } from '../features/video/actions';
import { exportTradingDayToMarkdown } from '../lib/markdown-sync';

async function main() {
  const videoPath = 'd:\\estudos\\2026-08-11 09-00-23.mp4';
  const dateStr = '2026-08-11';
  console.log(`🎬 Iniciando processamento do vídeo OBS para a data ${dateStr}: ${videoPath}`);

  const result = await processOBSVideoFromLocalPath({
    localFilePath: videoPath,
    date: dateStr,
    shouldExtractAudio: true,
  });

  console.log('✅ Vídeo processado com sucesso!');
  console.log('Resultado:', JSON.stringify(result, null, 2));

  await exportTradingDayToMarkdown(dateStr);
  console.log('[MarkdownSync] Diário exportado para 04-DIARIO-TRADE!');
}

main().catch(err => {
  console.error('❌ Erro no processamento do vídeo:', err);
});
