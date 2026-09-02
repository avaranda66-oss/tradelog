/**
 * Options Quantitative Calculation Engine (Institutional Edition)
 * Pure financial mathematics, pricing, Greeks handling, CDI benchmark and efficiency analysis.
 */

import {
  type BusinessDate,
  parseBusinessDate,
  countB3TradingDays,
  getBrazilTodayDate,
  getPreviousOrSameB3TradingDay,
} from './b3-calendar';
import {
  type AnnualRateDecimal,
  toAnnualRateDecimal,
  normalizeAnnualRate,
  calculateRealizedDiFactor,
  calculateProjectedDiFactor,
  calculateIndexedDiFactor,
  calculateIndexedDailyFactor,
  calculateB3DailyFactor,
  type RealizedDiResult,
  type ProjectedDiResult,
} from './cdi-engine';
import type { OptionPosition } from '@/lib/db/schema';

// ─── 1. DOMÍNIO DE LEGS (DISCRIMINATED UNIONS STRICT) ───
export type InstrumentType = 'OPTION' | 'STOCK' | 'CASH';

export interface OptionLeg {
  id: string;
  instrumentType: 'OPTION';
  side: 'LONG' | 'SHORT';
  exerciseStyle: 'AMERICAN' | 'EUROPEAN';
  quantityUnderlyingUnits: number; // Unidades de ações cobertas (ex: 400)
  option: {
    ticker: string;
    underlyingTicker: string;
    callPut: 'CALL' | 'PUT';
    strike: number;
    expirationDate: BusinessDate;
    entryPrice: number;
  };
}

export interface StockLeg {
  id: string;
  instrumentType: 'STOCK';
  side: 'LONG' | 'SHORT';
  quantityUnderlyingUnits: number;
  stock: {
    ticker: string;
    entryPrice: number;
  };
}

export interface CashLeg {
  id: string;
  instrumentType: 'CASH';
  amount: number;
  currency: 'BRL';
}

export type StrategyLeg = OptionLeg | StockLeg | CashLeg;

// ─── 2. ESTRATÉGIAS & COLLATERAL ───
export type StrategyBook = 'INCOME' | 'DIRECTIONAL' | 'HYBRID';
export type CollateralMode = 'IDLE_CASH' | 'REMUNERATED_100_CDI' | 'CUSTOM';

export type StrategyType =
  | 'CASH_SECURED_PUT'
  | 'COVERED_CALL'
  | 'LONG_CALL'
  | 'LONG_PUT'
  | 'BULL_PUT_SPREAD'
  | 'BEAR_CALL_SPREAD'
  | 'STRANGLE'
  | 'WHEEL_CYCLE'
  | 'CUSTOM_MULTI_LEG';

// ─── 3. SNAPSHOT DE MERCADO (INDEPENDENTE DA POSIÇÃO) ───
export interface OptionMarketSnapshot {
  optionTicker: string;
  underlyingSpot: number;
  bid?: number;
  ask?: number;
  last?: number;
  mark?: {
    price: number;
    method: 'MID' | 'LAST' | 'MANUAL';
  };
  feedMode: 'LIVE' | 'DELAYED' | 'MANUAL';
  ivDecimal?: number; // 0.2915 = 29.15%
  deltaPerUnit?: number; // -0.17
  gammaPerRealMove?: number; // 0.1435
  thetaReaisPerCalendarDay?: number; // -0.015
  vegaReaisPerVolPoint?: number; // 2.25
  probItmDecimal?: number; // 0.14 = 14%
  timestamp: string;
  source: string;
}

// ─── 4. COTAÇÃO DE SAÍDA ESTRUTURADA ───
export type ExitQuoteBasis = 'ASK' | 'BID' | 'MARK' | 'LAST' | 'UNAVAILABLE';
export type MarketDataFreshness = 'LIVE' | 'DELAYED' | 'MANUAL' | 'STALE';

export interface ExitQuote {
  price: number | null;
  basis: ExitQuoteBasis;
  isExecutable: boolean;
  marketDataStatus: MarketDataFreshness;
}

export function getConservativeExitQuote(
  snapshot: OptionMarketSnapshot | null | undefined,
  side: 'LONG' | 'SHORT',
  options?: { maxStaleSeconds?: number; nowMs?: number }
): ExitQuote {
  if (!snapshot) {
    return { price: null, basis: 'UNAVAILABLE', isExecutable: false, marketDataStatus: 'MANUAL' };
  }

  const maxStale = options?.maxStaleSeconds ?? 300;
  const now = options?.nowMs ?? Date.now();
  const snapTime = snapshot.timestamp ? new Date(snapshot.timestamp).getTime() : now;
  const isFresh = now - snapTime <= maxStale * 1000;

  let marketDataStatus: MarketDataFreshness = snapshot.feedMode;
  if (snapshot.feedMode === 'MANUAL') {
    marketDataStatus = 'MANUAL';
  } else if (!isFresh) {
    marketDataStatus = 'STALE';
  }

  if (side === 'SHORT') {
    if (snapshot.ask !== undefined && snapshot.ask !== null && snapshot.ask > 0) {
      return {
        price: snapshot.ask,
        basis: 'ASK',
        isExecutable: marketDataStatus === 'LIVE',
        marketDataStatus,
      };
    }
  } else {
    if (snapshot.bid !== undefined && snapshot.bid !== null && snapshot.bid > 0) {
      return {
        price: snapshot.bid,
        basis: 'BID',
        isExecutable: marketDataStatus === 'LIVE',
        marketDataStatus,
      };
    }
  }

  // Fallback para Mark ou Last
  if (snapshot.mark?.price !== undefined && snapshot.mark.price > 0) {
    return {
      price: snapshot.mark.price,
      basis: 'MARK',
      isExecutable: false,
      marketDataStatus,
    };
  }

  if (snapshot.last !== undefined && snapshot.last !== null && snapshot.last > 0) {
    return {
      price: snapshot.last,
      basis: 'LAST',
      isExecutable: false,
      marketDataStatus,
    };
  }

  return { price: null, basis: 'UNAVAILABLE', isExecutable: false, marketDataStatus };
}

// ─── 5. P&L ASSINADO UNIFICADO PARA LONG E SHORT ───
export function calculateSignedPnL(params: {
  entryPrice: number;
  currentPrice: number;
  quantityUnderlyingUnits: number;
  side: 'LONG' | 'SHORT';
}): number {
  const signedQuantity = params.side === 'LONG' ? params.quantityUnderlyingUnits : -params.quantityUnderlyingUnits;
  return (params.currentPrice - params.entryPrice) * signedQuantity;
}

// ─── 6. EFFICIENCY ENGINE (RECONCILIADO COM QUANTIDADE) ───
export interface EfficiencyParams {
  entryPrice: number;
  referencePrice: number; // Preço de saída (Ask/Bid ou Mark)
  quantityUnderlyingUnits: number;
  elapsedDU: number;
  totalDU: number;
  capitalReserved: number;
  projectedCdiFactor: number | null;
}

export type ExecutionQuality = 'EXECUTABLE' | 'INDICATIVE' | 'STALE' | 'UNAVAILABLE';

export interface EfficiencyAnalysis {
  harvestRatio: number | null;
  earlyCaptureFactor: number | null;
  residualVsProjectedCdiRatio: number | null;
  efficiencyScoreRaw: number | null;
  efficiencyScoreDisplay: number | null; // Inteiro arredondado
  tier: 'NORMAL' | 'ELEVADA' | 'AVALIAR_MANEJO' | 'RECICLAGEM_FORTE' | 'CAPTURE_EFFICIENCY_ONLY' | 'INSUFFICIENT_DATA';
  scoreBasis: ExitQuoteBasis;
  scoreCompleteness: 'FULL' | 'PARTIAL_EARLY_CAPTURE_ONLY' | 'UNAVAILABLE';
  missingInputs: string[];
  executionQuality: ExecutionQuality;
  decisionEligible: boolean;
}

