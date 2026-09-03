import crypto from 'crypto';
import type { OptionPosition, OptionStrategy, OptionStrategyLeg, StrategyFundingSegment } from '@/lib/db/schema';
import {
  calculateStrategyCanonicalResidualRisk,
  type StrategyCanonicalResidualRisk,
} from './calculations';
import { isB3TradingDay, getBrazilTodayDate, type BusinessDate } from './b3-calendar';

// ─── Proportional & GCD Helpers ─────────────────────────────────────
export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export function calculateLegsGcd(quantities: number[]): number {
  if (quantities.length === 0) return 0;
  return quantities.reduce((acc, q) => gcd(acc, q));
}

export function formatLegsRatio(legs: Array<{ quantity: number }>): string {
  if (legs.length === 0) return '';
  const g = calculateLegsGcd(legs.map((l) => l.quantity));
  if (g === 0) return legs.map(() => '0').join(':');
  return legs.map((l) => (l.quantity / g).toString()).join(':');
}

// ─── Contratos DTO Tipados e Fechados ───────────────────────────────
export interface RatioComponent {
  strategyLegId: string;
  ticker: string;
  side: string;
  optionType: 'CALL' | 'PUT';
  unitsPerStrategyUnit: number;
}

export interface ManeuverPreviewExecution {
  strategyLegId: string;
  positionId: string;
  ticker: string;
  optionType: 'CALL' | 'PUT';
  side: string;
  executionType: 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE';
  quantity: number;
  price: number;
  feesReais: number;
  grossRealizedPnlReais: number;
  netRealizedPnlReais: number;
  expectedLegOpenBefore: number;
  expectedPositionOpenBefore: number;
  residualLegQuantity: number;
}

export interface ManeuverPlan {
  previewFingerprint: string;
  strategyId: string;
  maneuverType: 'SCALE_DOWN' | 'LEG_CLOSE';
  executionDate: string;

  percentageReduced?: number;
  unitsReduced?: number;

  executions: ManeuverPreviewExecution[];

  grossRealizedPnlReais: number;
  feesReais: number;
  netRealizedPnlReais: number;

  ratioBefore: string;
  ratioAfter: string;
  ratioComponentsBefore: RatioComponent[];
  ratioComponentsAfter: RatioComponent[];
  preservesPreManeuverRatio: boolean;
  preservesOriginalRatio: boolean;

  beforeRisk: StrategyCanonicalResidualRisk;
  afterRisk: StrategyCanonicalResidualRisk;
  beforeBenchmarkCapitalReais: number;
  afterBenchmarkCapitalReais: number;
  capitalDeltaReais: number | null;
  capitalReleasedReais: number | null;
  additionalCapitalRequiredReais: number | null;

  strategyWillClose: boolean;
  fundingTransition:
    | {
        type: 'CLOSE_AND_OPEN_NEW_SEGMENT';
        beforeCapital: number;
        afterCapital: number;
        executionDate: string;
      }
    | {
        type: 'CLOSE_FINAL_SEGMENT';
        executionDate: string;
      };
}

export interface ManeuverHistoryExecutionDTO {
  executionId: string;
  ticker: string;
  optionType: 'CALL' | 'PUT';
  side: string;
  executionType: 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE';
  quantity: number;
  price: number;
  feesReais: number;
  grossRealizedPnlReais: number;
  netRealizedPnlReais: number;
}

export interface ManeuverHistoryDTO {
  maneuverEventId: string;
  strategyId: string;
  executionDate: string;
  createdAt: string;
  maneuverType: 'SCALE_DOWN' | 'LEG_CLOSE' | 'FULL_CLOSE' | 'ROLL';
  percentageReduced?: number | null;
  unitsReduced?: number | null;
  auditRatioBefore?: string | null;
  auditRatioAfter?: string | null;
  preservesOriginalRatio: boolean;
  auditCapitalReleasedReais?: number | null;
  executions: ManeuverHistoryExecutionDTO[];
  grossRealizedPnlReais: number;
  feesReais: number;
  netRealizedPnlReais: number;
}

// ─── Fingerprint Criptográfico Determinístico ───────────────────────
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [
          key,
          canonicalize((value as Record<string, unknown>)[key]),
        ])
    );
  }
  return value;
}

