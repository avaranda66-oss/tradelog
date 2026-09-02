import { db } from '../lib/db';
import { tradingDays, trades } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { exportTradingDayToMarkdown } from '../lib/markdown-sync';

async function main() {
  const dateStr = '2026-08-12';

  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, dateStr),
  });

  if (!day) {
    console.error('Dia 12/08/2026 não encontrado no SQLite');
    return;
  }

  const dayTrades = await db.query.trades.findMany({
    where: eq(trades.tradingDayId, day.id),
    orderBy: trades.tradeNumber,
  });

  if (dayTrades.length >= 2) {
    // Trade #1
    await db.update(trades).set({
      conviction: 2,
      execution: 2,
      strategy: 'Suporte de Abertura',
      entryType: 'reversão',
      marketRegime: 'abertura',
      dayPhase: 'abertura-ações',
      stopType: 'técnico',
      preTradeNote: 'Achei que era o suporte do dia às 10:10. Errei ao não esperar o destravamento das ações (leilão 10:00-10:15) e não observar que o DI1 estava subindo e pressionando o índice.',
      duringTradeNote: 'Entrada precipitada antes da consolidação do mercado à vista. Stop atingido rapidamente em 16 segundos (-100 pts).',
      postTradeNote: 'Entrada com timing muito adiantado. Deveria ter esperado até 10:15 para ver o comportamento das ações e do DI.',
      whatISawNow: 'Achei que 171.480 era suporte do dia, mas entrei sem esperar o mercado pegar mais abaixo e sem aguardar a abertura do mercado à vista (ações travadas em leilão). DI estava subindo na hora.',
      retrospective: 'Trade precoce antes das 10:15. A tese de alta se confirmou às 10:20/10:25, mas entrei no timing errado.',
    }).where(eq(trades.id, dayTrades[0].id));

    // Trade #2
    await db.update(trades).set({
      conviction: 3,
      execution: 3,
      strategy: 'Footprint / Absorção de Suporte',
      entryType: 'scalp-suporte',
      marketRegime: 'abertura',
      dayPhase: 'abertura-ações',
      stopType: 'técnico',
      preTradeNote: 'Entrada 2m46s após o 1º stop. Havia gatilho considerável no Footprint de 1 min e absorção perto do suporte do dia (171.140).',
      duringTradeNote: 'Trade executado apenas 2 candles de 1 min após o primeiro stop. Ansiedade na reentrada, embora a leitura visual de Footprint fosse melhor.',
      postTradeNote: 'O timing correto de entrada seria entre 10:15 e 10:20 (quando ocorreu a rejeição na indexação de S&P Fut vs WINFUT e as ações destravaram). O trade subiu forte às 10:20-10:25 como esperado.',
      whatISawNow: 'Entrada por Footprint no gráfico de 1 min perto do suporte do dia. Leitura técnica melhor que o Trade #1, porém executado precipitado sem esperar a confirmação da indexação às 10:15.',
      retrospective: 'Minha visão de mercado (alta/lateralidade no dia) estava 100% CORRETA! O erro foi puramente de TIMING. Deveria ter esperado 10-15 minutos a mais.',
    }).where(eq(trades.id, dayTrades[1].id));

    // Atualiza o resumo do dia no SQLite
    await db.update(tradingDays).set({
      avgConviction: 2.5,
      avgExecution: 2.5,
      honestPhrase: 'A visão de mercado estava 100% correta (alta/lateralidade), mas falhei no timing ao entrar precipitado antes das 10:15 sem aguardar o leilão das ações e a estabilização do DI.',
      retrospective: 'Dia de aprendizado valioso sobre TIMING: A tese operacional de alta/recuperação estava certa e se confirmou às 10:20-10:25. Porém, a execução às 10:10 e 10:13 pegou os leilões das ações travados e o DI subindo. Esperar 10-15 minutos pós-10:00 transforma stops em trades pagadores.',
      emotionalPost: 'Consciente & Aprendizado',
      updatedAt: new Date().toISOString(),
    }).where(eq(tradingDays.id, day.id));

    console.log('[SQLite TradeLog] Trades do dia 12/08/2026 atualizados com sucesso!');

    // Sincroniza o Markdown
    await exportTradingDayToMarkdown(dateStr);
    console.log('[Markdown Sync] 2026-08-12_diario.md atualizado com os relatos detalhados!');
  }
}

main().catch(console.error);