export function calculateEfficiencyScore(
  params: EfficiencyParams,
  quoteOrBasis: ExitQuote | { basis: ExitQuoteBasis; isExecutable: boolean; marketDataStatus?: MarketDataFreshness } | ExitQuoteBasis,
  isExecutableFallback?: boolean
): EfficiencyAnalysis {
  const missingInputs: string[] = [];

  let basis: ExitQuoteBasis;
  let isExecutable: boolean;
  let marketStatus: MarketDataFreshness;

  if (typeof quoteOrBasis === 'string') {
    basis = quoteOrBasis;
    isExecutable = !!isExecutableFallback;
    marketStatus = isExecutable ? 'LIVE' : 'MANUAL';
  } else {
    basis = quoteOrBasis.basis;
    isExecutable = quoteOrBasis.isExecutable;
    marketStatus = quoteOrBasis.marketDataStatus ?? (isExecutable ? 'LIVE' : 'MANUAL');
  }

  let executionQuality: ExecutionQuality = 'INDICATIVE';
  if (basis === 'UNAVAILABLE') {
    executionQuality = 'UNAVAILABLE';
  } else if (marketStatus === 'STALE') {
    executionQuality = 'STALE';
  } else if (isExecutable && marketStatus === 'LIVE') {
    executionQuality = 'EXECUTABLE';
  } else {
    executionQuality = 'INDICATIVE';
  }

  if (params.totalDU <= 0 || params.entryPrice <= 0 || params.quantityUnderlyingUnits <= 0) {
    return {
      harvestRatio: null,
      earlyCaptureFactor: null,
      residualVsProjectedCdiRatio: null,
      efficiencyScoreRaw: null,
      efficiencyScoreDisplay: null,
      tier: 'INSUFFICIENT_DATA',
      scoreBasis: 'UNAVAILABLE',
      scoreCompleteness: 'UNAVAILABLE',
      missingInputs: ['INVALID_PARAMS'],
      executionQuality: 'UNAVAILABLE',
      decisionEligible: false,
    };
  }

  const timeConsumedPct = Math.min(1, Math.max(0, params.elapsedDU / params.totalDU));
  const capturePct = (params.entryPrice - params.referencePrice) / params.entryPrice;

  // 1. Harvest Ratio com Guard
  const harvestRatio = timeConsumedPct > 0 ? capturePct / timeConsumedPct : null;

  // 2. Early Capture Factor (Guard para quando timeConsumedPct == 1)
  let earlyCaptureFactor: number | null = null;
  if (timeConsumedPct < 0.999) {
    earlyCaptureFactor = Math.min(1, Math.max(0, (capturePct - timeConsumedPct) / (1 - timeConsumedPct)));
  } else {
    earlyCaptureFactor = capturePct >= 0.8 ? 1.0 : 0.0;
  }

  // 3. Custo de Oportunidade Residual com Quantidade Correta (Preço x Quantidade)
  const remainingPremiumReais = Math.max(0, params.referencePrice) * params.quantityUnderlyingUnits;
  const roicResidual = params.capitalReserved > 0 ? remainingPremiumReais / params.capitalReserved : null;

  let residualVsProjectedCdiRatio: number | null = null;
  let opportunityFactor: number | null = null;

  if (params.projectedCdiFactor !== null && params.projectedCdiFactor > 0.00001 && roicResidual !== null) {
    residualVsProjectedCdiRatio = roicResidual / params.projectedCdiFactor;
    opportunityFactor = Math.min(1, Math.max(0, 1 - residualVsProjectedCdiRatio / 2.0));
  } else {
    missingInputs.push('PROJECTED_CDI');
  }

  // 4. Cálculo do Score sem neutralidade 0.5 silenciosa
  let scoreRaw: number | null = null;
  let completeness: 'FULL' | 'PARTIAL_EARLY_CAPTURE_ONLY' | 'UNAVAILABLE' = 'FULL';

  if (earlyCaptureFactor !== null && opportunityFactor !== null) {
    scoreRaw = 100 * (0.60 * earlyCaptureFactor + 0.40 * opportunityFactor);
    completeness = 'FULL';
  } else if (earlyCaptureFactor !== null) {
    // Score parcial identificado explicitamente
    scoreRaw = 100 * earlyCaptureFactor;
    completeness = 'PARTIAL_EARLY_CAPTURE_ONLY';
  } else {
    completeness = 'UNAVAILABLE';
  }

  const scoreDisplay = scoreRaw !== null ? Math.round(scoreRaw) : null;

  let tier: 'NORMAL' | 'ELEVADA' | 'AVALIAR_MANEJO' | 'RECICLAGEM_FORTE' | 'CAPTURE_EFFICIENCY_ONLY' | 'INSUFFICIENT_DATA' = 'NORMAL';
  if (scoreDisplay !== null) {
    if (completeness === 'PARTIAL_EARLY_CAPTURE_ONLY') {
      tier = 'CAPTURE_EFFICIENCY_ONLY';
    } else if (scoreDisplay >= 75) {
      tier = 'RECICLAGEM_FORTE';
    } else if (scoreDisplay >= 60) {
      tier = 'AVALIAR_MANEJO';
    } else if (scoreDisplay >= 40) {
      tier = 'ELEVADA';
    } else {
      tier = 'NORMAL';
    }
  } else {
    tier = 'INSUFFICIENT_DATA';
  }

  // Elegibilidade de Decisão Estrita: Apenas cotações executáveis (Bid/Ask LIVE, frescas e não-stale) com score completo podem disparar ações operacionais automáticas
  const decisionEligible = executionQuality === 'EXECUTABLE' && scoreDisplay !== null && completeness === 'FULL';

  return {
    harvestRatio,
    earlyCaptureFactor,
    residualVsProjectedCdiRatio,
    efficiencyScoreRaw: scoreRaw,
    efficiencyScoreDisplay: scoreDisplay,
    tier,
    scoreBasis: basis,
    scoreCompleteness: completeness,
    missingInputs,
    executionQuality,
    decisionEligible,
  };
}

/**
 * Determina se a análise de eficiência qualifica a posição para figurar no ActionFeed operacional.
 * Regra: Requer cotação executável fresca (decisionEligible) E score classificado em RECICLAGEM_FORTE, AVALIAR_MANEJO ou ELEVADA.
 */
export function isActionFeedEligible(eff: EfficiencyAnalysis): boolean {
  return eff.decisionEligible && (eff.tier === 'RECICLAGEM_FORTE' || eff.tier === 'AVALIAR_MANEJO' || eff.tier === 'ELEVADA');
}

// ─── 7. COLLATERAL ENGINE (IDLE_CASH vs REMUNERATED vs CUSTOM) ───
export interface CollateralResult {
  collateralReturnReais: number;
  strategyTotalReturnReais: number;
  alphaReais: number;
  optionPnlToCdiMultiple: number | null;
  strategyReturnToCdiMultiple: number | null;
}

