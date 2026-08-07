'use server';

import { db } from '@/lib/db';
import { tradingDays, trades, candleData } from '@/lib/db/schema';
import { parseProfitProCSV, parseCandleCSV } from '@/lib/csv-parser';
import { generateId } from '@/lib/utils';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { exportTradingDayToMarkdown } from '@/lib/markdown-sync';

/**
 * Importa CSV do Profit Pro e salva os trades no banco
 */
export async function importTradesCSV(formData: FormData) {
  const file = formData.get('file') as File;
  if (!file) throw new Error('Nenhum arquivo enviado');

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseProfitProCSV(buffer);

  // Cria ou encontra o dia
  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, parsed.date),
  });

  if (!day) {
    const newDay = {
      id: generateId(),
      date: parsed.date,
    };
    await db.insert(tradingDays).values(newDay);
    day = await db.query.tradingDays.findFirst({
      where: eq(tradingDays.date, parsed.date),
    });
  }

  if (!day) throw new Error('Falha ao criar dia');

  // Deleta trades existentes do dia (reimportação)
  await db.delete(trades).where(eq(trades.tradingDayId, day.id));

  // Insere os trades
  let totalPoints = 0;
  let totalReais = 0;
  let right = 0;
  let wrong = 0;

  for (let i = 0; i < parsed.trades.length; i++) {
    const t = parsed.trades[i];
    const entryPrice = t.side === 'C' ? t.buyPrice : t.sellPrice;
    const exitPrice = t.side === 'C' ? t.sellPrice : t.buyPrice;
    const contracts = Math.max(t.buyQty, t.sellQty);
    const pts = t.operationResultPct;
    const reais = t.operationResult;

    totalPoints += pts;
    totalReais += reais;
    if (reais > 0) right++;
    else if (reais < 0) wrong++;

    await db.insert(trades).values({
      id: generateId(),
      tradingDayId: day.id,
      tradeNumber: i + 1,
      instrument: t.instrument,
      openTime: t.openTime,
      closeTime: t.closeTime,
      duration: t.duration,
      side: t.side,
      entryPrice,
      exitPrice,
      contracts,
      points: pts,
      reais,
      isAverage: t.isAverage,
      mep: t.mep,
      men: t.men,
      drawdown: t.drawdown,
    });
  }

  // Atualiza resumo do dia
  await db.update(tradingDays)
    .set({
      totalPoints,
      totalReais,
      tradesRight: right,
      tradesWrong: wrong,
      overtrading: parsed.trades.length > 3,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tradingDays.id, day.id));

  revalidatePath('/');
  revalidatePath('/operacoes');
  revalidatePath('/analytics');

  await exportTradingDayToMarkdown(parsed.date);

  return {
    date: parsed.date,
    tradesImported: parsed.trades.length,
    totalPoints,
    totalReais,
  };
}

/**
 * Deleta um trade específico do banco e recalcula o P&L do dia
 */
export async function deleteTrade(tradeId: string) {
  const trade = await db.query.trades.findFirst({
    where: eq(trades.id, tradeId),
  });

  if (!trade) throw new Error('Trade não encontrado');
  const dayId = trade.tradingDayId;

  // Deleta o trade
  await db.delete(trades).where(eq(trades.id, tradeId));

  // Recalcula o resumo do dia se o dia existir
  if (dayId) {
    const remainingTrades = await db.query.trades.findMany({
      where: eq(trades.tradingDayId, dayId),
    });

    let totalPoints = 0;
    let totalReais = 0;
    let right = 0;
    let wrong = 0;

    for (const t of remainingTrades) {
      totalPoints += t.points || 0;
      totalReais += t.reais || 0;
      if ((t.reais || 0) > 0) right++;
      else if ((t.reais || 0) < 0) wrong++;
    }

    await db.update(tradingDays)
      .set({
        totalPoints,
        totalReais,
        tradesRight: right,
        tradesWrong: wrong,
        overtrading: remainingTrades.length > 3,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tradingDays.id, dayId));
  }

  revalidatePath('/');
  revalidatePath('/operacoes');
  revalidatePath('/analytics');
  return { success: true };
}

/**
 * Deleta todos os trades de um dia específico
 */
export async function deleteAllTradesForDay(dayId: string) {
  await db.delete(trades).where(eq(trades.tradingDayId, dayId));

  await db.update(tradingDays)
    .set({
      totalPoints: 0,
      totalReais: 0,
      tradesRight: 0,
      tradesWrong: 0,
      overtrading: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tradingDays.id, dayId));

  revalidatePath('/');
  revalidatePath('/operacoes');
  revalidatePath('/analytics');
  return { success: true };
}

/**
 * Importa CSV de candles (1min ou 5min)
 */
