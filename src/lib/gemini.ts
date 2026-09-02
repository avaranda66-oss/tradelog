import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

function getApiKey(): string {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
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

export function getGeminiClient(): GoogleGenAI {
  const key = getApiKey();
  if (!key) {
    throw new Error('GEMINI_API_KEY não configurada no arquivo .env.local.');
  }
  return new GoogleGenAI({ apiKey: key });
}

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
  let m = parts[1] ?? 0;
  let s = parts[2] ?? 0;

  let totalSecs = h * 3600 + m * 60 + s + offsetSecs;
  const newH = Math.floor(totalSecs / 3600) % 24;
  const newM = Math.floor((totalSecs % 3600) / 60);
  const newS = Math.floor(totalSecs % 60);

  return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}:${newS.toString().padStart(2, '0')}`;
}

function getFFmpegBinary(): string {
  if (!ffmpegPath) {
    throw new Error('FFmpeg executável não encontrado.');
  }
  return ffmpegPath;
}

function formatSecondsToMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Obtém duração em segundos de um arquivo de áudio via ffmpeg
 */
async function getAudioDurationSecs(audioPath: string): Promise<number> {
  const ffmpeg = getFFmpegBinary();
  let stderr = '';
  try {
    await execFileAsync(ffmpeg, ['-i', audioPath]);
  } catch (err: any) {
    stderr = err.stderr || err.stdout || '';
  }
  const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d+)/);
  if (match) {
    const [, h, m, s, ms] = match;
    return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseFloat(`0.${ms}`);
  }
  return 0;
}

/**
 * Transcreve um chunk de áudio de até 10-15 minutos usando Gemini 2.5 Flash
 */
async function transcribeAudioChunk({
  chunkPath,
  chunkOffsetSecs,
  startMarketTime,
  dayContext,
}: {
  chunkPath: string;
  chunkOffsetSecs: number;
  startMarketTime: string;
  dayContext: string;
}): Promise<{
  segments: Array<{
    audio_timestamp: string;
    market_time: string;
    raw_text: string;
    ai_analysis?: string;
  }>;
  trades_mentioned: any[];
  emotional_state: string;
  key_observations: string[];
  ai_summary: string;
}> {
  const base64Audio = fs.readFileSync(chunkPath).toString('base64');
  const chunkStartMMSS = formatSecondsToMMSS(chunkOffsetSecs);
  const chunkMarketStart = calculateMarketTimeFromStart(startMarketTime, chunkOffsetSecs);

  const promptText = `Você é um transcritor sênior especializado em trading de mini-índice (WINFUT / B3) e microestrutura de mercado brasileiro.
Você está analisando um segmento cronológico deste pregão:
- Início do segmento no áudio: **${chunkStartMMSS}** (Horário no Pregão: **${chunkMarketStart}**).
- Horário base de abertura da sessão: **${startMarketTime}**.

${dayContext ? `CONTEXTO OPERACIONAL DO DIA:\n${dayContext}\n` : ''}

GLOSSÁRIO TÉCNICO:
- "DI" / "DI Fut" / "DI1FUT" = Contrato Futuro de Taxa de Juros B3.
- "WINFUT" / "WIN" = Mini-Índice.
- "WDOFUT" / "WDO" = Mini-Dólar.
- "GEX" / "Zero Gamma" / "Call Wall" / "Put Wall" = Níveis de Opções.
- "VWAP" / "Médias 9/21/50/200" / "Ajuste" / "Parcial" / "Stop" = Termos de Trade.
- "XP", "Ideal", "BTG", "UBS", "Morgan", "Tullett" = Participantes / Corretoras.

INSTRUÇÕES OBRIGATÓRIAS:
1. Escaneie CUIDADOSAMENTE todo o áudio. Transcreva com fidelidade e exatidão LITERAL todas as falas que o trader proferir (comentários de entrada, parciais, alvos, leitura de fluxo, stops, frustração, alívio, etc.).
2. Não ignore falas baixas ou pontuais. Se houver falas em apenas 10 ou 20 segundos deste segmento, transcreva esses trechos perfeitamente com o timestamp relativo do início de cada fala dentro deste chunk (ex: "01:15").
3. Se o segmento estiver 100% em silêncio (apenas cliques de mouse ou sem voz), retorne "segments": [].
4. NUNCA invente diálogos que não existam no áudio.

