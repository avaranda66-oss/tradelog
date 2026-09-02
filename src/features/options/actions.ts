'use server';

import { db } from '@/lib/db';
import {
  optionPositions,
  optionStrategies,
  optionStrategyLegs,
  strategyAllocationEvents,
  strategyManeuverEvents,
  strategyFundingEvents,
  strategyFundingSegments,
  optionPositionExecutions,
  type OptionPosition,
  type NewOptionPosition,
  type OptionStrategy,
  type OptionStrategyLeg,
} from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import { eq, desc, asc, inArray, and, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  enrichOptionPosition,
  enrichOptionStrategy,
  detectStrategyRiskAndPayoff,
  calculateStrategyCanonicalBenchmarkCapital,
  calculateStrategyCanonicalResidualRisk,
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
import { getBrazilTodayDate, isB3TradingDay, type BusinessDate } from './b3-calendar';
import { toAnnualRateDecimal } from './cdi-engine';
import {
  buildScaleDownManeuverPlan,
  buildPartialLegCloseManeuverPlan,
  calculateLegsGcd,
  formatLegsRatio,
  type ManeuverPlan,
  type ManeuverPreviewExecution,
  type ManeuverHistoryDTO,
  type ManeuverHistoryExecutionDTO,
  type RatioComponent,
} from './maneuver-planner';

export type {
  ManeuverPlan,
  ManeuverPreviewExecution,
  ManeuverHistoryDTO,
  ManeuverHistoryExecutionDTO,
  RatioComponent,
};

function safeRevalidate(path: string = '/opcoes') {
  try {
    revalidatePath(path);
  } catch {}
}

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

  // Decomposição Tripla de P&L da Carteira (Gross & Net)
  portfolioRealizedPnlQuality: 'FULL' | 'LEGACY_INCOMPLETE' | 'NOT_AVAILABLE';
  portfolioKnownGrossRealizedPnlReais: number;
  portfolioKnownNetRealizedPnlReais: number;
  portfolioGrossRealizedPnlReais: number | null;
  portfolioNetRealizedPnlReais: number | null;
  portfolioUnrealizedPnlReais: number;
  portfolioTotalGrossPnlReais: number | null;
  portfolioTotalNetPnlReais: number | null;
  realizedPnlReais: number | null; // Alias para compatibilidade
  totalPnlReais: number | null; // Alias para compatibilidade

  // Gregas Totais Consolidadas
  totalThetaReaisPerDay: number;
  totalDeltaEquivUnits: number;

  // Agregação Econômica Canônica do Universo Benchmark-Eligible (Double Yield Consolidado)
  portfolioBenchmarkEligibleCapital: number;
  portfolioBenchmarkEligibleCount: number;
  portfolioExcludedFromBenchmarkCount: number;
  portfolioEconomicPerformanceQuality: 'FULL' | 'PARTIAL' | 'INSUFFICIENT_DATA';
  portfolioBenchmarkQuality: 'OFFICIAL_DI' | 'PARTIAL_ESTIMATE' | 'ESTIMATED' | 'NOT_AVAILABLE';

  portfolioOptionPnlReais: number;
  portfolioBenchmarkCdiReais: number;
  portfolioCollateralCarryReais: number;
  portfolioTotalEconomicReturnReais: number;
  portfolioExcessReturnVsCdiReais: number;
  portfolioTotalReturnToCdiMultiple: number | null;
  portfolioExcessToCdiMultiple: number | null;

  // Benchmark CDI & Alpha Consolidados da Garantia Total da Carteira (Aliases canônicos)
  totalCdiRealizedReais: number;
  totalNetCdiBenchmarkReais: number;
  totalAlphaReais: number;
  totalNetAlphaReais: number;
  totalCdiMultiple: number | null;
  totalNetCdiMultiple: number | null;

  // Livro de Renda / Remuneração de Capital (Short Options & Covered avulsas elegíveis)
  incomeBook: {
    capitalAllocated: number;
    knownOptionPnlReais: number;
    optionPnlReais: number;
    benchmarkCdiReais: number;
    collateralCarryReais: number;
    totalEconomicReturnReais: number;
    excessReturnVsCdiReais: number;
    totalReturnToCdiMultiple: number | null;
    excessToCdiMultiple: number | null;
    cdiRealizedYieldPct: number;
    cdiIsEstimated: boolean;
    benchmarkEligibleCount: number;
    excludedFromBenchmarkCount: number;
    performanceQuality: 'FULL' | 'PARTIAL' | 'INSUFFICIENT_DATA';

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
    knownOptionPnlReais: number;
    optionPnlReais: number;
    netInitialCreditDebitReais: number;
    benchmarkCdiReais: number;
    collateralCarryReais: number;
    totalEconomicReturnReais: number;
    excessReturnVsCdiReais: number;
    totalReturnToCdiMultiple: number | null;
    excessToCdiMultiple: number | null;
    benchmarkEligibleCount: number;
    excludedFromBenchmarkCount: number;
    performanceQuality: 'FULL' | 'PARTIAL' | 'INSUFFICIENT_DATA';

    netPnlReaisWithTax: number;
    netCdiBenchmarkReais: number;
    netAlphaReais: number;
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
    const rawExecutions = await db.query.optionPositionExecutions.findMany({
      orderBy: [desc(optionPositionExecutions.executionDate), desc(optionPositionExecutions.createdAt)],
    });
    const rawFundingSegments = await db.query.strategyFundingSegments.findMany({
      orderBy: [asc(strategyFundingSegments.startDate), asc(strategyFundingSegments.createdAt)],
    });

    let filteredPositions = rawPositions;
    if (filterStatus === 'OPEN') {
      filteredPositions = rawPositions.filter((p) => p.status === 'OPEN');
    } else if (filterStatus === 'CLOSED') {
      filteredPositions = rawPositions.filter((p) => p.status !== 'OPEN');
    }

    // Índices em Memória para Performance O(1) sem N+1 queries
    const executionsByPositionId = new Map<string, typeof rawExecutions>();
    const executionsByStrategyId = new Map<string, typeof rawExecutions>();
    const executionsByStrategyLegId = new Map<string, typeof rawExecutions>();
    for (const exec of rawExecutions) {
      if (exec.positionId) {
        const list = executionsByPositionId.get(exec.positionId) || [];
        list.push(exec);
        executionsByPositionId.set(exec.positionId, list);
      }
      if (exec.strategyId) {
        const list = executionsByStrategyId.get(exec.strategyId) || [];
        list.push(exec);
        executionsByStrategyId.set(exec.strategyId, list);
      }
      if (exec.strategyLegId) {
        const list = executionsByStrategyLegId.get(exec.strategyLegId) || [];
        list.push(exec);
        executionsByStrategyLegId.set(exec.strategyLegId, list);
      }
    }

    const valuationDate = getBrazilTodayDate();
    const enrichedPosMap = new Map<string, EnrichedOptionPosition>();
    for (const p of filteredPositions) {
      enrichedPosMap.set(p.id, enrichOptionPosition(p, undefined, valuationDate, executionsByPositionId.get(p.id)));
    }

    const fundingSegmentsByStrategyId = new Map<string, typeof rawFundingSegments>();
    for (const seg of rawFundingSegments) {
      const list = fundingSegmentsByStrategyId.get(seg.strategyId) || [];
      list.push(seg);
      fundingSegmentsByStrategyId.set(seg.strategyId, list);
    }

    // Mapa de Alocações ABERTAS por Posição (Anti-Double-Counting Canônico)
    const openAllocatedByPosition = new Map<string, number>();
    const allocatedInfoByPosition = new Map<string, { totalAllocated: number; strategyId?: string; economicRole?: string }>();
    for (const leg of rawLegs) {
      const origAlloc = leg.allocatedQuantity;
      const closedAlloc = leg.closedAllocatedQuantity ?? 0;
      const openAlloc = leg.openAllocatedQuantity ?? Math.max(0, origAlloc - closedAlloc);

      openAllocatedByPosition.set(
        leg.positionId,
        (openAllocatedByPosition.get(leg.positionId) || 0) + openAlloc
      );

      const current = allocatedInfoByPosition.get(leg.positionId) || { totalAllocated: 0 };
      current.totalAllocated += openAlloc;
      current.strategyId = leg.strategyId;
      current.economicRole = leg.economicRole;
      allocatedInfoByPosition.set(leg.positionId, current);
    }

    // Montagem das Estruturas Enriquecidas com Pernas Residuais
    const enrichedStrategies: EnrichedOptionStrategy[] = [];
    for (const st of rawStrategies) {
      const strategyLegs = rawLegs.filter((l) => l.strategyId === st.id);
      const legItems: EnrichedStrategyLeg[] = [];

      for (const leg of strategyLegs) {
        const p = enrichedPosMap.get(leg.positionId);
        if (p) {
          const origAlloc = leg.allocatedQuantity;
          const closedAlloc = leg.closedAllocatedQuantity ?? 0;
          const openAlloc = leg.openAllocatedQuantity ?? Math.max(0, origAlloc - closedAlloc);
          legItems.push({
            id: leg.id,
            strategyId: leg.strategyId,
            positionId: leg.positionId,
            allocatedQuantity: leg.allocatedQuantity,
            originalAllocatedQuantity: origAlloc,
            closedAllocatedQuantity: closedAlloc,
            openAllocatedQuantity: openAlloc,
            legacyClosedAllocatedQuantity: leg.legacyClosedAllocatedQuantity ?? 0,
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
            executions: executionsByStrategyId.get(st.id) || [],
            fundingSegments: fundingSegmentsByStrategyId.get(st.id) || [],
          })
        );
      }
    }

    // Posições com metadados de alocação residual estrita
    const finalPositions = filteredPositions.map((pos) => {
      const enriched = enrichedPosMap.get(pos.id)!;
      const openAlloc = openAllocatedByPosition.get(pos.id) || 0;
      const freeOpenQuantity = Math.max(0, enriched.metrics.openQuantity - openAlloc);
      const allocInfo = allocatedInfoByPosition.get(pos.id) || { totalAllocated: 0 };
      return {
        ...enriched,
        allocatedQuantity: openAlloc,
        unallocatedQuantity: freeOpenQuantity,
        freeOpenQuantity,
        strategyId: allocInfo.strategyId,
      };
    });

    // Agregação dos Totais sem Double Counting
    let totalCapitalAllocated = 0;
    let totalPnlMtmReais = 0;
    let openPositionsCount = 0;
    let closedPositionsCount = 0;

    // Benchmark Eligibility Counters & Capital
    let portfolioBenchmarkEligibleCapital = 0;
    let portfolioBenchmarkEligibleCount = 0;
    let portfolioExcludedFromBenchmarkCount = 0;
    let portfolioEconomicPerformanceQuality: 'FULL' | 'PARTIAL' | 'INSUFFICIENT_DATA' = 'FULL';
    let hasEstimatedBenchmark = false;
    let hasPartialEstimateBenchmark = false;
    let hasOfficialBenchmark = false;

    // Agregação Econômica Canônica do Universo Benchmark-Eligible (Double Yield Consolidado)
    let portfolioOptionPnlReais = 0;
    let portfolioBenchmarkCdiReais = 0;
    let portfolioCollateralCarryReais = 0;
    let portfolioTotalEconomicReturnReais = 0;
    let portfolioExcessReturnVsCdiReais = 0;

    // Subtotais dos Livros (seguindo a MESMA decomposição canônica)
    let incomeCapital = 0;
    let incomeKnownOptionPnlReais = 0;
    let incomeOptionPnlReais = 0;
    let incomeBenchmarkCdiReais = 0;
    let incomeCollateralCarryReais = 0;
    let incomeTotalEconomicReturnReais = 0;
    let incomeExcessReturnVsCdiReais = 0;
    let incomeNetPnl = 0;
    let incomeNetCdi = 0;
    let incomeCdiIsEstimated = false;
    let incomeBenchmarkEligibleCount = 0;
    let incomeExcludedFromBenchmarkCount = 0;
    let incomePerformanceQuality: 'FULL' | 'PARTIAL' | 'INSUFFICIENT_DATA' = 'FULL';

    let hybridCapital = 0;
    let hybridKnownOptionPnlReais = 0;
    let hybridOptionPnlReais = 0;
    let hybridNetCredit = 0;
    let hybridBenchmarkCdiReais = 0;
    let hybridCollateralCarryReais = 0;
    let hybridTotalEconomicReturnReais = 0;
    let hybridExcessReturnVsCdiReais = 0;
    let hybridNetCdi = 0;
    let hybridNetPnlWithTax = 0;
    let hybridBenchmarkEligibleCount = 0;
    let hybridExcludedFromBenchmarkCount = 0;
    let hybridPerformanceQuality: 'FULL' | 'PARTIAL' | 'INSUFFICIENT_DATA' = 'FULL';

    let directionalCapital = 0;
    let directionalPnl = 0;

    const actionFeedItems: ActionFeedItem[] = [];

    // 1. Agregação das Estruturas (CURRENT EXPOSURE vs PERFORMANCE SINCE INCEPTION)
    for (const st of enrichedStrategies) {
      const ep = st.economicPerformance;

      // CURRENT EXPOSURE: apenas estruturas com status === 'OPEN'
      if (st.status === 'OPEN') {
        totalCapitalAllocated += st.metrics.totalCapitalReserved;
        totalPnlMtmReais += st.metrics.netPnlMtmReais;

        if (st.book === 'HYBRID') {
          hybridCapital += st.metrics.totalCapitalReserved;
          hybridNetCredit += st.metrics.residualInitialCreditDebitReais ?? st.metrics.netInitialCreditDebitReais;
        } else if (st.book === 'INCOME') {
          incomeCapital += st.metrics.totalCapitalReserved;
        } else {
          directionalCapital += st.metrics.totalCapitalReserved;
        }
      }

      // PERFORMANCE SINCE INCEPTION (OPEN, CLOSED e ROLLED)
      // Estruturas com benchmark válido (HYBRID ou INCOME que não sejam INSUFFICIENT_DATA / NOT_AVAILABLE)
      const isBenchmarkComparable =
        (st.book === 'HYBRID' || st.book === 'INCOME') &&
        ep.benchmarkQuality !== 'NOT_AVAILABLE' &&
        ep.benchmarkCdiReais !== null &&
        st.metrics.strategyRealizedPnlQuality === 'FULL';

      if (isBenchmarkComparable) {
        portfolioBenchmarkEligibleCount++;
        portfolioBenchmarkEligibleCapital += ep.benchmarkCapitalReais;

        if (ep.economicPerformanceQuality === 'PARTIAL' && portfolioEconomicPerformanceQuality !== 'INSUFFICIENT_DATA') {
          portfolioEconomicPerformanceQuality = 'PARTIAL';
        } else if (ep.economicPerformanceQuality === 'INSUFFICIENT_DATA') {
          portfolioEconomicPerformanceQuality = 'INSUFFICIENT_DATA';
        }

        if (ep.benchmarkQuality === 'ESTIMATED') hasEstimatedBenchmark = true;
        else if (ep.benchmarkQuality === 'PARTIAL_ESTIMATE') hasPartialEstimateBenchmark = true;
        else if (ep.benchmarkQuality === 'OFFICIAL_DI') hasOfficialBenchmark = true;

        portfolioOptionPnlReais += ep.optionPnlReais;
        portfolioBenchmarkCdiReais += ep.benchmarkCdiReais!;
        portfolioCollateralCarryReais += ep.collateralCarryReais;
        portfolioTotalEconomicReturnReais += ep.totalEconomicReturnReais;
        portfolioExcessReturnVsCdiReais += ep.excessReturnVsCdiReais ?? 0;
      } else {
        portfolioExcludedFromBenchmarkCount++;
      }

      // Livros Históricos (Acumulam performance since inception de todas as estratégias)
      if (st.book === 'HYBRID') {
        hybridKnownOptionPnlReais += st.metrics.strategyKnownOptionPnlGrossReais;
        if (isBenchmarkComparable) {
          hybridBenchmarkEligibleCount++;
          hybridOptionPnlReais += ep.optionPnlReais;
          hybridBenchmarkCdiReais += ep.benchmarkCdiReais!;
          hybridCollateralCarryReais += ep.collateralCarryReais;
          hybridTotalEconomicReturnReais += ep.totalEconomicReturnReais;
          hybridExcessReturnVsCdiReais += ep.excessReturnVsCdiReais ?? 0;
          hybridNetCdi += ep.benchmarkCdiReais! * 0.775;
          hybridNetPnlWithTax += ep.optionPnlReais >= 0 ? ep.optionPnlReais * 0.85 : ep.optionPnlReais;
          if (ep.economicPerformanceQuality === 'PARTIAL' && hybridPerformanceQuality !== 'INSUFFICIENT_DATA') {
            hybridPerformanceQuality = 'PARTIAL';
          }
        } else {
          hybridExcludedFromBenchmarkCount++;
          hybridPerformanceQuality = 'INSUFFICIENT_DATA';
        }
      } else if (st.book === 'INCOME') {
        incomeKnownOptionPnlReais += st.metrics.strategyKnownOptionPnlGrossReais;
        if (isBenchmarkComparable) {
          incomeBenchmarkEligibleCount++;
          incomeOptionPnlReais += ep.optionPnlReais;
          incomeBenchmarkCdiReais += ep.benchmarkCdiReais!;
          incomeCollateralCarryReais += ep.collateralCarryReais;
          incomeTotalEconomicReturnReais += ep.totalEconomicReturnReais;
          incomeExcessReturnVsCdiReais += ep.excessReturnVsCdiReais ?? 0;
          incomeNetPnl += ep.optionPnlReais >= 0 ? ep.optionPnlReais * 0.85 : ep.optionPnlReais;
          incomeNetCdi += ep.benchmarkCdiReais! * 0.775;
          if (ep.economicPerformanceQuality === 'PARTIAL' && incomePerformanceQuality !== 'INSUFFICIENT_DATA') {
            incomePerformanceQuality = 'PARTIAL';
          }
        } else {
          incomeExcludedFromBenchmarkCount++;
          incomePerformanceQuality = 'INSUFFICIENT_DATA';
        }
      } else {
        directionalPnl += ep.optionPnlReais;
      }
    }

    // 2. Soma das Posições (Apenas Quantidades NÃO Alocadas / Standalone)
    for (const pos of finalPositions) {
      const m = pos.metrics;
      const standaloneExecs = (executionsByPositionId.get(pos.id) || []).filter((e) => !e.strategyId);
      const standaloneGrossRealized = Math.round(standaloneExecs.reduce((acc, x) => acc + x.grossRealizedPnlReais, 0) * 100) / 100;
      const standaloneClosedQty = standaloneExecs.reduce((acc, x) => acc + x.quantity, 0);
      const standaloneOpenQty = pos.unallocatedQuantity;
      const totalStandaloneQty = standaloneOpenQty + standaloneClosedQty;

      // CURRENT EXPOSURE (Apenas se houver contratos abertos na posição)
      if (pos.status === 'OPEN') {
        openPositionsCount++;
        const unallocRatio = m.openQuantity > 0 ? standaloneOpenQty / m.openQuantity : 0;

        if (unallocRatio > 0) {
          const unallocCapital = m.residualCapitalAllocated * unallocRatio;
          const unallocPnl = m.unrealizedPnlReais * unallocRatio;

          totalCapitalAllocated += unallocCapital;
          totalPnlMtmReais += unallocPnl;

          if (m.book === 'INCOME') {
            incomeCapital += unallocCapital;
          } else {
            directionalCapital += unallocCapital;
          }
        }
      } else {
        closedPositionsCount++;
      }

      // PERFORMANCE SINCE INCEPTION (OPEN e CLOSED para a parcela standalone)
      if (totalStandaloneQty > 0) {
        const unallocRatio = m.openQuantity > 0 ? standaloneOpenQty / m.openQuantity : 0;
        const unallocUnrealizedPnl = pos.status === 'OPEN' ? m.unrealizedPnlReais * unallocRatio : 0;
        const standaloneOptionPnl = standaloneGrossRealized + unallocUnrealizedPnl;

        if (m.book === 'INCOME') {
          incomeKnownOptionPnlReais += standaloneOptionPnl;

          const standaloneCapitalRatio = pos.quantity > 0 ? totalStandaloneQty / pos.quantity : 0;
          const standaloneBenchmarkCapital = m.originalCapitalAllocated * standaloneCapitalRatio;
          const isPosBenchmarkComparable =
            m.entryDateQuality === 'VALID_B3_TRADING_DAY' &&
            m.realizedPnlQuality === 'FULL' &&
            (pos.status === 'OPEN' || !pos.exitDate || isB3TradingDay(pos.exitDate.slice(0, 10) as BusinessDate));

          if (isPosBenchmarkComparable) {
            const standaloneBenchmarkCdi = standaloneBenchmarkCapital * m.cdiRealizedYieldDecimal;
            const standaloneExcessReturn = standaloneOptionPnl - standaloneBenchmarkCdi;

            portfolioBenchmarkEligibleCount++;
            portfolioBenchmarkEligibleCapital += standaloneBenchmarkCapital;
            if (portfolioEconomicPerformanceQuality === 'FULL') {
              portfolioEconomicPerformanceQuality = 'PARTIAL';
            }

            if (m.cdiIsEstimated) hasEstimatedBenchmark = true;
            else hasOfficialBenchmark = true;

            portfolioOptionPnlReais += standaloneOptionPnl;
            portfolioBenchmarkCdiReais += standaloneBenchmarkCdi;
            portfolioCollateralCarryReais += 0;
            portfolioTotalEconomicReturnReais += standaloneOptionPnl;
            portfolioExcessReturnVsCdiReais += standaloneExcessReturn;

            incomeBenchmarkEligibleCount++;
            incomeOptionPnlReais += standaloneOptionPnl;
            incomeBenchmarkCdiReais += standaloneBenchmarkCdi;
            incomeCollateralCarryReais += 0;
            incomeTotalEconomicReturnReais += standaloneOptionPnl;
            incomeExcessReturnVsCdiReais += standaloneExcessReturn;
            incomeNetPnl += standaloneOptionPnl >= 0 ? standaloneOptionPnl * 0.85 : standaloneOptionPnl;
            incomeNetCdi += standaloneBenchmarkCdi * 0.775;
            if (m.cdiIsEstimated) incomeCdiIsEstimated = true;
          } else {
            portfolioExcludedFromBenchmarkCount++;
            incomeExcludedFromBenchmarkCount++;
            incomePerformanceQuality = 'INSUFFICIENT_DATA';
          }

          // Action Feed (apenas posições abertas)
          if (pos.status === 'OPEN') {
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
          }
        } else {
          // Posição Direcional Avulsa (ex: Long Call / Long Put)
          portfolioExcludedFromBenchmarkCount++;
          directionalCapital += pos.status === 'OPEN' ? m.residualCapitalAllocated * (m.openQuantity > 0 ? standaloneOpenQty / m.openQuantity : 0) : 0;
          directionalPnl += standaloneOptionPnl;
        }
      }
    }

    const overallRoicPct = totalCapitalAllocated > 0 ? (totalPnlMtmReais / totalCapitalAllocated) * 100 : 0;

    // Realized P&L Canônico da Carteira (Cada execução canônica entra EXATAMENTE UMA VEZ)
    let portfolioKnownGrossRealizedPnlReais = 0;
    let portfolioKnownNetRealizedPnlReais = 0;
    for (const exec of rawExecutions) {
      portfolioKnownGrossRealizedPnlReais += exec.grossRealizedPnlReais;
      portfolioKnownNetRealizedPnlReais += exec.netRealizedPnlReais;
    }
    portfolioKnownGrossRealizedPnlReais = Math.round(portfolioKnownGrossRealizedPnlReais * 100) / 100;
    portfolioKnownNetRealizedPnlReais = Math.round(portfolioKnownNetRealizedPnlReais * 100) / 100;

    // Precedência Estrita de Qualidade Realizada do Portfólio
    // 1. Qualquer NOT_AVAILABLE => portfolio NOT_AVAILABLE
    // 2. Senão qualquer LEGACY_INCOMPLETE => portfolio LEGACY_INCOMPLETE
    // 3. Senão => FULL
    let hasNotAvailablePnl = false;
    let hasIncompleteLegacyPnl = false;

    for (const pos of finalPositions) {
      if (pos.metrics.realizedPnlQuality === 'NOT_AVAILABLE') {
        hasNotAvailablePnl = true;
      } else if (pos.metrics.realizedPnlQuality === 'LEGACY_INCOMPLETE') {
        hasIncompleteLegacyPnl = true;
      }
    }
    for (const st of enrichedStrategies) {
      if (st.metrics.strategyRealizedPnlQuality === 'NOT_AVAILABLE') {
        hasNotAvailablePnl = true;
      } else if (st.metrics.strategyRealizedPnlQuality === 'LEGACY_INCOMPLETE') {
        hasIncompleteLegacyPnl = true;
      }
    }

    const portfolioRealizedPnlQuality: 'FULL' | 'LEGACY_INCOMPLETE' | 'NOT_AVAILABLE' =
      hasNotAvailablePnl
        ? 'NOT_AVAILABLE'
        : hasIncompleteLegacyPnl
        ? 'LEGACY_INCOMPLETE'
        : 'FULL';

    const isFullRealizedQuality = portfolioRealizedPnlQuality === 'FULL';
    const portfolioGrossRealizedPnlReais = isFullRealizedQuality ? portfolioKnownGrossRealizedPnlReais : null;
    const portfolioNetRealizedPnlReais = isFullRealizedQuality ? portfolioKnownNetRealizedPnlReais : null;
    const portfolioUnrealizedPnlReais = Math.round(totalPnlMtmReais * 100) / 100;
    const portfolioTotalGrossPnlReais = isFullRealizedQuality
      ? Math.round((portfolioGrossRealizedPnlReais! + portfolioUnrealizedPnlReais) * 100) / 100
      : null;
    const portfolioTotalNetPnlReais = isFullRealizedQuality
      ? Math.round((portfolioNetRealizedPnlReais! + portfolioUnrealizedPnlReais) * 100) / 100
      : null;

    // Métricas Canônicas Derivadas do Double Yield Consolidado
    const totalAlphaReais = portfolioExcessReturnVsCdiReais;
    const totalCdiRealizedReais = portfolioBenchmarkCdiReais;
    const totalCdiMultiple = portfolioBenchmarkEligibleCount > 0 && Math.abs(portfolioBenchmarkCdiReais) >= 0.05 ? portfolioTotalEconomicReturnReais / portfolioBenchmarkCdiReais : null;
    const portfolioTotalReturnToCdiMultiple = totalCdiMultiple;
    const portfolioExcessToCdiMultiple = portfolioBenchmarkEligibleCount > 0 && Math.abs(portfolioBenchmarkCdiReais) >= 0.05 ? portfolioExcessReturnVsCdiReais / portfolioBenchmarkCdiReais : null;

    const incomeTotalReturnToCdiMultiple = incomeBenchmarkEligibleCount > 0 && Math.abs(incomeBenchmarkCdiReais) >= 0.05 ? incomeTotalEconomicReturnReais / incomeBenchmarkCdiReais : null;
    const incomeExcessToCdiMultiple = incomeBenchmarkEligibleCount > 0 && Math.abs(incomeBenchmarkCdiReais) >= 0.05 ? incomeExcessReturnVsCdiReais / incomeBenchmarkCdiReais : null;
    const incomeCdiYieldPct = incomeCapital > 0 ? (incomeBenchmarkCdiReais / incomeCapital) * 100 : 0;

    const incomeNetAlphaReais = incomeNetPnl - incomeNetCdi;
    const incomeNetCdiMultiple = incomeBenchmarkEligibleCount > 0 && Math.abs(incomeNetCdi) >= 0.05 ? incomeNetPnl / incomeNetCdi : null;

    const directionalRoiOnPremiumPct = directionalCapital > 0 ? (directionalPnl / directionalCapital) * 100 : 0;
    hybridNetPnlWithTax = hybridOptionPnlReais >= 0 ? hybridOptionPnlReais * 0.85 : hybridOptionPnlReais;
    const hybridNetAlphaReais = hybridNetPnlWithTax - hybridNetCdi;
    const hybridTotalReturnToCdiMultiple = hybridBenchmarkEligibleCount > 0 && Math.abs(hybridBenchmarkCdiReais) >= 0.05 ? hybridTotalEconomicReturnReais / hybridBenchmarkCdiReais : null;
    const hybridExcessToCdiMultiple = hybridBenchmarkEligibleCount > 0 && Math.abs(hybridBenchmarkCdiReais) >= 0.05 ? hybridExcessReturnVsCdiReais / hybridBenchmarkCdiReais : null;
    const hybridNetCdiMultiple = hybridBenchmarkEligibleCount > 0 && Math.abs(hybridNetCdi) >= 0.05 ? hybridNetPnlWithTax / hybridNetCdi : null;

    // Métricas Consolidadas da Carteira Inteira (Garantia Total)
    const totalNetPnlReais = incomeNetPnl + (directionalPnl * 0.85) + hybridNetPnlWithTax;
    const totalNetCdiBenchmarkReais = incomeNetCdi + hybridNetCdi;
    const totalNetAlphaReais = totalNetPnlReais - totalNetCdiBenchmarkReais;
    const totalNetCdiMultiple = Math.abs(totalNetCdiBenchmarkReais) >= 0.05 ? totalNetPnlReais / totalNetCdiBenchmarkReais : null;

    // Cálculo Consolidado de Gregas Totais da Carteira (sobre contratos abertos)
    let totalThetaReaisPerDay = 0;
    let totalDeltaEquivUnits = 0;

    for (const pos of finalPositions) {
      if (pos.status === 'OPEN' && pos.metrics.openQuantity > 0) {
        const isShort = pos.side === 'SELL' || pos.side === 'SHORT';
        const sign = isShort ? -1 : 1;
        if (typeof pos.theta === 'number' && !isNaN(pos.theta)) {
          totalThetaReaisPerDay += pos.theta * pos.metrics.openQuantity * sign;
        }
        if (typeof pos.delta === 'number' && !isNaN(pos.delta)) {
          totalDeltaEquivUnits += pos.delta * pos.metrics.openQuantity * sign;
        }
      }
    }

    let portfolioBenchmarkQuality: 'OFFICIAL_DI' | 'PARTIAL_ESTIMATE' | 'ESTIMATED' | 'NOT_AVAILABLE' = 'NOT_AVAILABLE';
    if (portfolioBenchmarkEligibleCount === 0) {
      portfolioBenchmarkQuality = 'NOT_AVAILABLE';
    } else if (hasEstimatedBenchmark) {
      portfolioBenchmarkQuality = 'ESTIMATED';
    } else if (hasPartialEstimateBenchmark) {
      portfolioBenchmarkQuality = 'PARTIAL_ESTIMATE';
    } else if (hasOfficialBenchmark) {
      portfolioBenchmarkQuality = 'OFFICIAL_DI';
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

        // Decomposição Tripla de P&L da Carteira (Gross & Net)
        portfolioRealizedPnlQuality,
        portfolioKnownGrossRealizedPnlReais,
        portfolioKnownNetRealizedPnlReais,
        portfolioGrossRealizedPnlReais,
        portfolioNetRealizedPnlReais,
        portfolioUnrealizedPnlReais,
        portfolioTotalGrossPnlReais,
        portfolioTotalNetPnlReais,
        realizedPnlReais: portfolioGrossRealizedPnlReais,
        totalPnlReais: portfolioTotalGrossPnlReais,

        totalThetaReaisPerDay,
        totalDeltaEquivUnits,

        // Agregação Econômica Canônica do Universo Benchmark-Eligible
        portfolioBenchmarkEligibleCapital,
        portfolioBenchmarkEligibleCount,
        portfolioExcludedFromBenchmarkCount,
        portfolioEconomicPerformanceQuality,
        portfolioBenchmarkQuality,

        portfolioOptionPnlReais,
        portfolioBenchmarkCdiReais,
        portfolioCollateralCarryReais,
        portfolioTotalEconomicReturnReais,
        portfolioExcessReturnVsCdiReais,
        portfolioTotalReturnToCdiMultiple,
        portfolioExcessToCdiMultiple,

        // Aliases Consolidados
        totalCdiRealizedReais,
        totalNetCdiBenchmarkReais,
        totalAlphaReais,
        totalNetAlphaReais,
        totalCdiMultiple,
        totalNetCdiMultiple,

        incomeBook: {
          capitalAllocated: incomeCapital,
          knownOptionPnlReais: incomeKnownOptionPnlReais,
          optionPnlReais: incomeOptionPnlReais,
          benchmarkCdiReais: incomeBenchmarkCdiReais,
          collateralCarryReais: incomeCollateralCarryReais,
          totalEconomicReturnReais: incomeTotalEconomicReturnReais,
          excessReturnVsCdiReais: incomeExcessReturnVsCdiReais,
          totalReturnToCdiMultiple: incomeTotalReturnToCdiMultiple,
          excessToCdiMultiple: incomeExcessToCdiMultiple,
          cdiRealizedYieldPct: incomeCdiYieldPct,
          cdiIsEstimated: incomeCdiIsEstimated,
          benchmarkEligibleCount: incomeBenchmarkEligibleCount,
          excludedFromBenchmarkCount: incomeExcludedFromBenchmarkCount,
          performanceQuality: incomeBenchmarkEligibleCount === 0 && incomeExcludedFromBenchmarkCount > 0 ? 'INSUFFICIENT_DATA' : incomePerformanceQuality,
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
          knownOptionPnlReais: hybridKnownOptionPnlReais,
          optionPnlReais: hybridOptionPnlReais,
          netInitialCreditDebitReais: hybridNetCredit,
          benchmarkCdiReais: hybridBenchmarkCdiReais,
          collateralCarryReais: hybridCollateralCarryReais,
          totalEconomicReturnReais: hybridTotalEconomicReturnReais,
          excessReturnVsCdiReais: hybridExcessReturnVsCdiReais,
          totalReturnToCdiMultiple: hybridTotalReturnToCdiMultiple,
          excessToCdiMultiple: hybridExcessToCdiMultiple,
          benchmarkEligibleCount: hybridBenchmarkEligibleCount,
          excludedFromBenchmarkCount: hybridExcludedFromBenchmarkCount,
          performanceQuality: hybridBenchmarkEligibleCount === 0 && hybridExcludedFromBenchmarkCount > 0 ? 'INSUFFICIENT_DATA' : hybridPerformanceQuality,
          netPnlReaisWithTax: hybridNetPnlWithTax,
          netCdiBenchmarkReais: hybridNetCdi,
          netAlphaReais: hybridNetAlphaReais,
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
 * 2. Agrupamento de Posições Existentes em Estrutura Multi-Leg (Transacional e Validado)
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

    const posIds = params.legs.map((l) => l.positionId);

    const effectiveCollateralMode = params.collateralMode || 'IDLE_CASH';

    // Validações imediatas de input
    if (effectiveCollateralMode === 'CUSTOM') {
      if (params.collateralYieldPctCDI === undefined || params.collateralYieldPctCDI === null || !Number.isFinite(params.collateralYieldPctCDI) || params.collateralYieldPctCDI < 0) {
        return { success: false, error: 'CUSTOM_COLLATERAL_PERCENT_REQUIRED: Informe um percentual válido e não-negativo (>= 0) para o CDI customizado.' };
      }
    }

    if (effectiveCollateralMode !== 'IDLE_CASH') {
      const hasCoverage = params.collateralCoveragePct !== undefined && params.collateralCoveragePct !== null;
      const hasRemunerated = params.capitalRemuneratedReais !== undefined && params.capitalRemuneratedReais !== null;
      if (!hasCoverage && !hasRemunerated) {
        return {
          success: false,
          error: 'EXPLICIT_FUNDING_SPLIT_REQUIRED: Para modalidades de colateral remunerado, é obrigatório informar explicitamente a porcentagem de cobertura ou o capital remunerado.',
        };
      }
    }

    if (params.collateralCoveragePct !== undefined && params.collateralCoveragePct !== null) {
      if (!Number.isFinite(params.collateralCoveragePct) || params.collateralCoveragePct < 0 || params.collateralCoveragePct > 100) {
        return { success: false, error: 'INVALID_COLLATERAL_COVERAGE_PERCENT: Cobertura de garantia deve estar entre 0% e 100%.' };
      }
    }

    if (params.capitalRemuneratedReais !== undefined && params.capitalRemuneratedReais !== null) {
      if (!Number.isFinite(params.capitalRemuneratedReais) || params.capitalRemuneratedReais < 0) {
        return { success: false, error: 'INVALID_REMUNERATED_CAPITAL: Capital remunerado não pode ser negativo.' };
      }
    }

    let strategyIdResult = '';

    db.transaction((tx) => {
      // 1. Leituras DENTRO da Transação para isolamento atômico e prevenção de oversubscription
      const rawPositions = tx.query.optionPositions.findMany({
        where: inArray(optionPositions.id, posIds),
      }).sync();

      if (rawPositions.length !== posIds.length) {
        throw new Error('Uma ou mais posições selecionadas não foram encontradas.');
      }

      const underlyingTicker = rawPositions[0].tickerUnderlying.toUpperCase();
      const allSameUnderlying = rawPositions.every((p) => p.tickerUnderlying.toUpperCase() === underlyingTicker);
      if (!allSameUnderlying) {
        throw new Error('Todas as pernas devem pertencer ao mesmo ativo subjacente.');
      }

      const existingLegs = tx.query.optionStrategyLegs.findMany({
        where: inArray(optionStrategyLegs.positionId, posIds),
      }).sync();

      // 2. Validação de quantidade disponível e montagem das pernas para cálculo de risco
      let netInitialCreditDebit = 0;
      const legItemsForRisk = [];
      const desiredQtyByPosId = new Map<string, number>();

      for (const legParam of params.legs) {
        const pos = rawPositions.find((p) => p.id === legParam.positionId)!;
        if (pos.status !== 'OPEN') {
          throw new Error(`CANNOT_GROUP_CLOSED_POSITION: Apenas posições abertas podem ser agrupadas em estruturas (${pos.tickerOption} está com status ${pos.status}).`);
        }

        const positionOpenQuantity = pos.openQuantity ?? Math.max(0, pos.quantity - (pos.closedQuantity ?? 0));
        if (positionOpenQuantity <= 0) {
          throw new Error(`INSUFFICIENT_FREE_OPEN_QUANTITY: Posição ${pos.tickerOption} não possui contratos abertos disponíveis.`);
        }

        const alreadyOpenAllocated = existingLegs
          .filter((l) => l.positionId === pos.id)
          .reduce(
            (sum, l) =>
              sum +
              (l.openAllocatedQuantity ??
                Math.max(0, l.allocatedQuantity - (l.closedAllocatedQuantity ?? 0))),
            0
          );

        const freeOpenQuantity = positionOpenQuantity - alreadyOpenAllocated;
        const desiredQty = legParam.allocatedQuantity !== undefined && legParam.allocatedQuantity !== null
          ? legParam.allocatedQuantity
          : freeOpenQuantity;

        if (!Number.isInteger(desiredQty) || desiredQty <= 0) {
          throw new Error(`INVALID_QUANTITY: Quantidade alocada deve ser um número inteiro positivo para ${pos.tickerOption}.`);
        }

        if (desiredQty > freeOpenQuantity) {
          throw new Error(`INSUFFICIENT_FREE_OPEN_QUANTITY: Quantidade insuficiente em ${pos.tickerOption}. Solicitado: ${desiredQty}, aberto livre disponível: ${freeOpenQuantity}.`);
        }

        desiredQtyByPosId.set(pos.id, desiredQty);

        const isShort = pos.side === 'SELL' || pos.side === 'SHORT';
        if (isShort) netInitialCreditDebit += pos.entryPrice * desiredQty;
        else netInitialCreditDebit -= pos.entryPrice * desiredQty;

        legItemsForRisk.push({
          allocatedQuantity: desiredQty,
          openAllocatedQuantity: desiredQty,
          closedAllocatedQuantity: 0,
          economicRole: legParam.economicRole || 'CUSTOM',
          position: enrichOptionPosition(pos),
        });
      }

      // 3. Validação do Capital Remunerado antes do INSERT
      const riskProfile = detectStrategyRiskAndPayoff({
        legs: legItemsForRisk as any,
        netInitialCreditDebitReais: netInitialCreditDebit,
      });
      const benchmarkCapitalReais = riskProfile.capitalReservedReais;

      let finalCapitalRemunerated: number | null = null;
      let finalCoveragePct: number | null = null;

      if (effectiveCollateralMode === 'IDLE_CASH') {
        finalCapitalRemunerated = 0;
        finalCoveragePct = null;
      } else {
        if (params.collateralCoveragePct !== undefined && params.collateralCoveragePct !== null) {
          finalCoveragePct = params.collateralCoveragePct;
          finalCapitalRemunerated = benchmarkCapitalReais * (params.collateralCoveragePct / 100);
        } else if (params.capitalRemuneratedReais !== undefined && params.capitalRemuneratedReais !== null) {
          finalCapitalRemunerated = params.capitalRemuneratedReais;
          finalCoveragePct = benchmarkCapitalReais > 0 ? (params.capitalRemuneratedReais / benchmarkCapitalReais) * 100 : null;
        }

        if (finalCapitalRemunerated !== null) {
          if (finalCapitalRemunerated < 0) {
            throw new Error('INVALID_REMUNERATED_CAPITAL: Capital remunerado não pode ser negativo.');
          }
          if (benchmarkCapitalReais > 0 && finalCapitalRemunerated > benchmarkCapitalReais + 0.01) {
            throw new Error(
              `REMUNERATED_CAPITAL_EXCEEDS_BENCHMARK: Capital remunerado (R$ ${finalCapitalRemunerated.toFixed(2)}) não pode exceder o capital de referência do benchmark (R$ ${benchmarkCapitalReais.toFixed(2)}).`
            );
          }
        }
      }

      // 4. Inserção
      const strategyId = generateId('opt_strat');
      strategyIdResult = strategyId;
      const now = new Date().toISOString();
      const openedAt = rawPositions.reduce((min, p) => (p.entryDate < min ? p.entryDate : min), rawPositions[0].entryDate);

      let detectedType = params.strategyType || 'CUSTOM_MULTI_LEG';
      let detectedBook: StrategyBook = params.book || 'HYBRID';

      const strategyName = params.name || `${underlyingTicker} — Estrutura Financiada 2:1`;

      tx.insert(optionStrategies).values({
        id: strategyId,
        portfolio: params.portfolio || rawPositions[0].portfolio || 'Principal',
        name: strategyName,
        strategyType: detectedType,
        book: detectedBook,
        underlyingTicker,
        collateralMode: effectiveCollateralMode,
        collateralYieldPctCDI: params.collateralYieldPctCDI ?? null,
        capitalRemuneratedReais: finalCapitalRemunerated,
        collateralCoveragePct: finalCoveragePct,
        status: 'OPEN',
        openedAt,
        notes: params.notes,
        createdAt: now,
        updatedAt: now,
      }).run();

      for (const legParam of params.legs) {
        const pos = rawPositions.find((p) => p.id === legParam.positionId)!;
        const allocQty = desiredQtyByPosId.get(pos.id)!;
        const legId = generateId('opt_strat_leg');

        let econRole = legParam.economicRole || 'CUSTOM';

        tx.insert(optionStrategyLegs).values({
          id: legId,
          strategyId,
          positionId: pos.id,
          allocatedQuantity: allocQty,
          economicRole: econRole,
          legacyClosedAllocatedQuantity: 0,
          closedAllocatedQuantity: 0,
          openAllocatedQuantity: allocQty,
          createdAt: now,
        }).run();

        tx.insert(strategyAllocationEvents).values({
          id: generateId('strat_ev'),
          strategyId,
          positionId: pos.id,
          eventType: 'GROUP',
          allocatedQuantity: allocQty,
          notes: `Agrupado na estrutura ${strategyName}`,
          timestamp: now,
        }).run();
      }

      // Inserir o segmento de funding inicial concreto (Bootstrap da Timeline para a nova estrutura)
      const initialFundingQuality: 'FULL' | 'INSUFFICIENT_DATA' =
        riskProfile.riskRecognitionQuality === 'UNKNOWN' ||
        riskProfile.maxLossType === 'UNBOUNDED' ||
        riskProfile.maxLossType === 'UNKNOWN'
          ? 'INSUFFICIENT_DATA'
          : 'FULL';

      tx.insert(strategyFundingSegments).values({
        id: generateId('strat_fnd_seg'),
        strategyId,
        startDate: openedAt,
        endDate: null,
        benchmarkCapitalReais,
        capitalRemuneratedReais: finalCapitalRemunerated ?? 0,
        collateralMode: effectiveCollateralMode,
        collateralPctCdi: params.collateralYieldPctCDI ?? null,
        sourceType: 'CREATION',
        quality: initialFundingQuality,
        createdAt: now,
      }).run();
    });

    safeRevalidate('/opcoes');
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

    // P0.3 (Fase 4.1.2): Verifica se a estratégia possui histórico contábil (execuções, manobras ou eventos de funding)
    const execs = await db.query.optionPositionExecutions.findMany({
      where: eq(optionPositionExecutions.strategyId, strategyId),
    });
    const maneuvers = await db.query.strategyManeuverEvents.findMany({
      where: eq(strategyManeuverEvents.strategyId, strategyId),
    });
    const fundingEvents = await db.query.strategyFundingEvents.findMany({
      where: eq(strategyFundingEvents.strategyId, strategyId),
    });

    if (execs.length > 0 || maneuvers.length > 0 || fundingEvents.length > 0) {
      return {
        success: false,
        error: 'STRATEGY_HAS_FINANCIAL_HISTORY: Esta estrutura possui histórico financeiro auditável (execuções, manobras ou alterações de funding) e não pode ser desagrupada. O histórico deve ser preservado para fins contábeis.',
      };
    }

    const legs = await db.query.optionStrategyLegs.findMany({
      where: eq(optionStrategyLegs.strategyId, strategyId),
    });

    const now = new Date().toISOString();

    db.transaction((tx) => {
      for (const leg of legs) {
        tx.insert(strategyAllocationEvents).values({
          id: generateId('strat_ev'),
          strategyId,
          positionId: leg.positionId,
          eventType: 'UNGROUP',
          allocatedQuantity: leg.allocatedQuantity,
          notes: `Desagrupado da estrutura ${existingStrategy.name}`,
          timestamp: now,
        }).run();
      }

      // Remove apenas o segmento de criação da estrutura 100% virgem antes de deletá-la
      tx.delete(strategyFundingSegments).where(eq(strategyFundingSegments.strategyId, strategyId)).run();

      // Deleta a estratégia (cascade deleta as legs, liberando as posições!)
      tx.delete(optionStrategies).where(eq(optionStrategies.id, strategyId)).run();
    });

    safeRevalidate('/opcoes');
    return { success: true };
  } catch (err: any) {
    console.error('[Options Actions] Erro ao desagrupar estratégia:', err);
    return { success: false, error: err.message || 'Erro ao desagrupar estratégia' };
  }
}

/**
 * 3.1. Edição Explícita de Funding / Remuneração da Estrutura (Prospectiva 'CHANGE')
 *
 * OBSERVAÇÃO ARQUITETURAL (Fase 4.1.2 / P1.6):
 * Esta ação realiza exclusivamente alterações PROSPECTIVAS ('CHANGE') na timeline de funding,
 * encerrando o segmento vigente e abrindo um novo a partir da data de hoje.
 * O eventType 'CORRECTION' de strategy_funding_events está estritamente reservado para
 * correções retroativas de auditoria e NÃO é executado por esta action.
 */
export async function updateOptionStrategyFundingAction(params: {
  strategyId: string;
  collateralMode: CollateralMode;
  collateralYieldPctCDI?: number | null;
  capitalRemuneratedReais?: number | null;
  collateralCoveragePct?: number | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const existingStrategy = db.query.optionStrategies.findFirst({
      where: eq(optionStrategies.id, params.strategyId),
    }).sync();

    if (!existingStrategy) {
      return { success: false, error: 'Estrutura não encontrada.' };
    }

    if (params.collateralMode === 'CUSTOM') {
      if (params.collateralYieldPctCDI === undefined || params.collateralYieldPctCDI === null || !Number.isFinite(params.collateralYieldPctCDI) || params.collateralYieldPctCDI < 0) {
        return { success: false, error: 'CUSTOM_COLLATERAL_PERCENT_REQUIRED: Informe um percentual válido e não-negativo (>= 0) para o CDI customizado.' };
      }
    }

    if (params.collateralCoveragePct !== undefined && params.collateralCoveragePct !== null) {
      if (!Number.isFinite(params.collateralCoveragePct) || params.collateralCoveragePct < 0 || params.collateralCoveragePct > 100) {
        return { success: false, error: 'INVALID_COLLATERAL_COVERAGE_PERCENT: Cobertura de garantia deve estar entre 0% e 100%.' };
      }
    }

    if (params.capitalRemuneratedReais !== undefined && params.capitalRemuneratedReais !== null) {
      if (!Number.isFinite(params.capitalRemuneratedReais) || params.capitalRemuneratedReais < 0) {
        return { success: false, error: 'INVALID_REMUNERATED_CAPITAL: Capital remunerado deve ser um número finito não-negativo.' };
      }
    }

    if (params.collateralMode !== 'IDLE_CASH') {
      const hasCoverage = params.collateralCoveragePct !== undefined && params.collateralCoveragePct !== null;
      const hasReais = params.capitalRemuneratedReais !== undefined && params.capitalRemuneratedReais !== null;
      if (!hasCoverage && !hasReais) {
        return {
          success: false,
          error: 'EXPLICIT_FUNDING_SPLIT_REQUIRED: Modo de funding remunerado exige cobertura percentual ou capital em R$ explícito.',
        };
      }
    }

    const legs = db.query.optionStrategyLegs.findMany({
      where: eq(optionStrategyLegs.strategyId, params.strategyId),
    }).sync();

    const posIds = legs.map((l) => l.positionId);
    const rawPositions = db.query.optionPositions.findMany({
      where: inArray(optionPositions.id, posIds),
    }).sync();

    let netInitialCreditDebit = 0;
    const legItemsForRisk = [];

    for (const leg of legs) {
      const pos = rawPositions.find((p) => p.id === leg.positionId);
      if (pos) {
        const isShort = pos.side === 'SELL' || pos.side === 'SHORT';
        if (isShort) netInitialCreditDebit += pos.entryPrice * leg.allocatedQuantity;
        else netInitialCreditDebit -= pos.entryPrice * leg.allocatedQuantity;

        legItemsForRisk.push({
          allocatedQuantity: leg.allocatedQuantity,
          economicRole: leg.economicRole,
          position: enrichOptionPosition(pos),
        });
      }
    }

    const riskProfile = detectStrategyRiskAndPayoff({
      legs: legItemsForRisk as any,
      netInitialCreditDebitReais: netInitialCreditDebit,
    });
    const benchmarkCapitalReais = riskProfile.capitalReservedReais;

    let finalCapitalRemunerated = params.capitalRemuneratedReais;
    if (params.collateralMode === 'IDLE_CASH') {
      finalCapitalRemunerated = 0;
    } else if (params.collateralCoveragePct !== undefined && params.collateralCoveragePct !== null) {
      finalCapitalRemunerated = benchmarkCapitalReais * (params.collateralCoveragePct / 100);
    }

    if (finalCapitalRemunerated !== undefined && finalCapitalRemunerated !== null) {
      if (finalCapitalRemunerated < 0) {
        return { success: false, error: 'INVALID_REMUNERATED_CAPITAL: Capital remunerado não pode ser negativo.' };
      }
      if (benchmarkCapitalReais > 0 && finalCapitalRemunerated > benchmarkCapitalReais + 0.01) {
        return {
          success: false,
          error: `REMUNERATED_CAPITAL_EXCEEDS_BENCHMARK: Capital remunerado (R$ ${finalCapitalRemunerated.toFixed(2)}) não pode exceder o capital de referência do benchmark (R$ ${benchmarkCapitalReais.toFixed(2)}).`,
        };
      }
    }

    const effectiveDate = getBrazilTodayDate();
    const now = new Date().toISOString();

    db.transaction((tx) => {
      // 1. Ler o segmento vigente aberto
      const openSegment = tx.query.strategyFundingSegments.findFirst({
        where: and(
          eq(strategyFundingSegments.strategyId, params.strategyId),
          isNull(strategyFundingSegments.endDate)
        ),
      }).sync();

      // 2. Criar strategy_funding_event CHANGE
      const fundingEventId = generateId('strat_fnd_ev');
      tx.insert(strategyFundingEvents).values({
        id: fundingEventId,
        strategyId: params.strategyId,
        eventType: 'CHANGE',
        effectiveDate,
        previousCollateralMode: existingStrategy.collateralMode || 'IDLE_CASH',
        newCollateralMode: params.collateralMode,
        previousCoveragePct: existingStrategy.collateralCoveragePct,
        newCoveragePct: params.collateralCoveragePct ?? null,
        previousCapitalRemunerated: existingStrategy.capitalRemuneratedReais,
        newCapitalRemunerated: finalCapitalRemunerated ?? 0,
        previousPctCdi: existingStrategy.collateralYieldPctCDI,
        newPctCdi: params.collateralYieldPctCDI ?? null,
        notes: 'Alteração prospectiva de funding via interface',
        createdAt: now,
      }).run();

      // 3. Fechar segmento vigente em effectiveDate
      if (openSegment) {
        tx.update(strategyFundingSegments)
          .set({ endDate: effectiveDate })
          .where(eq(strategyFundingSegments.id, openSegment.id))
          .run();
      }

      // 4. Abrir novo segmento de funding
      tx.insert(strategyFundingSegments).values({
        id: generateId('strat_fnd_seg'),
        strategyId: params.strategyId,
        startDate: effectiveDate,
        endDate: null,
        benchmarkCapitalReais,
        capitalRemuneratedReais: finalCapitalRemunerated ?? 0,
        collateralMode: params.collateralMode,
        collateralPctCdi: params.collateralYieldPctCDI ?? null,
        sourceType: 'FUNDING_CHANGE',
        fundingEventId,
        quality: 'FULL',
        createdAt: now,
      }).run();

      // 5. Atualizar snapshot da option_strategy
      tx.update(optionStrategies)
        .set({
          collateralMode: params.collateralMode,
          collateralYieldPctCDI: params.collateralYieldPctCDI ?? null,
          capitalRemuneratedReais: finalCapitalRemunerated ?? null,
          collateralCoveragePct: params.collateralCoveragePct ?? null,
          updatedAt: now,
        })
        .where(eq(optionStrategies.id, params.strategyId))
        .run();
    });

    safeRevalidate('/opcoes');
    return { success: true };
  } catch (err: any) {
    console.error('[Options Actions] Erro ao atualizar funding da estratégia:', err);
    return { success: false, error: err.message || 'Erro ao atualizar funding da estratégia' };
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
    // P0.4 (Fase 4.1.2): Bloqueia criação direta como CLOSED para preservar a identidade canônica
    if (data.status === 'CLOSED') {
      return {
        success: false,
        error: 'DIRECT_CLOSED_CREATION_NOT_SUPPORTED: Criação direta de posições fechadas não é suportada. Cadastre a posição como OPEN e utilize o fluxo de encerramento canônico.',
      };
    }

    // Boundary Validation: entryDate deve ser dia útil de pregão B3
    if (!isB3TradingDay(data.entryDate as BusinessDate)) {
      return {
        success: false,
        error: 'INVALID_ENTRY_DATE_NON_TRADING_DAY: A data de entrada deve corresponder a um pregão válido da B3.',
      };
    }

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
      legacyClosedQuantity: 0,
      legacyQuality: null,
      closedQuantity: 0,
      openQuantity: data.quantity,
      realizedPnlReais: 0,
      strike: data.strike,
      entryPrice: data.entryPrice,
      currentPrice: data.currentPrice || data.entryPrice,
      underlyingEntrySpot: data.underlyingEntrySpot,
      underlyingCurrentSpot: data.underlyingCurrentSpot || data.underlyingEntrySpot,
      entryDate: data.entryDate,
      expirationDate: data.expirationDate,
      allocatedCapital,
      status: 'OPEN',
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

    safeRevalidate('/opcoes');
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
    safeRevalidate('/opcoes');
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

    // Boundary Validation: entryDate deve ser dia útil de pregão B3 se fornecida
    if (data.entryDate !== undefined && !isB3TradingDay(data.entryDate as BusinessDate)) {
      return {
        success: false,
        error: 'INVALID_ENTRY_DATE_NON_TRADING_DAY: A data de entrada deve corresponder a um pregão válido da B3.',
      };
    }

    let openQuantity = current.openQuantity ?? current.quantity;
    let closedQuantity = current.closedQuantity ?? 0;
    let legacyClosedQuantity = current.legacyClosedQuantity ?? 0;

    // P0.3: Proteção de Imutabilidade da Quantidade Original
    if (data.quantity !== undefined && data.quantity !== current.quantity) {
      // 1. Verifica se a posição possui execuções reais
      const executions = await db.query.optionPositionExecutions.findMany({
        where: eq(optionPositionExecutions.positionId, id),
      });
      // 2. Verifica se a posição possui alocações em pernas de estruturas
      const activeLegs = await db.query.optionStrategyLegs.findMany({
        where: eq(optionStrategyLegs.positionId, id),
      });

      const isVirgin = executions.length === 0 && activeLegs.length === 0 && closedQuantity === 0 && current.status === 'OPEN';

      if (!isVirgin) {
        return {
          success: false,
          error: 'QUANTITY_IMMUTABLE: A quantidade original não pode ser alterada porque a posição possui execuções, alocações ou fechamentos registrados.',
        };
      }

      if (data.quantity <= 0) {
        return {
          success: false,
          error: 'INVALID_QUANTITY: A quantidade deve ser um número inteiro positivo.',
        };
      }

      // Para correção estrita de posição virgem: atualiza atomicamente quantity e openQuantity
      openQuantity = data.quantity;
      closedQuantity = 0;
      legacyClosedQuantity = 0;
    }

    const targetQuantity = data.quantity !== undefined ? data.quantity : current.quantity;
    if (openQuantity < 0 || openQuantity > targetQuantity) {
      return {
        success: false,
        error: `INVARIANT_VIOLATION: openQuantity (${openQuantity}) deve ser >= 0 e <= quantity (${targetQuantity}).`,
      };
    }

    const strike = data.strike !== undefined ? data.strike : current.strike;
    const quantity = targetQuantity;
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
      quantity,
      openQuantity,
      closedQuantity,
      legacyClosedQuantity,
      allocatedCapital,
      breakEven: data.breakEven || breakEven,
      cdiRateAnnual: data.cdiRateAnnual !== undefined ? toAnnualRateDecimal(data.cdiRateAnnual) : current.cdiRateAnnual,
      updatedAt: new Date().toISOString(),
    }).where(eq(optionPositions.id, id));

    safeRevalidate('/opcoes');
    return { success: true };
  } catch (err: any) {
    console.error('[Options Actions] Erro ao atualizar posição completa:', err);
    return { success: false, error: err.message || 'Erro ao atualizar' };
  }
}

