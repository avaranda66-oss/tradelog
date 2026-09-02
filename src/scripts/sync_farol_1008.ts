import { db } from '../lib/db';
import { tradingDays, keyLevels } from '../lib/db/schema';
import { generateId } from '../lib/utils';
import { eq } from 'drizzle-orm';
import { exportTradingDayToMarkdown } from '../lib/markdown-sync';

async function main() {
  const dateStr = '2026-08-10';

  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  const farolData = {
    generalBias: 'alta',
    farolBias: 'LONG // ALTA — Gap de alta matinal buscando VWAP D-1 em 174.175. ADRs com apetite de risco +3.84%, Petróleo Brent +1.47%. Suporte de Risco GEX em 172.270.',

    farolKeyLevels: [
      '177.660 — CALL WALL GEX (Teto Estrutural Absoluto)',
      '175.505 — R3 GEX (Short Gamma / Aceleração Compradora)',
      '174.425 — R2 GEX (Resistência GEX Superior)',
      '174.175 — VWAP MATINAL D-1 (Alvo Farol / Gap)',
      '173.350 — ZERO GAMMA / PIVOT (Divisor Long/Short Gamma)',
      '172.270 — S1 GEX / RISCO FAROL (Confluência Perfeita S1 GEX vs Suporte 172.275)',
      '171.195 — S2 GEX (Suporte Gamma Intermediário)',
      '167.960 — PUT WALL GEX (Piso Estrutural +700M OI)',
      'Stop Sugerido: 100 pontos',
      'Range Provável: ~2.750 pontos',
      'Peso do Cenário: Externo 55% | Interno 45%',
      'Pressão de Mercado: BAIXA',
      'Intensidade Esperada: ~1.7%',
    ].join('\n'),

    farolNews: [
      '▸ 08:25 BRT — BCB Boletim Focus Market Readout',
      '▸ 11:00 BRT — US CB Employment Trends Index (Jul)',
      '▸ VIX: 15.45 (+3.62%) — Região de volatilidade moderada',
      '▸ Petróleo Brent: $84.78 (+1.47%) 🟢 | WTI: $79.44 (+1.61%) 🟢',
      '▸ Minério de Ferro: $95.00 (+0.32%) em Singapura',
      '▸ DXY: 99.72 (+0.18%) — Dólar forte globalmente',
      '▸ Treasuries 10Y: 4.67% (+0.37%)',
      '▸ ADRs BR Pré-Market: PBR +1.17%, BSBR +1.20%, BBD +0.84%, VALE +0.10%, ITUB -0.18%',
      '▸ EWZ (ETF Brasil): 35.456 (+0.36%)',
    ].join('\n'),

    farolInsights: [
      '★ SÍNTESE OPERACIONAL DO FAROL:',
      'O WIN deve abrir com gap de alta buscando a região da VWAP anterior em 174.175. O WDO deve testar resistências próximas aos 5.130 acompanhando a força do DXY.',
      '',
      '★ CONFLUÊNCIA CRÍTICA GEX x FAROL:',
      '• Suporte S1 GEX em 172.270 coincide exatamente com a Região de Risco do Farol em 172.275.',
      '• Zero Gamma em 173.350 atua como divisor de águas entre Long Gamma e Short Gamma.',
      '• Perdendo 172.270 invalida a tese de recuperação e acelera vendas até 171.195.',
      '',
      '★ MERCADO GLOBAL (FUTUROS):',
      '• S&P 500: 7.786,75 (+0.09%)',
      '• Nasdaq 100: 29.909,25 (+0.25%)',
      '• Dow Jones: 54.088 (-0.12%)',
      '• Nikkei 225: 67.097,50 (+1.21%) 🚀',
    ].join('\n'),

    overnightNote: [
      'Futuros EUA positivos (S&P +0.09%, Nasdaq +0.25%). Nikkei225 +1.21%.',
      'Petróleo em forte alta (Brent +1.47% $84.78, WTI +1.61% $79.44).',
      'ADRs brasileiras com apetite de risco positivo (+3.84% no saldo geral do pré-market).',
      'EWZ +0.36%. VIX controlado em 15.45.',
    ].join('\n'),

    macroCalendar: [
      '08:25 BRT — BCB Boletim Focus Market Readout',
      '10:00 BRT — Leilão Títulos França (BTF)',
      '11:00 BRT — US CB Employment Trends Index',
      '12:30 BRT — Leilão Bill 3M/6M US',
      'VIX: 15.45 (+3.62%) | DXY: 99.72 (+0.18%)',
    ].join('\n'),

    preMarketDone: true,
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
    console.log('[SQLite TradeLog] Novo dia criado para 10/08/2026:', newDayId);
  } else {
    await db.update(tradingDays)
      .set(farolData)
      .where(eq(tradingDays.id, day.id));
    console.log('[SQLite TradeLog] Dia 10/08/2026 atualizado com dados do Farol/GEX.');
  }

  if (day) {
    await db.delete(keyLevels).where(eq(keyLevels.tradingDayId, day.id));
    await db.insert(keyLevels).values([
      { id: generateId(), tradingDayId: day.id, name: 'CALL WALL GEX (TETO ESTRUTURAL)', price: 177660 },
      { id: generateId(), tradingDayId: day.id, name: 'R3 GEX (SHORT GAMMA)', price: 175505 },
      { id: generateId(), tradingDayId: day.id, name: 'R2 GEX (RESISTÊNCIA GEX)', price: 174425 },
      { id: generateId(), tradingDayId: day.id, name: 'VWAP MATINAL D-1 (ALVO FAROL)', price: 174175 },
      { id: generateId(), tradingDayId: day.id, name: 'ZERO GAMMA / PIVOT GEX', price: 173350 },
      { id: generateId(), tradingDayId: day.id, name: 'S1 GEX / RISCO FAROL (CONFLUÊNCIA)', price: 172270 },
      { id: generateId(), tradingDayId: day.id, name: 'S2 GEX (SUPORTE GAMMA)', price: 171195 },
      { id: generateId(), tradingDayId: day.id, name: 'PUT WALL GEX (FLOOR ESTRUTURAL)', price: 167960 },
    ]);

    await exportTradingDayToMarkdown(dateStr);
    console.log('[MarkdownSync] Exportado diário com sucesso em 04-DIARIO-TRADE!');
  }
}

main().catch(console.error);
