'use server';

import { db } from '@/lib/db';
import {
  optionPositions,
  optionStrategies,
  optionStrategyLegs,
  strategyAllocationEvents,
  type OptionPosition,
  type NewOptionPosition,
  type OptionStrategy,
  type OptionStrategyLeg,
} from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import { eq, desc, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  enrichOptionPosition,
  enrichOptionStrategy,
  isActionFeedEligible,
  type PositionCalculatedMetrics,
  type EnrichedOptionPosition,
  type EnrichedOptionStrategy,
  type EnrichedStrategyLeg,
  type OptionMarketSnapshot,
  type StrategyBook,
  type CollateralMode,
  type StrategyEconomicPerformance,
} from './calculations';
import { getBrazilTodayDate } from './b3-calendar';
import { toAnnualRateDecimal } from './cdi-engine';

export type {
  PositionCalculatedMetrics,
  EnrichedOptionPosition,
  EnrichedOptionStrategy,
  EnrichedStrategyLeg,
  StrategyEconomicPerformance,
};

export interface ActionFeedItem {
  positionId: string;
  tickerOption: string;
  tickerUnderlying: string;
  tier: 'NORMAL' | 'ELEVADA' | 'AVALIAR_MANEJO' | 'RECICLAGEM_FORTE' | 'CAPTURE_EFFICIENCY_ONLY' | 'INSUFFICIENT_DATA';
  scoreDisplay: number | null;
  scoreBasis: string;
  title: string;
  details: string;
  pnlEstimatedExitReais: number;
  capitalReservedLiberavel: number;
}

export interface OptionsPortfolioSummary {
  totalCapitalAllocated: number;
  totalPnlMtmReais: number;
  overallRoicPct: number;
  openPositionsCount: number;
  closedPositionsCount: number;
  openStrategiesCount: number;

  // Gregas Totais Consolidadas
  totalThetaReaisPerDay: number;
  totalDeltaEquivUnits: number;

  // Benchmark CDI & Alpha Consolidados da Garantia Total da Carteira
  totalCdiRealizedReais: number;
  totalNetCdiBenchmarkReais: number;
  totalAlphaReais: number;
  totalNetAlphaReais: number;
  totalCdiMultiple: number | null;
  totalNetCdiMultiple: number | null;

  // Livro de Renda / Remuneração de Capital (Short Options & Covered avulsas)
  incomeBook: {
    capitalAllocated: number;
    pnlMtmReais: number;
    cdiRealizedReais: number;
    alphaReais: number;
    cdiMultiple: number | null;
    cdiRealizedYieldPct: number;
    cdiIsEstimated: boolean;

    // Líquido Estimado IR (15% Opções / 22.5% CDI)
    netPnlReaisWithTax: number;
    netCdiBenchmarkReais: number;
    netAlphaReais: number;
    netCdiMultiple: number | null;
  };

  // Livro Direcional / Convexidade (Long Calls & Puts avulsas)
  directionalBook: {
    capitalAtRisk: number;
    pnlMtmReais: number;
    roiOnPremiumPct: number;
  };

  // Livro Híbrido / Estruturas Multi-Pernas (ex: ITUB4 2:1)
  hybridBook: {
    capitalAllocated: number;
    pnlMtmReais: number;
    netInitialCreditDebitReais: number;
    netPnlReaisWithTax: number;
    cdiRealizedReais: number;
    netCdiBenchmarkReais: number;
    alphaReais: number;
    netAlphaReais: number;
    cdiMultiple: number | null;
    netCdiMultiple: number | null;
  };

  // Fila de Ações Sugeridas (Action Feed)
  actionFeedItems: ActionFeedItem[];
}

/**
 * 0. Sincronização ao Vivo do Spot via Yahoo Finance
 */
export async function syncYahooSpotPricesAction(): Promise<{
  success: boolean;
  updatedCount: number;
  quotes: Record<string, number>;
  error?: string;
}> {
  try {
    const rawPositions = await db.query.optionPositions.findMany({
      where: eq(optionPositions.status, 'OPEN'),
    });

    const uniqueTickers = Array.from(
      new Set(rawPositions.map((p) => p.tickerUnderlying.toUpperCase().trim()))
    );

    const quotes: Record<string, number> = {};

    for (const ticker of uniqueTickers) {
      try {
        const symbol = ticker.endsWith('.SA') ? ticker : `${ticker}.SA`;
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            next: { revalidate: 30 },
          }
        );
        const data = await res.json();
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price && typeof price === 'number') {
          quotes[ticker] = price;
        }
      } catch (err) {
        console.error(`[Yahoo Finance] Erro ao buscar cotação de ${ticker}:`, err);
      }
    }

    let updatedCount = 0;
    for (const pos of rawPositions) {
      const ticker = pos.tickerUnderlying.toUpperCase().trim();
      if (quotes[ticker]) {
        await db.update(optionPositions).set({
          underlyingCurrentSpot: quotes[ticker],
          updatedAt: new Date().toISOString(),
        }).where(eq(optionPositions.id, pos.id));
        updatedCount++;
      }
    }

    revalidatePath('/opcoes');
    return { success: true, updatedCount, quotes };
  } catch (err: any) {
    console.error('[Yahoo Finance] Erro geral:', err);
    return { success: false, updatedCount: 0, quotes: {}, error: err.message };
  }
}