export function calculateCollateralReturn(params: {
  optionPnlReais: number;
  capitalAllocated: number;
  cdiPeriodYieldDecimal: number;
  collateralMode: CollateralMode;
  collateralYieldPctCDI?: number;
}): CollateralResult {
  const benchmarkCdiReais = params.capitalAllocated * params.cdiPeriodYieldDecimal;

  let collateralReturnReais = 0;
  if (params.collateralMode === 'REMUNERATED_100_CDI') {
    collateralReturnReais = benchmarkCdiReais;
  } else if (params.collateralMode === 'CUSTOM') {
    if (params.collateralYieldPctCDI === undefined || params.collateralYieldPctCDI === null || !Number.isFinite(params.collateralYieldPctCDI) || params.collateralYieldPctCDI < 0) {
      throw new Error('CUSTOM_COLLATERAL_YIELD_REQUIRED: Informe uma taxa válida e não-negativa para o collateral customizado.');
    }
    collateralReturnReais = benchmarkCdiReais * (params.collateralYieldPctCDI / 100.0);
  }

  const strategyTotalReturnReais = params.optionPnlReais + collateralReturnReais;
  const alphaReais = strategyTotalReturnReais - benchmarkCdiReais;

  const minBenchmark = 0.05; // Guard para evitar divisão por zero
  const optionPnlToCdiMultiple = Math.abs(benchmarkCdiReais) >= minBenchmark ? params.optionPnlReais / benchmarkCdiReais : null;
  const strategyReturnToCdiMultiple = Math.abs(benchmarkCdiReais) >= minBenchmark ? strategyTotalReturnReais / benchmarkCdiReais : null;

  return {
    collateralReturnReais,
    strategyTotalReturnReais,
    alphaReais,
    optionPnlToCdiMultiple,
    strategyReturnToCdiMultiple,
  };
}

// ─── 8. STRATEGY ECONOMIC PERFORMANCE ENGINE (DOUBLE YIELD & STORYTELLING) ───
export interface StrategyEconomicPerformance {
  startDate: BusinessDate;
  valuationDate: BusinessDate;
  accrualValuationDate: BusinessDate;
  elapsedDU: number;
  resultNature: 'MTM' | 'REALIZED';

  // Bases de Capital Segregadas
  capitalReservedReais: number;        // Capital bloqueado por margem / strikes de opções vendidas (ex: R$ 15.476)
  capitalRemuneratedReais: number;    // Saldo em garantia aplicado no CDI (ex: R$ 15.476 ou R$ 0)
  benchmarkCapitalReais: number;      // Custo de oportunidade de referência
  capitalBasisMethod: 'STATIC' | 'STATIC_APPROXIMATION' | 'DAILY_WEIGHTED';

  // Risco Econômico
  maxLossEconomicReais: number | null;
  maxLossType: 'FINITE' | 'UNBOUNDED' | 'UNKNOWN';

  // Benchmark CDI (100% CDI Puro)
  benchmarkCdiAccumulatedFactor: number;
  benchmarkCdiYieldDecimal: number;
  benchmarkCdiReais: number;
  benchmarkQuality: 'OFFICIAL_DI' | 'PARTIAL_ESTIMATE' | 'ESTIMATED';

  // Carrego Real do Caixa (Collateral)
  collateralMode: CollateralMode;
  collateralPctCdi: number;
  collateralAccumulatedFactor: number;
  collateralYieldDecimal: number;
  collateralCarryReais: number;

  // Resultado Opções
  optionPnlReais: number;

  // Resultado Econômico Consolidado
  totalEconomicReturnReais: number;   // optionPnlReais + collateralCarryReais
  excessReturnVsCdiReais: number;     // totalEconomicReturnReais - benchmarkCdiReais

  // Múltiplos
  optionPnlToCdiMultiple: number | null;
  totalReturnToCdiMultiple: number | null;

  // Retornos no Período (%)
  optionReturnOnBenchmarkCapitalPct: number | null;
  totalEconomicReturnPct: number | null;
  cdiPeriodReturnPct: number | null;
  excessPeriodPctPoints: number | null;

  // Eficiência de Capital e Risco
  excessReturnOnReservedCapitalPct: number | null;
  excessReturnOnMaxRiskPct: number | null;
  extraProfitPer1000RiskReais: number | null;

  // Dias de CDI Equivalentes (Composição Logarítmica)
  optionPnlEquivalentCdiDU: number | null;

  // Carry Diário Normalizado (R$/DU)
  thetaReaisPerComparableDay: number | null;
  cdiCarryReaisPerComparableDay: number | null;
  thetaToCdiDailyMultiple: number | null;

  // Ritmo Mensal e Anualizado Equivalente
  monthlyEquivalentPct: number | null;
  annualizedEquivalentPct: number | null;
  annualizationQuality: 'NOT_AVAILABLE' | 'VERY_SHORT_PERIOD' | 'INDICATIVE' | 'NORMAL';

  // Qualidade Global
  economicPerformanceQuality: 'FULL' | 'PARTIAL' | 'INSUFFICIENT_DATA';
  qualityNotes: string[];
}

export interface StrategyEconomicPerformanceParams {
  startDate: BusinessDate;
  valuationDate?: BusinessDate;
  capitalReservedReais: number;
  capitalRemuneratedReais?: number;
  benchmarkCapitalReais?: number;
  optionPnlReais: number;
  collateralMode?: CollateralMode;
  collateralPctCdi?: number | null;
  maxLossEconomicReais?: number | null;
  maxLossType?: 'FINITE' | 'UNBOUNDED' | 'UNKNOWN';
  netThetaReaisPerDay?: number | null;
  resultNature?: 'MTM' | 'REALIZED';
  customDiSeries?: Map<BusinessDate, { annualRateDecimal: AnnualRateDecimal; source: string }>;
  cdiFallbackAnnualRate?: number;
  legsOpenedAtDifferentDates?: boolean;
}