/**
 * 6. Encerra / Realiza a Posição Avulsa (Full Close Canônico com Geração de Executions)
 */
export async function closeOptionPosition(params: {
  id: string;
  exitPrice: number;
  exitDate?: string;
  status: 'CLOSED' | 'EXERCISED' | 'EXPIRED_WORTHLESS' | 'ROLLED';
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (params.status === 'EXERCISED' || params.status === 'ROLLED') {
      return {
        success: false,
        error: `NOT_SUPPORTED: Encerramento com status '${params.status}' não é suportado diretamente em posições avulsas nesta versão.`,
      };
    }

    const pos = await db.query.optionPositions.findFirst({
      where: eq(optionPositions.id, params.id),
    });
    if (!pos) {
      return { success: false, error: 'Posição não encontrada.' };
    }

    const openQuantity = pos.openQuantity ?? (pos.status === 'CLOSED' ? 0 : pos.quantity);
    if (openQuantity <= 0 || pos.status === 'CLOSED') {
      return { success: false, error: 'POSITION_ALREADY_CLOSED: A posição já se encontra totalmente encerrada.' };
    }

    // Verifica se há alocação ativa em pernas de estruturas
    const activeLegs = await db.query.optionStrategyLegs.findMany({
      where: eq(optionStrategyLegs.positionId, params.id),
    });
    const totalAllocated = activeLegs.reduce((sum, leg) => sum + (leg.openAllocatedQuantity ?? leg.allocatedQuantity), 0);
    if (totalAllocated > 0) {
      return {
        success: false,
        error: 'POSITION_ALLOCATED_TO_STRATEGY: A posição possui quantidade ativa em uma estrutura e deve ser encerrada pelo manejo da estratégia.',
      };
    }

    const isSell = pos.side === 'SELL' || pos.side === 'SHORT';
    let executionType: 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE' | 'EXPIRE_WORTHLESS' = isSell ? 'BUY_TO_CLOSE' : 'SELL_TO_CLOSE';
    let effectivePrice = params.exitPrice;
    const exitDate = params.exitDate || getBrazilTodayDate();

    if (params.status === 'EXPIRED_WORTHLESS') {
      executionType = 'EXPIRE_WORTHLESS';
      effectivePrice = 0;

      // P0: Invariante Temporal estrito: pó só ocorre no vencimento ou após
      if (exitDate < pos.expirationDate) {
        return {
          success: false,
          error: `EXPIRE_BEFORE_EXPIRATION_NOT_ALLOWED: Uma opção só pode expirar como pó no vencimento ou após o vencimento (exitDate ${exitDate} < expirationDate ${pos.expirationDate}). Para encerramento antecipado, utilize o fechamento a mercado.`,
        };
      }
    } else if (params.status === 'CLOSED') {
      // P0: Validações estritas de preço e datas para encerramento a mercado
      if (!Number.isFinite(params.exitPrice) || params.exitPrice < 0) {
        return {
          success: false,
          error: 'INVALID_EXIT_PRICE: O preço de saída deve ser um número finito maior ou igual a zero.',
        };
      }

      if (!isB3TradingDay(exitDate as BusinessDate)) {
        return {
          success: false,
          error: 'INVALID_EXIT_DATE_NON_TRADING_DAY: A data de saída deve corresponder a um pregão válido da B3.',
        };
      }

      if (exitDate < pos.entryDate) {
        return {
          success: false,
          error: `EXIT_DATE_BEFORE_ENTRY_DATE: A data de saída (${exitDate}) não pode ser anterior à data de entrada da posição (${pos.entryDate}).`,
        };
      }
    }

    const unitPnl = isSell ? (pos.entryPrice - effectivePrice) : (effectivePrice - pos.entryPrice);
    const realizedPnlDelta = Math.round(unitPnl * openQuantity * 100) / 100;
    const newTotalRealizedPnl = Math.round(((pos.realizedPnlReais ?? 0) + realizedPnlDelta) * 100) / 100;
    const newClosedQuantity = (pos.closedQuantity ?? 0) + openQuantity;

    const execId = generateId('opt_pos_exec');
    const now = new Date().toISOString();

    db.transaction((tx) => {
      tx.insert(optionPositionExecutions).values({
        id: execId,
        positionId: params.id,
        executionType,
        quantity: openQuantity,
        price: effectivePrice,
        executionDate: exitDate,
        entryPriceBasisReais: pos.entryPrice,
        grossRealizedPnlReais: realizedPnlDelta,
        netRealizedPnlReais: realizedPnlDelta,
        source: 'USER_MANUAL',
        createdAt: now,
      }).run();

      tx.update(optionPositions).set({
        status: params.status,
        openQuantity: 0,
        closedQuantity: newClosedQuantity,
realizedPnlReais: newTotalRealizedPnl,
        exitPrice: effectivePrice,
        exitDate,
        notes: params.notes ?? pos.notes,
        updatedAt: now,
      }).where(eq(optionPositions.id, params.id)).run();
    });

    safeRevalidate('/opcoes');
    return { success: true };
  } catch (err: any) {
    console.error('[Options Actions] Erro ao encerrar posição canonicamente:', err);
    return { success: false, error: err.message || 'Erro ao encerrar posição' };
  }
}

