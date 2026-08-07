import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';
import { z } from 'zod';
import { parseBRNumber, parseDateBR } from './utils';

// ─── Schema de validação do trade do Profit Pro ──────────────
const ProfitTradeRowSchema = z.object({
  instrument: z.string(),
  openTime: z.string(),
  closeTime: z.string(),
  duration: z.string(),
  buyQty: z.number(),
  sellQty: z.number(),
  side: z.string(),
  buyPrice: z.number(),
  sellPrice: z.number(),
  marketPrice: z.number(),
  mep: z.number(),
  men: z.number(),
  isAverage: z.boolean(),
  grossResult: z.number(),
  grossResultPct: z.number(),
  operationResult: z.number(),
  operationResultPct: z.number(),
  drawdown: z.number(),
  tet: z.string(),
  total: z.number(),
});

export type ProfitTradeRow = z.infer<typeof ProfitTradeRowSchema>;

export interface ParsedCSVResult {
  account: string;
  holder: string;
  date: string; // ISO format "2026-08-06"
  trades: ProfitTradeRow[];
}

/**
 * Parseia o CSV de relatório de operações exportado do Profit Pro (Nelogica)
 * 
 * Formato do CSV:
 * - Encoding: Latin-1 (ISO-8859-1)
 * - Separador: ponto-e-vírgula (;)
 * - Números: formato brasileiro (1.000,00)
 * - 3 linhas de metadados antes do header
 */
export function parseProfitProCSV(buffer: Buffer): ParsedCSVResult {
  // 1. Decodificar Latin-1 para UTF-8
  const content = iconv.decode(buffer, 'latin1');
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');

  // 2. Extrair metadados (primeiras 3 linhas)
  let account = '';
  let holder = '';
  let dateStr = '';

  for (const line of lines.slice(0, 5)) {
    if (line.startsWith('Conta:')) account = line.replace('Conta:', '').trim();
    if (line.startsWith('Titular:')) holder = line.replace('Titular:', '').trim();
    if (line.startsWith('Data:')) dateStr = line.replace('Data:', '').trim();
  }

  // 3. Encontrar o header da tabela
  const headerIndex = lines.findIndex(line =>
    line.includes('Ativo') && line.includes('Abertura') && line.includes('Fechamento')
  );

  if (headerIndex === -1) {
    throw new Error('Header da tabela não encontrado no CSV do Profit Pro');
  }

  const csvBody = lines.slice(headerIndex).join('\n');

  // 4. Parsear CSV com separador ;
  const records = parse(csvBody, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  // 5. Mapear para o schema
  const trades: ProfitTradeRow[] = records
    .filter(r => r['Ativo'] && r['Ativo'].trim() !== '')
    .map(r => {
      const obj: ProfitTradeRow = {
        instrument: r['Ativo']?.trim() || '',
        openTime: r['Abertura']?.trim() || '',
        closeTime: r['Fechamento']?.trim() || '',
        duration: r['Tempo Operação'] || r['Tempo Opera\u00e7\u00e3o'] || r['Tempo Operacao'] || '',
        buyQty: parseBRNumber(r['Qtd Compra'] || '0'),
        sellQty: parseBRNumber(r['Qtd Venda'] || '0'),
        side: r['Lado']?.trim() || '',
        buyPrice: parseBRNumber(r['Preço Compra'] || r['Pre\u00e7o Compra'] || r['Preco Compra'] || '0'),
        sellPrice: parseBRNumber(r['Preço Venda'] || r['Pre\u00e7o Venda'] || r['Preco Venda'] || '0'),
        marketPrice: parseBRNumber(r['Preço de Mercado'] || r['Pre\u00e7o de Mercado'] || r['Preco de Mercado'] || '0'),
        mep: parseBRNumber(r['MEP'] || '0'),
        men: parseBRNumber(r['MEN'] || '0'),
        isAverage: (r['Médio'] || r['M\u00e9dio'] || r['Medio'] || '').trim().toLowerCase() === 'sim',
        grossResult: parseBRNumber(r['Res. Intervalo Bruto'] || '0'),
        grossResultPct: parseBRNumber(r['Res. Intervalo (%)'] || '0'),
        operationResult: parseBRNumber(r['Res. Operação'] || r['Res. Opera\u00e7\u00e3o'] || r['Res. Operacao'] || '0'),
        operationResultPct: parseBRNumber(r['Res. Operação (%)'] || r['Res. Opera\u00e7\u00e3o (%)'] || r['Res. Operacao (%)'] || '0'),
        drawdown: parseBRNumber(r['Drawdown'] || '0'),
        tet: r['TET']?.trim() || '',
        total: parseBRNumber(r['Total'] || '0'),
      };

      return ProfitTradeRowSchema.parse(obj);
    });

  return {
    account,
    holder,
    date: parseDateBR(dateStr),
    trades,
  };
}

// ─── Parser de Candles (1min/5min) ───────────────────────────

const CandleRowSchema = z.object({
  instrument: z.string(),
  dateTime: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  quantity: z.number(),
});

export type CandleRow = z.infer<typeof CandleRowSchema>;

/**
 * Parseia CSV de candles (1min ou 5min) exportado do Profit Pro
 */
export function parseCandleCSV(buffer: Buffer, timeframe: '1min' | '5min'): CandleRow[] {
  const content = iconv.decode(buffer, 'latin1');

  const records = parse(content, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  return records
    .filter(r => r['Ativo'] && r['Ativo'].trim() !== '')
    .map(r => {
      const dateStr = r['Data']?.trim() || '';
      const timeStr = r['Hora']?.trim() || '';
      const isoDate = parseDateBR(dateStr);

      return CandleRowSchema.parse({
        instrument: r['Ativo']?.trim() || '',
        dateTime: `${isoDate}T${timeStr}`,
        open: parseBRNumber(r['Abertura'] || '0'),
        high: parseBRNumber(r['Máximo'] || r['M\u00e1ximo'] || r['Maximo'] || '0'),
        low: parseBRNumber(r['Mínimo'] || r['M\u00ednimo'] || r['Minimo'] || '0'),
        close: parseBRNumber(r['Fechamento'] || '0'),
        volume: parseBRNumber(r['Volume'] || '0'),
        quantity: parseBRNumber(r['Quantidade'] || '0'),
      });
    });
}
