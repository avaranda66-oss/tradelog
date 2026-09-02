import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../lib/db';
import { audioRecords, trades, tradingDays } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

function getApiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/GEMINI_API_KEY=(.+)/);
      if (match && match[1]) return match[1].trim();
    }
  } catch {}
  return '';
}

const ai = new GoogleGenAI({ apiKey: getApiKey() });

async function testConfluence() {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, '2026-08-25'),
  });

  const dayTrades = await db.query.trades.findMany({
    where: eq(trades.tradingDayId, day!.id),
  });

  const audio = await db.query.audioRecords.findFirst({
    where: eq(audioRecords.tradingDayId, day!.id),
  });

  const insights = JSON.parse(audio?.insights || '{}');
  const segments = insights.segments || [];

  console.log(`Cruzando ${dayTrades.length} trades do CSV com ${segments.length} segmentos de fala...`);

  const prompt = `Você é um mentor e auditor quantitativo e psicológico de Day Trade (B3 / WINFUT).
Sua missão é realizar a **CONFLUÊNCIA EXATA ENTRE OS TRADES DO CSV (PROFIT PRO) E O ÁUDIO/TRANSCRIÇÃO DE VOZ DO TRADER**.

LISTA DE TRADES EXECUTADOS NO PROFIT (CSV):
${JSON.stringify(dayTrades.map(t => ({
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
})), null, 2)}

HORÁRIO DE INÍCIO DA GRAVAÇÃO: ${insights.startMarketTime || '09:00:21'}

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

2. Identifique também se o trader mencionou alguma operação hipotética, cancelada ou comentou sobre cenários gerais.

Responda ESTRITAMENTE em formato JSON:
{
  "confluence_trades": [
    {
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

  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json', temperature: 0.1 },
  });

  console.log('Resultado da confluência Gemini:');
  console.log(res.text);
}

testConfluence().catch(console.error);