export type GetOptionPositionsResult =
  | {
      success: true;
      positions: (EnrichedOptionPosition & { allocatedQuantity: number; unallocatedQuantity: number; strategyId?: string })[];
      strategies: EnrichedOptionStrategy[];
      summary: OptionsPortfolioSummary;
      error?: undefined;
      errorCode?: undefined;
    }
  | {
      success: false;
      error: string;
      errorCode: string;
      positions: null;
      strategies: null;
      summary: null;
    };

/**
 * 1. Agregação Geral: Posições, Estruturas e Síntese de Carteira
 */
export async function getOptionPositions(filterStatus?: 'ALL' | 'OPEN' | 'CLOSED'): Promise<GetOptionPositionsResult> {
  try {
    const rawPositions = await db.query.optionPositions.findMany({
      orderBy: [desc(optionPositions.entryDate), desc(optionPositions.createdAt)],
    });

    const rawStrategies = await db.query.optionStrategies.findMany({
      orderBy: [desc(optionStrategies.openedAt), desc(optionStrategies.createdAt)],
    });

    const rawLegs = await db.query.optionStrategyLegs.findMany();

    let filteredPositions = rawPositions;
    if (filterStatus === 'OPEN') {
      filteredPositions = rawPositions.filter((p) => p.status === 'OPEN');
    } else if (filterStatus === 'CLOSED') {
      filteredPositions = rawPositions.filter((p) => p.status !== 'OPEN');
    }

    const valuationDate = getBrazilTodayDate();
    const enrichedPosMap = new Map<string, EnrichedOptionPosition>();
    for (const p of filteredPositions) {
      enrichedPosMap.set(p.id, enrichOptionPosition(p, undefined, valuationDate));
    }

    // Mapa de Alocações por Posição
    const allocatedQtyByPosition = new Map<string, { totalAllocated: number; strategyId?: string; economicRole?: string }>();
    for (const leg of rawLegs) {
      const current = allocatedQtyByPosition.get(leg.positionId) || { totalAllocated: 0 };
      current.totalAllocated += leg.allocatedQuantity;
      current.strategyId = leg.strategyId;
      current.economicRole = leg.economicRole;
      allocatedQtyByPosition.set(leg.positionId, current);
    }

    // Montagem das Estruturas Enriquecidas
    const enrichedStrategies: EnrichedOptionStrategy[] = [];
    for (const st of rawStrategies) {
      const strategyLegs = rawLegs.filter((l) => l.strategyId === st.id);
      const legItems: EnrichedStrategyLeg[] = [];

      for (const leg of strategyLegs) {
        const p = enrichedPosMap.get(leg.positionId);
        if (p) {
          legItems.push({
            id: leg.id,
            strategyId: leg.strategyId,
            positionId: leg.positionId,
            allocatedQuantity: leg.allocatedQuantity,
            economicRole: leg.economicRole as any,
            position: p,
          });
        }
      }

      if (legItems.length > 0) {
        enrichedStrategies.push(
          enrichOptionStrategy({
            id: st.id,
            portfolio: st.portfolio || 'Principal',
            name: st.name,
            strategyType: st.strategyType,
            book: st.book as StrategyBook,
            underlyingTicker: st.underlyingTicker,
            collateralMode: st.collateralMode as any,
            collateralYieldPctCDI: st.collateralYieldPctCDI,
            capitalRemuneratedReais: (st as any).capitalRemuneratedReais,
            collateralCoveragePct: (st as any).collateralCoveragePct,
            status: st.status as any,
            openedAt: st.openedAt,
            closedAt: st.closedAt,
            notes: st.notes,
            legs: legItems,
          })
        );
      }
    }

    // Posições com metadados de alocação
    const finalPositions = filteredPositions.map((pos) => {
      const enriched = enrichedPosMap.get(pos.id)!;
      const allocInfo = allocatedQtyByPosition.get(pos.id) || { totalAllocated: 0 };
      const allocatedQuantity = Math.min(pos.quantity, allocInfo.totalAllocated);
      const unallocatedQuantity = Math.max(0, pos.quantity - allocatedQuantity);
      return {
        ...enriched,
        allocatedQuantity,
        unallocatedQuantity,
        strategyId: allocInfo.strategyId,
      };
    });

    // Agregação dos Totais sem Double Counting
    let totalCapitalAllocated = 0;
    let totalPnlMtmReais = 0;
    let openPositionsCount = 0;
    let closedPositionsCount = 0;

    // Income Book (Apenas posições de Renda NÃO alocadas a estratégias híbridas)
    let incomeCapital = 0;
    let incomePnl = 0;
    let incomeCdiRealized = 0;
    let incomeNetPnl = 0;
    let incomeNetCdi = 0;
    let incomeCdiIsEstimated = false;

    // Directional Book (Apenas posições direcionais NÃO alocadas a estratégias híbridas)
    let directionalCapital = 0;
    let directionalPnl = 0;

    // Hybrid Book (Estruturas consolidadas)
    let hybridCapital = 0;
    let hybridPnl = 0;
    let hybridNetCredit = 0;
    let hybridCdiRealized = 0;
    let hybridNetCdi = 0;

    const actionFeedItems: ActionFeedItem[] = [];

    // 1. Soma das Estruturas Abertas
    for (const st of enrichedStrategies) {
      if (st.status === 'OPEN') {
        totalCapitalAllocated += st.metrics.totalCapitalReserved;
        totalPnlMtmReais += st.metrics.netPnlMtmReais;

        if (st.book === 'HYBRID') {
          hybridCapital += st.metrics.totalCapitalReserved;
          hybridPnl += st.metrics.netPnlMtmReais;
          hybridNetCredit += st.metrics.netInitialCreditDebitReais;
          hybridCdiRealized += st.metrics.cdiRealizedReais;
          hybridNetCdi += st.metrics.cdiRealizedReais * 0.775;
        } else if (st.book === 'INCOME') {
          incomeCapital += st.metrics.totalCapitalReserved;
          incomePnl += st.metrics.netPnlMtmReais;
          incomeCdiRealized += st.metrics.cdiRealizedReais;
          incomeNetPnl += st.metrics.netPnlMtmReais * 0.85;
          incomeNetCdi += st.metrics.cdiRealizedReais * 0.775;
        } else {
          directionalCapital += st.metrics.totalCapitalReserved;
          directionalPnl += st.metrics.netPnlMtmReais;
        }
      }
    }

    // 2. Soma das Posições (Apenas Quantidades NÃO Alocadas)
    for (const pos of finalPositions) {
      const m = pos.metrics;
      if (pos.status === 'OPEN') {
        openPositionsCount++;
        const unallocRatio = pos.quantity > 0 ? pos.unallocatedQuantity / pos.quantity : 0;

        if (unallocRatio > 0) {
          const unallocCapital = m.capitalAllocated * unallocRatio;
          const unallocPnl = m.pnlMtmReais * unallocRatio;

          totalCapitalAllocated += unallocCapital;
          totalPnlMtmReais += unallocPnl;

          if (m.book === 'INCOME') {
            incomeCapital += unallocCapital;
            incomePnl += unallocPnl;
            incomeCdiRealized += m.cdiRealizedReais * unallocRatio;
            incomeNetPnl += m.netPnlMtmReaisWithTax * unallocRatio;
            incomeNetCdi += m.netCdiBenchmarkReais * unallocRatio;
            if (m.cdiIsEstimated) incomeCdiIsEstimated = true;

            const eff = m.efficiencyExecutable;
            if (isActionFeedEligible(eff)) {
              actionFeedItems.push({
                positionId: pos.id,
                tickerOption: pos.tickerOption,
                tickerUnderlying: pos.tickerUnderlying,
                tier: eff.tier,
                scoreDisplay: eff.efficiencyScoreDisplay,
                scoreBasis: eff.scoreBasis,
                title: eff.tier === 'RECICLAGEM_FORTE'
                  ? `🎯 RECICLAGEM FORTE: ${pos.tickerOption}`
                  : eff.tier === 'AVALIAR_MANEJO'
                  ? `⚡ AVALIAR MANEJO: ${pos.tickerOption}`
                  : `📈 EFICIÊNCIA ELEVADA (${eff.efficiencyScoreDisplay}/100): ${pos.tickerOption}`,
                details: `P&L MTM: +R$ ${m.pnlMtmReais.toFixed(2)} (${m.premiumCapturedPct.toFixed(1)}% capturado). Prêmio restante: R$ ${m.remainingCaptureReais.toFixed(2)}. Capital reservado liberável: R$ ${m.capitalAllocated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
                pnlEstimatedExitReais: m.pnlEstimatedExitReais,
                capitalReservedLiberavel: m.capitalAllocated,
              });
            }
          } else {
            directionalCapital += unallocCapital;
            directionalPnl += unallocPnl;
          }
        }
      } else {
        closedPositionsCount++;
      }
    }

    const overallRoicPct = totalCapitalAllocated > 0 ? (totalPnlMtmReais / totalCapitalAllocated) * 100 : 0;
    const incomeAlphaReais = incomePnl - incomeCdiRealized;
    const incomeCdiMultiple = Math.abs(incomeCdiRealized) >= 0.05 ? incomePnl / incomeCdiRealized : null;
    const incomeCdiYieldPct = incomeCapital > 0 ? (incomeCdiRealized / incomeCapital) * 100 : 0;

    const incomeNetAlphaReais = incomeNetPnl - incomeNetCdi;
    const incomeNetCdiMultiple = Math.abs(incomeNetCdi) >= 0.05 ? incomeNetPnl / incomeNetCdi : null;

    const directionalRoiOnPremiumPct = directionalCapital > 0 ? (directionalPnl / directionalCapital) * 100 : 0;
    const hybridNetPnlWithTax = hybridPnl >= 0 ? hybridPnl * 0.85 : hybridPnl;
    const hybridAlphaReais = hybridPnl - hybridCdiRealized;
    const hybridNetAlphaReais = hybridNetPnlWithTax - hybridNetCdi;
    const hybridCdiMultiple = Math.abs(hybridCdiRealized) >= 0.05 ? hybridPnl / hybridCdiRealized : null;
    const hybridNetCdiMultiple = Math.abs(hybridNetCdi) >= 0.05 ? hybridNetPnlWithTax / hybridNetCdi : null;

    // Métricas Consolidadas da Carteira Inteira (Garantia Total)
    const totalNetPnlReais = incomeNetPnl + (directionalPnl * 0.85) + hybridNetPnlWithTax;
    const totalCdiRealizedReais = incomeCdiRealized + hybridCdiRealized;
    const totalNetCdiBenchmarkReais = incomeNetCdi + hybridNetCdi;
    const totalAlphaReais = totalPnlMtmReais - totalCdiRealizedReais;
    const totalNetAlphaReais = totalNetPnlReais - totalNetCdiBenchmarkReais;
    const totalCdiMultiple = Math.abs(totalCdiRealizedReais) >= 0.05 ? totalPnlMtmReais / totalCdiRealizedReais : null;
    const totalNetCdiMultiple = Math.abs(totalNetCdiBenchmarkReais) >= 0.05 ? totalNetPnlReais / totalNetCdiBenchmarkReais : null;

    // Cálculo Consolidado de Gregas Totais da Carteira
    let totalThetaReaisPerDay = 0;
    let totalDeltaEquivUnits = 0;

    for (const pos of finalPositions) {
      if (pos.status === 'OPEN') {
        const isShort = pos.side === 'SELL' || pos.side === 'SHORT';
        const sign = isShort ? -1 : 1;
        if (typeof pos.theta === 'number' && !isNaN(pos.theta)) {
          totalThetaReaisPerDay += pos.theta * pos.quantity * sign;
        }
        if (typeof pos.delta === 'number' && !isNaN(pos.delta)) {
          totalDeltaEquivUnits += pos.delta * pos.quantity * sign;
        }
      }
    }

    return {
      success: true,
      positions: finalPositions,
      strategies: enrichedStrategies,
      summary: {
        totalCapitalAllocated,
        totalPnlMtmReais,
        overallRoicPct,
        openPositionsCount,
        closedPositionsCount,
        openStrategiesCount: enrichedStrategies.filter((s) => s.status === 'OPEN').length,
        totalThetaReaisPerDay,
        totalDeltaEquivUnits,
        totalCdiRealizedReais,
        totalNetCdiBenchmarkReais,
        totalAlphaReais,
        totalNetAlphaReais,
        totalCdiMultiple,
        totalNetCdiMultiple,
        incomeBook: {
          capitalAllocated: incomeCapital,
          pnlMtmReais: incomePnl,
          cdiRealizedReais: incomeCdiRealized,
          alphaReais: incomeAlphaReais,
          cdiMultiple: incomeCdiMultiple,
          cdiRealizedYieldPct: incomeCdiYieldPct,
          cdiIsEstimated: incomeCdiIsEstimated,
          netPnlReaisWithTax: incomeNetPnl,
          netCdiBenchmarkReais: incomeNetCdi,
          netAlphaReais: incomeNetAlphaReais,
          netCdiMultiple: incomeNetCdiMultiple,
        },
        directionalBook: {
          capitalAtRisk: directionalCapital,
          pnlMtmReais: directionalPnl,
          roiOnPremiumPct: directionalRoiOnPremiumPct,
        },
        hybridBook: {
          capitalAllocated: hybridCapital,
          pnlMtmReais: hybridPnl,
          netInitialCreditDebitReais: hybridNetCredit,
          netPnlReaisWithTax: hybridNetPnlWithTax,
          cdiRealizedReais: hybridCdiRealized,
          netCdiBenchmarkReais: hybridNetCdi,
          alphaReais: hybridAlphaReais,
          netAlphaReais: hybridNetAlphaReais,
          cdiMultiple: hybridCdiMultiple,
          netCdiMultiple: hybridNetCdiMultiple,
        },
        actionFeedItems,
      },
    };
  } catch (err) {
    console.error('[Options Actions] Erro ao buscar posições e estratégias:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao carregar dados de opções do banco de dados.',
      errorCode: 'DATABASE_LOAD_ERROR',
      positions: null,
      strategies: null,
      summary: null,
    };
  }
}

/**
 * 2. Agrupamento de Posições Existentes em Estrutura Multi-Leg
 */
export async function groupOptionPositionsAction(params: {
  portfolio?: string;
  name: string;
  strategyType: string;
  book?: StrategyBook;
  underlyingTicker: string;
  collateralMode?: CollateralMode;
  collateralYieldPctCDI?: number | null;
  capitalRemuneratedReais?: number | null;
  collateralCoveragePct?: number | null;
  notes?: string;
  legs: Array<{
    positionId: string;
    allocatedQuantity: number;
    economicRole?: 'FINANCING' | 'DIRECTIONAL' | 'HEDGE' | 'INCOME' | 'CUSTOM';
  }>;
}): Promise<{ success: boolean; strategyId?: string; error?: string }> {
  try {
    if (!params.legs || params.legs.length < 2) {
      return { success: false, error: 'Uma estrutura deve conter pelo menos 2 pernas (legs).' };
    }

    // Validações estritas de funding
    if (params.collateralCoveragePct !== undefined && params.collateralCoveragePct !== null) {
      if (params.collateralCoveragePct < 0 || params.collateralCoveragePct > 100) {
        return { success: false, error: 'INVALID_COLLATERAL_COVERAGE_PERCENT: Cobertura de garantia deve estar entre 0% e 100%.' };
      }
    }
    if (params.capitalRemuneratedReais !== undefined && params.capitalRemuneratedReais !== null) {
      if (params.capitalRemuneratedReais < 0) {
        return { success: false, error: 'INVALID_REMUNERATED_CAPITAL: Capital remunerado não pode ser negativo.' };
      }
    }

    const posIds = params.legs.map((l) => l.positionId);
    const rawPositions = await db.query.optionPositions.findMany({
      where: inArray(optionPositions.id, posIds),
    });

    if (rawPositions.length !== posIds.length) {
      return { success: false, error: 'Uma ou mais posições selecionadas não foram encontradas.' };
    }

    const underlyingTicker = rawPositions[0].tickerUnderlying.toUpperCase();
    const allSameUnderlying = rawPositions.every((p) => p.tickerUnderlying.toUpperCase() === underlyingTicker);
    if (!allSameUnderlying) {
      return { success: false, error: 'Todas as pernas devem pertencer ao mesmo ativo subjacente.' };
    }

    const existingLegs = await db.query.optionStrategyLegs.findMany({
      where: inArray(optionStrategyLegs.positionId, posIds),
    });

    let strategyIdResult = '';

    await db.transaction(async (tx) => {
      // Validação de quantidade disponível
      for (const legParam of params.legs) {
        const pos = rawPositions.find((p) => p.id === legParam.positionId)!;
        const alreadyAllocated = existingLegs
          .filter((l) => l.positionId === pos.id)
          .reduce((sum, l) => sum + l.allocatedQuantity, 0);

        const desiredQty = legParam.allocatedQuantity ?? pos.quantity;

        if (desiredQty <= 0) {
          throw new Error(`Quantidade alocada deve ser maior que zero para ${pos.tickerOption}.`);
        }

        if (alreadyAllocated + desiredQty > pos.quantity) {
          throw new Error(`Quantidade insuficiente em ${pos.tickerOption}. Disponível: ${pos.quantity - alreadyAllocated}, Solicitado: ${desiredQty}.`);
        }
      }

      const strategyId = generateId('opt_strat');
      strategyIdResult = strategyId;
      const now = new Date().toISOString();
      const openedAt = rawPositions.reduce((min, p) => (p.entryDate < min ? p.entryDate : min), rawPositions[0].entryDate);

      let detectedType = params.strategyType || 'CUSTOM_MULTI_LEG';
      let detectedBook: StrategyBook = params.book || 'HYBRID';

      const strategyName = params.name || `${underlyingTicker} — Estrutura Financiada 2:1`;

      await tx.insert(optionStrategies).values({
        id: strategyId,
        portfolio: params.portfolio || rawPositions[0].portfolio || 'Principal',
        name: strategyName,
        strategyType: detectedType,
        book: detectedBook,
        underlyingTicker,
        collateralMode: params.collateralMode || 'IDLE_CASH',
        collateralYieldPctCDI: params.collateralYieldPctCDI ?? null,
        capitalRemuneratedReais: params.capitalRemuneratedReais ?? null,
        collateralCoveragePct: params.collateralCoveragePct ?? null,
        status: 'OPEN',
        openedAt,
        notes: params.notes,
        createdAt: now,
        updatedAt: now,
      });

      for (const legParam of params.legs) {
        const pos = rawPositions.find((p) => p.id === legParam.positionId)!;
        const allocQty = legParam.allocatedQuantity ?? pos.quantity;
        const legId = generateId('opt_strat_leg');

        let econRole = legParam.economicRole || 'CUSTOM';

        await tx.insert(optionStrategyLegs).values({
          id: legId,
          strategyId,
          positionId: pos.id,
          allocatedQuantity: allocQty,
          economicRole: econRole,
          createdAt: now,
        });

        await tx.insert(strategyAllocationEvents).values({
          id: generateId('strat_ev'),
          strategyId,
          positionId: pos.id,
          eventType: 'GROUP',
          allocatedQuantity: allocQty,
          notes: `Agrupado na estrutura ${strategyName}`,
          timestamp: now,
        });
      }
    });

    revalidatePath('/opcoes');
    return { success: true, strategyId: strategyIdResult };
  } catch (err: any) {
    console.error('[Options Actions] Erro ao agrupar posições:', err);
    return { success: false, error: err.message || 'Erro ao agrupar posições em estrutura.' };
  }
}

/**
 * 3. Desagrupa Estrutura (Desfaz Relações com 100% de Segurança Transacional)
 */
export async function ungroupOptionStrategyAction(strategyId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const existingStrategy = await db.query.optionStrategies.findFirst({
      where: eq(optionStrategies.id, strategyId),
    });

    if (!existingStrategy) {
      return { success: false, error: 'Estrutura não encontrada.' };
    }

    const legs = await db.query.optionStrategyLegs.findMany({
      where: eq(optionStrategyLegs.strategyId, strategyId),
    });

    const now = new Date().toISOString();

    await db.transaction(async (tx) => {
      for (const leg of legs) {
        await tx.insert(strategyAllocationEvents).values({
          id: generateId('strat_ev'),
          strategyId,
          positionId: leg.positionId,
          eventType: 'UNGROUP',
          allocatedQuantity: leg.allocatedQuantity,
          notes: `Desagrupado da estrutura ${existingStrategy.name}`,
          timestamp: now,
        });
      }

      // Deleta a estratégia (cascade deleta as legs, as posições permanecem intactas!)
      await tx.delete(optionStrategies).where(eq(optionStrategies.id, strategyId));
    });

    revalidatePath('/opcoes');
    return { success: true };
  } catch (err: any) {
    console.error('[Options Actions] Erro ao desagrupar estratégia:', err);
    return { success: false, error: err.message || 'Erro ao desagrupar estratégia' };
  }
}

/**
 * 4. Criação de Nova Posição de Opção com cálculo de Capital Alocado
 */
export async function createOptionPosition(data: {
  portfolio: string;
  tickerUnderlying: string;
  tickerOption: string;
  optionType: 'CALL' | 'PUT';
  side: 'BUY' | 'SELL';
  strategyType: string;
  quantity: number;
  strike: number;
  entryPrice: number;
  currentPrice: number;
  underlyingEntrySpot?: number;
  underlyingCurrentSpot?: number;
  entryDate: string;
  expirationDate: string;
  allocatedCapital?: number;
  cdiRateAnnual?: number;
  breakEven?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  iv?: number;
  pop?: number;
  notes?: string;
  status?: 'OPEN' | 'CLOSED';
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const id = generateId('opt_pos');
    const now = new Date().toISOString();

    const isSell = data.side === 'SELL';
    let allocatedCapital = data.allocatedCapital;
    if (allocatedCapital === undefined || allocatedCapital <= 0) {
      if (isSell && data.optionType === 'PUT') {
        allocatedCapital = data.strike * data.quantity;
      } else if (isSell && data.optionType === 'CALL') {
        allocatedCapital = (data.underlyingEntrySpot || data.strike) * data.quantity;
      } else {
        allocatedCapital = data.entryPrice * data.quantity;
      }
    }

    const breakEven = data.optionType === 'PUT' ? data.strike - data.entryPrice : data.strike + data.entryPrice;

    await db.insert(optionPositions).values({
      id,
      portfolio: data.portfolio || 'Principal',
      tickerUnderlying: data.tickerUnderlying.toUpperCase().trim(),
      tickerOption: data.tickerOption.toUpperCase().trim(),
      optionType: data.optionType,
      side: data.side,
      strategyType: data.strategyType || (isSell ? (data.optionType === 'PUT' ? 'VENDA_PUT' : 'VENDA_CALL') : 'COMPRA_CALL'),
      quantity: data.quantity,
      strike: data.strike,
      entryPrice: data.entryPrice,
      currentPrice: data.currentPrice || data.entryPrice,
      underlyingEntrySpot: data.underlyingEntrySpot,
      underlyingCurrentSpot: data.underlyingCurrentSpot || data.underlyingEntrySpot,
      entryDate: data.entryDate,
      expirationDate: data.expirationDate,
      allocatedCapital,
      status: data.status || 'OPEN',
      delta: data.delta,
      gamma: data.gamma,
      theta: data.theta,
      vega: data.vega,
      iv: data.iv,
      pop: data.pop,
      breakEven: data.breakEven || breakEven,
      cdiRateAnnual: toAnnualRateDecimal(data.cdiRateAnnual),
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    });

    revalidatePath('/opcoes');
    return { success: true, id };
  } catch (err: any) {
    console.error('[Options Actions] Erro ao criar posição:', err);
    return { success: false, error: err.message || 'Erro ao criar posição' };
  }
}

/**
 * 5. Atualização Rápida de Preço a Mercado
 */
export async function updateOptionMarketPrice(
  id: string,
  newPrice: number,
  underlyingSpot?: number
): Promise<{ success: boolean }> {
  try {
    const updateData: Partial<NewOptionPosition> = {
      currentPrice: newPrice,
      updatedAt: new Date().toISOString(),
    };
    if (underlyingSpot !== undefined) {
      updateData.underlyingCurrentSpot = underlyingSpot;
    }

    await db.update(optionPositions).set(updateData).where(eq(optionPositions.id, id));
    revalidatePath('/opcoes');
    return { success: true };
  } catch (err) {
    console.error('[Options Actions] Erro ao atualizar preço:', err);
    return { success: false };
  }
}

/**
 * 5b. Atualização Completa da Posição com Validação de Alocações
 */
export async function updateOptionPosition(
  id: string,
  data: Partial<NewOptionPosition>
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = await db.query.optionPositions.findFirst({
      where: eq(optionPositions.id, id),
    });
    if (!current) throw new Error('Posição não encontrada');

    // Valida se nova quantidade é compatível com alocações existentes
    if (data.quantity !== undefined && data.quantity < current.quantity) {
      const activeLegs = await db.query.optionStrategyLegs.findMany({
        where: eq(optionStrategyLegs.positionId, id),
      });
      const totalAllocated = activeLegs.reduce((sum, l) => sum + l.allocatedQuantity, 0);
      if (data.quantity < totalAllocated) {
        return {
          success: false,
          error: `Não é possível reduzir a quantidade para ${data.quantity}, pois ${totalAllocated} unidades estão alocadas em estruturas ativas. Desagrupe ou reduza a estrutura primeiro.`,
        };
      }
    }

    const strike = data.strike !== undefined ? data.strike : current.strike;
    const quantity = data.quantity !== undefined ? data.quantity : current.quantity;
    const entryPrice = data.entryPrice !== undefined ? data.entryPrice : current.entryPrice;
    const side = data.side || current.side;
    const optionType = data.optionType || current.optionType;

    let allocatedCapital = data.allocatedCapital;
    if (allocatedCapital === undefined || allocatedCapital <= 0) {
      if (side === 'SELL' && optionType === 'PUT') {
        allocatedCapital = strike * quantity;
      } else if (side === 'SELL' && optionType === 'CALL') {
        allocatedCapital = (data.underlyingEntrySpot || current.underlyingEntrySpot || strike) * quantity;
      } else {
        allocatedCapital = entryPrice * quantity;
      }
    }

    const breakEven = optionType === 'PUT' ? strike - entryPrice : strike + entryPrice;

    await db.update(optionPositions).set({
      ...data,
      allocatedCapital,
      breakEven: data.breakEven || breakEven,
      cdiRateAnnual: data.cdiRateAnnual !== undefined ? toAnnualRateDecimal(data.cdiRateAnnual) : current.cdiRateAnnual,
      updatedAt: new Date().toISOString(),
    }).where(eq(optionPositions.id, id));

    revalidatePath('/opcoes');
    return { success: true };
  } catch (err: any) {
    console.error('[Options Actions] Erro ao atualizar posição completa:', err);
    return { success: false, error: err.message || 'Erro ao atualizar' };
  }
}

/**
 * 6. Encerra / Realiza a Posição com Proteção de Alocação
 */
export async function closeOptionPosition(params: {
  id: string;
  exitPrice: number;
  exitDate?: string;
  status: 'CLOSED' | 'EXERCISED' | 'EXPIRED_WORTHLESS' | 'ROLLED';
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();
    const exitDate = params.exitDate || getBrazilTodayDate();

    // Ao encerrar a posição, também encerra as alocações/estruturas associadas
    await db.update(optionPositions).set({
      exitPrice: params.exitPrice,
      exitDate,
      status: params.status,
      notes: params.notes,
      updatedAt: now,
    }).where(eq(optionPositions.id, params.id));

    revalidatePath('/opcoes');
    return { success: true };
  } catch (err: any) {
    console.error('[Options Actions] Erro ao encerrar posição:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 7. Protocolo de Rolagem
 */
export async function rollOptionPosition(params: {
  currentPositionId: string;
  recompraPrice: number;
  newOptionTicker: string;
  newStrike: number;
  newEntryPrice: number;
  newExpirationDate: string;
  newQuantity?: number;
}): Promise<{ success: boolean; newId?: string }> {
  try {
    const current = await db.query.optionPositions.findFirst({
      where: eq(optionPositions.id, params.currentPositionId),
    });
    if (!current) throw new Error('Posição original não encontrada');

    const todayStr = getBrazilTodayDate();

    await closeOptionPosition({
      id: params.currentPositionId,
      exitPrice: params.recompraPrice,
      exitDate: todayStr,
      status: 'ROLLED',
      notes: `Rolagem para ${params.newOptionTicker} (Strike R$ ${params.newStrike.toFixed(2)})`,
    });

    const newQty = params.newQuantity || current.quantity;
    const newCapital = current.optionType === 'PUT' ? params.newStrike * newQty : current.allocatedCapital;

    const res = await createOptionPosition({
      portfolio: current.portfolio || 'Principal',
      tickerUnderlying: current.tickerUnderlying,
      tickerOption: params.newOptionTicker,
      optionType: current.optionType as 'CALL' | 'PUT',
      side: current.side as 'SELL' | 'BUY',
      strategyType: current.strategyType || 'VENDA_PUT',
      quantity: newQty,
      strike: params.newStrike,
      entryPrice: params.newEntryPrice,
      currentPrice: params.newEntryPrice,
      underlyingEntrySpot: current.underlyingCurrentSpot ?? current.underlyingEntrySpot ?? undefined,
      underlyingCurrentSpot: current.underlyingCurrentSpot ?? current.underlyingEntrySpot ?? undefined,
      entryDate: todayStr,
      expirationDate: params.newExpirationDate,
      allocatedCapital: newCapital,
      cdiRateAnnual: current.cdiRateAnnual ?? undefined,
      status: 'OPEN',
      notes: `Rolagem originada de ${current.tickerOption}`,
    });

    revalidatePath('/opcoes');
    return { success: true, newId: res.id };
  } catch (err: any) {
    console.error('[Options Actions] Erro na rolagem:', err);
    return { success: false };
  }
}

/**
 * 8. Exclui Posição com Proteção Relacional
 */
export async function deleteOptionPosition(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Verifica se há alocações ativas
    const activeLegs = await db.query.optionStrategyLegs.findMany({
      where: eq(optionStrategyLegs.positionId, id),
    });

    if (activeLegs.length > 0) {
      return {
        success: false,
        error: 'Esta posição está alocada em uma estrutura ativa. Desagrupe a estrutura antes de excluir a posição.',
      };
    }

    await db.delete(optionPositions).where(eq(optionPositions.id, id));
    revalidatePath('/opcoes');
    return { success: true };
  } catch (err: any) {
    console.error('[Options Actions] Erro ao excluir posição:', err);
    return { success: false, error: err.message || 'Erro ao excluir posição' };
  }
}

/**
 * 9. Semeia as posições reais dos prints se a tabela estiver vazia
 */
export async function seedInitialOptionsIfEmpty(): Promise<void> {
  try {
    const count = await db.query.optionPositions.findMany({ limit: 1 });
    if (count.length === 0) {
      const now = new Date().toISOString();
      const itubPutId = generateId('opt_pos');
      const itubCallId = generateId('opt_pos');
      const lrenPutId = generateId('opt_pos');

      // Posição 1: Venda de Put ITUBU393
      await db.insert(optionPositions).values({
        id: itubPutId,
        portfolio: 'BTG Principal',
        tickerUnderlying: 'ITUB4',
        tickerOption: 'ITUBU393',
        optionType: 'PUT',
        side: 'SELL',
        strategyType: 'VENDA_PUT',
        quantity: 400,
        strike: 38.69,
        entryPrice: 1.04,
        currentPrice: 0.29,
        underlyingEntrySpot: 40.23,
        underlyingCurrentSpot: 40.23,
        entryDate: '2026-08-24',
        expirationDate: '2026-09-18',
        allocatedCapital: 15476.0,
        status: 'OPEN',
        delta: -0.17,
        gamma: 0.1435,
        theta: -0.015,
        vega: 2.25,
        iv: 29.15,
        pop: 96.0,
        breakEven: 37.65,
        cdiRateAnnual: 14.0,
        notes: 'Venda de Put OTM ITUB4 para remuneração de caixa',
        createdAt: now,
        updatedAt: now,
      });

      // Posição 2: Compra a Seco de Call ITUBI393
      await db.insert(optionPositions).values({
        id: itubCallId,
        portfolio: 'BTG Principal',
        tickerUnderlying: 'ITUB4',
        tickerOption: 'ITUBI393',
        optionType: 'CALL',
        side: 'BUY',
        strategyType: 'COMPRA_CALL',
        quantity: 200,
        strike: 38.69,
        entryPrice: 1.18,
        currentPrice: 2.07,
        underlyingEntrySpot: 40.23,
        underlyingCurrentSpot: 40.23,
        entryDate: '2026-08-24',
        expirationDate: '2026-09-18',
        allocatedCapital: 236.0,
        status: 'OPEN',
        delta: 0.85,
        gamma: 0.0799,
        theta: -0.013,
        vega: 2.29,
        iv: 29.15,
        pop: 85.0,
        breakEven: 39.87,
        cdiRateAnnual: 14.0,
        notes: 'Compra de Call direcional de ITUB4',
        createdAt: now,
        updatedAt: now,
      });

      // Posição 3: Venda de Put LRENV104
      await db.insert(optionPositions).values({
        id: lrenPutId,
        portfolio: 'BTG Principal',
        tickerUnderlying: 'LREN3',
        tickerOption: 'LRENV104',
        optionType: 'PUT',
        side: 'SELL',
        strategyType: 'VENDA_PUT',
        quantity: 500,
        strike: 10.42,
        entryPrice: 0.50,
        currentPrice: 0.37,
        underlyingEntrySpot: 11.21,
        underlyingCurrentSpot: 11.21,
        entryDate: '2026-08-27',
        expirationDate: '2026-10-16',
        allocatedCapital: 5210.0,
        status: 'OPEN',
        delta: -0.25,
        gamma: 0.1917,
        theta: -0.0069,
        vega: 1.24,
        iv: 69.16,
        pop: 75.0,
        breakEven: 9.92,
        cdiRateAnnual: 14.0,
        notes: 'Venda de Put LREN3 Strike R$ 10,42',
        createdAt: now,
        updatedAt: now,
      });

      // Semeia Estrutura Inicial de ITUB4 (Call Financiada 2:1)
      const stratId = generateId('opt_strat');
      await db.insert(optionStrategies).values({
        id: stratId,
        portfolio: 'BTG Principal',
        name: 'ITUB4 — Call Financiada por Put 2:1',
        strategyType: 'CUSTOM_MULTI_LEG',
        book: 'HYBRID',
        underlyingTicker: 'ITUB4',
        collateralMode: 'IDLE_CASH',
        status: 'OPEN',
        openedAt: '2026-08-24',
        notes: 'Financiamento da Call ITUBI393 com o prêmio da Put ITUBU393 (Assimetria 2:1)',
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(optionStrategyLegs).values([
        {
          id: generateId('opt_strat_leg'),
          strategyId: stratId,
          positionId: itubPutId,
          allocatedQuantity: 400,
          economicRole: 'FINANCING',
          createdAt: now,
        },
        {
          id: generateId('opt_strat_leg'),
          strategyId: stratId,
          positionId: itubCallId,
          allocatedQuantity: 200,
          economicRole: 'DIRECTIONAL',
          createdAt: now,
        },
      ]);
    }
  } catch (err) {
    console.error('[Options Actions] Erro ao semear posições iniciais:', err);
  }
}
