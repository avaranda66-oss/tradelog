/**
 * CDI / DI Accrual Engine (Canonical B3 Methodology)
 * Acumulação diária oficial da Taxa DI (Fator DI) e projeção Selic Proxy.
 */

import { type BusinessDate, parseBusinessDate, getB3TradingDays } from './b3-calendar';

export type AnnualRateDecimal = number; // Sempre em decimal: 0.14 = 14% a.a.

export function normalizeAnnualRate(raw: number, unit: 'PERCENT' | 'DECIMAL'): AnnualRateDecimal {
  if (unit === 'PERCENT') {
    return raw / 100.0;
  }
  return raw;
}

export interface DIDailyObservation {
  date: BusinessDate;
  dailyFactor: number; // Fator diário oficial B3: (1 + DI_anual)^(1/252)
  annualRateDecimal?: AnnualRateDecimal;
  source: string;
}

/**
 * Série canônica de observações da Taxa DI recente da B3 (13.90% a.a. / 14.00% a.a.)
 * Fator diário base 13.90%: (1 + 0.1390)^(1/252) = 1.00051666...
 * Fator diário base 14.00%: (1 + 0.1400)^(1/252) = 1.00051996...
 */
const CANONICAL_DI_SERIES = new Map<BusinessDate, DIDailyObservation>([
  ['2026-08-24', { date: '2026-08-24', dailyFactor: 1.00051666, annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
  ['2026-08-25', { date: '2026-08-25', dailyFactor: 1.00051666, annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
  ['2026-08-26', { date: '2026-08-26', dailyFactor: 1.00051666, annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
  ['2026-08-27', { date: '2026-08-27', dailyFactor: 1.00051666, annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
  ['2026-08-28', { date: '2026-08-28', dailyFactor: 1.00051666, annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
  ['2026-08-31', { date: '2026-08-31', dailyFactor: 1.00051666, annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
  ['2026-09-01', { date: '2026-09-01', dailyFactor: 1.00051666, annualRateDecimal: 0.1390, source: 'B3_OFFICIAL' }],
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
    const obs = CANONICAL_DI_SERIES.get(day);
    if (obs) {
      accumulatedFactor *= obs.dailyFactor;
      count++;
      datesUsed.push(day);
    } else {
      // Fallback para taxa diária derivada da taxa anual de referência
      const syntheticDailyFactor = Math.pow(1 + fallbackAnnualRate, 1.0 / 252.0);
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
  const du = Math.max(0, remainingTradingDays);
  if (du === 0) {
    return {
      accumulatedFactor: 1.0,
      periodYieldDecimal: 0.0,
      projectionMethod: 'SELIC_PROXY',
      projectedAnnualRateDecimal,
    };
  }

  const factor = Math.pow(1 + projectedAnnualRateDecimal, du / 252.0);
  return {
    accumulatedFactor: factor,
    periodYieldDecimal: factor - 1.0,
    projectionMethod: 'SELIC_PROXY',
    projectedAnnualRateDecimal,
  };
}
