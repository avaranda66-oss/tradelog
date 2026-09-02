import { db } from '../lib/db';
import { tradingDays, keyLevels } from '../lib/db/schema';
import { generateId } from '../lib/utils';
import { eq } from 'drizzle-orm';
import { exportTradingDayToMarkdown } from '../lib/markdown-sync';

async function main() {
  const dateStr = '2026-08-11';

  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  const farolData = {
    generalBias: 'alta',
    farolBias: 'LONG // ALTA MODERADA — Desempenho positivo do EWZ (+0.43%) e arbitragem de ADRs bancárias (ITUB +1.70%, BBD +1.54%) apontam para abertura em gap de alta. Manutenção acima de 173.200 crucial para sustentar viés comprador matinal.',

    farolKeyLevels: [
      '174.075 — PutWall Farol (Nível divisor de risco / Rompimento acelera vendas)',
      '173.200 — Suporte Relevante Farol (Manutenção crucial para viés comprador matinal)',
      '172.422 — INDFUT Fechamento D-1',
      'Stop Sugerido: 100 pontos',
      'Range Provável: ~2.750 pontos',
      'Peso do Cenário: Externo 55% | Interno 45%',
      'Pressão de Mercado: BAIXA',
      'Intensidade Esperada: ~1.3%',
    ].join('\n'),

    farolNews: [
      '▸ 08:00 BRT — BCB Copom Meeting Ata (divulgada)',
      '▸ 09:00 BRT — BR IPCA Inflação Julho (Real: 0.17% vs Ant: 0.23%)',
      '▸ 09:15 BRT — US ADP Employment Change Weekly',
      '▸ 11:00 BRT — US Vendas de Casas Usadas (Jul)',
      '▸ VIX: 15.48 (+0.13%) — Volatilidade Moderada (Inversão de tendência para IBOV virou negativa)',
      '▸ Petróleo Brent: $87.29 (-0.49%) 🔴 | WTI: $81.94 (-0.23%) 🔴',
      '▸ Minério de Ferro: $95.40 (+0.42%) em Singapura | $707.00 (+1.00%) em Dalian 🟢',
      '▸ DXY: 99.84 (+0.02%) | USD/BRL: 5.11 (+0.02%)',
      '▸ Treasuries 10Y: 4.71% (+0.09%)',
      '▸ ADRs BR Pré-Market: ITUB +1.70% 🟢, BBD +1.54% 🟢, BSBR +1.39% 🟢, PBR +0.68% 🟢, VALE -0.10% 🔴',
      '▸ EWZ (ETF Brasil): 35.06 (pré-market +0.43%)',
    ].join('\n'),

    farolInsights: [
      '★ SÍNTESE OPERACIONAL DO FAROL:',
      'O mercado deve iniciar a sessão buscando o ajuste de arbitragem indicado pelo EWZ, mas condicionado à leitura da Ata do Copom e IPCA. A manutenção acima dos 173.200 será crucial para sustentar o viés comprador matinal.',
      '',
      '★ RISCOS & NÍVEIS CRÍTICOS:',
      '• Divulgação do IPCA (09:00 BRT) pode gerar spikes de volatilidade.',
      '• Rompimento da PutWall em 174.075 pode acelerar movimentos de venda por desalavancagem.',
      '• Suporte decisivo em 173.200.',
      '',
      '★ MERCADO GLOBAL (FUTUROS):',
      '• S&P 500: 7.787,25 (+0.14%)',
      '• Nasdaq 100: 29.826,50 (+0.30%)',
      '• Dow Jones: 54.091,00 (+0.05%)',
      '• Nikkei 225: 67.312,50 (+0.93%) 🚀',
      '• Hang Seng: 25.654,50 (-1.21%)',
    ].join('\n'),

    overnightNote: [
      'Futuros EUA positivos (S&P +0.14%, Nasdaq +0.30%). Nikkei 225 +0.93%.',
      'Minério de ferro em alta (+0.42% Singapura, +1.00% Dalian). Petróleo com leve realização (-0.49% Brent $87.29).',
      'ADRs bancárias brasileiras com forte apetite de risco no pré-market (ITUB +1.70%, BBD +1.54%, BSBR +1.39%).',
      'EWZ em alta de +0.43% no pré-market. VIX controlado em 15.48.',
    ].join('\n'),

    macroCalendar: [
      '08:00 BRT — BCB Copom Meeting Ata',
      '09:00 BRT — BR IPCA Inflação Mensal Julho (Real: 0.17%)',
      '09:15 BRT — US ADP Employment Change Weekly',
      '09:55 BRT — US Redbook (Anual)',
      '11:00 BRT — US Vendas de Casas Usadas (Jul)',
      '14:00 BRT — US Leilão de Note 3Y',
      'VIX: 15.48 (+0.13%) | DXY: 99.84 (+0.02%)',
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
    console.log('[SQLite TradeLog] Novo dia criado para 11/08/2026:', newDayId);
  } else {
    await db.update(tradingDays)
      .set(farolData)
      .where(eq(tradingDays.id, day.id));
    console.log('[SQLite TradeLog] Dia 11/08/2026 atualizado com dados do Farol.');
  }

  if (day) {
    await db.delete(keyLevels).where(eq(keyLevels.tradingDayId, day.id));
    await db.insert(keyLevels).values([
      { id: generateId(), tradingDayId: day.id, name: 'PUTWALL FAROL (DIVISOR DE RISCO)', price: 174075 },
      { id: generateId(), tradingDayId: day.id, name: 'SUPORTE RELEVANTE FAROL (CRUCIAL)', price: 173200 },
      { id: generateId(), tradingDayId: day.id, name: 'INDFUT FECHAMENTO D-1', price: 172422 },
    ]);

    await exportTradingDayToMarkdown(dateStr);
    console.log('[MarkdownSync] Exportado diário com sucesso em 04-DIARIO-TRADE!');
  }
}

main().catch(console.error);