Responda ESTRITAMENTE em formato JSON:
{
  "segments": [
    {
      "audio_timestamp": "MM:SS",
      "raw_text": "Transcrição exata do que foi falado pelo trader...",
      "ai_analysis": "Breve nota do contexto operacional..."
    }
  ],
  "trades_mentioned": [],
  "emotional_state": "Estado emocional perceptível na voz (ex: Focado, Ansioso, Frustrado, Confiante, Calmo)",
  "key_observations": ["observações operacionais"],
  "ai_summary": "Resumo das falas ocorridas neste bloco"
}`;

  try {
    const client = getGeminiClient();
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            { inlineData: { mimeType: 'audio/mp3', data: base64Audio } },
          ],
        },
      ],
      config: {
        temperature: 0.0,
        responseMimeType: 'application/json',
        maxOutputTokens: 16384,
      },
    });

    const text = response.text ?? '';
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      return { segments: [], trades_mentioned: [], emotional_state: '', key_observations: [], ai_summary: '' };
    }

    let parsed: any = null;
    const jsonSubstring = text.substring(firstBrace, lastBrace + 1);
    try {
      parsed = JSON.parse(jsonSubstring);
    } catch {
      try {
        const cleaned = jsonSubstring
          .replace(/,\s*([\]}])/g, '$1')
          .replace(/}\s*{/g, '},{')
          .replace(/]\s*\[/g, '],[')
          .replace(/"\s*\n\s*"/g, '",\n"')
          .replace(/}\s*\n\s*{/g, '},\n{');
        parsed = JSON.parse(cleaned);
      } catch {
        const rawMatches = Array.from(jsonSubstring.matchAll(/"audio_timestamp"\s*:\s*"([^"]+)"[\s\S]*?"raw_text"\s*:\s*"([^"]+)"/g));
        if (rawMatches.length > 0) {
          parsed = {
            segments: rawMatches.map(m => ({
              audio_timestamp: m[1],
              raw_text: m[2],
            })),
          };
        } else {
          return { segments: [], trades_mentioned: [], emotional_state: '', key_observations: [], ai_summary: '' };
        }
      }
    }

    const segments = Array.isArray(parsed?.segments) ? parsed.segments : [];

    const adjustedSegments = segments
      .filter((s: any) => s.raw_text && s.raw_text.trim().length > 0)
      .map((s: any) => {
        const localSecs = parseAudioTimestampToSeconds(s.audio_timestamp);
        const totalOffset = chunkOffsetSecs + localSecs;
        const totalMMSS = formatSecondsToMMSS(totalOffset);
        const marketTime = calculateMarketTimeFromStart(startMarketTime, totalOffset);
        return {
          audio_timestamp: totalMMSS,
          market_time: marketTime,
          raw_text: s.raw_text.trim(),
          ai_analysis: s.ai_analysis || '',
        };
      });

    return {
      segments: adjustedSegments,
      trades_mentioned: Array.isArray(parsed.trades_mentioned) ? parsed.trades_mentioned : [],
      emotional_state: parsed.emotional_state || '',
      key_observations: Array.isArray(parsed.key_observations) ? parsed.key_observations : [],
      ai_summary: parsed.ai_summary || '',
    };
  } catch (err: any) {
    console.error(`[Gemini Chunk] Erro ao transcrever chunk @ ${chunkStartMMSS}:`, err);
    const msg = err?.message || String(err);
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      throw new Error('A chave GEMINI_API_KEY no arquivo .env.local é inválida. Ela deve ser obtida no Google AI Studio (iniciando com "AIzaSy...").');
    }
    throw err;
  }
}

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
  const ffmpeg = getFFmpegBinary();
  const durationSecs = await getAudioDurationSecs(filePath);
  const CHUNK_DURATION = 600; // 10 minutos por chunk

  console.log(`[Gemini] Processando áudio (${(durationSecs / 60).toFixed(1)} min) com início do pregão em [${startMarketTime}]...`);

  // Se o áudio for menor que 12 minutos, processa diretamente
  if (durationSecs <= 720) {
    const chunkResult = await transcribeAudioChunk({
      chunkPath: filePath,
      chunkOffsetSecs: 0,
      startMarketTime,
      dayContext,
    });

    if (chunkResult.segments.length === 0) {
      return {
        transcription: 'Gravação sem narração de voz detectada (vídeo/áudio gravado em silêncio).',
        insights: JSON.stringify({
          trades: [],
          emotion: 'Neutro (Sem narração)',
          observations: ['Áudio sem narração de voz detectada.'],
          segments: [],
          aiSummary: 'Nenhuma narração em áudio foi detectada nesta gravação.',
          startMarketTime,
        }),
      };
    }

    const formattedTimeline = chunkResult.segments.map((s) => {
      const timeHeader = `⏱️ **[${s.audio_timestamp} | Pregão ${s.market_time}]**`;
      return `${timeHeader}\n${s.raw_text}`;
    }).join('\n\n');

    return {
      transcription: formattedTimeline,
      insights: JSON.stringify({
        trades: chunkResult.trades_mentioned,
        emotion: chunkResult.emotional_state,
        observations: chunkResult.key_observations,
        segments: chunkResult.segments,
        aiSummary: chunkResult.ai_summary,
        startMarketTime,
      }),
    };
  }

  // Áudio longo (> 12 min): divide em fatias de 10 minutos com loudnorm
  const uniqueFolder = `chunks_temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempDir = path.join(path.dirname(filePath), uniqueFolder);
  fs.mkdirSync(tempDir, { recursive: true });

  const totalChunks = Math.ceil(durationSecs / CHUNK_DURATION);
  const allSegments: Array<{ audio_timestamp: string; market_time: string; raw_text: string; ai_analysis?: string }> = [];
  const allTradesMentioned: any[] = [];
  const allObservations: string[] = [];
  const emotions: string[] = [];
  const summaries: string[] = [];

  try {
    for (let i = 0; i < totalChunks; i++) {
      const offsetSecs = i * CHUNK_DURATION;
      if (offsetSecs >= durationSecs) break;

      const chunkFile = path.join(tempDir, `chunk_${i}_${offsetSecs}.mp3`);

      console.log(`[Gemini] Extraindo chunk ${i + 1}/${totalChunks} (${formatSecondsToMMSS(offsetSecs)} - ${formatSecondsToMMSS(Math.min(durationSecs, offsetSecs + CHUNK_DURATION))})...`);

      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      await execFileAsync(ffmpeg, [
        '-ss', offsetSecs.toString(),
        '-t', CHUNK_DURATION.toString(),
        '-i', filePath,
        '-af', 'loudnorm',
        '-q:a', '2',
        '-y',
        chunkFile,
      ]);

      const result = await transcribeAudioChunk({
        chunkPath: chunkFile,
        chunkOffsetSecs: offsetSecs,
        startMarketTime,
        dayContext,
      });

      if (result.segments.length > 0) {
        console.log(`[Gemini] Chunk ${i + 1}/${totalChunks}: ${result.segments.length} trechos de fala detectados!`);
        allSegments.push(...result.segments);
        allTradesMentioned.push(...result.trades_mentioned);
        allObservations.push(...result.key_observations);
        if (result.emotional_state) emotions.push(result.emotional_state);
        if (result.ai_summary) summaries.push(result.ai_summary);
      } else {
        console.log(`[Gemini] Chunk ${i + 1}/${totalChunks}: Silêncio.`);
      }

      // Limpa arquivo temporário
      try { if (fs.existsSync(chunkFile)) fs.unlinkSync(chunkFile); } catch {}
    }
  } finally {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  }

  if (allSegments.length === 0) {
    return {
      transcription: 'Gravação sem narração de voz detectada (vídeo/áudio gravado em silêncio).',
      insights: JSON.stringify({
        trades: [],
        emotion: 'Neutro (Sem narração)',
        observations: ['Áudio sem narração de voz detectada.'],
        segments: [],
        aiSummary: 'Nenhuma narração em áudio foi detectada nesta gravação.',
        startMarketTime,
      }),
    };
  }

  // Ordena cronologicamente todos os segmentos
  allSegments.sort((a, b) => parseAudioTimestampToSeconds(a.audio_timestamp) - parseAudioTimestampToSeconds(b.audio_timestamp));

  const formattedTimeline = allSegments.map((s) => {
    const timeHeader = `⏱️ **[${s.audio_timestamp} | Pregão ${s.market_time}]**`;
    return `${timeHeader}\n${s.raw_text}`;
  }).join('\n\n');

  const consolidatedSummary = summaries.length > 0
    ? summaries.join(' ')
    : 'Transcrição consolidada das falas do trader ao longo do pregão.';

  return {
    transcription: formattedTimeline,
    insights: JSON.stringify({
      trades: allTradesMentioned,
      emotion: emotions[0] || 'Focado / Neutro',
      observations: Array.from(new Set(allObservations)),
      segments: allSegments,
      aiSummary: consolidatedSummary,
      startMarketTime,
    }),
  };
}

