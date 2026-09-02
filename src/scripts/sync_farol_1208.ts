import { db } from '../lib/db';
import { tradingDays, keyLevels } from '../lib/db/schema';
import { generateId } from '../lib/utils';
import { eq } from 'drizzle-orm';
import { exportTradingDayToMarkdown } from '../lib/markdown-sync';

async function main() {
  const dateStr = '2026-08-12';

  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  const farolData = {
    generalBias: 'alta',
    farolBias: 'LONG // ALTA MODERADA — ⚠️ DIA DE VENCIMENTO DO CONTRATO WINFUT. Correção da queda anterior e alinhamento com melhora externa no pré-NYSE (Nasdaq +1.02%). Sustentação acima do Call Wall GEX (171.695) é chave.',

    farolKeyLevels: [
      '171.695 — Call Wall GEX (Suporte / Compressão Imediata em BOVA R$ 165 - 1.64M OI)',
      '170.595 — Zero Gamma GEX (Flip Point / Divisor de Regime de Mercado)',
      '169.500 — Put Wall GEX (Pico Short / Aceleração Vendedora em BOVA R$ 163)',
      '172.795 — Resistência R1 GEX',
      '173.890 — Resistência R2 GEX',
      '174.990 — Resistência R3 GEX',
      'Stop Sugerido: 100 pontos',
      'Range Provável: ~2.750 pontos',
      'Peso do Cenário: Externo 65% | Interno 35%',
      'Pressão de Mercado: BAIXA',
      'Intensidade Esperada: ~0.8%',
    ].join('\n'),

    farolNews: [
      '▸ 08:00 BRT — DE IPC Inflação Alemanha (Real: 0.8% - dentro do esperado)',
      '▸ 10:30 BRT — US Abertura NYSE / Mercado Americano',
      '▸ ⚠️ OBSERVAÇÃO CRÍTICA: HOJE É DIA DE VENCIMENTO DO CONTRATO DE MINI-ÍNDICE (WINFUT)!',
      '▸ VIX: 15.00 (-1.83%) — Volatilidade Moderada / Risk-On',
      '▸ Petróleo Brent: $88.45 (-0.52%) 🔴 | WTI: $82.88 (-0.38%) 🔴',
      '▸ Minério de Ferro: $95.60 (+0.16%) em Singapura | $709.00 (+0.35%) em Dalian 🟢',
      '▸ DXY: 99.65 (-0.18%) 🔴 | USD/BRL: 5.17 (+0.04%)',
      '▸ Treasuries 10Y: 4.66% (-0.72%)',
      '▸ ADRs BR: VALE +1.11% 🟢, BBD +0.15% 🟢, ITUB -0.53% 🔴, PBR -1.07% 🔴',
    ].join('\n'),

    farolInsights: [
      '★ SÍNTESE OPERACIONAL DO FAROL:',
      'O mercado brasileiro aguarda a abertura de NY com viés de recuperação no WIN e pressão vendedora no WDO. O foco está na sustentação acima da Call Wall em 171.695.',
      '',
      '★ OBSERVAÇÃO ESPECIAL DO DIA:',
      '⚠️ DIA DE VENCIMENTO DO CONTRATO DE MINI-ÍNDICE (WINFUT) — Alta volatilidade por rolagem de contratos institucionais e reajuste de posições no vencimento de opções de índice!',
      '',
      '★ RISCOS & NÍVEIS CRÍTICOS:',
      '• Ajuste de posições pré-NYSE (10:30 BRT).',
      '• Rompimento da Zero Gamma em 170.595 acelera vendas em direção ao Put Wall (169.500).',
    ].join('\n'),

    personalNote: '⚠️ HOJE É DIA DE VENCIMENTO DO CONTRATO WINFUT. Alta volatilidade por rolagem de contratos institucionais!',

    overnightNote: [
      'Futuros EUA positivos (Nasdaq +1.02%, S&P +0.48%). Nikkei 225 +2.27%.',
      'DXY em queda a 99.65. VIX controlado em 15.00.',
      'Minério de ferro em leve alta em Singapura e Dalian.',
    ].join('\n'),

    macroCalendar: [
      '08:00 BRT — DE IPC Inflação Alemanha (Real: 0.8%)',
      '10:30 BRT — US Abertura NYSE',
      '⚠️ HOJE: VENCIMENTO DO CONTRATO WINFUT',
      'VIX: 15.00 (-1.83%) | DXY: 99.65 (-0.18%)',
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
    console.log('[SQLite TradeLog] Novo dia criado para 12/08/2026:', newDayId);
  } else {
    await db.update(tradingDays)
      .set(farolData)
      .where(eq(tradingDays.id, day.id));
    console.log('[SQLite TradeLog] Dia 12/08/2026 atualizado com dados do Farol do Mercado.');
  }

  if (day) {
    await db.delete(keyLevels).where(eq(keyLevels.tradingDayId, day.id));

    const levelsToInsert = [
      { name: 'Call Wall GEX (Compressão)', price: 171695 },
      { name: 'Zero Gamma GEX (Flip Point)', price: 170595 },
      { name: 'Put Wall GEX (Pico Short)', price: 169500 },
      { name: 'Resistência R1 GEX', price: 172795 },
      { name: 'Resistência R2 GEX', price: 173890 },
      { name: 'Resistência R3 GEX', price: 174990 },
      { name: 'Suporte S1 GEX', price: 168400 },
      { name: 'Suporte S2 GEX', price: 167300 },
    ];

    for (const lvl of levelsToInsert) {
      await db.insert(keyLevels).values({
        id: generateId(),
        tradingDayId: day.id,
        name: lvl.name,
        price: lvl.price,
      });
    }

    console.log('[SQLite TradeLog] Níveis-chave GEX inseridos na tabela key_levels.');

    // Sincroniza também o arquivo markdown do diário
    await exportTradingDayToMarkdown(dateStr);
    console.log('[Markdown Sync] Arquivo 2026-08-12_diario.md sincronizado com sucesso!');
  }
}

main().catch(console.error);