export function calculateStrategyEconomicPerformance(
  params: StrategyEconomicPerformanceParams
): StrategyEconomicPerformance {
  const qualityNotes: string[] = [];
  const startDate = parseBusinessDate(params.startDate);
  const valDate = parseBusinessDate(params.valuationDate || getBrazilTodayDate());
  const accrualValuationDate = getPreviousOrSameB3TradingDay(valDate);
  const elapsedDU = countB3TradingDays(startDate, accrualValuationDate);
  const resultNature: 'MTM' | 'REALIZED' = params.resultNature ?? 'MTM';

  // 1. Capitais Segregados
  const capitalReservedReais = Math.max(0, params.capitalReservedReais);
  const collateralMode: CollateralMode = params.collateralMode ?? 'IDLE_CASH';

  let collateralPctCdi = 0;
  if (collateralMode === 'REMUNERATED_100_CDI') {
    collateralPctCdi = 100;
  } else if (collateralMode === 'CUSTOM') {
    if (
      params.collateralPctCdi === undefined ||
      params.collateralPctCdi === null ||
      !Number.isFinite(params.collateralPctCdi) ||
      params.collateralPctCdi < 0
    ) {
      throw new Error(
        'CUSTOM_COLLATERAL_PERCENT_REQUIRED: Informe um percentual válido e não-negativo (>= 0) para o collateral customizado.'
      );
    }
    collateralPctCdi = params.collateralPctCdi;
  }

  const capitalRemuneratedReais = collateralMode === 'IDLE_CASH'
    ? 0
    : (params.capitalRemuneratedReais !== undefined ? Math.max(0, params.capitalRemuneratedReais) : capitalReservedReais);

  const benchmarkCapitalReais = params.benchmarkCapitalReais !== undefined
    ? Math.max(0, params.benchmarkCapitalReais)
    : capitalReservedReais;

  const capitalBasisMethod: 'STATIC' | 'STATIC_APPROXIMATION' | 'DAILY_WEIGHTED' = params.legsOpenedAtDifferentDates
    ? 'STATIC_APPROXIMATION'
    : 'STATIC';

  if (params.legsOpenedAtDifferentDates) {
    qualityNotes.push('Pernas com datas de abertura distintas: benchmark linear aproximado (STATIC_APPROXIMATION)');
  }

  // 2. Benchmark CDI (100% CDI Puro)
  const benchDi = calculateRealizedDiFactor(
    startDate,
    accrualValuationDate,
    params.cdiFallbackAnnualRate ?? 0.14,
    params.customDiSeries,
    100
  );
  const benchmarkCdiAccumulatedFactor = benchDi.accumulatedFactor;
  const benchmarkCdiYieldDecimal = benchDi.periodYieldDecimal;
  const benchmarkCdiReais = benchmarkCapitalReais * benchmarkCdiYieldDecimal;

  let benchmarkQuality: 'OFFICIAL_DI' | 'PARTIAL_ESTIMATE' | 'ESTIMATED' = 'OFFICIAL_DI';
  if (benchDi.isEstimated) {
    benchmarkQuality = benchDi.observations.some((o) => o.source === 'B3_OFFICIAL')
      ? 'PARTIAL_ESTIMATE'
      : 'ESTIMATED';
    qualityNotes.push('Benchmark CDI contém observações estimadas com taxa de referência');
  }

  // 3. Carrego Real do Caixa (Collateral Carry com indexação diária oficial B3)
  const collateralDi = calculateRealizedDiFactor(
    startDate,
    accrualValuationDate,
    params.cdiFallbackAnnualRate ?? 0.14,
    params.customDiSeries,
    collateralPctCdi
  );
  const collateralAccumulatedFactor = collateralDi.accumulatedFactor;
  const collateralYieldDecimal = collateralDi.periodYieldDecimal;
  const collateralCarryReais = capitalRemuneratedReais * collateralYieldDecimal;

  // 4. Resultados Financeiros & Excesso vs CDI
  const optionPnlReais = params.optionPnlReais;
  const totalEconomicReturnReais = optionPnlReais + collateralCarryReais;
  const excessReturnVsCdiReais = totalEconomicReturnReais - benchmarkCdiReais;

  // 5. Múltiplos
  const minBenchmarkThreshold = 0.05;
  const optionPnlToCdiMultiple = Math.abs(benchmarkCdiReais) >= minBenchmarkThreshold
    ? optionPnlReais / benchmarkCdiReais
    : null;
  const totalReturnToCdiMultiple = Math.abs(benchmarkCdiReais) >= minBenchmarkThreshold
    ? totalEconomicReturnReais / benchmarkCdiReais
    : null;

  // 6. Retornos do Período (%)
  const optionReturnOnBenchmarkCapitalPct = benchmarkCapitalReais > 0
    ? (optionPnlReais / benchmarkCapitalReais) * 100.0
    : null;
  const totalEconomicReturnPct = benchmarkCapitalReais > 0
    ? (totalEconomicReturnReais / benchmarkCapitalReais) * 100.0
    : null;
  const cdiPeriodReturnPct = benchmarkCdiYieldDecimal * 100.0;
  const excessPeriodPctPoints = totalEconomicReturnPct !== null
    ? totalEconomicReturnPct - cdiPeriodReturnPct
    : null;

  // 7. Risco & Eficiência de Capital
  const maxLossType: 'FINITE' | 'UNBOUNDED' | 'UNKNOWN' = params.maxLossType ?? (
    params.maxLossEconomicReais !== undefined && params.maxLossEconomicReais !== null ? 'FINITE' : 'UNKNOWN'
  );
  const maxLossEconomicReais = maxLossType === 'FINITE' && params.maxLossEconomicReais !== undefined && params.maxLossEconomicReais !== null
    ? Math.max(0, params.maxLossEconomicReais)
    : null;

  const excessReturnOnReservedCapitalPct = capitalReservedReais > 0
    ? (excessReturnVsCdiReais / capitalReservedReais) * 100.0
    : null;

  let excessReturnOnMaxRiskPct: number | null = null;
  let extraProfitPer1000RiskReais: number | null = null;

  if (maxLossType === 'FINITE' && maxLossEconomicReais !== null && maxLossEconomicReais > 0) {
    excessReturnOnMaxRiskPct = (excessReturnVsCdiReais / maxLossEconomicReais) * 100.0;
    extraProfitPer1000RiskReais = (excessReturnVsCdiReais / maxLossEconomicReais) * 1000.0;
  }

  // 8. Dias de CDI Equivalentes (Composição Logarítmica)
  let optionPnlEquivalentCdiDU: number | null = null;
  if (elapsedDU > 0 && benchmarkCapitalReais > 0 && benchmarkCdiAccumulatedFactor > 1.0) {
    const equivalentDailyFactor = Math.pow(benchmarkCdiAccumulatedFactor, 1.0 / elapsedDU);
    const optionReturn = optionPnlReais / benchmarkCapitalReais;
    if (equivalentDailyFactor > 1.00000001 && 1.0 + optionReturn > 0) {
      optionPnlEquivalentCdiDU = Math.log1p(optionReturn) / Math.log(equivalentDailyFactor);
    }
  }

  // 9. Carry Diário (Theta vs CDI Normalizado em R$/DU baseado no collateral real indexado)
  const lastCollateralDailyFactor = collateralDi.observations.length > 0
    ? collateralDi.observations[collateralDi.observations.length - 1].dailyFactor
    : calculateIndexedDailyFactor(params.cdiFallbackAnnualRate ?? 0.14, collateralPctCdi);
  const cdiCarryReaisPerComparableDay = capitalRemuneratedReais * (lastCollateralDailyFactor - 1.0);
  const thetaReaisPerComparableDay = params.netThetaReaisPerDay !== undefined && params.netThetaReaisPerDay !== null
    ? params.netThetaReaisPerDay * (365.0 / 252.0)
    : null;
  const thetaToCdiDailyMultiple = (thetaReaisPerComparableDay !== null && cdiCarryReaisPerComparableDay > 0.05)
    ? thetaReaisPerComparableDay / cdiCarryReaisPerComparableDay
    : null;

  // 10. Ritmo Mensal e Anualizado com Guards
  let annualizationQuality: 'NOT_AVAILABLE' | 'VERY_SHORT_PERIOD' | 'INDICATIVE' | 'NORMAL' = 'NORMAL';
  let monthlyEquivalentPct: number | null = null;
  let annualizedEquivalentPct: number | null = null;

  if (elapsedDU < 5 || totalEconomicReturnPct === null || totalEconomicReturnPct <= -100) {
    annualizationQuality = 'NOT_AVAILABLE';
  } else {
    if (elapsedDU <= 15) {
      annualizationQuality = 'VERY_SHORT_PERIOD';
    } else if (elapsedDU <= 40) {
      annualizationQuality = 'INDICATIVE';
    } else {
      annualizationQuality = 'NORMAL';
    }
    const periodBase = 1.0 + totalEconomicReturnPct / 100.0;
    if (periodBase > 0) {
      monthlyEquivalentPct = (Math.pow(periodBase, 21.0 / elapsedDU) - 1.0) * 100.0;
      annualizedEquivalentPct = (Math.pow(periodBase, 252.0 / elapsedDU) - 1.0) * 100.0;
    }
  }

  // 11. Qualidade Global
  let economicPerformanceQuality: 'FULL' | 'PARTIAL' | 'INSUFFICIENT_DATA' = 'FULL';
  if (benchmarkCapitalReais <= 0 || elapsedDU <= 0) {
    economicPerformanceQuality = 'INSUFFICIENT_DATA';
    qualityNotes.push('Capital insuficiente ou zero dias úteis decorridos');
  } else if (params.legsOpenedAtDifferentDates || benchmarkQuality !== 'OFFICIAL_DI') {
    economicPerformanceQuality = 'PARTIAL';
  }

  return {
    startDate,
    valuationDate: valDate,
    accrualValuationDate,
    elapsedDU,
    resultNature,

    capitalReservedReais,
    capitalRemuneratedReais,
    benchmarkCapitalReais,
    capitalBasisMethod,

    maxLossEconomicReais,
    maxLossType,

    benchmarkCdiAccumulatedFactor,
    benchmarkCdiYieldDecimal,
    benchmarkCdiReais,
    benchmarkQuality,

    collateralMode,
    collateralPctCdi,
    collateralAccumulatedFactor,
    collateralYieldDecimal,
    collateralCarryReais,

    optionPnlReais,

    totalEconomicReturnReais,
    excessReturnVsCdiReais,

    optionPnlToCdiMultiple,
    totalReturnToCdiMultiple,

    optionReturnOnBenchmarkCapitalPct,
    totalEconomicReturnPct,
    cdiPeriodReturnPct,
    excessPeriodPctPoints,

    excessReturnOnReservedCapitalPct,
    excessReturnOnMaxRiskPct,
    extraProfitPer1000RiskReais,

    optionPnlEquivalentCdiDU,

    thetaReaisPerComparableDay,
    cdiCarryReaisPerComparableDay,
    thetaToCdiDailyMultiple,

    monthlyEquivalentPct,
    annualizedEquivalentPct,
    annualizationQuality,

    economicPerformanceQuality,
    qualityNotes,
  };
}

