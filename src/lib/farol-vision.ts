import { getGeminiClient } from './gemini';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db';
import { tradingDays, tradeImages } from './db/schema';
import { generateId, todayISO } from './utils';
import { eq } from 'drizzle-orm';
import { exportTradingDayToMarkdown } from './markdown-sync';

export interface FarolExtractedAnalysis {
  // FAROL DO MERCADO · PROTOCOLO MACRO & GPS
  farolBias: string;
  farolKeyLevels: string;
  farolNews: string;
  farolInsights: string;

  // PROTOCOLO PRÉ-MARKET · PREPARAÇÃO & REPOUSO MATINAL
  macroCalendar: string;
  overnightNote: string;
  generalBias: 'alta' | 'baixa' | 'indefinido';
}

const FAROL_VISION_SYSTEM_PROMPT = `Você é um analista quantitativo sênior especializado em macroeconomia, microestrutura de mercado e derivativos na B3 (WINFUT / Mini-Índice).

Você está recebendo capturas de tela oficiais da plataforma 'Farol do Mercado':
1. GPS DE MERCADO: Viés WIN/WDO com % Cenário, Intensidade, Stop Sugerido, Range Provável, Síntese Operacional e Riscos do Dia.
2. BRIEFING DE MERCADO: Notícias-chave e movimentação de ADRs e commodities.
3. RADAR / DASHBOARD: Cotações das ADRs (VALE, ITUB, BBD, PBR, EWZ), Commodities (Minério, Petróleo, Ouro), Câmbio (USD/BRL, DXY) e Juros.

Extraia com 100% de factualidade os dados visíveis em JSON válido:
{
  "farolBias": "Viés WIN e WDO com percentuais (ex: 'Alta (70% Externo / 30% Interno)')",
  "farolKeyLevels": "Range Provável, Stop Sugerido e Intensidade",
  "farolNews": "Resumo em 1 parágrafo das cotações das ADRs, Commodities e Câmbio visíveis",
  "farolInsights": "Síntese Operacional e Riscos do Dia (máximo 3 frases objetivas)",
  "macroCalendar": "Liste no máximo 5 eventos econômicos com seus horários se visíveis. Se não houver calendário explícito nos prints, retorne 'Nenhum calendário econômico informado nas telas'",
  "overnightNote": "Leitura sintética em 1 frase do cenário overnight internacional",
  "generalBias": "alta" ou "baixa" ou "indefinido"
}

Regras Cruciais:
- NUNCA invente notícias ou indicadores. NUNCA repita a mesma linha ou evento em looping.
- Cada evento do calendário deve aparecer NO MÁXIMO UMA VEZ.
- Retorne EXCLUSIVAMENTE o bloco JSON válido.`;

function deduplicateText(text: string): string {
  if (!text) return '';
  const clean = text.replace(/([^\n,;]+)(?:[\n,;\s]+\1)+/gi, '$1');
  const lines = clean.split(/[\n;]+/).map(l => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const uniqueLines: string[] = [];
  for (const line of lines) {
    const normalized = line.toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueLines.push(line);
    }
  }
  return uniqueLines.slice(0, 8).join('\n');
}