export interface ConfluenceTradeResult {
  trade_id?: string;
  trade_number: number;
  instrument?: string;
  side: string;
  open_time: string;
  close_time: string;
  duration?: string;
  entry_price?: number;
  exit_price?: number;
  points?: number;
  reais?: number;
  mep?: number;
  men?: number;
  narration_status: 'realtime' | 'delayed' | 'retrospective' | 'silent';
  narration_time_market?: string;
  audio_timestamp?: string;
  latency_minutes?: number;
  latency_description?: string;
  rationale_spoken?: string;
  management_spoken?: string;
  psychology_spoken?: string;
  did_follow_plan?: boolean;
  discipline_score?: number;
  key_takeaway?: string;
}

/**
 * Realiza confluência e auditoria profunda entre os trades do CSV (Profit Pro) e a narração em áudio
 */
export async function synthesizeAudioTradeConfluence({
  dayTrades,
  segments,
  startMarketTime = '09:00:00',
}: {
  dayTrades: any[];
  segments: Array<{ audio_timestamp: string; market_time: string; raw_text: string; ai_analysis?: string }>;
  startMarketTime?: string;
}): Promise<{
  confluenceTrades: ConfluenceTradeResult[];
  sessionSummary?: string;
}> {
  if (!dayTrades || dayTrades.length === 0 || !segments || segments.length === 0) {
    return {
      confluenceTrades: (dayTrades || []).map((t) => ({
        trade_id: t.id,
        trade_number: t.tradeNumber,
        instrument: t.instrument || 'WINFUT',
        side: t.side === 'C' ? 'COMPRA' : 'VENDA',
        open_time: t.openTime,
        close_time: t.closeTime,
        entry_price: t.entryPrice,
        exit_price: t.exitPrice,
        points: t.points,
        reais: t.reais,
        mep: t.mep,
        men: t.men,
        narration_status: 'silent',
        latency_description: 'Nenhum áudio ou narração associada a este trade.',
      })),
      sessionSummary: 'Sem dados suficientes de áudio ou trades para confluência.',
    };
  }

  const prompt = `Você é um mentor e auditor quantitativo e psicológico de Day Trade (B3 / WINFUT).
Sua missão é realizar a **CONFLUÊNCIA EXATA ENTRE OS TRADES DO CSV (PROFIT PRO) E O ÁUDIO/TRANSCRIÇÃO DE VOZ DO TRADER**.

LISTA DE TRADES EXECUTADOS NO PROFIT (CSV):
${JSON.stringify(
  dayTrades.map((t) => ({
    trade_id: t.id,
    trade_number: t.tradeNumber,
    instrument: t.instrument,
    side: t.side === 'C' ? 'COMPRA' : 'VENDA',
    open_time: t.openTime,
    close_time: t.closeTime,
    duration: t.duration,
    entry_price: t.entryPrice,
    exit_price: t.exitPrice,
    points: t.points,
    reais: t.reais,
    mep: t.mep,
    men: t.men,
  })),
  null,
  2
)}

HORÁRIO DE INÍCIO DA GRAVAÇÃO: ${startMarketTime}

SEGMENTOS DA TRANSCRIÇÃO DE VOZ:
${JSON.stringify(segments, null, 2)}

INSTRUÇÕES DE AUDITORIA E CONFLUÊNCIA:
1. Para CADA trade executado no CSV:
   - Localize nos segmentos de fala o momento exato em que o trader falou sobre essa operação.
   - Analise a TEMPORALIDADE DA FALA:
     * "realtime": Se ele narrou enquanto a operação estava aberta (entre open_time e close_time).
     * "delayed": Se ele só falou minutos depois da entrada ou após o fechamento.
     * "retrospective": Se comentou muito tempo depois (ex: revisão do dia ou fechamento).
     * "silent": Se não fez nenhuma menção a esse trade no áudio.
   - Calcule o atraso/latência em minutos (se houver).
   - Extraia o MOTIVO TÉCNICO FALADO (por que entrou: ex: DI subindo, bateu na ADR, canal de VWAP, etc.).
   - Extraia o MANEJO OPERACIONAL FALADO (alvos de 400/500 pts, parcial de 150 pts, stop movido pro 0x0, saída real).
   - Extraia o ESTADO PSICOLÓGICO / COMPORTAMENTAL (ex: frustrado por ter sido 'mão de alface' após o mercado andar a favor, ansiedade, calma).
   - Avalie se SEGUIU O PLANO (did_follow_plan: true/false) e dê uma nota de disciplina (1 a 10).
   - Resuma o diagnóstico / aprendizado principal em "key_takeaway".

Responda ESTRITAMENTE em formato JSON:
{
  "confluence_trades": [
    {
      "trade_id": "id do trade",
      "trade_number": 1,
      "instrument": "WINV26",
      "side": "VENDA",
      "open_time": "09:09:21",
      "close_time": "09:15:34",
      "entry_price": 174940,
      "exit_price": 174815,
      "points": 125,
      "reais": 50,
      "mep": 390,
      "men": -50,
      "narration_status": "delayed",
      "narration_time_market": "09:27:39",
      "audio_timestamp": "27:18",
      "latency_minutes": 18,
      "latency_description": "Narrado com 18 min de atraso (falou às 09:27 sobre o trade das 09:09)",
      "rationale_spoken": "Venda por alta do DI Futuro e WINFUT batendo na faixa de ADR",
      "management_spoken": "Alvo inicial de 500/400 pts, parcial de 150 pts, protegeu no 0x0, saída com 125 pts",
      "psychology_spoken": "Frustração intensa por sair cedo ('mão de alface') vendo o preço andar 390 pts a favor",
      "did_follow_plan": false,
      "discipline_score": 6,
      "key_takeaway": "O trader acertou o timing e a direção, mas o medo/ansiedade fez proteger cedo demais e perder o movimento principal."
    }
  ],
  "session_summary": "Resumo geral da confluência..."
}`;

  try {
    const client = getGeminiClient();
    const res = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', temperature: 0.1 },
    });

    const text = res.text || '';
    const parsed = JSON.parse(text);
    return {
      confluenceTrades: parsed.confluence_trades || [],
      sessionSummary: parsed.session_summary || '',
    };
  } catch (err) {
    console.error('[Gemini Confluence] Erro ao sintetizar confluência:', err);
    return {
      confluenceTrades: [],
      sessionSummary: '',
    };
  }
}