// ─── 9. POSITION METRICS & ENRICHMENT ───
export interface PositionCalculatedMetrics {
  // Livro & Classificação
  book: StrategyBook;
  strategyType: StrategyType;

  // Contagem de Sessões B3
  elapsedTradingDays: number;
  remainingTradingDays: number;
  totalTradingDaysAtEntry: number;
  timeConsumedPct: number;

  // Preços & Cotação de Saída
  markPrice: number;
  exitQuote: ExitQuote;
  estimatedExitPrice: number;

  // P&L MTM vs Saída Conservadora
  pnlMtmReais: number;
  pnlEstimatedExitReais: number;
  yieldOnCapitalPct: number;
  premiumCapturedPct: number; // para short
  roiOnPremiumPct: number; // para long
  remainingCaptureReais: number; // Lucro máximo adicional ainda a capturar

  // Custo Efetivo & Exercício
  capitalAllocated: number;
  maxLossReais: number;
  maxLossType: 'FINITE' | 'UNBOUNDED' | 'NOT_APPLICABLE';
  effectiveAcquisitionPrice: number | null; // Strike - Prêmio
  discountToSpotPct: number | null; // % abaixo do spot

  // CDI Realizado Diário vs Projetado
  cdiRealizedFactor: number;
  cdiRealizedYieldDecimal: number;
  cdiRealizedReais: number;
  cdiIsEstimated: boolean;
  cdiProjectedYieldDecimal: number;
  cdiProjectedReais: number;
  projectionMethod: 'SELIC_PROXY' | 'CURRENT_DI';

  // Alpha & Múltiplos
  alphaReais: number;
  optionPnlToCdiMultiple: number | null;
  strategyReturnToCdiMultiple: number | null;

  // Efficiency & Decision
  efficiencyMtm: EfficiencyAnalysis;
  efficiencyExecutable: EfficiencyAnalysis;
  targetRecompraAtingido: boolean;

  // Visão Líquida Estimada (15% Opções / 22.5% Benchmark Renda Fixa)
  netPnlMtmReaisWithTax: number;
  netCdiBenchmarkReais: number;
  netAlphaReais: number;
  netOptionPnlToCdiMultiple: number | null;
}

export type EnrichedOptionPosition = OptionPosition & {
  metrics: PositionCalculatedMetrics;
};

/**
 * Enriquece uma posição com todos os motores quantitativos auditados
 */
export function enrichOptionPosition(
  pos: OptionPosition,
  marketSnapshot?: OptionMarketSnapshot,
  valuationDateStr: BusinessDate = getBrazilTodayDate()
): EnrichedOptionPosition {
  const openDate = parseBusinessDate(pos.entryDate);
  const expiryDate = parseBusinessDate(pos.expirationDate);
  const valDate = parseBusinessDate(valuationDateStr);

  const isClosed = pos.status !== 'OPEN';
  const effectiveValDate = isClosed && pos.exitDate ? parseBusinessDate(pos.exitDate) : valDate;

  // 1. Contagem B3
  const elapsedTradingDays = countB3TradingDays(openDate, effectiveValDate);
  const remainingTradingDays = isClosed ? 0 : countB3TradingDays(valDate, expiryDate);
  const totalTradingDaysAtEntry = countB3TradingDays(openDate, expiryDate);
  const timeConsumedPct = totalTradingDaysAtEntry > 0 ? elapsedTradingDays / totalTradingDaysAtEntry : 0;

  // 2. Classificação de Livro
  const side = pos.side as 'LONG' | 'SHORT' | 'SELL' | 'BUY';
  const normalizedSide: 'LONG' | 'SHORT' = side === 'BUY' || side === 'LONG' ? 'LONG' : 'SHORT';
  const isShort = normalizedSide === 'SHORT';
  const book: StrategyBook = isShort ? 'INCOME' : 'DIRECTIONAL';

  const quantityUnits = pos.quantity;
  const currentPrice = isClosed && pos.exitPrice !== null ? pos.exitPrice : pos.currentPrice;

  // 3. Snapshot & Cotação de Saída
  const snapshot = marketSnapshot ?? {
    optionTicker: pos.tickerOption,
    underlyingSpot: pos.underlyingCurrentSpot || pos.underlyingEntrySpot || 0,
    last: currentPrice,
    mark: { price: currentPrice, method: 'MANUAL' },
    feedMode: 'MANUAL',
    timestamp: new Date().toISOString(),
    source: 'MANUAL',
  };

  const exitQuote = getConservativeExitQuote(snapshot, normalizedSide);
  const estimatedExitPrice = exitQuote.price ?? currentPrice;

  // 4. P&L Assinado (MTM vs Saída Conservadora)
  const pnlMtmReais = calculateSignedPnL({
    entryPrice: pos.entryPrice,
    currentPrice,
    quantityUnderlyingUnits: quantityUnits,
    side: normalizedSide,
  });

  const pnlEstimatedExitReais = calculateSignedPnL({
    entryPrice: pos.entryPrice,
    currentPrice: estimatedExitPrice,
    quantityUnderlyingUnits: quantityUnits,
    side: normalizedSide,
  });

  // 5. % Capturado e ROI
  let premiumCapturedPct = 0;
  let roiOnPremiumPct = 0;
  let remainingCaptureReais = 0;

  if (pos.entryPrice > 0) {
    if (isShort) {
      premiumCapturedPct = ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
      remainingCaptureReais = Math.max(0, currentPrice) * quantityUnits;
    } else {
      roiOnPremiumPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    }
  }

  // 6. Capital Alocado & Max Loss
  const capitalAllocated = Math.max(1, pos.allocatedCapital);
  const yieldOnCapitalPct = (pnlMtmReais / capitalAllocated) * 100;

  let maxLossReais = capitalAllocated;
  let maxLossType: 'FINITE' | 'UNBOUNDED' | 'NOT_APPLICABLE' = 'FINITE';
  let effectiveAcquisitionPrice: number | null = null;
  let discountToSpotPct: number | null = null;

  if (pos.optionType === 'PUT' && isShort) {
    effectiveAcquisitionPrice = pos.strike - pos.entryPrice;
    maxLossReais = effectiveAcquisitionPrice * quantityUnits;
    const spot = pos.underlyingCurrentSpot || pos.underlyingEntrySpot;
    if (spot && spot > 0) {
      discountToSpotPct = ((spot - effectiveAcquisitionPrice) / spot) * 100;
    }
  } else if (pos.optionType === 'CALL' && isShort) {
    effectiveAcquisitionPrice = pos.strike + pos.entryPrice;
    maxLossType = 'UNBOUNDED';
  } else {
    maxLossReais = pos.entryPrice * quantityUnits;
  }

  // 7. CDI Realizado Diário vs Projetado (com normalização estrita de unidade decimal)
  const cdiRateAnnual = toAnnualRateDecimal(pos.cdiRateAnnual);
  const realizedDi = calculateRealizedDiFactor(openDate, effectiveValDate, cdiRateAnnual);
  const projectedDi = calculateProjectedDiFactor(remainingTradingDays, cdiRateAnnual);

  const cdiRealizedReais = capitalAllocated * realizedDi.periodYieldDecimal;
  const cdiProjectedReais = capitalAllocated * projectedDi.periodYieldDecimal;

  // 8. Collateral & Alpha
  const collateralRes = calculateCollateralReturn({
    optionPnlReais: pnlMtmReais,
    capitalAllocated,
    cdiPeriodYieldDecimal: realizedDi.periodYieldDecimal,
    collateralMode: 'IDLE_CASH',
  });

  // 9. Efficiency Analysis (MTM e Executável)
  const efficiencyMtm = calculateEfficiencyScore(
    {
      entryPrice: pos.entryPrice,
      referencePrice: currentPrice,
      quantityUnderlyingUnits: quantityUnits,
      elapsedDU: elapsedTradingDays,
      totalDU: totalTradingDaysAtEntry,
      capitalReserved: capitalAllocated,
      projectedCdiFactor: projectedDi.periodYieldDecimal,
    },
    { price: currentPrice, basis: 'MARK', isExecutable: false, marketDataStatus: 'MANUAL' }
  );

  const efficiencyExecutable = calculateEfficiencyScore(
    {
      entryPrice: pos.entryPrice,
      referencePrice: estimatedExitPrice,
      quantityUnderlyingUnits: quantityUnits,
      elapsedDU: elapsedTradingDays,
      totalDU: totalTradingDaysAtEntry,
      capitalReserved: capitalAllocated,
      projectedCdiFactor: projectedDi.periodYieldDecimal,
    },
    exitQuote
  );

  // 10. Visão Líquida Estimada (15% Opções / 22.5% CDI)
  const OPTION_TAX_RATE = 0.15;
  const CDI_TAX_RATE = 0.225;

  const netPnlMtmReaisWithTax = pnlMtmReais > 0 ? pnlMtmReais * (1 - OPTION_TAX_RATE) : pnlMtmReais;
  const netCdiBenchmarkReais = cdiRealizedReais * (1 - CDI_TAX_RATE);
  const netAlphaReais = netPnlMtmReaisWithTax - netCdiBenchmarkReais;
  const netOptionPnlToCdiMultiple = Math.abs(netCdiBenchmarkReais) >= 0.05 ? netPnlMtmReaisWithTax / netCdiBenchmarkReais : null;

  const targetRecompraAtingido = isShort && premiumCapturedPct >= 50 && !isClosed;

  return {
    ...pos,
    metrics: {
      book,
      strategyType: isShort ? (pos.optionType === 'PUT' ? 'CASH_SECURED_PUT' : 'COVERED_CALL') : (pos.optionType === 'PUT' ? 'LONG_PUT' : 'LONG_CALL'),
      elapsedTradingDays,
      remainingTradingDays,
      totalTradingDaysAtEntry,
      timeConsumedPct,
      markPrice: currentPrice,
      exitQuote,
      estimatedExitPrice,
      pnlMtmReais,
      pnlEstimatedExitReais,
      yieldOnCapitalPct,
      premiumCapturedPct,
      roiOnPremiumPct,
      remainingCaptureReais,
      capitalAllocated,
      maxLossReais,
      maxLossType,
      effectiveAcquisitionPrice,
      discountToSpotPct,
      cdiRealizedFactor: realizedDi.accumulatedFactor,
      cdiRealizedYieldDecimal: realizedDi.periodYieldDecimal,
      cdiRealizedReais,
      cdiIsEstimated: realizedDi.isEstimated,
      cdiProjectedYieldDecimal: projectedDi.periodYieldDecimal,
      cdiProjectedReais,
      projectionMethod: projectedDi.projectionMethod,
      alphaReais: collateralRes.alphaReais,
      optionPnlToCdiMultiple: collateralRes.optionPnlToCdiMultiple,
      strategyReturnToCdiMultiple: collateralRes.strategyReturnToCdiMultiple,
      efficiencyMtm,
      efficiencyExecutable,
      targetRecompraAtingido,
      netPnlMtmReaisWithTax,
      netCdiBenchmarkReais,
      netAlphaReais,
      netOptionPnlToCdiMultiple,
    },
  };
}