// ─── Proportional & Maneuver Actions (Backed by Shared Pure Planner) ─

export interface PartialCloseStrategyLegParams {
  strategyId: string;
  strategyLegId: string;
  quantity: number;
  price: number;
  executionDate?: string;
  feesReais?: number;
  notes?: string;
  previewFingerprint?: string;
}

/**
 * Simula o encerramento parcial de uma perna (LEG_CLOSE) sem qualquer escrita no banco.
 */
export async function previewPartialCloseStrategyLegAction(
  params: PartialCloseStrategyLegParams
): Promise<{ success: true; plan: ManeuverPlan } | { success: false; error: string; errorCode: string }> {
  try {
    if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
      return { success: false, error: 'INVALID_QUANTITY: Quantidade deve ser um número inteiro positivo.', errorCode: 'INVALID_QUANTITY' };
    }
    if (!Number.isFinite(params.price) || params.price < 0) {
      return { success: false, error: 'INVALID_PRICE: Preço deve ser um número finito não negativo.', errorCode: 'INVALID_PRICE' };
    }
    const fees = params.feesReais !== undefined ? params.feesReais : 0;
    if (!Number.isFinite(fees) || fees < 0) {
      return { success: false, error: 'INVALID_FEES: Custos devem ser um número finito não negativo.', errorCode: 'INVALID_FEES' };
    }

    const executionDate = params.executionDate || getBrazilTodayDate();
    if (!isB3TradingDay(executionDate as BusinessDate)) {
      return { success: false, error: 'INVALID_EXECUTION_DATE_NON_TRADING_DAY: A data de execução deve corresponder a um pregão válido da B3.', errorCode: 'INVALID_EXECUTION_DATE_NON_TRADING_DAY' };
    }

    const strategy = await db.query.optionStrategies.findFirst({
      where: eq(optionStrategies.id, params.strategyId),
    });
    if (!strategy) {
      return { success: false, error: 'STRATEGY_NOT_FOUND: Estratégia não encontrada.', errorCode: 'STRATEGY_NOT_FOUND' };
    }

    const allLegs = await db.query.optionStrategyLegs.findMany({
      where: eq(optionStrategyLegs.strategyId, params.strategyId),
      orderBy: [asc(optionStrategyLegs.id)],
    });
    const targetLeg = allLegs.find((l) => l.id === params.strategyLegId);
    if (!targetLeg) {
      return { success: false, error: 'STRATEGY_LEG_NOT_FOUND: Perna não encontrada na estratégia.', errorCode: 'STRATEGY_LEG_NOT_FOUND' };
    }

    const positionsMap = new Map<string, OptionPosition>();
    for (const leg of allLegs) {
      const pos = await db.query.optionPositions.findFirst({
        where: eq(optionPositions.id, leg.positionId),
      });
      if (pos) positionsMap.set(leg.positionId, pos);
    }

    const openSegment = await db.query.strategyFundingSegments.findFirst({
      where: and(
        eq(strategyFundingSegments.strategyId, params.strategyId),
        isNull(strategyFundingSegments.endDate)
      ),
    });

    return buildPartialLegCloseManeuverPlan({
      strategy,
      allLegs,
      targetLeg,
      positionsMap,
      openSegment,
      quantity: params.quantity,
      price: params.price,
      feesReais: params.feesReais || 0,
      executionDate,
      notes: params.notes,
    });
  } catch (err: any) {
    console.error('[Options Actions] Erro ao simular LEG_CLOSE:', err);
    return { success: false, error: err.message || 'Erro ao simular LEG_CLOSE', errorCode: 'INTERNAL_ERROR' };
  }
}

