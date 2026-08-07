import { GoogleGenAI } from '@google/genai';

const API_KEY = process.env.GEMINI_API_KEY!;
const ai = new GoogleGenAI({ apiKey: API_KEY });

export interface AiCoachReportData {
  disciplineScore: number;
  fomoAlert: boolean;
  revengeTrading: boolean;
  planCompliance: number;
  keyStrengths: string[];
  areasToImprove: string[];
  coachFeedback: string;
}

const COACH_PROMPT = `Você é um gestor de risco de mesa proprietária e Coach de Trading especializado em mini-índice futuro (WINFUT) no Brasil.

Analise os dados desta sessão de trading (operações, estado mental, notas de pré-market e narração de voz) e forneça um diagnóstico brutalmente honesto sobre a disciplina e execução do trader.

Responda EXATAMENTE neste formato JSON (sem markdown, sem code blocks):
{
  "disciplineScore": 85,
  "fomoAlert": false,
  "revengeTrading": false,
  "planCompliance": 90,
  "keyStrengths": [
    "Boa paciência aguardando o teste da VWAP",
    "Gerenciamento de stop dentro do limite"
  ],
  "areasToImprove": [
    "Evitar boletar nos primeiros 5 minutos de abertura",
    "Melhorar o horário de saída parcial"
  ],
  "coachFeedback": "Excelente disciplina na segunda operação. Mantenha o foco em não antecipar o sinal."
}`;

export async function generateAiCoachReport(data: {
  date: string;
  trades: Array<{
    tradeNumber: number;
    side: string;
    points: number | null;
    reais: number | null;
    openTime: string;
    mep: number | null;
    men: number | null;
    conviction?: number | null;
    execution?: number | null;
  }>;
  preMarketNote?: string | null;
  retrospective?: string | null;
  honestPhrase?: string | null;
  transcriptions?: string[];
}): Promise<AiCoachReportData> {
  if (data.trades.length === 0 && !data.transcriptions?.length) {
    return {
      disciplineScore: 100,
      fomoAlert: false,
      revengeTrading: false,
      planCompliance: 100,
      keyStrengths: ['Dia sem operações. Disciplina mantida.'],
      areasToImprove: [],
      coachFeedback: 'Sem operações registradas para este dia.',
    };
  }

  const promptInput = `
Data: ${data.date}
Trades do Dia (${data.trades.length}):
${JSON.stringify(data.trades, null, 2)}

Pré-Market: ${data.preMarketNote || 'N/A'}
Retrospectiva: ${data.retrospective || 'N/A'}
Frase Honesta: ${data.honestPhrase || 'N/A'}

Transcrições de Voz da Sessão:
${data.transcriptions?.join('\n---\n') || 'Nenhuma narração gravada.'}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: COACH_PROMPT },
            { text: promptInput },
          ],
        },
      ],
      config: { temperature: 0.2 },
    });

    const text = response.text ?? '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      disciplineScore: parsed.disciplineScore || 80,
      fomoAlert: Boolean(parsed.fomoAlert),
      revengeTrading: Boolean(parsed.revengeTrading),
      planCompliance: parsed.planCompliance || 85,
      keyStrengths: parsed.keyStrengths || [],
      areasToImprove: parsed.areasToImprove || [],
      coachFeedback: parsed.coachFeedback || 'Análise concluída.',
    };
  } catch (err) {
    console.error('Erro ao gerar AI Coach Report:', err);
    return {
      disciplineScore: 75,
      fomoAlert: false,
      revengeTrading: false,
      planCompliance: 80,
      keyStrengths: ['Operações registradas com sucesso.'],
      areasToImprove: ['Manter constância no diário.'],
      coachFeedback: 'Sessão concluída com dados operacionais armazenados.',
    };
  }
}