/**
 * Analisa visualmente um screenshot / frame real da tela do Profit Pro via Gemini 2.5 Flash Vision
 */
export async function analyzeFrameWithGeminiVision({
  imageBase64,
  tradeInfo,
  frameTime,
  focusArea = 'general',
  customQuestion,
}: {
  imageBase64: string;
  tradeInfo: {
    tradeNumber: number;
    instrument: string;
    side: string;
    entryPrice: number;
    exitPrice: number;
    points: number;
    openTime: string;
    closeTime: string;
    strategy?: string | null;
    marketRegime?: string | null;
    conviction?: number | null;
    execution?: number | null;
  };
  frameTime: {
    formattedTime: string;
    clockTime?: string;
  };
  focusArea?: 'general' | 'tape' | 'book' | 'chart' | 'zoom';
  customQuestion?: string;
}): Promise<string> {
  const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const focusAreaDescriptions: Record<string, string> = {
    general: 'VISÃO GERAL PANORÂMICA: Analise todo o layout do Profit Pro (gráfico, book de ofertas, times & trades, saldo de corretoras e fluxo).',
    tape: 'FOCO EM TAPE READING & TIMES & TRADES: Analise as ordens de agressão no fluxo, grandes lotes de institucionais e saldo dos participantes.',
    book: 'FOCO EM BOOK DE OFERTAS / SUPERDOM / VOLUME PROFILE: Analise escoras de liquidez, absorções de agressão e barreiras de preço.',
    chart: 'FOCO NO GRÁFICO & INDICADORES: Analise a formação dos candles, posição em relação à VWAP, médias móveis e níveis de suporte/resistência.',
    zoom: 'FOCO NA ÁREA AMPLIADA: Analise com máxima atenção a região em destaque que o trader ampliou na tela.',
  };

  const focusDesc = focusAreaDescriptions[focusArea] || focusAreaDescriptions.general;

  const promptText = `Você é um mentor institucional sênior e analista especialista em Day Trade de mini-índice (WINFUT / B3) e Tape Reading.
Você está visualizando o screenshot REAL da tela do Profit Pro capturado exatamente no momento deste frame de vídeo.

DADOS DA OPERAÇÃO:
- Trade #${tradeInfo.tradeNumber}: ${tradeInfo.side === 'C' ? 'COMPRA' : 'VENDA'} ${tradeInfo.instrument}
- Entrada: ${tradeInfo.entryPrice} | Saída: ${tradeInfo.exitPrice} | Resultado: ${tradeInfo.points} pts
- Horário no Pregão: ${frameTime.clockTime || tradeInfo.openTime} (Tempo do Vídeo: ${frameTime.formattedTime})
- Estratégia: ${tradeInfo.strategy || 'Não informada'} | Regime: ${tradeInfo.marketRegime || 'Normal'}
- Convicção: ${tradeInfo.conviction || 3}/5 | Execução: ${tradeInfo.execution || 3}/5
- FOCO DA ANÁLISE SOLICITADO: ${focusDesc}
${customQuestion ? `- PERGUNTA / OBSERVAÇÃO DO TRADER: "${customQuestion}"` : ''}

REGRAS OBRIGATÓRIAS DE RESPOSTA:
1. NUNCA use saudações, preâmbulos ou frases genéricas (NÃO diga "Prezado trader", "Olá", "Ao analisar o screenshot...").
2. VÁ DIRETO AO PONTO com evidências visuais no formato estruturado em tópicos abaixo:

📊 FLUXO & TAPE READING (Times & Trades / Saldo):
[Descreva quem está agredindo, volume de lotes e se há pressão compradora ou vendedora visível]

📑 BOOK & SUPERDOM (Liquidez / Absorção):
[Aponte os níveis de preço com escoras de contratos ou absorções visíveis no book/DOM]

📈 GRÁFICO & INDICADORES (Candle / VWAP / Médias):
[Descreva o padrão do candle atual, posição em relação à VWAP e médias móveis]

🎯 DIAGNÓSTICO DO MOMENTO:
[Conclusão técnica cirúrgica sobre a qualidade do trade e o contexto deste segundo específico]

3. Complete todos os tópicos até o final sem truncar a resposta.`;

  try {
    const client = getGeminiClient();
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Clean,
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    });

    return response.text?.trim() || 'Não foi possível gerar a leitura visual da imagem.';
  } catch (err) {
    console.error('[Gemini Vision] Erro na leitura visual do frame:', err);
    throw err;
  }
}