/**
 * Encerra parcial ou totalmente uma perna específica de uma estratégia (LEG_CLOSE)
 * Protegido por Preview Fingerprint Stale Guard e Condicionais SQL Exactly-Once.
 */
export async function partialCloseStrategyLegAction(
  params: PartialCloseStrategyLegParams
): Promise<{ success: boolean; maneuverEventId?: string; executionId?: string; error?: string; errorCode?: string }> {
  try {
    if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
      return { success: false, error: 'INVALID_QUANTITY: Quantidade deve ser um número inteiro positivo.', errorCode: 'INVALID_QUANTITY' };
    }
    if (!Number.isFinite(params.price) || params.price < 0) {
      return { success: false, error: 'INVALID_PRICE: Preço deve ser um número finito não negativo.', errorCode: 'INVALID_PRICE' };
    }
    const fees = params.feesReais !== undefined ? params.feesReais : 0;
    if (!Number.isFinite(fees) || fees < 0) {
      return { success: false, error: 'INVALID_FEES: Custos devem ser um número finito não negativo.', errorCode: 'INVALID_FEES' };
    }

    const executionDate = params.executionDate || getBrazilTodayDate();
    if (!isB3TradingDay(executionDate as BusinessDate)) {
      return { success: false, error: 'INVALID_EXECUTION_DATE_NON_TRADING_DAY: A data de execução deve corresponder a um pregão válido da B3.', errorCode: 'INVALID_EXECUTION_DATE_NON_TRADING_DAY' };
    }

    const maneuverEventId = generateId('strat_mnv');
    const execId = generateId('opt_pos_exec');
    const now = new Date().toISOString();

    const txRes = db.transaction((tx) => {
      // 1. Recarregar estado dentro da transaction
      const strategy = tx.query.optionStrategies.findFirst({
        where: eq(optionStrategies.id, params.strategyId),
      }).sync();
      if (!strategy) {
        return { success: false, error: 'STRATEGY_NOT_FOUND: Estratégia não encontrada.', errorCode: 'STRATEGY_NOT_FOUND' };
      }
      if (strategy.status !== 'OPEN') {
        return { success: false, error: 'STRATEGY_NOT_OPEN: A estratégia não está aberta para manobras.', errorCode: 'STRATEGY_NOT_OPEN' };
      }

      const allLegs = tx.query.optionStrategyLegs.findMany({
        where: eq(optionStrategyLegs.strategyId, params.strategyId),
        orderBy: [asc(optionStrategyLegs.id)],
      }).sync();

      const targetLeg = allLegs.find((l) => l.id === params.strategyLegId);
      if (!targetLeg) {
        return { success: false, error: 'STRATEGY_LEG_NOT_FOUND: Perna não encontrada na estratégia.', errorCode: 'STRATEGY_LEG_NOT_FOUND' };
      }

      const positionsMap = new Map<string, OptionPosition>();
      for (const leg of allLegs) {
        const pos = tx.query.optionPositions.findFirst({
          where: eq(optionPositions.id, leg.positionId),
        }).sync();
        if (pos) positionsMap.set(leg.positionId, pos);
      }

      const openSegment = tx.query.strategyFundingSegments.findFirst({
        where: and(
          eq(strategyFundingSegments.strategyId, params.strategyId),
          isNull(strategyFundingSegments.endDate)
        ),
      }).sync();

      // 2. Executar o MESMO planner puro compartilhado
      const planResult = buildPartialLegCloseManeuverPlan({
        strategy,
        allLegs,
        targetLeg,
        positionsMap,
        openSegment,
        quantity: params.quantity,
        price: params.price,
        feesReais: params.feesReais || 0,
        executionDate,
        notes: params.notes,
      });

      if (!planResult.success) {
        return { success: false, error: planResult.error, errorCode: planResult.errorCode };
      }

      const plan = planResult.plan;

      // 3. Validação de Stale Preview (P0)
      if (params.previewFingerprint && params.previewFingerprint !== plan.previewFingerprint) {
        return {
          success: false,
          errorCode: 'STALE_MANEUVER_PREVIEW',
          error: 'STALE_MANEUVER_PREVIEW: A estrutura mudou desde a simulação. Gere um novo preview antes de confirmar.',
        };
      }

      const exec = plan.executions[0];
      const pos = positionsMap.get(exec.positionId)!;

      // 4. Inserir Strategy Maneuver Event PRIMEIRO (Precedência estrita)
      tx.insert(strategyManeuverEvents).values({
        id: maneuverEventId,
        strategyId: params.strategyId,
        maneuverType: 'LEG_CLOSE',
        percentageReduced: null,
        unitsReduced: null,
        executionDate,
        auditRealizedPnlReais: plan.grossRealizedPnlReais,
        auditCapitalReleasedReais: plan.capitalReleasedReais,
        auditRatioBefore: plan.ratioBefore,
        auditRatioAfter: plan.ratioAfter,
        preservesOriginalRatio: plan.preservesOriginalRatio,
        notes: params.notes || `Fechamento parcial de ${params.quantity} unidades da perna ${pos.tickerOption}`,
        createdAt: now,
      }).run();

      // 5. Inserir execution com mesmo maneuverEventId
      tx.insert(optionPositionExecutions).values({
        id: execId,
        positionId: pos.id,
        strategyId: params.strategyId,
        strategyLegId: targetLeg.id,
        maneuverEventId,
        executionType: exec.executionType,
        quantity: exec.quantity,
        price: exec.price,
        executionDate,
        entryPriceBasisReais: pos.entryPrice,
        grossRealizedPnlReais: exec.grossRealizedPnlReais,
        feesReais: exec.feesReais,
        netRealizedPnlReais: exec.netRealizedPnlReais,
        source: 'USER_MANUAL',
        notes: params.notes,
        createdAt: now,
      }).run();

      // 6. Conditional SQL update da leg com expectedLegOpenBefore (P0 Anti-Double-Submit)
      const legRes = tx.run(sql`
        UPDATE option_strategy_legs
        SET open_allocated_quantity = open_allocated_quantity - ${exec.quantity},
            closed_allocated_quantity = closed_allocated_quantity + ${exec.quantity}
        WHERE id = ${targetLeg.id}
          AND open_allocated_quantity = ${exec.expectedLegOpenBefore}
          AND open_allocated_quantity >= ${exec.quantity}
      `);
      if (legRes.changes !== 1) {
        throw new Error('CONCURRENT_MODIFICATION_OR_INSUFFICIENT_QUANTITY: Concorrência detectada ou saldo já modificado na perna.');
      }

      // 7. Conditional SQL update da position com expectedPositionOpenBefore (P0 Anti-Double-Submit)
      const posRes = tx.run(sql`
        UPDATE option_positions
        SET open_quantity = open_quantity - ${exec.quantity},
            closed_quantity = closed_quantity + ${exec.quantity},
            realized_pnl_reais = realized_pnl_reais + ${exec.netRealizedPnlReais},
            status = CASE WHEN open_quantity - ${exec.quantity} = 0 THEN 'CLOSED' ELSE status END,
            exit_date = CASE WHEN open_quantity - ${exec.quantity} = 0 THEN ${executionDate} ELSE exit_date END,
            exit_price = CASE WHEN open_quantity - ${exec.quantity} = 0 THEN ${exec.price} ELSE exit_price END,
            updated_at = ${now}
        WHERE id = ${pos.id}
          AND open_quantity = ${exec.expectedPositionOpenBefore}
          AND open_quantity >= ${exec.quantity}
      `);
      if (posRes.changes !== 1) {
        throw new Error('CONCURRENT_MODIFICATION_OR_INSUFFICIENT_QUANTITY: Concorrência detectada ou saldo já modificado na posição.');
      }

      // 8. Transição de Funding
      if (openSegment) {
        tx.update(strategyFundingSegments)
          .set({ endDate: executionDate })
          .where(eq(strategyFundingSegments.id, openSegment.id))
          .run();
      }

      if (plan.strategyWillClose) {
        tx.update(optionStrategies).set({
          status: 'CLOSED',
          closedAt: executionDate,
          capitalRemuneratedReais: 0,
          updatedAt: now,
        }).where(eq(optionStrategies.id, params.strategyId)).run();
      } else {
        const residualRisk = plan.afterRisk;
        const newBenchmarkCapital = plan.afterBenchmarkCapitalReais;
        let newSegmentQuality = openSegment ? openSegment.quality : 'FULL';

        if (residualRisk.riskRecognitionQuality === 'UNKNOWN' || residualRisk.maxLossType === 'UNBOUNDED') {
          newSegmentQuality = 'INSUFFICIENT_DATA';
        }

        let newCapitalRemunerated = 0;
        const currentMode = openSegment ? openSegment.collateralMode : (strategy.collateralMode || 'IDLE_CASH');
        const currentCoveragePct = strategy.collateralCoveragePct;

        if (currentMode === 'IDLE_CASH') {
          newCapitalRemunerated = 0;
        } else if (currentCoveragePct !== null && currentCoveragePct !== undefined) {
          newCapitalRemunerated = (newBenchmarkCapital * currentCoveragePct) / 100.0;
        } else if (openSegment) {
          newCapitalRemunerated = Math.min(openSegment.capitalRemuneratedReais, newBenchmarkCapital);
        } else {
          newCapitalRemunerated = newBenchmarkCapital;
        }

        tx.insert(strategyFundingSegments).values({
          id: generateId('strat_fnd_seg'),
          strategyId: params.strategyId,
          startDate: executionDate,
          endDate: null,
          benchmarkCapitalReais: newBenchmarkCapital,
          capitalRemuneratedReais: newCapitalRemunerated,
          collateralMode: currentMode,
          collateralPctCdi: openSegment ? openSegment.collateralPctCdi : strategy.collateralYieldPctCDI,
          sourceType: 'MANEUVER',
          maneuverEventId,
          quality: newSegmentQuality,
          createdAt: now,
        }).run();

        tx.update(optionStrategies).set({
          capitalRemuneratedReais: newCapitalRemunerated,
          collateralMode: currentMode,
          updatedAt: now,
        }).where(eq(optionStrategies.id, params.strategyId)).run();
      }

      return { success: true, maneuverEventId, executionId: execId };
    });

    if (txRes.success) {
      safeRevalidate('/opcoes');
    }
    return txRes;
  } catch (err: any) {
    console.error('[Options Actions] Erro em partialCloseStrategyLegAction:', err);
    return {
      success: false,
      error: err.message || 'Erro ao fechar perna da estratégia',
      errorCode: err.message?.startsWith('STALE') ? 'STALE_MANEUVER_PREVIEW' : 'INTERNAL_ERROR',
    };
  }
}