export interface SimulationParams {
  side: 'SELL' | 'BUY';
  optionType: 'PUT' | 'CALL';
  strike: number;
  premium: number;
  quantity: number;
  busDays: number;
  underlyingSpot?: number;
  customAllocatedCapital?: number;
  cdiRateAnnual?: number;
}

export interface SimulationResult {
  capital: number;
  totalPremiumReais: number;
  yieldPeriodPct: number;
  cdiYieldPeriodPct: number;
  cdiProfitReais: number;
  pctOfCdi: number;
  alphaReais: number;
  annualizedYieldPct: number;
  breakEven: number;
  safetyMarginPct: number;
  effectiveCostPerShare: number;
  effectiveExerciseTotalCost: number;
  discountToSpotPct: number;
  netPremiumReais: number;
  netYieldPeriodPct: number;
  cdiNetProfitReais: number;
  netPctOfCdi: number;
  netAlphaReais: number;
}

export function simulateOptionTradeCdi(params: SimulationParams): SimulationResult {
  const cdiAnnual = toAnnualRateDecimal(params.cdiRateAnnual);
  const isSell = params.side === 'SELL';
  const totalPremiumReais = params.premium * params.quantity;

  let capital = params.customAllocatedCapital || 0;
  if (!capital || capital <= 0) {
    if (isSell && params.optionType === 'PUT') {
      capital = params.strike * params.quantity;
    } else if (isSell && params.optionType === 'CALL') {
      capital = (params.underlyingSpot || params.strike) * params.quantity;
    } else {
      capital = totalPremiumReais;
    }
  }

  const yieldPeriodPct = capital > 0 ? (totalPremiumReais / capital) * 100 : 0;
  const cdiProj = calculateProjectedDiFactor(params.busDays, cdiAnnual);
  const cdiYieldPeriodPct = cdiProj.periodYieldDecimal * 100;
  const cdiProfitReais = capital * cdiProj.periodYieldDecimal;
  const pctOfCdi = cdiYieldPeriodPct > 0 ? (yieldPeriodPct / cdiYieldPeriodPct) * 100 : 0;
  const alphaReais = totalPremiumReais - cdiProfitReais;

  let annualizedYieldPct = 0;
  if (params.busDays > 0) {
    annualizedYieldPct = (Math.pow(1 + yieldPeriodPct / 100, 252 / params.busDays) - 1) * 100;
  }

  let effectiveCostPerShare = params.strike;
  let effectiveExerciseTotalCost = params.strike * params.quantity;

  if (params.optionType === 'PUT') {
    effectiveCostPerShare = params.strike - params.premium;
    effectiveExerciseTotalCost = effectiveCostPerShare * params.quantity;
  } else {
    effectiveCostPerShare = params.strike + params.premium;
    effectiveExerciseTotalCost = effectiveCostPerShare * params.quantity;
  }

  const breakEven = effectiveCostPerShare;
  let safetyMarginPct = 0;
  let discountToSpotPct = 0;

  if (params.underlyingSpot && params.underlyingSpot > 0) {
    safetyMarginPct = Math.abs((params.underlyingSpot - breakEven) / params.underlyingSpot) * 100;
    if (params.optionType === 'PUT') {
      discountToSpotPct = ((params.underlyingSpot - effectiveCostPerShare) / params.underlyingSpot) * 100;
    }
  }

  const netPremiumReais = totalPremiumReais * 0.85;
  const netYieldPeriodPct = capital > 0 ? (netPremiumReais / capital) * 100 : 0;
  const cdiNetProfitReais = cdiProfitReais * (1 - 0.225);
  const cdiNetYieldPct = cdiYieldPeriodPct * (1 - 0.225);
  const netPctOfCdi = cdiNetYieldPct > 0 ? (netYieldPeriodPct / cdiNetYieldPct) * 100 : 0;
  const netAlphaReais = netPremiumReais - cdiNetProfitReais;

  return {
    capital,
    totalPremiumReais,
    yieldPeriodPct,
    cdiYieldPeriodPct,
    cdiProfitReais,
    pctOfCdi,
    alphaReais,
    annualizedYieldPct,
    breakEven,
    safetyMarginPct,
    effectiveCostPerShare,
    effectiveExerciseTotalCost,
    discountToSpotPct,
    netPremiumReais,
    netYieldPeriodPct,
    cdiNetProfitReais,
    netPctOfCdi,
    netAlphaReais,
  };
}

