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

const TRANSCRIPTION_PROMPT = `Você é um transcritor profissional de áudio de day trade no mini-índice (WINFUT).

REGRAS CRÍTICAS DE TRANSCRIÇÃO:
1. **Comece do Início Absoluto do Áudio (00:00):** Transcreva TUDO a partir do primeiro segundo (00:00) da gravação, incluindo qualquer comentário pré-market feito antes da abertura do pregão (ex: 08:15, 08:30, 08:45). NÃO ignore o início e NÃO force a transcrição a iniciar em 09:00.
2. **Fidelidade Total em 1ª Pessoa (Fala Natural):** Transcreva EXATAMENTE as palavras como o trader falou em primeira pessoa (ex: "eu tô pensando aqui agora", "eu ia fazer uma compra nessa média de 50", "olha que filho da puta, me violinou"). NÃO resuma, NÃO reescreva de forma acadêmica/formal e NÃO transforme em relatório em 3ª pessoa.
3. **Remova Apenas Ruídos de Fala:** Elimine apenas interjeições como "eh", "humm", "né?", "tipo", "ó", sem alterar o vocabulário, o tom ou as frases do trader.
4. **Timestamps [MM:SS]:** Divida o áudio em segmentos naturais com o tempo relativo [MM:SS] desde o início (00:00). Se o trader mencionar horários específicos (ex: 08:45, 09:05, 09:30), registre também o horário de mercado.
5. **Destaques Técnicos:** Destaque em negrito/código preços (ex: \`176.280\`), indicadores (VWAP, Fibo, ADRs, Zero Gamma, Média de 50) e corretoras (XP, Ideal).

Responda EXATAMENTE neste formato JSON válido (sem markdown extra fora do JSON):
{
  "segments": [
    {
      "audio_timestamp": "00:00",
      "market_time": "08:45 (se mencionado, senão null)",
      "text": "Fala natural do trader a partir do primeiro segundo de gravação..."
    }
  ],
  "transcription": "Texto concatenado natural da gravação inteira em 1ª pessoa",
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
  "emotional_state": "Estado emocional percebido",
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
  console.log(`[Gemini] Transcrevendo áudio do segundo 00:00 (pré-market incluso): ${(fileSize / 1024 / 1024).toFixed(1)} MB (~${estimatedMinutes} min)`);

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

    // Se os segmentos estiverem disponíveis, monta a linha do tempo natural desde 00:00
    if (parsed.segments && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
      const formattedTimeline = parsed.segments.map((s: any) => {
        const timeHeader = s.market_time && s.market_time !== 'null'
          ? `⏱️ **[${s.audio_timestamp} | Pregão ${s.market_time}]**`
          : `⏱️ **[${s.audio_timestamp}]**`;
        return `${timeHeader}\n${s.text}`;
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
      }),
    };
  } catch {
    return {
      transcription: text,
      insights: '{}',
    };
  }
}