function extractFieldByRegex(text: string, fieldName: string): string {
  const regex = new RegExp(`"${fieldName}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's');
  const match = text.match(regex);
  if (match && match[1]) {
    return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
  }
  const openRegex = new RegExp(`"${fieldName}"\\s*:\\s*"([^"}]*)$`, 's');
  const openMatch = text.match(openRegex);
  if (openMatch && openMatch[1]) {
    return openMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
  }
  return '';
}

function parseFarolResponse(responseText: string): Partial<FarolExtractedAnalysis> {
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, responseText];
  let rawJson = (jsonMatch[1] || responseText).trim();

  // Limpa loops de repetição de texto antes do JSON.parse
  rawJson = rawJson.replace(/("(?:macroCalendar|farolNews|farolInsights)"\s*:\s*")([^"]*?)((?:[\s\n,;-]*\b[A-Za-z0-9\-\(\)\s]{5,40}\b\s*){10,})([^"]*")/g, (m, p1, p2, p3, p4) => {
    return `${p1}${deduplicateText(p2 + p3)}${p4}`;
  });

  try {
    return JSON.parse(rawJson);
  } catch (err) {
    console.warn('[Farol Vision AI] JSON.parse estrito falhou, aplicando fallback de reparo...', err);
    try {
      let repaired = rawJson;
      if (!repaired.endsWith('}')) {
        repaired += '"}';
      }
      return JSON.parse(repaired);
    } catch {}

    return {
      farolBias: deduplicateText(extractFieldByRegex(rawJson, 'farolBias')),
      farolKeyLevels: deduplicateText(extractFieldByRegex(rawJson, 'farolKeyLevels')),
      farolNews: deduplicateText(extractFieldByRegex(rawJson, 'farolNews')),
      farolInsights: deduplicateText(extractFieldByRegex(rawJson, 'farolInsights')),
      macroCalendar: deduplicateText(extractFieldByRegex(rawJson, 'macroCalendar')),
      overnightNote: deduplicateText(extractFieldByRegex(rawJson, 'overnightNote')),
      generalBias: (extractFieldByRegex(rawJson, 'generalBias') as any) || undefined,
    };
  }
}

/**
 * Coleta as imagens mais recentes do Farol do Mercado agrupadas por tipo (GPS, Briefing, Radar)
 */
export function getFarolImagePathsForDate(dateStr: string): string[] {
  const allFiles: { name: string; fullPath: string; mtime: number }[] = [];

  const checkDir = (dirPath: string, filterFn: (name: string) => boolean) => {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath).filter(filterFn);
      for (const f of files) {
        const full = path.join(dirPath, f);
        try {
          const stat = fs.statSync(full);
          allFiles.push({ name: f, fullPath: full, mtime: stat.mtimeMs });
        } catch {}
      }
    }
  };

  // 1. Pasta padrão data/images/[date]/farol/
  checkDir(path.join(process.cwd(), 'data', 'images', dateStr, 'farol'), f => /\.(png|jpg|jpeg|webp)$/i.test(f));

  // 2. Pasta geral data/images/[date]/
  checkDir(path.join(process.cwd(), 'data', 'images', dateStr), f => /\.(png|jpg|jpeg|webp)$/i.test(f) && /farol|gps|briefing|radar/i.test(f));

  // 3. Pasta 04-DIARIO-TRADE/[YYYY-MM]/prints/
  const yearMonth = dateStr.slice(0, 7);
  checkDir(path.join('d:', 'estudos', '04-DIARIO-TRADE', yearMonth, 'prints'), f => f.startsWith(dateStr) && /\.(png|jpg|jpeg|webp)$/i.test(f));

  // Deduplica por categorias: GPS, Briefing, Radar (mantém apenas o mais recente de cada categoria)
  const categories = ['gps', 'briefing', 'radar'];
  const selectedPaths: string[] = [];

  for (const cat of categories) {
    const matches = allFiles.filter(f => f.name.toLowerCase().includes(cat)).sort((a, b) => b.mtime - a.mtime);
    if (matches.length > 0) {
      selectedPaths.push(matches[0].fullPath);
    }
  }

  // Se não encontrou por categoria, seleciona os até 3 arquivos mais recentes
  if (selectedPaths.length === 0 && allFiles.length > 0) {
    const sorted = allFiles.sort((a, b) => b.mtime - a.mtime);
    for (const item of sorted.slice(0, 3)) {
      selectedPaths.push(item.fullPath);
    }
  }

  return selectedPaths;
}

/**
 * Analisa os screenshots do Farol do Mercado com Gemini Vision e extrai dados
 * tanto para o PROTOCOLO PRÉ-MARKET quanto para o FAROL DO MERCADO · MACRO & GPS.
 */
export async function analyzeFarolScreenshotsVision(dateStr: string = todayISO()): Promise<FarolExtractedAnalysis> {
  const imagePaths = getFarolImagePathsForDate(dateStr);

  if (imagePaths.length === 0) {
    throw new Error(`Nenhum screenshot do Farol do Mercado encontrado para a data ${dateStr}. Capture via Playwright ou envie prints.`);
  }

  console.log(`[Farol Vision AI] Analisando ${imagePaths.length} imagens únicas para ${dateStr}:`, imagePaths.map(p => path.basename(p)));

  // Monta as partes de imagem para a API Gemini (apenas as 3 imagens distintas selecionadas)
  const imageParts: any[] = [];

  for (const imgPath of imagePaths) {
    try {
      const buffer = fs.readFileSync(imgPath);
      const ext = path.extname(imgPath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

      imageParts.push({
        inlineData: {
          data: buffer.toString('base64'),
          mimeType,
        },
      });
    } catch (err) {
      console.warn(`[Farol Vision AI] Erro ao ler imagem ${imgPath}:`, err);
    }
  }

  if (imageParts.length === 0) {
    throw new Error('Falha ao processar arquivos de imagem.');
  }

  // Chama a API Gemini 2.5 Flash com Structured Outputs (JSON Schema estrito)
  const modelName = 'gemini-2.5-flash';
  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model: modelName,
    contents: [
      {
        role: 'user',
        parts: [
          { text: FAROL_VISION_SYSTEM_PROMPT },
          { text: `Data da sessão: ${dateStr}. Extraia os dados das telas anexadas de forma concisa, sem repetições e 100% factual.` },
          ...imageParts,
        ],
      },
    ],
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          farolBias: { type: 'string', description: 'Viés WIN e WDO do GPS' },
          farolKeyLevels: { type: 'string', description: 'Range e Stop' },
          farolNews: { type: 'string', description: 'Resumo das cotações das ADRs e Commodities' },
          farolInsights: { type: 'string', description: 'Síntese Operacional e Riscos' },
          macroCalendar: { type: 'string', description: 'Eventos econômicos com horários explícitos sem repetições' },
          overnightNote: { type: 'string', description: 'Cenário overnight internacional' },
          generalBias: { type: 'string', enum: ['alta', 'baixa', 'indefinido'] },
        },
        required: ['farolBias', 'farolKeyLevels', 'farolNews', 'farolInsights', 'macroCalendar', 'overnightNote', 'generalBias'],
      },
    },
  });

  const responseText = response.text?.trim() || '';
  console.log(`[Farol Vision AI] Resposta do modelo ${modelName} recebida (${responseText.length} chars).`);

  // Extrai e limpa o JSON com tolerância a falhas
  const extracted = parseFarolResponse(responseText);

  // Normaliza o viés geral
  let generalBias: 'alta' | 'baixa' | 'indefinido' = 'indefinido';
  const biasStr = (extracted.generalBias || extracted.farolBias || '').toLowerCase();
  if (biasStr.includes('alta') || biasStr.includes('comprador')) generalBias = 'alta';
  else if (biasStr.includes('baixa') || biasStr.includes('vendedor')) generalBias = 'baixa';

  const cleanedCalendar = deduplicateText(extracted.macroCalendar || '');

  const finalResult: FarolExtractedAnalysis = {
    farolBias: deduplicateText(extracted.farolBias || 'Neutro / Indefinido'),
    farolKeyLevels: deduplicateText(extracted.farolKeyLevels || 'Níveis não identificados'),
    farolNews: deduplicateText(extracted.farolNews || 'Sem notícias extraídas'),
    farolInsights: deduplicateText(extracted.farolInsights || 'Síntese não identificada'),
    macroCalendar: cleanedCalendar || 'Nenhum calendário econômico informado nas telas',
    overnightNote: deduplicateText(extracted.overnightNote || 'Mercados internacionais estáveis'),
    generalBias,
  };

  // Atualiza no Banco de Dados SQLite
  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  if (!day) {
    const newDayId = generateId();
    await db.insert(tradingDays).values({
      id: newDayId,
      date: dateStr,
      farolBias: finalResult.farolBias,
      farolKeyLevels: finalResult.farolKeyLevels,
      farolNews: finalResult.farolNews,
      farolInsights: finalResult.farolInsights,
      macroCalendar: finalResult.macroCalendar,
      overnightNote: finalResult.overnightNote,
      generalBias: finalResult.generalBias,
      preMarketDone: true,
      updatedAt: new Date().toISOString(),
    });
  } else {
    await db.update(tradingDays).set({
      farolBias: finalResult.farolBias,
      farolKeyLevels: finalResult.farolKeyLevels,
      farolNews: finalResult.farolNews,
      farolInsights: finalResult.farolInsights,
      macroCalendar: finalResult.macroCalendar,
      overnightNote: finalResult.overnightNote,
      generalBias: finalResult.generalBias,
      preMarketDone: true,
      updatedAt: new Date().toISOString(),
    }).where(eq(tradingDays.id, day.id));
  }

  // Exporta e sincroniza com o Markdown oficial em 04-DIARIO-TRADE
  try {
    await exportTradingDayToMarkdown(dateStr);
    await generateFarolSnapshotMarkdown(dateStr, finalResult);
  } catch (syncErr) {
    console.warn('[Farol Vision AI] Aviso na exportação Markdown:', syncErr);
  }

  return finalResult;
}

/**
 * Gera ou atualiza o arquivo YYYY-MM-DD_FAROL_MERCADO_SNAPSHOT.md
 */
export async function generateFarolSnapshotMarkdown(dateStr: string, data: FarolExtractedAnalysis) {
  const yearMonth = dateStr.slice(0, 7);
  const targetDir = path.join('d:', 'estudos', '04-DIARIO-TRADE', yearMonth);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filePath = path.join(targetDir, `${dateStr}_FAROL_MERCADO_SNAPSHOT.md`);

  const md = `# Snapshot Farol do Mercado & Radar Pré-Market — ${dateStr}

**Data de Coleta / Análise:** ${dateStr} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} BRT (Extração Automática Gemini Vision)  
**Status:** Pré-Abertura & Confluência Macro  
**Fonte:** Screenshots Oficiais \`faroldomercado.com\`  

---

## 🧭 1. GPS de Mercado (Oficial Farol)

| Parâmetro | Diagnóstico Extraído pela IA |
| :--- | :--- |
| **Viés do Farol** | **${data.farolBias}** |
| **Range Provável & Stop** | **${data.farolKeyLevels}** |
| **Viés Direcional Geral** | **${data.generalBias.toUpperCase()}** |

### 📌 Síntese Operacional & Insights
${data.farolInsights}

---

## 📊 2. Radar Macro, Commodities & ADRs

${data.farolNews}

---

## 📅 3. Calendário Econômico & Drivers do Dia

${data.macroCalendar}

---

## 🌐 4. Cenário Overnight (Ásia, Europa & Futuros US)

${data.overnightNote}

---
*Snapshot sincronizado e integrado no TradeLog SQLite & Gemini Multimodal em ${dateStr}.*
`;

  fs.writeFileSync(filePath, md, 'utf-8');
  console.log(`[Farol Vision AI] Snapshot Markdown gravado em: ${filePath}`);
}
