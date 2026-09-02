import { retryAudioTranscription } from '../features/audio/actions';

async function main() {
  console.log('🎙️ Iniciando re-transcrição com cobertura dos 63 minutos e cálculo de segundos...');
  const res = await retryAudioTranscription('u88ogiecpv3jwz5dup997h4e');
  console.log('✅ Re-transcrição concluída com sucesso!');
}

main().catch(err => {
  console.error('❌ Erro:', err);
});
