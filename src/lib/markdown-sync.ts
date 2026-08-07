import { db } from '@/lib/db';
import { tradingDays, trades, keyLevels, audioRecords } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Exporta os dados do dia de trading armazenados no SQLite do TradeLog
 * para um arquivo Markdown padronizado em 04-DIARIO-TRADE/YYYY-MM/YYYY-MM-DD_diario.md
 */
export async function exportTradingDayToMarkdown(dateStr: string): Promise<string | null> {
  try {
    const day = await db.query.tradingDays.findFirst({
      where: eq(tradingDays.date, dateStr),
    });

    if (!day) return null;

    const dayTrades = await db.query.trades.findMany({
      where: eq(trades.tradingDayId, day.id),
      orderBy: trades.tradeNumber,
    });

    const dayLevels = await db.query.keyLevels.findMany({
      where: eq(keyLevels.tradingDayId, day.id),
    });

    const dayAudios = await db.query.audioRecords.findMany({
      where: eq(audioRecords.tradingDayId, day.id),
    });

    // Formata Mês/Ano para a pasta (ex: 2026-08)
    const yearMonth = dateStr.slice(0, 7);
    const targetDir = path.join('d:', 'estudos', '04-DIARIO-TRADE', yearMonth);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, `${dateStr}_diario.md`);

    // Constrói o conteúdo Markdown
    let md = `# Diário de Trade — ${dateStr}\n\n`;
    md += `---\n\n`;

    // ─── 🌅 PRÉ-MARKET ───
    md += `## 🌅 PRÉ-MARKET\n\n`;
    md += `### Rotina Pessoal\n`;
    md += `- Hora que acordou: ${day.wakeUpTime || '___'}\n`;
    md += `- Qualidade do sono (1-5): ${day.sleepQuality || '___'}\n`;
    md += `- Estado mental/emocional ao sentar na tela: ${day.mentalState || '___'}\n`;
    md += `- Algo pessoal pesando hoje? ${day.personalNote || '___'}\n\n`;

    md += `### Contexto Macro & Farol do Mercado\n`;
    md += `- **Calendário do dia:** ${day.macroCalendar || 'N/A'}\n`;
    md += `- **Overnight:** ${day.overnightNote || 'N/A'}\n`;
    md += `- **Cenário / Viés Farol:** ${day.farolBias || day.generalBias || 'Indefinido'}\n`;
    if (day.farolNews) md += `- **Notícias Farol:** ${day.farolNews}\n`;
    if (day.farolInsights) md += `- **Insights Farol:** ${day.farolInsights}\n`;
    md += `\n`;

    md += `### Níveis-Chave do Dia\n\n`;
    md += `| Nível | Preço |\n`;
    md += `|-------|-------|\n`;
    if (dayLevels.length > 0) {
      for (const lvl of dayLevels) {
        md += `| ${lvl.name} | ${lvl.price.toLocaleString('pt-BR')} |\n`;
      }
    } else if (day.farolKeyLevels) {
      md += `| Farol Key Levels | ${day.farolKeyLevels} |\n`;
    } else {
      md += `| Níveis não cadastrados | - |\n`;
    }
    md += `\n`;

    md += `### Meu Viés Pré-Abertura\n`;
    md += `> ${day.generalBias ? `Viés: **${day.generalBias}**` : '(Antes de ver o preço abrir — leitura direcional matinal)'}\n\n`;

    md += `---\n\n`;

    // ─── 📊 OPERAÇÕES DO DIA ───
    md += `## 📊 OPERAÇÕES DO DIA\n\n`;
    md += `### Tabela de Trades\n\n`;
    md += `| # | Hora Entrada | Hora Saída | Lado | O que vi pra entrar (resumo) | Entrada | Saída | Pts | R$ | Convicção | Execução |\n`;
    md += `|---|--------------|------------|------|------------------------------|---------|-------|-----|----|:---------:|:--------:|\n`;

    if (dayTrades.length > 0) {
      for (const t of dayTrades) {
        const resumo = t.whatISawNow || t.preTradeNote || t.strategy || 'N/A';
        const sideLabel = t.side === 'C' ? 'COMPRA' : 'VENDA';
        const pts = t.points !== null && t.points !== undefined ? `${t.points > 0 ? '+' : ''}${t.points}` : '-';
        const reais = t.reais !== null && t.reais !== undefined ? `R$ ${t.reais > 0 ? '+' : ''}${t.reais.toFixed(2)}` : '-';
        const conv = t.conviction || '-';
        const exec = t.execution || '-';

        md += `| ${t.tradeNumber} | ${t.openTime} | ${t.closeTime} | ${sideLabel} | ${resumo} | ${t.entryPrice} | ${t.exitPrice} | ${pts} | ${reais} | ${conv} | ${exec} |\n`;
      }
    } else {
      md += `| - | - | - | - | Nenhum trade registrado | - | - | - | - | - | - |\n`;
    }
    md += `\n`;

    md += `### O Que Vi NA HORA (por trade)\n\n`;
    if (dayTrades.length > 0) {
      for (const t of dayTrades) {
        md += `#### Trade #${t.tradeNumber} (${t.side === 'C' ? 'COMPRA' : 'VENDA'} @ ${t.entryPrice})\n`;
        md += `- **O que vi NA HORA:** ${t.whatISawNow || 'N/A'}\n`;
        md += `- **Estratégia:** ${t.strategy || 'N/A'}\n`;
        md += `- **Regime de mercado:** ${t.marketRegime || 'N/A'}\n`;
        md += `- **Fase do dia:** ${t.dayPhase || 'N/A'}\n`;
        md += `- **Tipo de Stop:** ${t.stopType || 'N/A'}\n`;
        if (t.preTradeNote) md += `- **Pré-Trade Note:** ${t.preTradeNote}\n`;
        if (t.duringTradeNote) md += `- **Durante o Trade:** ${t.duringTradeNote}\n`;
        md += `\n`;
      }
    } else {
      md += `Sem trades gravados para este dia.\n\n`;
    }

    md += `---\n\n`;

    // ─── 🔍 RETROSPECTIVA ───
    md += `## 🔍 RETROSPECTIVA (DEPOIS DE VER O RESULTADO)\n\n`;
    md += `### Análise Pós-Pregão\n`;
    md += `${day.retrospective || 'Nenhuma retrospectiva digitada ainda.'}\n\n`;

    md += `### Autoavaliação\n`;
    md += `- **Estado emocional pós-pregão:** ${day.emotionalPost || 'N/A'}\n`;
    md += `- **Houve overtrading?** ${day.overtrading ? 'SIM ⚠️' : 'NÃO ✅'}\n`;
    if (day.honestPhrase) md += `- **Frase Honesta:** "${day.honestPhrase}"\n`;
    md += `\n`;

    // Transcrições de Voz se houver
    if (dayAudios.length > 0) {
      md += `### 🎙️ Narrações de Voz / Transcrições do Pregão\n`;
      for (const a of dayAudios) {
        if (a.transcription) {
          md += `> **[Áudio ${a.durationSecs ? `${a.durationSecs}s` : ''}]:** ${a.transcription}\n\n`;
        }
      }
    }

    md += `---\n\n`;

    // ─── 📈 RESULTADO DO DIA ───
    md += `## 📈 RESULTADO DO DIA\n\n`;
    md += `- Total pontos: **${day.totalPoints || 0} pts**\n`;
    md += `- Total R$: **R$ ${(day.totalReais || 0).toFixed(2)}**\n`;
    md += `- Trades certos / errados: **${day.tradesRight || 0} / ${day.tradesWrong || 0}**\n`;
    md += `- Nota média de convicção: **${day.avgConviction || '-'} / 5**\n`;
    md += `- Nota média de execução: **${day.avgExecution || '-'} / 5**\n`;
    md += `- Pré-market feito? **${day.preMarketDone ? 'Sim ✅' : 'Não ⚠️'}**\n`;
    md += `- Viés pré-abertura correto? **${day.biasCorrect === true ? 'Sim ✅' : day.biasCorrect === false ? 'Não ❌' : 'Indefinido'}**\n\n`;

    if (day.honestPhrase) {
      md += `### Uma Frase Honesta\n`;
      md += `> "${day.honestPhrase}"\n\n`;
    }

    fs.writeFileSync(filePath, md, 'utf-8');
    console.log(`[MarkdownSync] Exportado diário com sucesso em: ${filePath}`);
    return filePath;
  } catch (err) {
    console.error(`[MarkdownSync] Erro ao exportar Markdown para ${dateStr}:`, err);
    return null;
  }
}