export function createManeuverFingerprint(payload: Record<string, any>): string {
  const serialized = JSON.stringify(canonicalize(payload));
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

// ─── Helper de Rótulos Semânticos de Razão ─────────────────────────
export function buildRatioComponents(
  legs: OptionStrategyLeg[],
  quantitiesByLegId: Map<string, number>,
  positionsMap: Map<string, OptionPosition>
): { ratioString: string; components: RatioComponent[] } {
  const activeLegs = legs.filter((l) => (quantitiesByLegId.get(l.id) || 0) > 0);
  if (activeLegs.length === 0) {
    return { ratioString: '', components: [] };
  }

  const quantities = activeLegs.map((l) => quantitiesByLegId.get(l.id)!);
  const legGcd = calculateLegsGcd(quantities);

  const components: RatioComponent[] = activeLegs.map((l) => {
    const pos = positionsMap.get(l.positionId);
    const qty = quantitiesByLegId.get(l.id)!;
    const units = legGcd > 0 ? qty / legGcd : 0;
    return {
      strategyLegId: l.id,
      ticker: pos?.tickerOption || l.positionId,
      side: pos?.side || 'UNKNOWN',
      optionType: (pos?.optionType || 'CALL') as 'CALL' | 'PUT',
      unitsPerStrategyUnit: units,
    };
  });

  const ratioString = components
    .map((c) => `${c.unitsPerStrategyUnit} ${c.optionType} ${c.side}`)
    .join(' : ');

  return { ratioString, components };
}

// ─── Planner Puro: SCALE_DOWN Proporcional ─────────────────────────
export interface BuildScaleDownPlanParams {
  strategy: OptionStrategy;
  allLegs: OptionStrategyLeg[];
  openLegs: OptionStrategyLeg[];
  positionsMap: Map<string, OptionPosition>;
  openSegment?: StrategyFundingSegment | null;
  percentageReduced: number;
  executionDate: string;
  legInputs: Array<{ strategyLegId: string; price: number; feesReais?: number }>;
  notes?: string;
}

export function buildScaleDownManeuverPlan(
  params: BuildScaleDownPlanParams
): { success: true; plan: ManeuverPlan } | { success: false; error: string; errorCode: string } {
  const {
    strategy,
    allLegs,
    openLegs,
    positionsMap,
    openSegment,
    percentageReduced,
    executionDate,
    legInputs,
  } = params;

  // 1. Validação de Fronteira
  if (!Number.isFinite(percentageReduced) || percentageReduced <= 0 || percentageReduced >= 100) {
    return {
      success: false,
      errorCode: 'INVALID_SCALE_DOWN_PERCENTAGE',
      error: 'INVALID_SCALE_DOWN_PERCENTAGE: A porcentagem de redução deve estar entre 0% e 100% (exclusivos).',
    };
  }

  if (executionDate > getBrazilTodayDate()) {
    return {
      success: false,
      errorCode: 'FUTURE_EXECUTION_DATE_NOT_ALLOWED',
      error: 'FUTURE_EXECUTION_DATE_NOT_ALLOWED: A data de execução não pode estar no futuro.',
    };
  }

  let isTradingDay = false;
  try {
    isTradingDay = isB3TradingDay(executionDate as BusinessDate);
  } catch {
    isTradingDay = false;
  }

  if (!isTradingDay) {
    return {
      success: false,
      errorCode: 'INVALID_EXECUTION_DATE_NON_TRADING_DAY',
      error: 'INVALID_EXECUTION_DATE_NON_TRADING_DAY: A data de execução deve corresponder a um pregão válido da B3.',
    };
  }

  if (strategy.status !== 'OPEN') {
    return {
      success: false,
      errorCode: 'STRATEGY_NOT_OPEN',
      error: 'STRATEGY_NOT_OPEN: A estratégia não está aberta para manobras.',
    };
  }

  if (openLegs.length === 0) {
    return {
      success: false,
      errorCode: 'NO_OPEN_LEGS_IN_STRATEGY',
      error: 'NO_OPEN_LEGS_IN_STRATEGY: Não há pernas abertas na estratégia para redução.',
    };
  }

  if (!Array.isArray(legInputs) || legInputs.length !== openLegs.length) {
    return {
      success: false,
      errorCode: 'MISSING_LEG_INPUT',
      error: `MISSING_LEG_INPUT: O cliente deve fornecer exatamente uma entrada de execução para cada perna aberta da estratégia (esperado: ${openLegs.length}, recebido: ${legInputs?.length ?? 0}).`,
    };
  }

  const legInputMap = new Map<string, { price: number; feesReais: number }>();
  const seenLegIds = new Set<string>();

  for (const input of legInputs) {
    if (seenLegIds.has(input.strategyLegId)) {
      return {
        success: false,
        errorCode: 'DUPLICATE_LEG_INPUT',
        error: `DUPLICATE_LEG_INPUT: Perna '${input.strategyLegId}' fornecida em duplicidade.`,
      };
    }
    seenLegIds.add(input.strategyLegId);

    if (!openLegs.some((l) => l.id === input.strategyLegId)) {
      return {
        success: false,
        errorCode: 'INVALID_LEG_INPUT',
        error: `INVALID_LEG_INPUT: Perna '${input.strategyLegId}' não pertence à estratégia ou já se encontra fechada.`,
      };
    }
    if (!Number.isFinite(input.price) || input.price < 0) {
      return {
        success: false,
        errorCode: 'INVALID_PRICE',
        error: `INVALID_PRICE: Preço inválido para a perna '${input.strategyLegId}'. Preço deve ser um número finito não negativo.`,
      };
    }
    const fees = input.feesReais || 0;
    if (!Number.isFinite(fees) || fees < 0) {
      return {
        success: false,
        errorCode: 'INVALID_FEES',
        error: `INVALID_FEES: Custos inválidos para a perna '${input.strategyLegId}'. Custos devem ser um número finito não negativo.`,
      };
    }
    legInputMap.set(input.strategyLegId, { price: input.price, feesReais: fees });
  }

  // 2. MDC e Derivação Canônica das Quantidades
  const openQuantities = openLegs.map((l) =>
    l.openAllocatedQuantity ?? Math.max(0, l.allocatedQuantity - (l.closedAllocatedQuantity ?? 0))
  );
  const strategyGcd = calculateLegsGcd(openQuantities);
  const unitsToReduce = (strategyGcd * percentageReduced) / 100.0;

  if (!Number.isInteger(unitsToReduce) || unitsToReduce < 1) {
    return {
      success: false,
      errorCode: 'SCALE_DOWN_PERCENTAGE_NOT_REPRESENTABLE',
      error: `SCALE_DOWN_PERCENTAGE_NOT_REPRESENTABLE: A porcentagem ${percentageReduced}% sobre a unidade base da estratégia (MDC: ${strategyGcd}) resulta em ${unitsToReduce} unidades, que não é um número inteiro de contratos.`,
    };
  }

  const qtyToCloseByLegId = new Map<string, number>();
  const newOpenByLegId = new Map<string, number>();
  const curOpenByLegId = new Map<string, number>();

  for (let i = 0; i < openLegs.length; i++) {
    const leg = openLegs[i];
    const curOpen = openQuantities[i];
    curOpenByLegId.set(leg.id, curOpen);
    const legRatioMultiplier = curOpen / strategyGcd;
    const legQtyToClose = legRatioMultiplier * unitsToReduce;
    qtyToCloseByLegId.set(leg.id, legQtyToClose);
    newOpenByLegId.set(leg.id, curOpen - legQtyToClose);
  }

  // 3. Validação das Posições
  for (const leg of openLegs) {
    const pos = positionsMap.get(leg.positionId);
    if (!pos) {
      return {
        success: false,
        errorCode: 'POSITION_NOT_FOUND',
        error: `POSITION_NOT_FOUND: Posição para a perna '${leg.id}' não encontrada.`,
      };
    }
    if (pos.status !== 'OPEN') {
      return {
        success: false,
        errorCode: 'POSITION_NOT_OPEN',
        error: `POSITION_NOT_OPEN: Posição '${pos.tickerOption}' não está aberta.`,
      };
    }
    if (executionDate < pos.entryDate) {
      return {
        success: false,
        errorCode: 'EXECUTION_DATE_BEFORE_ENTRY_DATE',
        error: `EXECUTION_DATE_BEFORE_ENTRY_DATE: Data de execução (${executionDate}) não pode ser anterior à data de entrada (${pos.entryDate}).`,
      };
    }
    const posOpenQty = pos.openQuantity ?? pos.quantity;
    const qtyToClose = qtyToCloseByLegId.get(leg.id)!;
    if (qtyToClose > posOpenQty) {
      return {
        success: false,
        errorCode: 'INSUFFICIENT_POSITION_OPEN_QUANTITY',
        error: `INSUFFICIENT_POSITION_OPEN_QUANTITY: Quantidade a encerrar (${qtyToClose}) excede saldo da posição (${posOpenQty}).`,
      };
    }
  }

  // 4. Cálculo das Execuções Planejadas
  let totalGrossRealizedPnl = 0;
  let totalFees = 0;
  const executions: ManeuverPreviewExecution[] = [];

  for (const leg of openLegs) {
    const pos = positionsMap.get(leg.positionId)!;
    const legInput = legInputMap.get(leg.id)!;
    const qtyToClose = qtyToCloseByLegId.get(leg.id)!;
    const curOpen = curOpenByLegId.get(leg.id)!;
    const posOpenQty = pos.openQuantity ?? pos.quantity;

    const isSell = pos.side === 'SELL' || (pos.side as any) === 'SHORT';
    const executionType: 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE' = isSell ? 'BUY_TO_CLOSE' : 'SELL_TO_CLOSE';
    const unitGrossPnl = isSell ? pos.entryPrice - legInput.price : legInput.price - pos.entryPrice;
    const grossRealizedPnlReais = Math.round(unitGrossPnl * qtyToClose * 100) / 100;
    const fees = legInput.feesReais;
    const netRealizedPnlReais = Math.round((grossRealizedPnlReais - fees) * 100) / 100;

    totalGrossRealizedPnl += grossRealizedPnlReais;
    totalFees += fees;

    executions.push({
      strategyLegId: leg.id,
      positionId: pos.id,
      ticker: pos.tickerOption,
      optionType: pos.optionType as 'CALL' | 'PUT',
      side: pos.side,
      executionType,
      quantity: qtyToClose,
      price: legInput.price,
      feesReais: fees,
      grossRealizedPnlReais,
      netRealizedPnlReais,
      expectedLegOpenBefore: curOpen,
      expectedPositionOpenBefore: posOpenQty,
      residualLegQuantity: curOpen - qtyToClose,
    });
  }

  totalGrossRealizedPnl = Math.round(totalGrossRealizedPnl * 100) / 100;
  totalFees = Math.round(totalFees * 100) / 100;
  const netRealizedPnlReais = Math.round((totalGrossRealizedPnl - totalFees) * 100) / 100;

  // 5. Análise Semântica de Ratios
  const origQtyByLegId = new Map<string, number>(allLegs.map((l) => [l.id, l.allocatedQuantity]));
  const originalRatioInfo = buildRatioComponents(allLegs, origQtyByLegId, positionsMap);
  const beforeRatioInfo = buildRatioComponents(openLegs, curOpenByLegId, positionsMap);
  const afterRatioInfo = buildRatioComponents(openLegs, newOpenByLegId, positionsMap);

  const rawOriginalRatio = formatLegsRatio(allLegs.map((l) => ({ quantity: l.allocatedQuantity })));
  const rawRatioBefore = formatLegsRatio(openLegs.map((l) => ({ quantity: curOpenByLegId.get(l.id)! })));
  const rawRatioAfter = formatLegsRatio(openLegs.map((l) => ({ quantity: newOpenByLegId.get(l.id)! })));

  const preservesPreManeuverRatio = rawRatioAfter !== '' && rawRatioAfter === rawRatioBefore;
  const preservesOriginalRatio = rawRatioAfter !== '' && rawRatioAfter === rawOriginalRatio;

  // 6. Risco e Capital Canônico (Antes e Depois)
  const beforeLegsForBenchmark = openLegs.map((l) => {
    const p = positionsMap.get(l.positionId)!;
    return {
      allocatedQuantity: curOpenByLegId.get(l.id)!,
      economicRole: l.economicRole,
      position: {
        optionType: p.optionType as 'CALL' | 'PUT',
        side: p.side as 'SELL' | 'SHORT' | 'BUY' | 'LONG',
        strike: p.strike,
        entryPrice: p.entryPrice,
        underlyingCurrentSpot: p.underlyingCurrentSpot,
        expirationDate: p.expirationDate,
      },
    };
  });

  const remainingLegsForBenchmark = openLegs.map((l) => {
    const p = positionsMap.get(l.positionId)!;
    return {
      allocatedQuantity: newOpenByLegId.get(l.id)!,
      economicRole: l.economicRole,
      position: {
        optionType: p.optionType as 'CALL' | 'PUT',
        side: p.side as 'SELL' | 'SHORT' | 'BUY' | 'LONG',
        strike: p.strike,
        entryPrice: p.entryPrice,
        underlyingCurrentSpot: p.underlyingCurrentSpot,
        expirationDate: p.expirationDate,
      },
    };
  });

  const beforeRisk = calculateStrategyCanonicalResidualRisk(beforeLegsForBenchmark);
  const afterRisk = calculateStrategyCanonicalResidualRisk(remainingLegsForBenchmark);

  const beforeBenchmarkCapitalReais = beforeRisk.benchmarkCapitalReais;
  const afterBenchmarkCapitalReais = afterRisk.benchmarkCapitalReais;

  // Capital liberado é quantitativamente comparável apenas quando ambos os estados forem finitos/conhecidos
  const isBeforeComparable = beforeRisk.riskRecognitionQuality !== 'UNKNOWN' && beforeRisk.maxLossType !== 'UNBOUNDED';
  const isAfterComparable = afterRisk.riskRecognitionQuality !== 'UNKNOWN' && afterRisk.maxLossType !== 'UNBOUNDED';

  const capitalDeltaReais = isBeforeComparable && isAfterComparable
    ? Math.round((afterBenchmarkCapitalReais - beforeBenchmarkCapitalReais) * 100) / 100
    : null;

  const capitalReleasedReais = isBeforeComparable && isAfterComparable
    ? Math.max(0, Math.round((beforeBenchmarkCapitalReais - afterBenchmarkCapitalReais) * 100) / 100)
    : null;

  const additionalCapitalRequiredReais = isBeforeComparable && isAfterComparable
    ? Math.max(0, Math.round((afterBenchmarkCapitalReais - beforeBenchmarkCapitalReais) * 100) / 100)
    : null;

  // 7. Fingerprint Determinístico (ordenado explicitamente por legId)
  const sortedLegsState = openLegs
    .map((l) => {
      const pos = positionsMap.get(l.positionId);
      return {
        legId: l.id,
        positionId: l.positionId,
        economicRole: l.economicRole,
        originalAllocatedQuantity: l.allocatedQuantity,
        openAllocatedQuantity: curOpenByLegId.get(l.id)!,
        positionOpenQuantity: pos?.openQuantity ?? pos?.quantity ?? 0,
        entryPrice: pos?.entryPrice ?? 0,
        underlyingCurrentSpot: pos?.underlyingCurrentSpot ?? null,
        strike: pos?.strike ?? 0,
        side: pos?.side ?? 'UNKNOWN',
        optionType: pos?.optionType ?? 'CALL',
        expirationDate: pos?.expirationDate ?? '',
      };
    })
    .sort((a, b) => a.legId.localeCompare(b.legId));

  const sortedInputs = legInputs
    .map((i) => ({
      legId: i.strategyLegId,
      price: i.price,
      fees: i.feesReais || 0,
    }))
    .sort((a, b) => a.legId.localeCompare(b.legId));

  const fingerprintPayload = {
    strategyId: strategy.id,
    strategyCollateralMode: strategy.collateralMode ?? null,
    strategyCollateralYieldPctCDI: (strategy as any).collateralYieldPctCDI ?? null,
    collateralCoveragePct: (strategy as any).collateralCoveragePct ?? null,
    maneuverType: 'SCALE_DOWN',
    executionDate,
    percentageReduced,
    unitsReduced: unitsToReduce,
    legsState: sortedLegsState,
    inputs: sortedInputs,
    openSegment: openSegment
      ? {
          id: openSegment.id,
          benchmarkCapitalReais: openSegment.benchmarkCapitalReais,
          capitalRemuneratedReais: openSegment.capitalRemuneratedReais,
          collateralMode: openSegment.collateralMode,
          collateralPctCdi: openSegment.collateralPctCdi,
          quality: (openSegment as any).quality ?? null,
        }
      : null,
  };
  const previewFingerprint = createManeuverFingerprint(fingerprintPayload);

  return {
    success: true,
    plan: {
      previewFingerprint,
      strategyId: strategy.id,
      maneuverType: 'SCALE_DOWN',
      executionDate,
      percentageReduced,
      unitsReduced: unitsToReduce,
      executions,
      grossRealizedPnlReais: totalGrossRealizedPnl,
      feesReais: totalFees,
      netRealizedPnlReais,
      ratioBefore: beforeRatioInfo.ratioString,
      ratioAfter: afterRatioInfo.ratioString,
      ratioComponentsBefore: beforeRatioInfo.components,
      ratioComponentsAfter: afterRatioInfo.components,
      preservesPreManeuverRatio,
      preservesOriginalRatio,
      beforeRisk,
      afterRisk,
      beforeBenchmarkCapitalReais,
      afterBenchmarkCapitalReais,
      capitalDeltaReais,
      capitalReleasedReais,
      additionalCapitalRequiredReais,
      strategyWillClose: false,
      fundingTransition: {
        type: 'CLOSE_AND_OPEN_NEW_SEGMENT',
        beforeCapital: beforeBenchmarkCapitalReais,
        afterCapital: afterBenchmarkCapitalReais,
        executionDate,
      },
    },
  };
}

// ─── Planner Puro: LEG_CLOSE Parcial ───────────────────────────────
export interface BuildPartialLegClosePlanParams {
  strategy: OptionStrategy;
  allLegs: OptionStrategyLeg[];
  targetLeg: OptionStrategyLeg;
  positionsMap: Map<string, OptionPosition>;
  openSegment?: StrategyFundingSegment | null;
  quantity: number;
  price: number;
  feesReais?: number;
  executionDate: string;
  notes?: string;
}

export function buildPartialLegCloseManeuverPlan(
  params: BuildPartialLegClosePlanParams
): { success: true; plan: ManeuverPlan } | { success: false; error: string; errorCode: string } {
  const {
    strategy,
    allLegs,
    targetLeg,
    positionsMap,
    openSegment,
    quantity,
    price,
    feesReais = 0,
    executionDate,
  } = params;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return {
      success: false,
      errorCode: 'INVALID_QUANTITY',
      error: 'INVALID_QUANTITY: Quantidade deve ser um número inteiro positivo.',
    };
  }

  if (!Number.isFinite(price) || price < 0) {
    return {
      success: false,
      errorCode: 'INVALID_PRICE',
      error: 'INVALID_PRICE: Preço deve ser um número finito não negativo.',
    };
  }

  if (!Number.isFinite(feesReais) || feesReais < 0) {
    return {
      success: false,
      errorCode: 'INVALID_FEES',
      error: 'INVALID_FEES: Custos devem ser um número finito não negativo.',
    };
  }

  if (executionDate > getBrazilTodayDate()) {
    return {
      success: false,
      errorCode: 'FUTURE_EXECUTION_DATE_NOT_ALLOWED',
      error: 'FUTURE_EXECUTION_DATE_NOT_ALLOWED: A data de execução não pode estar no futuro.',
    };
  }

  let isTradingDay = false;
  try {
    isTradingDay = isB3TradingDay(executionDate as BusinessDate);
  } catch {
    isTradingDay = false;
  }

  if (!isTradingDay) {
    return {
      success: false,
      errorCode: 'INVALID_EXECUTION_DATE_NON_TRADING_DAY',
      error: 'INVALID_EXECUTION_DATE_NON_TRADING_DAY: A data de execução deve corresponder a um pregão válido da B3.',
    };
  }

  if (strategy.status !== 'OPEN') {
    return {
      success: false,
      errorCode: 'STRATEGY_NOT_OPEN',
      error: 'STRATEGY_NOT_OPEN: A estratégia não está aberta para manobras.',
    };
  }

  const legOpenQty = targetLeg.openAllocatedQuantity ?? Math.max(0, targetLeg.allocatedQuantity - (targetLeg.closedAllocatedQuantity ?? 0));
  if (quantity > legOpenQty) {
    return {
      success: false,
      errorCode: 'INSUFFICIENT_LEG_OPEN_QUANTITY',
      error: `INSUFFICIENT_LEG_OPEN_QUANTITY: Quantidade solicitada (${quantity}) excede o saldo aberto da perna (${legOpenQty}).`,
    };
  }

  const pos = positionsMap.get(targetLeg.positionId);
  if (!pos) {
    return {
      success: false,
      errorCode: 'POSITION_NOT_FOUND',
      error: 'POSITION_NOT_FOUND: Posição correspondente à perna não encontrada.',
    };
  }
  if (pos.status !== 'OPEN') {
    return {
      success: false,
      errorCode: 'POSITION_NOT_OPEN',
      error: 'POSITION_NOT_OPEN: Posição correspondente não está aberta.',
    };
  }
  if (executionDate < pos.entryDate) {
    return {
      success: false,
      errorCode: 'EXECUTION_DATE_BEFORE_ENTRY_DATE',
      error: `EXECUTION_DATE_BEFORE_ENTRY_DATE: Data de execução (${executionDate}) não pode ser anterior à data de entrada (${pos.entryDate}).`,
    };
  }

  const posOpenQty = pos.openQuantity ?? pos.quantity;
  if (quantity > posOpenQty) {
    return {
      success: false,
      errorCode: 'INSUFFICIENT_POSITION_OPEN_QUANTITY',
      error: `INSUFFICIENT_POSITION_OPEN_QUANTITY: Quantidade solicitada (${quantity}) excede saldo da posição (${posOpenQty}).`,
    };
  }

  const isSell = pos.side === 'SELL' || (pos.side as any) === 'SHORT';
  const executionType: 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE' = isSell ? 'BUY_TO_CLOSE' : 'SELL_TO_CLOSE';
  const unitGrossPnl = isSell ? pos.entryPrice - price : price - pos.entryPrice;
  const grossRealizedPnlReais = Math.round(unitGrossPnl * quantity * 100) / 100;
  const netRealizedPnlReais = Math.round((grossRealizedPnlReais - feesReais) * 100) / 100;

  const executions: ManeuverPreviewExecution[] = [
    {
      strategyLegId: targetLeg.id,
      positionId: pos.id,
      ticker: pos.tickerOption,
      optionType: pos.optionType as 'CALL' | 'PUT',
      side: pos.side,
      executionType,
      quantity,
      price,
      feesReais,
      grossRealizedPnlReais,
      netRealizedPnlReais,
      expectedLegOpenBefore: legOpenQty,
      expectedPositionOpenBefore: posOpenQty,
      residualLegQuantity: legOpenQty - quantity,
    },
  ];

  // Mapas de quantidades antes e depois
  const curOpenByLegId = new Map<string, number>();
  const newOpenByLegId = new Map<string, number>();

  for (const l of allLegs) {
    const curOpen = l.openAllocatedQuantity ?? Math.max(0, l.allocatedQuantity - (l.closedAllocatedQuantity ?? 0));
    curOpenByLegId.set(l.id, curOpen);
    if (l.id === targetLeg.id) {
      newOpenByLegId.set(l.id, curOpen - quantity);
    } else {
      newOpenByLegId.set(l.id, curOpen);
    }
  }

  // Verificar se a estratégia fechará completamente
  let remainingOpenTotal = 0;
  for (const [, openQ] of newOpenByLegId) {
    remainingOpenTotal += openQ;
  }
  const strategyWillClose = remainingOpenTotal === 0;

  // Ratios
  const origQtyByLegId = new Map<string, number>(allLegs.map((l) => [l.id, l.allocatedQuantity]));
  const originalRatioInfo = buildRatioComponents(allLegs, origQtyByLegId, positionsMap);
  const beforeRatioInfo = buildRatioComponents(allLegs, curOpenByLegId, positionsMap);
  const afterRatioInfo = buildRatioComponents(allLegs, newOpenByLegId, positionsMap);

  const rawOriginalRatio = formatLegsRatio(allLegs.map((l) => ({ quantity: l.allocatedQuantity })));
  const rawRatioBefore = formatLegsRatio(allLegs.map((l) => ({ quantity: curOpenByLegId.get(l.id)! })));
  const rawRatioAfter = formatLegsRatio(allLegs.map((l) => ({ quantity: newOpenByLegId.get(l.id)! })));

  const preservesPreManeuverRatio = rawRatioAfter !== '' && rawRatioAfter === rawRatioBefore;
  const preservesOriginalRatio = rawRatioAfter !== '' && rawRatioAfter === rawOriginalRatio;

  // Risco canônico antes e depois
  const beforeLegsForBenchmark = allLegs
    .filter((l) => curOpenByLegId.get(l.id)! > 0)
    .map((l) => {
      const p = positionsMap.get(l.positionId)!;
      return {
        allocatedQuantity: curOpenByLegId.get(l.id)!,
        economicRole: l.economicRole,
        position: {
          optionType: p.optionType as 'CALL' | 'PUT',
          side: p.side as 'SELL' | 'SHORT' | 'BUY' | 'LONG',
          strike: p.strike,
          entryPrice: p.entryPrice,
          underlyingCurrentSpot: p.underlyingCurrentSpot,
          expirationDate: p.expirationDate,
        },
      };
    });

  const remainingLegsForBenchmark = allLegs
    .filter((l) => newOpenByLegId.get(l.id)! > 0)
    .map((l) => {
      const p = positionsMap.get(l.positionId)!;
      return {
        allocatedQuantity: newOpenByLegId.get(l.id)!,
        economicRole: l.economicRole,
        position: {
          optionType: p.optionType as 'CALL' | 'PUT',
          side: p.side as 'SELL' | 'SHORT' | 'BUY' | 'LONG',
          strike: p.strike,
          entryPrice: p.entryPrice,
          underlyingCurrentSpot: p.underlyingCurrentSpot,
          expirationDate: p.expirationDate,
        },
      };
    });

  const beforeRisk = calculateStrategyCanonicalResidualRisk(beforeLegsForBenchmark);
  const afterRisk = calculateStrategyCanonicalResidualRisk(remainingLegsForBenchmark);

  const beforeBenchmarkCapitalReais = beforeRisk.benchmarkCapitalReais;
  const afterBenchmarkCapitalReais = strategyWillClose ? 0 : afterRisk.benchmarkCapitalReais;

  const isBeforeComparable = beforeRisk.riskRecognitionQuality !== 'UNKNOWN' && beforeRisk.maxLossType !== 'UNBOUNDED';
  const isAfterComparable = strategyWillClose || (afterRisk.riskRecognitionQuality !== 'UNKNOWN' && afterRisk.maxLossType !== 'UNBOUNDED');

  const capitalDeltaReais = isBeforeComparable && isAfterComparable
    ? Math.round((afterBenchmarkCapitalReais - beforeBenchmarkCapitalReais) * 100) / 100
    : null;

  const capitalReleasedReais = isBeforeComparable && isAfterComparable
    ? Math.max(0, Math.round((beforeBenchmarkCapitalReais - afterBenchmarkCapitalReais) * 100) / 100)
    : null;

  const additionalCapitalRequiredReais = isBeforeComparable && isAfterComparable
    ? Math.max(0, Math.round((afterBenchmarkCapitalReais - beforeBenchmarkCapitalReais) * 100) / 100)
    : null;

  // 7. Fingerprint Determinístico (ordenado explicitamente por legId)
  const sortedLegsState = allLegs
    .map((l) => {
      const p = positionsMap.get(l.positionId);
      return {
        legId: l.id,
        positionId: l.positionId,
        economicRole: l.economicRole,
        originalAllocatedQuantity: l.allocatedQuantity,
        openAllocatedQuantity: curOpenByLegId.get(l.id)!,
        positionOpenQuantity: p?.openQuantity ?? p?.quantity ?? 0,
        entryPrice: p?.entryPrice ?? 0,
        underlyingCurrentSpot: p?.underlyingCurrentSpot ?? null,
        strike: p?.strike ?? 0,
        side: p?.side ?? 'UNKNOWN',
        optionType: p?.optionType ?? 'CALL',
        expirationDate: p?.expirationDate ?? '',
      };
    })
    .sort((a, b) => a.legId.localeCompare(b.legId));

  const fingerprintPayload = {
    strategyId: strategy.id,
    strategyCollateralMode: strategy.collateralMode ?? null,
    strategyCollateralYieldPctCDI: (strategy as any).collateralYieldPctCDI ?? null,
    collateralCoveragePct: (strategy as any).collateralCoveragePct ?? null,
    maneuverType: 'LEG_CLOSE',
    executionDate,
    targetLegId: targetLeg.id,
    quantity,
    price,
    fees: feesReais,
    legsState: sortedLegsState,
    openSegment: openSegment
      ? {
          id: openSegment.id,
          benchmarkCapitalReais: openSegment.benchmarkCapitalReais,
          capitalRemuneratedReais: openSegment.capitalRemuneratedReais,
          collateralMode: openSegment.collateralMode,
          collateralPctCdi: openSegment.collateralPctCdi,
          quality: (openSegment as any).quality ?? null,
        }
      : null,
  };
  const previewFingerprint = createManeuverFingerprint(fingerprintPayload);

  return {
    success: true,
    plan: {
      previewFingerprint,
      strategyId: strategy.id,
      maneuverType: 'LEG_CLOSE',
      executionDate,
      executions,
      grossRealizedPnlReais,
      feesReais,
      netRealizedPnlReais,
      ratioBefore: beforeRatioInfo.ratioString,
      ratioAfter: afterRatioInfo.ratioString,
      ratioComponentsBefore: beforeRatioInfo.components,
      ratioComponentsAfter: afterRatioInfo.components,
      preservesPreManeuverRatio,
      preservesOriginalRatio,
      beforeRisk,
      afterRisk,
      beforeBenchmarkCapitalReais,
      afterBenchmarkCapitalReais,
      capitalDeltaReais,
      capitalReleasedReais,
      additionalCapitalRequiredReais,
      strategyWillClose,
      fundingTransition: strategyWillClose
        ? { type: 'CLOSE_FINAL_SEGMENT', executionDate }
        : {
            type: 'CLOSE_AND_OPEN_NEW_SEGMENT',
            beforeCapital: beforeBenchmarkCapitalReais,
            afterCapital: afterBenchmarkCapitalReais,
            executionDate,
          },
    },
  };
}