/**
 * Analisa visualmente uma sequência cronológica de múltiplos frames (Pré, Entrada, Durante, Saída e Pós)
 */
export async function analyzeMultiFrameSequenceWithGeminiVision({
  frames,
  tradeInfo,
  customQuestion,
}: {
  frames: Array<{
    label: string;
    clockTime: string;
    formattedTime: string;
    imageBase64: string;
  }>;
  tradeInfo: {
    tradeNumber: number;
    instrument: string;
    side: string;
    entryPrice: number;
    exitPrice: number;
    points: number;
    openTime: string;
    closeTime: string;
    strategy?: string | null;
    marketRegime?: string | null;
    conviction?: number | null;
    execution?: number | null;
  };
  customQuestion?: string;
}): Promise<string> {
  const promptText = `Você é um mentor institucional sênior e analista especialista em Day Trade de mini-índice (WINFUT / B3) e Tape Reading.
Você está visualizando uma SEQUÊNCIA CRONOLÓGICA DE FRAMES REAIS da tela do Profit Pro que registram a evolução completa de uma operação de Day Trade (Pré-Trade, Entrada, Durante a Operação, Momento da Saída/Stop e Pós-Trade).

DADOS GERAIS DO TRADE:
- Operação: #${tradeInfo.tradeNumber} (${tradeInfo.side === 'C' ? 'COMPRA' : 'VENDA'} ${tradeInfo.instrument})
- Nível de Entrada: ${tradeInfo.entryPrice} @ ${tradeInfo.openTime} | Saída: ${tradeInfo.exitPrice} @ ${tradeInfo.closeTime}
- Resultado Final: ${tradeInfo.points} pts
- Estratégia: ${tradeInfo.strategy || 'Não informada'} | Regime: ${tradeInfo.marketRegime || 'Normal'}
- Convicção Declarada: ${tradeInfo.conviction || 3}/5 | Execução: ${tradeInfo.execution || 3}/5
${customQuestion ? `- PERGUNTA ESPECÍFICA DO TRADER: "${customQuestion}"` : ''}

SUA MISSÃO - ANALISAR A HISTÓRIA DO TRADE FRAME A FRAME:
Analise as imagens na ordem cronológica fornecida e produza um debriefing completo e cirúrgico no seguinte formato estruturado:

1️⃣ 🎬 PRÉ-TRADE & CONTEXTO (Preparação):
[Como o mercado estava se comportando antes da entrada. Houve acumulação, rompimento ou teste de suporte/resistência?]

2️⃣ 🎯 O MOMENTO DA ENTRADA:
[Avaliação técnica da entrada. O timing foi preciso? Havia fluxo comprador/vendedor no Times & Trades confirmando a ordem?]

3️⃣ 📊 DURANTE O TRADE & MICROESTRUTURA:
[Como o preço e o book evoluíram durante a posição. Houve absorção contra o trade, renovação de lotes ou escoras?]

4️⃣ 🛑 MOMENTO DA SAÍDA / STOP:
[A saída/stop foi técnica ou emocional? O mercado bateu no alvo/stop ou o trader saiu por afobação/medo?]

5️⃣ 🔮 PÓS-TRADE & ESTUDO DE VIOLINADA:
[O que aconteceu após a saída? Foi violinada e o mercado foi para o alvo depois, ou o stop protegeu o capital?]

6️⃣ 🏆 VEREDITO & NOTA DE EXECUÇÃO:
[Diagnóstico comportamental e técnico final com 1 aprendizado inegociável para as próximas operações.]`;

  const contentParts: any[] = [{ text: promptText }];

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const base64Clean = f.imageBase64.replace(/^data:image\/\w+;base64,/, '');
    contentParts.push({
      text: `\n\n═══════════════════════════════════════\n📸 FRAME ${i + 1}/${frames.length}: [${f.label}] | Horário Pregão: ${f.clockTime} (Vídeo: ${f.formattedTime})\n═══════════════════════════════════════`,
    });
    contentParts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Clean,
      },
    });
  }

  try {
    const client = getGeminiClient();
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: contentParts,
        },
      ],
      config: {
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    });

    return response.text?.trim() || 'Não foi possível gerar a leitura da sequência de frames.';
  } catch (err) {
    console.error('[Gemini Multi-Frame] Erro ao analisar sequência:', err);
    throw err;
  }
}



