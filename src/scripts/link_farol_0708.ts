import { db } from '../lib/db';
import { tradingDays, keyLevels } from '../lib/db/schema';
import { generateId } from '../lib/utils';
import { eq } from 'drizzle-orm';
import { exportTradingDayToMarkdown } from '../lib/markdown-sync';

async function main() {
  const dateStr = '2026-08-07';

  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  const farolData = {
    generalBias: 'alta',
    farolBias: 'ALTA MODERADA — Sentimento RISK ON. ADRs no pré-market em recuperação forte (+3.12% dia). Vale +0.95%, Petrobras +1.35%, Itaú +0.49%. Futuros S&P500 +0.21%, Nasdaq +0.52%. Viés comprador para abertura do mini-índice, condicionado ao Payroll US às 09:30.',

    farolKeyLevels: [
      '175.600 — GAMMA FLIP (Suporte crítico divisor de águas — perdendo acelera fluxo vendedor institucional)',
      '176.125 — PIVOT DE ALTA (Sustentação acima confirma repique comprador matinal)',
      '177.800 — CALL WALL (Alvo da movimentação institucional / resistência forte)',
      'Stop Sugerido: 100 pontos',
      'Range Provável: ~2.550 pontos',
      'Peso do Cenário: Externo 55% | Interno 45%',
      'Pressão de Mercado: BAIXA',
      'Intensidade Esperada: ~0.8%',
    ].join('\n'),

    farolNews: [
      '▸ 09:30 BRT — PAYROLL US (Relatório de Emprego EUA) — ALTO IMPACTO — Volatilidade extrema esperada na abertura',
      '▸ VIX: 15.22 (+0.33%) — Região neutra, ambiente RISK ON',
      '▸ Ouro: $4.378 (+1.95%) — Disparando, demanda por proteção',
      '▸ Petróleo Brent: $81.81 (-0.82%) — Pressionado',
      '▸ Minério de Ferro: $716.50 (+0.35%) — Leve alta',
      '▸ DXY: 99.90 (-0.03%) — Estável, dólar sem pressão',
      '▸ Treasuries 10Y: 4.66% (-0.30%) — Juros longos em queda',
      '▸ Bitcoin Fut: 65.205 (+0.91%) — Alta moderada',
      '▸ EWZ (ETF Brasil): 35.91 (+0.28%) — Leve alta',
    ].join('\n'),

    farolInsights: [
      '★ SÍNTESE OPERACIONAL DO FAROL:',
      'O mercado fechou o pregão anterior (06/08) em tom pessimista (-1.23% IBOV), mas com forte sinalização de recuperação no after-market internacional. O foco absoluto da sessão de hoje está no Payroll US às 09:30.',
      '',
      '★ ADRs BRASILEIRAS (PRÉ-MARKET 07/08):',
      '• PBR (Petrobras): +1.35% — Forte recuperação',
      '• VALE: +0.95% — Alta com minério em leve alta',
      '• ITUB (Itaú): +0.49% — Positivo',
      '• BBD (Bradesco): 0.00% — Neutro',
      '• Saldo ADRs Dia: +3.12% (Alta moderada)',
      '• Saldo ADRs Pós (06/08): +3.02% (Recuperação)',
      '',
      '★ MERCADO GLOBAL (FUTUROS):',
      '• S&P 500: 7.751,25 (+0.21%)',
      '• Nasdaq 100: 29.640,25 (+0.52%)',
      '• Dow Jones: 54.060 (+0.09%)',
      '• DAX Alemanha: +0.76%',
      '• Nikkei 225: +0.48%',
      '',
      '★ RISCOS DO DIA:',
      '• Volatilidade extrema às 09:30 (Payroll)',
      '• Rompimento do Gamma Flip em 175.600 acelera vendas',
      '• Ouro disparando pode sinalizar aversão a risco latente',
    ].join('\n'),

    overnightNote: [
      'EUA futuros em alta consistente: S&P +0.21%, Nasdaq +0.52%, Dow +0.09%.',
      'Europa forte: DAX +0.76%, FTSE100 +0.70%, EURO_STOXX +0.54%.',
      'Ásia positiva: Nikkei +0.48%, China A50 +0.75%, Hang Seng +0.68%.',
      'ADRs brasileiras no after-market (06/08) recuperando +3.02%.',
      'Ouro rompendo máximas históricas: $4.378 (+1.95%).',
      'VIX controlado em 15.22 — ambiente RISK ON.',
    ].join('\n'),

    macroCalendar: [
      '09:30 — Payroll US (Relatório de Emprego EUA) [ALTO IMPACTO]',
      'VIX: 15.22 (+0.33%) — Região de valor neutra — RISK ON',
      'Treasuries: 2Y 4.24% | 5Y 4.38% | 10Y 4.66% | 30Y 5.21%',
      'Câmbio: USD/BRL 5.10 (+0.02%) | DXY 99.90 (-0.03%)',
    ].join('\n'),

    preMarketDone: false,
    updatedAt: new Date().toISOString(),
  };

  if (!day) {
    const newDayId = generateId();
    await db.insert(tradingDays).values({
      id: newDayId,
      date: dateStr,
      ...farolData,
    });
    day = await db.query.tradingDays.findFirst({
      where: eq(tradingDays.date, dateStr),
    });
    console.log('Novo dia criado:', dateStr, newDayId);
  } else {
    await db.update(tradingDays)
      .set(farolData)
      .where(eq(tradingDays.id, day.id));
    console.log('Dia atualizado com dados detalhados do Farol:', dateStr);
  }

  if (day) {
    await db.delete(keyLevels).where(eq(keyLevels.tradingDayId, day.id));
    await db.insert(keyLevels).values([
      { id: generateId(), tradingDayId: day.id, name: 'Gamma Flip (Suporte Crítico)', price: 175600 },
      { id: generateId(), tradingDayId: day.id, name: 'Pivot de Alta (Confirmação)', price: 176125 },
      { id: generateId(), tradingDayId: day.id, name: 'Call Wall (Alvo Institucional)', price: 177800 },
    ]);

    await exportTradingDayToMarkdown(dateStr);
    console.log('Markdown sincronizado para 04-DIARIO-TRADE');
  }
}

main().catch(console.error);
