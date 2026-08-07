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
    farolBias: 'alta',
    farolKeyLevels: '175.600 Gamma Flip | 176.125 Pivot | 177.800 Call Wall',
    farolNews: '09:30 Payroll US (Alto Impacto) | Ouro +1.95% | Petróleo Brent -0.82%',
    farolInsights: 'Foco total no Payroll US às 09:30. Abertura das ADRs internacionais em alta no pré-market (+3.12% dia, Vale +0.95%, Petrobras +1.35%). Mini-índice sustentando repique comprador acima de 176.125.',
    overnightNote: 'EUA futuros em alta (S&P +0.21%, Nasdaq +0.52%). ADRs brasileiras no after-market recuperando +3.02%.',
    macroCalendar: '09:30 Payroll US (Relatório de Emprego EUA) | VIX 15.22 (Risk On)',
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
    console.log('✅ Novo dia de pregão criado no SQLite:', dateStr, newDayId);
  } else {
    await db.update(tradingDays)
      .set(farolData)
      .where(eq(tradingDays.id, day.id));
    console.log('✅ Dia de pregão atualizado no SQLite com dados do Farol:', dateStr);
  }

  if (day) {
    // Insere Níveis Chave Iniciais no SQLite
    await db.delete(keyLevels).where(eq(keyLevels.tradingDayId, day.id));
    await db.insert(keyLevels).values([
      { id: generateId(), tradingDayId: day.id, name: 'Gamma Flip', price: 175600 },
      { id: generateId(), tradingDayId: day.id, name: 'Pivot de Alta', price: 176125 },
      { id: generateId(), tradingDayId: day.id, name: 'Call Wall', price: 177800 },
    ]);

    await exportTradingDayToMarkdown(dateStr);
    console.log('✅ Markdown sincronizado para 04-DIARIO-TRADE!');
  }
}

main().catch(console.error);