export interface ScaleDownOptionStrategyParams {
  strategyId: string;
  percentageReduced: number;
  executionDate?: string;
  legs: Array<{
    strategyLegId: string;
    price: number;
    feesReais?: number;
  }>;
  notes?: string;
  previewFingerprint?: string;
}

/**
 * Simula a redução proporcional da estratégia (SCALE_DOWN) sem qualquer escrita no banco.
 */
export async function previewScaleDownStrategyAction(
  params: ScaleDownOptionStrategyParams
): Promise<{ success: true; plan: ManeuverPlan } | { success: false; error: string; errorCode: string }> {
  try {
    if (!Number.isFinite(params.percentageReduced) || params.percentageReduced <= 0 || params.percentageReduced >= 100) {
      return {
        success: false,
        errorCode: 'INVALID_SCALE_DOWN_PERCENTAGE',
        error: 'INVALID_SCALE_DOWN_PERCENTAGE: A porcentagem de redução deve estar entre 0% e 100% (exclusivos). Para encerramento total (100%), utilize o fechamento completo da estratégia.',
      };
    }

    const executionDate = params.executionDate || getBrazilTodayDate();
    if (!isB3TradingDay(executionDate as BusinessDate)) {
      return { success: false, error: 'INVALID_EXECUTION_DATE_NON_TRADING_DAY: A data de execução deve corresponder a um pregão válido da B3.', errorCode: 'INVALID_EXECUTION_DATE_NON_TRADING_DAY' };
    }

    const strategy = await db.query.optionStrategies.findFirst({
      where: eq(optionStrategies.id, params.strategyId),
    });
    if (!strategy) {
      return { success: false, error: 'STRATEGY_NOT_FOUND: Estratégia não encontrada.', errorCode: 'STRATEGY_NOT_FOUND' };
    }

    const allLegs = await db.query.optionStrategyLegs.findMany({
      where: eq(optionStrategyLegs.strategyId, params.strategyId),
      orderBy: [asc(optionStrategyLegs.id)],
    });
    const openLegs = allLegs.filter((l) => {
      const openQty = l.openAllocatedQuantity ?? Math.max(0, l.allocatedQuantity - (l.closedAllocatedQuantity ?? 0));
      return openQty > 0;
    });

    const positionsMap = new Map<string, OptionPosition>();
    for (const leg of allLegs) {
      const pos = await db.query.optionPositions.findFirst({
        where: eq(optionPositions.id, leg.positionId),
      });
      if (pos) positionsMap.set(leg.positionId, pos);
    }

    const openSegment = await db.query.strategyFundingSegments.findFirst({
      where: and(
        eq(strategyFundingSegments.strategyId, params.strategyId),
        isNull(strategyFundingSegments.endDate)
      ),
    });

    return buildScaleDownManeuverPlan({
      strategy,
      allLegs,
      openLegs,
      positionsMap,
      openSegment,
      percentageReduced: params.percentageReduced,
      executionDate,
      legInputs: params.legs || [],
      notes: params.notes,
    });
  } catch (err: any) {
    console.error('[Options Actions] Erro ao simular SCALE_DOWN:', err);
    return { success: false, error: err.message || 'Erro ao simular SCALE_DOWN', errorCode: 'INTERNAL_ERROR' };
  }
}

