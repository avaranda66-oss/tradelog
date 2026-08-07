import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';

const API_KEY = process.env.GEMINI_API_KEY!;
const ai = new GoogleGenAI({ apiKey: API_KEY });

// ─── Limites ─────────────────────────────────────────────────
/**
 * Limites de tamanho da Gemini API:
 * - inlineData: máx 15 MB (20 MB com base64 overhead = ~15 MB raw)
 * - Files API: máx 2 GB, ~8.4h de áudio
 * - Token limit de áudio: ~25-32 tokens/segundo
 * - Custo: ~US$ 0.005-0.01/minuto de áudio (Flash)
 * 
 * WebM/Opus bitrate típico: ~6-10 KB/s
 * - 15 MB ≈ 25-40 minutos de áudio
 * - Para gravações > 15 MB, usamos Files API automaticamente
 */
const INLINE_MAX_BYTES = 14 * 1024 * 1024; // 14 MB (margem de segurança)

const TRANSCRIPTION_PROMPT = `Você é um assistente especializado em trading de mini-índice futuro (WINFUT) no Brasil.

Transcreva este áudio em português brasileiro de forma precisa. O áudio é uma narração de um trader durante ou após suas operações de day trade.

IMPORTANTE sobre timestamps:
- Divida a transcrição em segmentos de ~15-30 segundos
- Para cada segmento, indique o timestamp do áudio (MM:SS)
- Se o trader mencionar um horário específico (ex: "às 9:15", "no candle das 10:30"), registre esse horário separadamente como "market_time"

Responda EXATAMENTE neste formato JSON (sem markdown, sem code blocks):
{
  "segments": [
    {
      "audio_timestamp": "00:00",
      "market_time": "09:05 (se mencionado, senão null)",
      "text": "texto do segmento aqui"
    }
  ],
  "transcription": "texto completo sem timestamps (concatenado)",
  "trades_mentioned": [
    {
      "trade_number": 1,
      "side": "compra ou venda",
      "time": "horário mencionado se houver",
      "level": "nível de preço mencionado se houver",
      "result": "resultado mencionado se houver",
      "audio_timestamp": "MM:SS do momento no áudio"
    }
  ],
  "emotional_state": "descrição do estado emocional percebido na voz/conteúdo",
  "key_observations": ["observação 1", "observação 2"]
}`;

// ─── MIME types aceitos pelo Gemini ──────────────────────────
const MIME_MAP: Record<string, string> = {
  '.webm': 'audio/webm',
  '.mp3': 'audio/mp3',
  '.mpeg': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
};

/**
 * Transcreve um arquivo de áudio usando Gemini 2.5 Flash.
 * 
 * Estratégia de upload:
 * - Arquivo < 14 MB → inlineData (base64 direto no request)
 * - Arquivo >= 14 MB → Files API (upload separado, referência por URI)
 */
export async function transcribeAudio(filePath: string): Promise<{
  transcription: string;
  insights: string;
}> {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_MAP[ext] || 'audio/webm';
  const fileSize = fs.statSync(filePath).size;
  const estimatedMinutes = Math.round(fileSize / (8 * 1024) / 60);
  console.log(`[Gemini] Transcrevendo: ${(fileSize / 1024 / 1024).toFixed(1)} MB (~${estimatedMinutes} min)`);

  let audioPart: { inlineData: { mimeType: string; data: string } } | { fileData: { fileUri: string; mimeType: string } };

  if (fileSize < INLINE_MAX_BYTES) {
    // ─── Método 1: inlineData (rápido, < 14 MB) ───────────
    console.log('[Gemini] Usando inlineData');
    const base64Audio = fs.readFileSync(filePath).toString('base64');
    audioPart = { inlineData: { mimeType, data: base64Audio } };
  } else {
    // ─── Método 2: Files API (robusto, até 2GB) ───────────
    console.log('[Gemini] Usando Files API');
    const uploadResult = await ai.files.upload({
      file: filePath,
      config: { mimeType },
    });

    // Aguarda processamento
    let file = uploadResult;
    while (file.state === 'PROCESSING') {
      console.log('[Gemini] Aguardando processamento...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      file = await ai.files.get({ name: file.name! });
    }

    if (file.state === 'FAILED') {
      throw new Error('Falha no processamento do arquivo pelo Gemini');
    }

    audioPart = { fileData: { fileUri: file.uri!, mimeType } };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { text: TRANSCRIPTION_PROMPT },
          audioPart,
        ],
      },
    ],
    config: {
      temperature: 0.2,
    },
  });

  const text = response.text ?? '';

  // Tenta parsear como JSON
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      transcription: parsed.transcription || text,
      insights: JSON.stringify({
        trades: parsed.trades_mentioned || [],
        emotion: parsed.emotional_state || '',
        observations: parsed.key_observations || [],
      }),
    };
  } catch {
    return {
      transcription: text,
      insights: '{}',
    };
  }
}
