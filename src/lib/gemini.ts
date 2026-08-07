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

function parseAudioTimestampToSeconds(timestampStr: string): number {
  if (!timestampStr) return 0;
  const parts = timestampStr.split(':').map(Number);
  if (parts.length === 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
  if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  return 0;
}

function calculateMarketTimeFromStart(startMarketTime: string, offsetSecs: number): string {
  const parts = startMarketTime.split(':').map(Number);
  let h = parts[0] ?? 9;
  let m = parts[1] ?? 4;
  let s = parts[2] ?? 0;

  let totalSecs = h * 3600 + m * 60 + s + offsetSecs;
  const newH = Math.floor(totalSecs / 3600) % 24;
  const newM = Math.floor((totalSecs % 3600) / 60);

  return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
}

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
 * Transcreve um arquivo de áudio usando Gemini 2.5 Flash com Horário de Início Real e Contexto de Trades
 */
export async function transcribeAudio(
  filePath: string,
  startMarketTime: string = '09:04:54',
  dayContext: string = ''
): Promise<{
  transcription: string;
  insights: string;
}> {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_MAP[ext] || 'audio/webm';
  const fileSize = fs.statSync(filePath).size;
  const estimatedMinutes = Math.round(fileSize / (8 * 1024) / 60);
  console.log(`[Gemini] Transcrevendo com horário de início real do áudio [${startMarketTime}] e contexto de trades do dia: ${(fileSize / 1024 / 1024).toFixed(1)} MB (~${estimatedMinutes} min)`);

  const promptText = `Você é um transcritor sênior especializado em trading de mercado futuro brasileiro (B3) e mini-índice (WINFUT).

HORÁRIO DE INÍCIO REAL DA GRAVAÇÃO: **${startMarketTime}** (Horário de Brasília / Pregão).
- O tempo relativo [00:00] do áudio corresponde EXATAMENTE a **${startMarketTime}** no relógio do pregão.
- Calcule os horários do pregão para cada segmento a partir desta hora inicial (${startMarketTime}).

${dayContext ? `INFORMAÇÕES E TRADES REAIS EXECUTADOS NESTA SESSÃO (USE COMO REFERÊNCIA DE CONTEXTO):\n${dayContext}\n` : ''}

GLOSSÁRIO TÉCNICO OBRIGATÓRIO DE TRADING B3:
- "DI" / "DI1FUT" / "DI Fut" / "DI 1 Fut" = Contrato Futuro de Taxa de Juros B3 no Brasil. NUNCA transcreva como "DXY" quando o trader disser DI / DI1Fut / DI Fut!
- "DXY" = Somente transcreva DXY se o trader falar "D-X-Y" ou "Índice Dólar Global".
- "WINFUT" / "WIN" / "WINQ26" = Mini-Índice Futuro.
- "WDOFUT" / "WDO" = Mini-Dólar Futuro.
- "GEX" / "Zero Gamma" / "Flip Regime" / "Call Wall" / "Put Wall" / "Pico Short" = Estrutura de Opções/GEX.
- "VWAP" / "Fibo 76,4%" / "Média de 9" / "Média de 50" / "Ajuste" = Indicadores.
- "XP", "Ideal", "BTG", "UBS", "Morgan" = Corretoras.

REGRAS DE TRANSCRIÇÃO:
1. **Fidelidade Auditiva Absoluta (00:00 → Fim):** Transcreva o áudio a partir do segundo 00:00 até o final, em 1ª pessoa, exatamente como o trader falou.
2. **Sem Substituições de Termos:** Se o trader disser "DI", "DI Fut" ou "DI1Fut", transcreva EXATAMENTE "DI" ou "DI Fut". Não confunda foneticamente com "DXY".
3. **Limpeza de Ruídos:** Remova apenas interjeições como "eh", "humm", "né?", "tipo", sem alterar frases ou raciocínio.

Responda EXATAMENTE neste formato JSON válido (sem markdown extra fora do JSON):
{
  "segments": [
    {
      "audio_timestamp": "00:00",
      "raw_text": "Transcrição fiel e exata do áudio em 1ª pessoa...",
      "ai_analysis": "Análise técnica profissional da IA sobre este trecho..."
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
          { text: promptText },
          audioPart,
        ],
      },
    ],
    config: {
      temperature: 0.0,
    },
  });

  const text = response.text ?? '';

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Recalcula MATEMATICAMENTE o horário de pregão para cada segmento a partir de startMarketTime
    if (parsed.segments && Array.isArray(parsed.segments)) {
      parsed.segments = parsed.segments.map((s: any) => {
        const offsetSecs = parseAudioTimestampToSeconds(s.audio_timestamp);
        const calculatedMarketTime = calculateMarketTimeFromStart(startMarketTime, offsetSecs);
        return {
          ...s,
          market_time: calculatedMarketTime,
        };
      });
    }

    let formattedText = parsed.transcription || '';

    if (parsed.segments && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
      const formattedTimeline = parsed.segments.map((s: any) => {
        const timeHeader = `⏱️ **[${s.audio_timestamp} | Pregão ${s.market_time}]**`;
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
        startMarketTime,
      }),
    };
  } catch {
    return {
      transcription: text,
      insights: '{}',
    };
  }
}