/**
 * Reduz proporcionalmente todas as pernas abertas de uma estratégia (SCALE_DOWN)
 * Protegido por Preview Fingerprint Stale Guard e Condicionais SQL Exactly-Once.
 */
export async function scaleDownOptionStrategyAction(
  params: ScaleDownOptionStrategyParams
): Promise<{ success: boolean; maneuverEventId?: string; error?: string; errorCode?: string }> {
  try {
    if (!Number.isFinite(params.percentageReduced) || params.percentageReduced <= 0 || params.percentageReduced >= 100) {
      return {
        success: false,
        errorCode: 'INVALID_SCALE_DOWN_PERCENTAGE',
        error: 'INVALID_SCALE_DOWN_PERCENTAGE: A porcentagem de redução deve estar entre 0% e 100% (exclusivos). Para encerramento total (100%), utilize o fechamento completo da estratégia.',
      };
    }

    const executionDate = params.executionDate || getBrazilTodayDate();
    if (!isB3TradingDay(executionDate as BusinessDate)) {
      return { success: false, error: 'INVALID_EXECUTION_DATE_NON_TRADING_DAY: A data de execução deve corresponder a um pregão válido da B3.', errorCode: 'INVALID_EXECUTION_DATE_NON_TRADING_DAY' };
    }

    const maneuverEventId = generateId('strat_mnv');
    const now = new Date().toISOString();

    const txRes = db.transaction((tx) => {
      // 1. Recarregar dentro da transaction
      const strategy = tx.query.optionStrategies.findFirst({
        where: eq(optionStrategies.id, params.strategyId),
      }).sync();
      if (!strategy) {
        return { success: false, error: 'STRATEGY_NOT_FOUND: Estratégia não encontrada.', errorCode: 'STRATEGY_NOT_FOUND' };
      }
      if (strategy.status !== 'OPEN') {
        return { success: false, error: 'STRATEGY_NOT_OPEN: A estratégia não está aberta para manobras.', errorCode: 'STRATEGY_NOT_OPEN' };
      }

      const allLegs = tx.query.optionStrategyLegs.findMany({
        where: eq(optionStrategyLegs.strategyId, params.strategyId),
        orderBy: [asc(optionStrategyLegs.id)],
      }).sync();

      const openLegs = allLegs.filter((l) => {
        const openQty = l.openAllocatedQuantity ?? Math.max(0, l.allocatedQuantity - (l.closedAllocatedQuantity ?? 0));
        return openQty > 0;
      });

      const positionsMap = new Map<string, OptionPosition>();
      for (const leg of allLegs) {
        const pos = tx.query.optionPositions.findFirst({
          where: eq(optionPositions.id, leg.positionId),
        }).sync();
        if (pos) positionsMap.set(leg.positionId, pos);
      }

      const openSegment = tx.query.strategyFundingSegments.findFirst({
        where: and(
          eq(strategyFundingSegments.strategyId, params.strategyId),
          isNull(strategyFundingSegments.endDate)
        ),
      }).sync();

      // 2. Executar o MESMO planner puro compartilhado
      const planResult = buildScaleDownManeuverPlan({
        strategy,
        allLegs,
        openLegs,
        positionsMap,
        openSegment,
        percentageReduced: params.percentageReduced,
        executionDate,
        legInputs: params.legs || [],
        notes: params.notes,
      });

      if (!planResult.success) {
        return { success: false, error: planResult.error, errorCode: planResult.errorCode };
      }

      const plan = planResult.plan;

      // 3. Validação de Stale Preview (P0)
      if (params.previewFingerprint && params.previewFingerprint !== plan.previewFingerprint) {
        return {
          success: false,
          errorCode: 'STALE_MANEUVER_PREVIEW',
          error: 'STALE_MANEUVER_PREVIEW: A estrutura mudou desde a simulação. Gere um novo preview antes de confirmar.',
        };
      }

      // 4. Inserir Strategy Maneuver Event PRIMEIRO (Precedência estrita)
      tx.insert(strategyManeuverEvents).values({
        id: maneuverEventId,
        strategyId: params.strategyId,
        maneuverType: 'SCALE_DOWN',
        percentageReduced: plan.percentageReduced,
        unitsReduced: plan.unitsReduced,
        executionDate,
        auditRealizedPnlReais: plan.grossRealizedPnlReais,
        auditCapitalReleasedReais: plan.capitalReleasedReais,
        auditRatioBefore: plan.ratioBefore,
        auditRatioAfter: plan.ratioAfter,
        preservesOriginalRatio: plan.preservesOriginalRatio,
        notes: params.notes || `Redução proporcional de ${plan.percentageReduced}% da estrutura`,
        createdAt: now,
      }).run();

      // 5. Inserir Execuções e Atualizações Condicionais com verificação de changes === 1 (P0 Anti-Double-Submit)
      for (const exec of plan.executions) {
        tx.insert(optionPositionExecutions).values({
          id: generateId('opt_pos_exec'),
          positionId: exec.positionId,
          strategyId: params.strategyId,
          strategyLegId: exec.strategyLegId,
          maneuverEventId,
          executionType: exec.executionType,
          quantity: exec.quantity,
          price: exec.price,
          executionDate,
          entryPriceBasisReais: positionsMap.get(exec.positionId)!.entryPrice,
          grossRealizedPnlReais: exec.grossRealizedPnlReais,
          feesReais: exec.feesReais,
          netRealizedPnlReais: exec.netRealizedPnlReais,
          source: 'USER_MANUAL',
          notes: params.notes,
          createdAt: now,
        }).run();

        // Guard condicional da leg: open_allocated_quantity DEVE bater com o expectedLegOpenBefore
        const legRes = tx.run(sql`
          UPDATE option_strategy_legs
          SET open_allocated_quantity = open_allocated_quantity - ${exec.quantity},
              closed_allocated_quantity = closed_allocated_quantity + ${exec.quantity}
          WHERE id = ${exec.strategyLegId}
            AND open_allocated_quantity = ${exec.expectedLegOpenBefore}
            AND open_allocated_quantity >= ${exec.quantity}
        `);
        if (legRes.changes !== 1) {
          throw new Error('CONCURRENT_MODIFICATION_OR_INSUFFICIENT_QUANTITY: Concorrência detectada ou saldo já modificado na perna.');
        }

        // Guard condicional da position: open_quantity DEVE bater com o expectedPositionOpenBefore
        const posRes = tx.run(sql`
          UPDATE option_positions
          SET open_quantity = open_quantity - ${exec.quantity},
              closed_quantity = closed_quantity + ${exec.quantity},
              realized_pnl_reais = realized_pnl_reais + ${exec.netRealizedPnlReais},
              status = CASE WHEN open_quantity - ${exec.quantity} = 0 THEN 'CLOSED' ELSE status END,
              exit_date = CASE WHEN open_quantity - ${exec.quantity} = 0 THEN ${executionDate} ELSE exit_date END,
              exit_price = CASE WHEN open_quantity - ${exec.quantity} = 0 THEN ${exec.price} ELSE exit_price END,
              updated_at = ${now}
        WHERE id = ${exec.positionId}
          AND open_quantity = ${exec.expectedPositionOpenBefore}
          AND open_quantity >= ${exec.quantity}
        `);
        if (posRes.changes !== 1) {
          throw new Error('CONCURRENT_MODIFICATION_OR_INSUFFICIENT_QUANTITY: Concorrência detectada ou saldo já modificado na posição.');
        }
      }

      // 6. Transição de Funding (Fechar antigo e abrir novo)
      if (openSegment) {
        tx.update(strategyFundingSegments)
          .set({ endDate: executionDate })
          .where(eq(strategyFundingSegments.id, openSegment.id))
          .run();
      }

      const residualRisk = plan.afterRisk;
      const newBenchmarkCapital = plan.afterBenchmarkCapitalReais;
      let newSegmentQuality = openSegment ? openSegment.quality : 'FULL';

      if (residualRisk.riskRecognitionQuality === 'UNKNOWN' || residualRisk.maxLossType === 'UNBOUNDED') {
        newSegmentQuality = 'INSUFFICIENT_DATA';
      }

      let newCapitalRemunerated = 0;
      const currentMode = openSegment ? openSegment.collateralMode : (strategy.collateralMode || 'IDLE_CASH');
      const currentCoveragePct = strategy.collateralCoveragePct;

      if (currentMode === 'IDLE_CASH') {
        newCapitalRemunerated = 0;
      } else if (currentCoveragePct !== null && currentCoveragePct !== undefined) {
        newCapitalRemunerated = (newBenchmarkCapital * currentCoveragePct) / 100.0;
      } else if (openSegment) {
        newCapitalRemunerated = Math.min(openSegment.capitalRemuneratedReais, newBenchmarkCapital);
      } else {
        newCapitalRemunerated = newBenchmarkCapital;
      }

      tx.insert(strategyFundingSegments).values({
        id: generateId('strat_fnd_seg'),
        strategyId: params.strategyId,
        startDate: executionDate,
        endDate: null,
        benchmarkCapitalReais: newBenchmarkCapital,
        capitalRemuneratedReais: newCapitalRemunerated,
        collateralMode: currentMode,
        collateralPctCdi: openSegment ? openSegment.collateralPctCdi : strategy.collateralYieldPctCDI,
        sourceType: 'MANEUVER',
        maneuverEventId,
        quality: newSegmentQuality,
        createdAt: now,
      }).run();

      tx.update(optionStrategies).set({
        capitalRemuneratedReais: newCapitalRemunerated,
        collateralMode: currentMode,
        updatedAt: now,
      }).where(eq(optionStrategies.id, params.strategyId)).run();

      return { success: true, maneuverEventId };
    });

    if (txRes.success) {
      safeRevalidate('/opcoes');
    }
    return txRes;
  } catch (err: any) {
    console.error('[Options Actions] Erro em scaleDownOptionStrategyAction:', err);
    return { success: false, error: err.message || 'Erro ao reduzir estratégia proporcionalmente' };
  }
}

