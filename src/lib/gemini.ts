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

const TRANSCRIPTION_PROMPT = `Você é um assistente sênior especialista em trading de mini-índice futuro (WINFUT) na B3.

Sua tarefa é transcrever e estruturar esta narração de áudio de day trade em um relatório profissional, limpo e legível.

REGRAS DE FORMATAÇÃO E ESTRUTURA:
1. **Linguagem Limpa e Direta:** Remova vícios de linguagem e hesitações (ex: "eh", "né", "tipo assim", "ó"), mantendo 100% da fidelidade técnica, raciocínio, emoções e preços mencionados.
2. **Timestamps e Horários do Mercado:** Divida o áudio em tópicos/parágrafos claros com marcação de tempo [MM:SS] (timestamp do áudio) e, se o trader citar o horário do pregão (ex: 09:05, 09:30, 09:55), inclua a hora do pregão.
3. **Destaques Técnicos:** Destaque em negrito/código preços (ex: \`176.280\`), indicadores (VWAP, Fibo 76,4%, ADRs, Zero Gamma, Média de 50) e corretoras (XP, Ideal).

Responda EXATAMENTE neste formato JSON válido (sem markdown extra fora do JSON):
{
  "segments": [
    {
      "audio_timestamp": "00:00",
      "market_time": "09:05",
      "title": "Abertura & Expectativa pré-Payroll",
      "text": "Texto limpo do segmento aqui..."
    }
  ],
  "transcription": "Linha do tempo completa formatada em Markdown com timestamps em cada parágrafo (ex: **[00:00 - 09:05] 🌅 Title**\\nTexto...)",
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
  "emotional_state": "Descrição do estado psicológico percebido",
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
  console.log(`[Gemini] Transcrevendo áudio com timestamps: ${(fileSize / 1024 / 1024).toFixed(1)} MB (~${estimatedMinutes} min)`);

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
      temperature: 0.2,
    },
  });

  const text = response.text ?? '';

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    let formattedText = parsed.transcription || '';

    // Se os segmentos estiverem disponíveis e a transcrição for genérica, monta a linha do tempo bonita
    if (parsed.segments && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
      const formattedTimeline = parsed.segments.map((s: any) => {
        const timeHeader = s.market_time
          ? `⏱️ **[${s.audio_timestamp} | Pregão ${s.market_time}]** ${s.title ? `— ${s.title}` : ''}`
          : `⏱️ **[${s.audio_timestamp}]** ${s.title ? `— ${s.title}` : ''}`;
        return `${timeHeader}\n${s.text}`;
      }).join('\n\n');

      if (!formattedText || formattedText.length < 100) {
        formattedText = formattedTimeline;
      }
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
