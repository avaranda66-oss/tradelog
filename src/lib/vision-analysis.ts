import { getGeminiClient } from '@/lib/gemini';
import fs from 'node:fs';

const VISION_CHART_PROMPT = `Você é um analista sênior de Price Action, Tape Reading e Análise Técnica de mini-índice (WINFUT) no Brasil.

Analise esta imagem de gráfico/plataforma de trading (Profit Pro / OBS).
Identifique:
1. Padrão de candles ou estrutura de preço visível (ex: consolidação, rompimento, pullback, engolfo, martelo, tendência).
2. Posição do preço em relação às médias móveis, VWAP ou Cumulative Delta (se visíveis na tela).
3. Uma síntese técnica em 2 ou 3 frases curtas e objetivas sobre o contexto operacional desta imagem.

Responda diretamente em texto claro e profissional em português (sem saudações).`;

/**
 * Analisa a imagem de um gráfico/screenshot de trade usando IA de Visão Multimodal (Claude/Gemini Vision)
 */
export async function analyzeTradeScreenshotVision(filePath: string): Promise<string> {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo não encontrado: ${filePath}`);
    }

    const imageBuffer = fs.readFileSync(filePath);
    const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const client = getGeminiClient();
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: VISION_CHART_PROMPT },
            {
              inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType,
              },
            },
          ],
        },
      ],
      config: { temperature: 0.2 },
    });

    return response.text?.trim() || 'Análise visual concluída.';
  } catch (err) {
    console.error('Erro na Análise Vision do Screenshot:', err);
    return 'Análise visual indisponível para este screenshot.';
  }
}