/**
 * Consulta o recibo factual de uma manobra recém-executada.
 */
export async function getStrategyManeuverReceiptAction(maneuverEventId: string): Promise<{
  success: boolean;
  receipt?: ManeuverHistoryDTO;
  error?: string;
}> {
  try {
    const maneuver = await db.query.strategyManeuverEvents.findFirst({
      where: eq(strategyManeuverEvents.id, maneuverEventId),
    });
    if (!maneuver) {
      return { success: false, error: 'Maneuver event not found' };
    }

    const execs = await db.query.optionPositionExecutions.findMany({
      where: eq(optionPositionExecutions.maneuverEventId, maneuverEventId),
      orderBy: [asc(optionPositionExecutions.id)],
    });

    const posIds = [...new Set(execs.map((e) => e.positionId))];
    const positions = posIds.length > 0
      ? await db.query.optionPositions.findMany({ where: inArray(optionPositions.id, posIds) })
      : [];
    const posMap = new Map(positions.map((p) => [p.id, p]));

    const executionDTOs: ManeuverHistoryExecutionDTO[] = execs.map((e) => {
      const p = posMap.get(e.positionId);
      return {
        executionId: e.id,
        ticker: p?.tickerOption || e.positionId,
        optionType: (p?.optionType || 'CALL') as 'CALL' | 'PUT',
        side: p?.side || 'UNKNOWN',
        executionType: e.executionType as 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE',
        quantity: e.quantity,
        price: e.price,
        feesReais: e.feesReais ?? 0,
        grossRealizedPnlReais: e.grossRealizedPnlReais ?? 0,
        netRealizedPnlReais: e.netRealizedPnlReais ?? 0,
      };
    });

    const grossRealizedPnlReais = executionDTOs.reduce((acc, e) => acc + e.grossRealizedPnlReais, 0);
    const feesReais = executionDTOs.reduce((acc, e) => acc + e.feesReais, 0);
    const netRealizedPnlReais = executionDTOs.reduce((acc, e) => acc + e.netRealizedPnlReais, 0);

    return {
      success: true,
      receipt: {
        maneuverEventId: maneuver.id,
        strategyId: maneuver.strategyId,
        executionDate: maneuver.executionDate,
        createdAt: maneuver.createdAt || '',
        maneuverType: maneuver.maneuverType as any,
        percentageReduced: maneuver.percentageReduced,
        unitsReduced: maneuver.unitsReduced,
        auditRatioBefore: maneuver.auditRatioBefore,
        auditRatioAfter: maneuver.auditRatioAfter,
        preservesOriginalRatio: maneuver.preservesOriginalRatio,
        auditCapitalReleasedReais: maneuver.auditCapitalReleasedReais,
        executions: executionDTOs,
        grossRealizedPnlReais: Math.round(grossRealizedPnlReais * 100) / 100,
        feesReais: Math.round(feesReais * 100) / 100,
        netRealizedPnlReais: Math.round(netRealizedPnlReais * 100) / 100,
      },
    };
  } catch (err: any) {
    console.error('[Options Actions] Erro ao buscar recibo de manejo:', err);
    return { success: false, error: err.message || 'Erro ao buscar recibo' };
  }
}