// ─── 9. ESTRUTURAS CONSOLIDADAS (MULTI-LEG STRATEGIES) ────────
export interface EnrichedStrategyLeg {
  id: string;
  strategyId: string;
  positionId: string;
  allocatedQuantity: number;
  economicRole: 'FINANCING' | 'DIRECTIONAL' | 'HEDGE' | 'INCOME' | 'CUSTOM';
  position: EnrichedOptionPosition;
}

// ─── 11. STRATEGY RISK & PAYOFF RECOGNIZER ───
export interface StrategyRiskProfile {
  maxLossEconomicReais: number | null;
  maxLossType: 'FINITE' | 'UNBOUNDED' | 'UNKNOWN';
  capitalReservedReais: number;
  breakEvenInferior: number | null;
  breakEvenSuperior: number | null;
  downsideExposureUnits: number;
  upsideParticipationUnits: number;
  putToCallRatio: number | null;
}

export function detectStrategyRiskAndPayoff(params: {
  legs: Array<{
    allocatedQuantity: number;
    economicRole: string;
    position: EnrichedOptionPosition;
  }>;
  netInitialCreditDebitReais: number;
}): StrategyRiskProfile {
  let shortPutUnits = 0;
  let longPutUnits = 0;
  let shortCallUnits = 0;
  let longCallUnits = 0;

  let totalShortPutStrikeVal = 0;
  let totalLongPutStrikeVal = 0;
  let totalShortCallStrikeVal = 0;
  let totalLongCallStrikeVal = 0;

  const shortPuts: Array<{ strike: number; qty: number }> = [];
  const longPuts: Array<{ strike: number; qty: number }> = [];
  const shortCalls: Array<{ strike: number; qty: number; spot: number }> = [];
  const longCalls: Array<{ strike: number; qty: number }> = [];

  for (const leg of params.legs) {
    const pos = leg.position;
    const isShort = pos.side === 'SELL' || pos.side === 'SHORT';
    const isLong = !isShort;
    const qty = leg.allocatedQuantity;

    if (pos.optionType === 'PUT') {
      if (isShort) {
        shortPutUnits += qty;
        totalShortPutStrikeVal += pos.strike * qty;
        shortPuts.push({ strike: pos.strike, qty });
      } else {
        longPutUnits += qty;
        totalLongPutStrikeVal += pos.strike * qty;
        longPuts.push({ strike: pos.strike, qty });
      }
    } else if (pos.optionType === 'CALL') {
      if (isShort) {
        shortCallUnits += qty;
        totalShortCallStrikeVal += pos.strike * qty;
        shortCalls.push({ strike: pos.strike, qty, spot: pos.underlyingCurrentSpot || pos.strike });
      } else {
        longCallUnits += qty;
        totalLongCallStrikeVal += pos.strike * qty;
        longCalls.push({ strike: pos.strike, qty });
      }
    }
  }

  const putToCallRatio = longCallUnits > 0 ? shortPutUnits / longCallUnits : null;
  const netCredit = params.netInitialCreditDebitReais; // positivo = crédito, negativo = débito

  let maxLossType: 'FINITE' | 'UNBOUNDED' | 'UNKNOWN' = 'FINITE';
  let maxLossEconomicReais: number | null = null;
  let capitalReservedReais = 0;
  let breakEvenInferior: number | null = null;
  let breakEvenSuperior: number | null = null;

  // 1. Naked Short Call (Venda Descoberta de Call sem cobertura de Long Call suficiente)
  if (shortCallUnits > longCallUnits) {
    maxLossType = 'UNBOUNDED';
    maxLossEconomicReais = null;
    capitalReservedReais = shortCalls.reduce((acc, c) => acc + c.spot * c.qty, 0);
    if (shortPutUnits > 0) {
      capitalReservedReais += totalShortPutStrikeVal;
    }
  }
  // 2. Trava de Alta com Put (Bull Put Spread)
  else if (shortPuts.length === 1 && longPuts.length === 1 && shortCallUnits === 0 && longCallUnits === 0) {
    const sp = shortPuts[0];
    const lp = longPuts[0];
    if (sp.qty === lp.qty && lp.strike < sp.strike) {
      const spreadWidthReais = (sp.strike - lp.strike) * sp.qty;
      maxLossType = 'FINITE';
      maxLossEconomicReais = Math.max(0, spreadWidthReais - netCredit);
      capitalReservedReais = spreadWidthReais;
      breakEvenInferior = sp.strike - (netCredit / sp.qty);
    } else {
      maxLossType = 'FINITE';
      maxLossEconomicReais = Math.max(0, totalShortPutStrikeVal - totalLongPutStrikeVal - netCredit);
      capitalReservedReais = Math.max(1, totalShortPutStrikeVal - totalLongPutStrikeVal);
    }
  }
  // 3. Trava de Baixa com Call (Bear Call Spread)
  else if (shortCalls.length === 1 && longCalls.length === 1 && shortPutUnits === 0 && longPutUnits === 0) {
    const sc = shortCalls[0];
    const lc = longCalls[0];
    if (sc.qty === lc.qty && lc.strike > sc.strike) {
      const spreadWidthReais = (lc.strike - sc.strike) * sc.qty;
      maxLossType = 'FINITE';
      maxLossEconomicReais = Math.max(0, spreadWidthReais - netCredit);
      capitalReservedReais = spreadWidthReais;
      breakEvenSuperior = sc.strike + (netCredit / sc.qty);
    } else {
      maxLossType = 'FINITE';
      maxLossEconomicReais = Math.max(0, (lc.strike - sc.strike) * sc.qty - netCredit);
      capitalReservedReais = Math.max(1, (lc.strike - sc.strike) * sc.qty);
    }
  }
  // 4. Estruturas com Short Put (ex: CSP, Put Financiando Call 2:1, etc.)
  else if (shortPutUnits > 0 && shortCallUnits === 0) {
    maxLossType = 'FINITE';
    maxLossEconomicReais = Math.max(0, totalShortPutStrikeVal - netCredit);
    capitalReservedReais = totalShortPutStrikeVal;
    breakEvenInferior = (totalShortPutStrikeVal - netCredit) / shortPutUnits;
  }
  // 5. Estruturas Long Only (Compra de Call, Compra de Put, Trava de Débito)
  else if (shortPutUnits === 0 && shortCallUnits === 0) {
    maxLossType = 'FINITE';
    maxLossEconomicReais = Math.max(0, Math.abs(netCredit));
    capitalReservedReais = Math.max(1, Math.abs(netCredit));
  }
  // 6. Genérico
  else {
    maxLossType = 'FINITE';
    capitalReservedReais = totalShortPutStrikeVal + shortCalls.reduce((acc, c) => acc + c.spot * c.qty, 0);
    maxLossEconomicReais = Math.max(0, capitalReservedReais - netCredit);
  }

  if (capitalReservedReais <= 0) {
    capitalReservedReais = Math.max(1, Math.abs(netCredit));
  }

  return {
    maxLossEconomicReais,
    maxLossType,
    capitalReservedReais,
    breakEvenInferior,
    breakEvenSuperior,
    downsideExposureUnits: shortPutUnits,
    upsideParticipationUnits: longCallUnits,
    putToCallRatio,
  };
}