export async function importCandlesCSV(formData: FormData) {
  const file = formData.get('file') as File;
  const timeframe = formData.get('timeframe') as '1min' | '5min';
  if (!file) throw new Error('Nenhum arquivo enviado');

  const buffer = Buffer.from(await file.arrayBuffer());
  const candles = parseCandleCSV(buffer, timeframe);

  if (candles.length === 0) return { imported: 0 };

  const firstCandle = candles[0];
  const date = firstCandle.dateTime.split('T')[0];

  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, date),
  });

  if (!day) {
    const newDay = { id: generateId(), date };
    await db.insert(tradingDays).values(newDay);
    day = await db.query.tradingDays.findFirst({
      where: eq(tradingDays.date, date),
    });
  }

  if (!day) throw new Error('Falha ao criar dia');

  for (const c of candles) {
    await db.insert(candleData).values({
      id: generateId(),
      tradingDayId: day.id,
      instrument: c.instrument,
      timeframe,
      dateTime: c.dateTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      quantity: c.quantity,
    }).onConflictDoNothing();
  }

  return { imported: candles.length, date };
}

/**
 * Atualiza notas de um trade específico
 */
export async function updateTradeNotes(
  tradeId: string,
  data: {
    // Existentes
    conviction?: number;
    execution?: number;
    whatISawNow?: string;
    retrospective?: string;
    // Pré-Trade
    strategy?: string;
    emotionalPre?: string;
    entryType?: string;
    preTradeNote?: string;
    // Durante
    marketRegime?: string;
    dayPhase?: string;
    stopType?: string;
    didPartial?: boolean;
    movedStop?: boolean;
    reducedSize?: boolean;
    exitedEarly?: boolean;
    duringTradeNote?: string;
    // Pós-Trade
    emotionalPost?: string;
    tradeQuality?: number;
    postTradeNote?: string;
  }
) {
  await db.update(trades).set(data).where(eq(trades.id, tradeId));
  const trade = await db.query.trades.findFirst({ where: eq(trades.id, tradeId) });
  if (trade?.tradingDayId) {
    const day = await db.query.tradingDays.findFirst({ where: eq(tradingDays.id, trade.tradingDayId) });
    if (day) await exportTradingDayToMarkdown(day.date);
  }
  revalidatePath('/');
  revalidatePath('/operacoes');
}

/**
 * Atualiza dados de pré-market do dia (incluindo Farol do Mercado)
 */
export async function updatePreMarket(
  dayId: string,
  data: {
    sleepTime?: string;
    wakeUpTime?: string;
    sleepQuality?: number;
    mentalState?: string;
    personalNote?: string;
    macroCalendar?: string;
    overnightNote?: string;
    generalBias?: string;
    preMarketDone?: boolean;
    farolBias?: string;
    farolKeyLevels?: string;
    farolNews?: string;
    farolInsights?: string;
  }
) {
  await db.update(tradingDays)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(tradingDays.id, dayId));

  const day = await db.query.tradingDays.findFirst({ where: eq(tradingDays.id, dayId) });
  if (day) await exportTradingDayToMarkdown(day.date);

  revalidatePath('/');
  revalidatePath('/diario');
  revalidatePath('/operacoes');
}

/**
 * Atualiza retrospectiva do dia
 */
export async function updateDayRetrospective(
  dayId: string,
  data: {
    honestPhrase?: string;
    retrospective?: string;
    emotionalPost?: string;
  }
) {
  await db.update(tradingDays)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(tradingDays.id, dayId));

  const day = await db.query.tradingDays.findFirst({ where: eq(tradingDays.id, dayId) });
  if (day) await exportTradingDayToMarkdown(day.date);

  revalidatePath('/');
  revalidatePath('/diario');
  revalidatePath('/operacoes');
}

/**
 * Exclui completamente um dia de operação, seus trades, mídias e pastas no disco
 */
export async function deleteTradingDayAction(dayId: string) {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.id, dayId),
  });

  if (!day) return { success: false, message: 'Dia não encontrado' };

  const dateStr = day.date;
  const path = await import('node:path');
  const fs = await import('node:fs');

  // Deleta pastas físicas do dia
  const folders = [
    path.join(process.cwd(), 'data', 'videos', dateStr),
    path.join(process.cwd(), 'data', 'audio', dateStr),
    path.join(process.cwd(), 'data', 'images', dateStr),
  ];

  for (const folder of folders) {
    if (fs.existsSync(folder)) {
      try {
        fs.rmSync(folder, { recursive: true, force: true });
      } catch (err) {
        console.error(`Erro ao deletar pasta ${folder}:`, err);
      }
    }
  }

  // Deleta arquivo .md sincronizado em 04-DIARIO-TRADE
  const yearMonth = dateStr.slice(0, 7);
  const mdPath = path.join('d:', 'estudos', '04-DIARIO-TRADE', yearMonth, `${dateStr}_diario.md`);
  if (fs.existsSync(mdPath)) {
    try {
      fs.unlinkSync(mdPath);
    } catch (err) {
      console.error(`Erro ao deletar diário markdown ${mdPath}:`, err);
    }
  }

  // Deleta o registro no banco (cascade deleta trades, imagens, audios, videos, keyLevels)
  await db.delete(tradingDays).where(eq(tradingDays.id, dayId));

  revalidatePath('/');
  revalidatePath('/database');
  revalidatePath('/diario');
  revalidatePath('/operacoes');

  return { success: true };
}
