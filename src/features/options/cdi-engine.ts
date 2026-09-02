/**
 * CDI / DI Accrual Engine (Canonical B3 Methodology)
 * Acumulação diária oficial da Taxa DI (Fator DI) e projeção Selic Proxy.
 */

import { type BusinessDate, parseBusinessDate, getB3TradingDays } from './b3-calendar';

export type AnnualRateDecimal = number; // Sempre em decimal: 0.14 = 14% a.a.

/**
 * Normaliza qualquer taxa recebida (percentual ou decimal) para o padrão estrito decimal (ex: 0.14 = 14% a.a.)
 */
export function toAnnualRateDecimal(raw?: number | null, fallback: AnnualRateDecimal = 0.14): AnnualRateDecimal {
  if (raw === undefined || raw === null || isNaN(raw) || raw <= 0) {
    return fallback;
  }
  // Se for maior que 1 (ex: 14.0 ou 13.9), converte de percentual para decimal (0.14)
  if (raw > 1.0) {
    return raw / 100.0;
  }
  // Já é decimal estrito (ex: 0.14)
  return raw;
}

export function normalizeAnnualRate(raw: number, unit: 'PERCENT' | 'DECIMAL'): AnnualRateDecimal {
  if (unit === 'PERCENT') {
    return raw / 100.0;
  }
  return raw;
}

/**
 * Calcula o Fator Diário oficial da Taxa DI da B3 em base 252 dias úteis
 * Fórmula oficial B3: (1 + TaxaAnualDecimal)^(1/252)
 */
export function calculateB3DailyFactor(annualRateDecimal: AnnualRateDecimal): number {
  return Math.pow(1 + annualRateDecimal, 1.0 / 252.0);
}

export interface DIDailyObservation {
  date: BusinessDate;
  annualRateDecimal: AnnualRateDecimal;
  dailyFactor: number; // Fator diário oficial B3: (1 + DI_anual)^(1/252)
  source: string;
}

/**
 * Série canônica de taxas da Taxa DI da B3 (13.90% a.a. / 14.00% a.a.)
 */
const CANONICAL_DI_RATES = new Map<BusinessDate, { annualRateDecimal: AnnualRateDecimal; source: string }>([
  ['2026-08-24', { annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
  ['2026-08-25', { annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
  ['2026-08-26', { annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
  ['2026-08-27', { annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
  ['2026-08-28', { annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
  ['2026-08-31', { annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
  ['2026-09-01', { annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
  ['2026-09-02', { annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
]);

export interface RealizedDiResult {
  accumulatedFactor: number; // Ex: 1.003105
  periodYieldDecimal: number; // Factor - 1 (ex: 0.003105)
  isEstimated: boolean;
  observationsCount: number;
  datesUsed: BusinessDate[];
}

/**
 * Calcula a acumulação diária realizada do CDI entre duas datas de negócio (openDate, valuationDate]
 */
export function calculateRealizedDiFactor(
  openDateStr: BusinessDate,
  valuationDateStr: BusinessDate,
  fallbackAnnualRate: AnnualRateDecimal = 0.14
): RealizedDiResult {
  const openDate = parseBusinessDate(openDateStr);
  const valDate = parseBusinessDate(valuationDateStr);
  const safeFallback = toAnnualRateDecimal(fallbackAnnualRate);

  const tradingDays = getB3TradingDays(openDate, valDate, 'EXCLUDE_START_INCLUDE_END');

  if (tradingDays.length === 0) {
    return {
      accumulatedFactor: 1.0,
      periodYieldDecimal: 0.0,
      isEstimated: false,
      observationsCount: 0,
      datesUsed: [],
    };
  }

  let accumulatedFactor = 1.0;
  let isEstimated = false;
  let count = 0;
  const datesUsed: BusinessDate[] = [];

  for (const day of tradingDays) {
    const obs = CANONICAL_DI_RATES.get(day);
    if (obs) {
      accumulatedFactor *= calculateB3DailyFactor(obs.annualRateDecimal);
      count++;
      datesUsed.push(day);
    } else {
      // Fallback para taxa diária derivada da taxa anual de referência normalizada
      const syntheticDailyFactor = calculateB3DailyFactor(safeFallback);
      accumulatedFactor *= syntheticDailyFactor;
      isEstimated = true;
      count++;
      datesUsed.push(day);
    }
  }

  return {
    accumulatedFactor,
    periodYieldDecimal: accumulatedFactor - 1.0,
    isEstimated,
    observationsCount: count,
    datesUsed,
  };
}

export interface ProjectedDiResult {
  accumulatedFactor: number;
  periodYieldDecimal: number;
  projectionMethod: 'SELIC_PROXY' | 'CURRENT_DI';
  projectedAnnualRateDecimal: AnnualRateDecimal;
}

/**
 * Calcula o CDI projetado para os dias úteis restantes até o vencimento
 */
export function calculateProjectedDiFactor(
  remainingTradingDays: number,
  projectedAnnualRateDecimal: AnnualRateDecimal = 0.14
): ProjectedDiResult {
  const safeRate = toAnnualRateDecimal(projectedAnnualRateDecimal);
  const du = Math.max(0, remainingTradingDays);
  if (du === 0) {
    return {
      accumulatedFactor: 1.0,
      periodYieldDecimal: 0.0,
      projectionMethod: 'SELIC_PROXY',
      projectedAnnualRateDecimal: safeRate,
    };
  }

  const factor = Math.pow(1 + safeRate, du / 252.0);
  return {
    accumulatedFactor: factor,
    periodYieldDecimal: factor - 1.0,
    projectionMethod: 'SELIC_PROXY',
    projectedAnnualRateDecimal: safeRate,
  };
}
