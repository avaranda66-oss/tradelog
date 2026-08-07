import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';

function getApiKey(): string {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/GEMINI_API_KEY=(.+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch {}
  return '';
}

const API_KEY = getApiKey();
const ai = new GoogleGenAI({ apiKey: API_KEY });

const INLINE_MAX_BYTES = 14 * 1024 * 1024; // 14 MB

const TRANSCRIPTION_PROMPT = `Você é um assistente duplo especialista em trading de mini-índice futuro (WINFUT) na B3.

Sua tarefa é gerar DUAS VISÕES COMPLETAS para este áudio de day trade:

VISÃO 1 - TRANSCRIÇÃO FIEL E NATURAL (1ª PESSOA):
- Transcreva rigorosamente o que o trader falou em primeira pessoa a partir do SEGUNDO 00:00 da gravação (incluindo pré-market).
- Mantenha 100% das palavras, vocabulário, termos chulos/emocionais e espontaneidade do trader.
- Remova APENAS ruídos de fala (ex: "eh", "humm", "né?", "tipo"). NÃO resuma e NÃO formalize.

VISÃO 2 - ANÁLISE & SÍNTESE TÉCNICA PROFISSIONAL DA IA (PARA O POP-UP):
- Crie uma análise técnica e síntese refinada de cada trecho do áudio em tom profissional de mentor de trading.
- Relacione o raciocínio do trader com o cenário macro (Payroll, ADRs, Fed) e a ação do preço (VWAP, Fibo 76,4%, Zero Gamma, suportes/resistências).

Responda EXATAMENTE neste formato JSON válido (sem markdown extra fora do JSON):
{
  "segments": [
    {
      "audio_timestamp": "00:00",
      "market_time": "08:45",
      "raw_text": "Transcrição fiel e natural das palavras ditas pelo trader em 1ª pessoa...",
      "ai_analysis": "Análise técnica profissional da IA sobre este momento específico para exibir no pop-up..."
    }
  ],
  "transcription": "Texto concatenado natural da gravação inteira em 1ª pessoa",
  "ai_summary": "Resumo executivo completo do pregão elaborado pela IA",
  "trades_mentioned": [
    {
      "trade_number": 1,
      "side": "venda",
      "time": "09:55",
      "level": "176.295",
      "result": "stop 100 pts",
      "audio_timestamp": "50:10"
    }
  ],
  "emotional_state": "Estado emocional percebido na voz",
  "key_observations": ["observação 1", "observação 2"]
}`;

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
 * Transcreve um arquivo de áudio usando Gemini 2.5 Flash
 */
export async function transcribeAudio(filePath: string): Promise<{
  transcription: string;
  insights: string;
}> {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_MAP[ext] || 'audio/webm';
  const fileSize = fs.statSync(filePath).size;
  const estimatedMinutes = Math.round(fileSize / (8 * 1024) / 60);
  console.log(`[Gemini] Transcrevendo áudio com dupla visão (fiel + análise IA): ${(fileSize / 1024 / 1024).toFixed(1)} MB (~${estimatedMinutes} min)`);

  let audioPart: { inlineData: { mimeType: string; data: string } } | { fileData: { fileUri: string; mimeType: string } };

  if (fileSize < INLINE_MAX_BYTES) {
    console.log('[Gemini] Usando inlineData');
    const base64Audio = fs.readFileSync(filePath).toString('base64');
    audioPart = { inlineData: { mimeType, data: base64Audio } };
  } else {
    console.log('[Gemini] Usando Files API');
    const uploadResult = await ai.files.upload({
      file: filePath,
      config: { mimeType },
    });

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
      temperature: 0.1,
    },
  });

  const text = response.text ?? '';

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    let formattedText = parsed.transcription || '';

    // Se os segmentos estiverem disponíveis, monta a linha do tempo natural
    if (parsed.segments && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
      const formattedTimeline = parsed.segments.map((s: any) => {
        const timeHeader = s.market_time && s.market_time !== 'null'
          ? `⏱️ **[${s.audio_timestamp} | Pregão ${s.market_time}]**`
          : `⏱️ **[${s.audio_timestamp}]**`;
        const content = s.raw_text || s.text || '';
        return `${timeHeader}\n${content}`;
      }).join('\n\n');

      formattedText = formattedTimeline;
    }

    return {
      transcription: formattedText || text,
      insights: JSON.stringify({
        trades: parsed.trades_mentioned || [],
        emotion: parsed.emotional_state || '',
        observations: parsed.key_observations || [],
        segments: parsed.segments || [],
        aiSummary: parsed.ai_summary || '',
      }),
    };
  } catch {
    return {
      transcription: text,
      insights: '{}',
    };
  }
}