export interface EnrichedOptionStrategy {
  id: string;
  portfolio: string;
  name: string;
  strategyType: string;
  book: StrategyBook;
  underlyingTicker: string;
  collateralMode: CollateralMode;
  collateralYieldPctCDI: number | null;
  status: 'OPEN' | 'CLOSED' | 'ROLLED';
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  legs: EnrichedStrategyLeg[];

  // Métricas Consolidadas da Estrutura
  metrics: {
    netInitialCreditDebitReais: number; // ex: +180.00
    isNetCredit: boolean;
    netPnlMtmReais: number; // ex: +478.00
    netEstimatedExitReais: number;
    totalCapitalReserved: number; // ex: 15476.00 (cash-secured)
    maxLossEconomicReais: number | null; // ex: 15296.00 ou null se UNBOUNDED
    maxLossType: 'FINITE' | 'UNBOUNDED' | 'UNKNOWN';
    breakEvenInferior: number | null; // ex: 38.24
    breakEvenSuperior: number | null;
    roicPct: number; // ex: +3.09%
    putToCallRatio: number | null; // ex: 2.0 (400:200)
    downsideExposureUnits: number; // 400
    upsideParticipationUnits: number; // 200
    cdiRealizedReais: number;
    alphaReais: number;
    cdiMultiple: number | null;
    remainingTradingDays: number;
    elapsedTradingDays: number;
    economicPerformance: StrategyEconomicPerformance;
  };
  economicPerformance: StrategyEconomicPerformance;
}

export function enrichOptionStrategy(params: {
  id: string;
  portfolio: string;
  name: string;
  strategyType: string;
  book: StrategyBook;
  underlyingTicker: string;
  collateralMode: CollateralMode;
  collateralYieldPctCDI?: number | null;
  status: 'OPEN' | 'CLOSED' | 'ROLLED';
  openedAt: string;
  closedAt?: string | null;
  notes?: string | null;
  legs: Array<{
    id: string;
    strategyId: string;
    positionId: string;
    allocatedQuantity: number;
    economicRole: 'FINANCING' | 'DIRECTIONAL' | 'HEDGE' | 'INCOME' | 'CUSTOM';
    position: EnrichedOptionPosition;
  }>;
}): EnrichedOptionStrategy {
  let netInitialCreditDebitReais = 0;
  let netPnlMtmReais = 0;
  let netEstimatedExitReais = 0;
  let maxElapsedDU = 0;
  let minRemainingDU = 999;
  let cdiRealizedReaisTotal = 0;

  for (const leg of params.legs) {
    const pos = leg.position;
    const isShort = pos.side === 'SELL' || pos.side === 'SHORT';
    const isLong = !isShort;
    const qty = leg.allocatedQuantity;
    const ratio = pos.quantity > 0 ? qty / pos.quantity : 1;

    // Fluxo Inicial
    if (isShort) {
      netInitialCreditDebitReais += pos.entryPrice * qty;
    } else {
      netInitialCreditDebitReais -= pos.entryPrice * qty;
    }

    // P&L MTM Proporcional
    const pnlMtmLeg = calculateSignedPnL({
      entryPrice: pos.entryPrice,
      currentPrice: pos.metrics.markPrice,
      quantityUnderlyingUnits: qty,
      side: isLong ? 'LONG' : 'SHORT',
    });
    netPnlMtmReais += pnlMtmLeg;

    const pnlExitLeg = calculateSignedPnL({
      entryPrice: pos.entryPrice,
      currentPrice: pos.metrics.estimatedExitPrice,
      quantityUnderlyingUnits: qty,
      side: isLong ? 'LONG' : 'SHORT',
    });
    netEstimatedExitReais += pnlExitLeg;

    if (pos.metrics.elapsedTradingDays > maxElapsedDU) {
      maxElapsedDU = pos.metrics.elapsedTradingDays;
    }
    if (pos.metrics.remainingTradingDays < minRemainingDU) {
      minRemainingDU = pos.metrics.remainingTradingDays;
    }

    cdiRealizedReaisTotal += pos.metrics.cdiRealizedReais * ratio;
  }

  if (minRemainingDU === 999) minRemainingDU = 0;

  const isNetCredit = netInitialCreditDebitReais >= 0;

  // Reconhecimento de Risco e Payoff Genérico da Estrutura
  const riskProfile = detectStrategyRiskAndPayoff({
    legs: params.legs,
    netInitialCreditDebitReais,
  });

  const totalCapitalReserved = riskProfile.capitalReservedReais;
  const maxLossEconomicReais = riskProfile.maxLossEconomicReais;
  const maxLossType = riskProfile.maxLossType;
  const breakEvenInferior = riskProfile.breakEvenInferior;
  const breakEvenSuperior = riskProfile.breakEvenSuperior;

  const roicPct = totalCapitalReserved > 0 ? (netPnlMtmReais / totalCapitalReserved) * 100 : 0;
  const alphaReais = netPnlMtmReais - cdiRealizedReaisTotal;
  const cdiMultiple = Math.abs(cdiRealizedReaisTotal) >= 0.05 ? netPnlMtmReais / cdiRealizedReaisTotal : null;

  // Performance Econômica da Estrutura (Double Yield Engine)
  const openedAtBusinessDate = parseBusinessDate(params.openedAt.slice(0, 10));
  const valuationDateStr: BusinessDate = (params.status === 'CLOSED' || params.status === 'ROLLED') && params.closedAt
    ? parseBusinessDate(params.closedAt.slice(0, 10))
    : getBrazilTodayDate();

  const entryDates = new Set(params.legs.map((l) => l.position.entryDate));
  const legsOpenedAtDifferentDates = entryDates.size > 1;

  const economicPerformance = calculateStrategyEconomicPerformance({
    startDate: openedAtBusinessDate,
    valuationDate: valuationDateStr,
    capitalReservedReais: totalCapitalReserved,
    capitalRemuneratedReais: params.collateralMode === 'IDLE_CASH' ? 0 : totalCapitalReserved,
    benchmarkCapitalReais: totalCapitalReserved,
    optionPnlReais: netPnlMtmReais,
    collateralMode: params.collateralMode,
    collateralPctCdi: params.collateralYieldPctCDI,
    maxLossEconomicReais,
    maxLossType,
    resultNature: params.status === 'CLOSED' ? 'REALIZED' : 'MTM',
    legsOpenedAtDifferentDates,
  });

  return {
    id: params.id,
    portfolio: params.portfolio,
    name: params.name,
    strategyType: params.strategyType,
    book: params.book,
    underlyingTicker: params.underlyingTicker,
    collateralMode: params.collateralMode,
    collateralYieldPctCDI: params.collateralYieldPctCDI ?? null,
    status: params.status,
    openedAt: params.openedAt,
    closedAt: params.closedAt ?? null,
    notes: params.notes ?? null,
    legs: params.legs,
    economicPerformance,
    metrics: {
      netInitialCreditDebitReais,
      isNetCredit,
      netPnlMtmReais,
      netEstimatedExitReais,
      totalCapitalReserved,
      maxLossEconomicReais,
      maxLossType,
      breakEvenInferior,
      breakEvenSuperior,
      roicPct,
      putToCallRatio: riskProfile.putToCallRatio,
      downsideExposureUnits: riskProfile.downsideExposureUnits,
      upsideParticipationUnits: riskProfile.upsideParticipationUnits,
      cdiRealizedReais: cdiRealizedReaisTotal,
      alphaReais,
      cdiMultiple,
      remainingTradingDays: minRemainingDU,
      elapsedTradingDays: maxElapsedDU,
      economicPerformance,
    },
  };
}