/**
 * Consulta o histórico canônico de manobras de uma estratégia (Auditabilidade Visual).
 * Os totais de P&L são rigorosamente derivados da soma das execuções (SUM(executions)).
 */
export async function getStrategyManeuverHistoryAction(strategyId: string): Promise<{
  success: boolean;
  history?: ManeuverHistoryDTO[];
  error?: string;
}> {
  try {
    const maneuvers = await db.query.strategyManeuverEvents.findMany({
      where: eq(strategyManeuverEvents.strategyId, strategyId),
      orderBy: [desc(strategyManeuverEvents.executionDate), desc(strategyManeuverEvents.createdAt)],
    });

    if (maneuvers.length === 0) {
      return { success: true, history: [] };
    }

    const mnvIds = maneuvers.map((m) => m.id);
    const allExecs = await db.query.optionPositionExecutions.findMany({
      where: inArray(optionPositionExecutions.maneuverEventId, mnvIds),
      orderBy: [asc(optionPositionExecutions.id)],
    });

    const posIds = [...new Set(allExecs.map((e) => e.positionId))];
    const positions = posIds.length > 0
      ? await db.query.optionPositions.findMany({ where: inArray(optionPositions.id, posIds) })
      : [];
    const posMap = new Map(positions.map((p) => [p.id, p]));

    const execsByManeuverId = new Map<string, ManeuverHistoryExecutionDTO[]>();
    for (const e of allExecs) {
      if (!e.maneuverEventId) continue;
      const list = execsByManeuverId.get(e.maneuverEventId) || [];
      const p = posMap.get(e.positionId);
      list.push({
        executionId: e.id,
        ticker: p?.tickerOption || e.positionId,
        optionType: (p?.optionType || 'CALL') as 'CALL' | 'PUT',
        side: p?.side || 'UNKNOWN',
        executionType: e.executionType as 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE',
        quantity: e.quantity,
        price: e.price,
        feesReais: e.feesReais ?? 0,
        grossRealizedPnlReais: e.grossRealizedPnlReais ?? 0,
        netRealizedPnlReais: e.netRealizedPnlReais ?? 0,
      });
      execsByManeuverId.set(e.maneuverEventId, list);
    }

    const history: ManeuverHistoryDTO[] = maneuvers.map((m) => {
      const execs = execsByManeuverId.get(m.id) || [];
      const grossRealizedPnlReais = execs.reduce((acc, e) => acc + e.grossRealizedPnlReais, 0);
      const feesReais = execs.reduce((acc, e) => acc + e.feesReais, 0);
      const netRealizedPnlReais = execs.reduce((acc, e) => acc + e.netRealizedPnlReais, 0);

      return {
        maneuverEventId: m.id,
        strategyId: m.strategyId,
        executionDate: m.executionDate,
        createdAt: m.createdAt || '',
        maneuverType: m.maneuverType as any,
        percentageReduced: m.percentageReduced,
        unitsReduced: m.unitsReduced,
        auditRatioBefore: m.auditRatioBefore,
        auditRatioAfter: m.auditRatioAfter,
        preservesOriginalRatio: m.preservesOriginalRatio,
        auditCapitalReleasedReais: m.auditCapitalReleasedReais,
        executions: execs,
        grossRealizedPnlReais: Math.round(grossRealizedPnlReais * 100) / 100,
        feesReais: Math.round(feesReais * 100) / 100,
        netRealizedPnlReais: Math.round(netRealizedPnlReais * 100) / 100,
      };
    });

    return { success: true, history };
  } catch (err: any) {
    console.error('[Options Actions] Erro ao buscar histórico de manejos:', err);
    return { success: false, error: err.message || 'Erro ao buscar histórico' };
  }
}

/**
 * 7. Protocolo de Rolagem (Bloqueado temporariamente até a integração do Maneuver Engine)
 */
export async function rollOptionPosition(params: {
  currentPositionId: string;
  recompraPrice: number;
  newOptionTicker: string;
  newStrike: number;
  newEntryPrice: number;
  newExpirationDate: string;
  newQuantity?: number;
}): Promise<{ success: boolean; newId?: string; error?: string }> {
  return {
    success: false,
    error: 'ROLL_NOT_SUPPORTED_UNTIL_MANEUVER_ENGINE: A funcionalidade de rolagem está temporariamente suspensa até a integração completa do motor de manobras compostas (Maneuver Engine). Encerre a posição atual via Fechamento a Mercado e cadastre a nova série.',
  };
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
    safeRevalidate('/opcoes');
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
        legacyClosedQuantity: 0,
        legacyQuality: null,
        closedQuantity: 0,
        openQuantity: 400,
        realizedPnlReais: 0,
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
        legacyClosedQuantity: 0,
        legacyQuality: null,
        closedQuantity: 0,
        openQuantity: 200,
        realizedPnlReais: 0,
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
        legacyClosedQuantity: 0,
        legacyQuality: null,
        closedQuantity: 0,
        openQuantity: 500,
        realizedPnlReais: 0,
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
          legacyClosedAllocatedQuantity: 0,
          closedAllocatedQuantity: 0,
          openAllocatedQuantity: 400,
          createdAt: now,
        },
        {
          id: generateId('opt_strat_leg'),
          strategyId: stratId,
          positionId: itubCallId,
          allocatedQuantity: 200,
          economicRole: 'DIRECTIONAL',
          legacyClosedAllocatedQuantity: 0,
          closedAllocatedQuantity: 0,
          openAllocatedQuantity: 200,
          createdAt: now,
        },
      ]);

      await db.insert(strategyFundingSegments).values({
        id: generateId('strat_fnd_seg'),
        strategyId: stratId,
        startDate: '2026-08-24',
        endDate: null,
        benchmarkCapitalReais: 15476.0,
        capitalRemuneratedReais: 0,
        collateralMode: 'IDLE_CASH',
        collateralPctCdi: null,
        sourceType: 'CREATION',
        quality: 'FULL',
        createdAt: now,
      });
    }
  } catch (err) {
    console.error('[Options Actions] Erro ao semear posições iniciais:', err);
  }
}
