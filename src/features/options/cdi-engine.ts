/**
 * CDI / DI Accrual Engine (Canonical B3 Methodology)
 * Acumulação diária oficial da Taxa DI (Fator DI) e projeção Selic Proxy.
 */

import {
  type BusinessDate,
  parseBusinessDate,
  getB3TradingDays,
  getDiObservationDates,
  getPreviousOrSameB3TradingDay,
} from './b3-calendar';

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
 * Fórmula oficial B3: FDI_k = round( (1 + TaxaAnualDecimal)^(1/252), 8 )
 */
export function calculateB3DailyFactor(annualRateDecimal: AnnualRateDecimal): number {
  const safeRate = toAnnualRateDecimal(annualRateDecimal);
  const rawFactor = Math.pow(1 + safeRate, 1.0 / 252.0);
  return Math.round(rawFactor * 100000000) / 100000000;
}

/**
 * Calcula o Fator Diário indexado a um percentual do CDI (ex: 110% do CDI) conforme metodologia oficial B3.
 * Regra B3: O percentual p é aplicado sobre a taxa diária efetiva:
 * TDI_indexada = (FDI - 1) * (pctCdi / 100)
 * FDI_indexado = round(1 + TDI_indexada, 8)
 */
export function calculateIndexedDailyFactor(
  annualRateDecimal: AnnualRateDecimal,
  pctCdi: number = 100
): number {
  if (pctCdi <= 0) return 1.0;
  const standardDailyFactor = calculateB3DailyFactor(annualRateDecimal);
  if (pctCdi === 100) return standardDailyFactor;

  const dailyEffectiveRate = standardDailyFactor - 1.0;
  const indexedDailyRate = dailyEffectiveRate * (pctCdi / 100.0);
  const rawIndexedFactor = 1.0 + indexedDailyRate;
  return Math.round(rawIndexedFactor * 100000000) / 100000000;
}

const SCALE_8 = BigInt('100000000');
const SCALE_16 = BigInt('10000000000000000');
const HALF_SCALE_8 = BigInt('50000000');

/**
 * Realiza o produtório acumulado canônico da B3 com truncamento intermediário a 16 casas decimais
 * e arredondamento final para 8 casas decimais via aritmética inteira BigInt fixed-point exata.
 */
export function calculateB3AccumulatedFactor(dailyFactors: number[]): number {
  if (dailyFactors.length === 0) return 1.0;
  let accumulated16 = SCALE_16;
  for (const factor of dailyFactors) {
    const factor8 = BigInt(Math.round(factor * 100000000));
    accumulated16 = (accumulated16 * factor8) / SCALE_8;
  }
  const rounded8 = (accumulated16 + HALF_SCALE_8) / SCALE_8;
  return Number(rounded8) / 100000000;
}

export interface DiAccrualObservation {
  accrualDate: BusinessDate; // Data da sessão remunerada atingida (ex: 2026-08-25)
  rateDate: BusinessDate;    // Data da observação da taxa DI aplicada (ex: 2026-08-24)
  annualRateDecimal: AnnualRateDecimal;
  dailyFactor: number;
  source: string;
}

/**
 * Série canônica de taxas da Taxa DI da B3 (13.90% a.a. / 14.00% a.a.)
 */
export const CANONICAL_DI_RATES = new Map<BusinessDate, { annualRateDecimal: AnnualRateDecimal; source: string }>([
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
  accumulatedFactor: number; // Ex: 1.00310356 (arredondado a 8 casas conforme B3)
  periodYieldDecimal: number; // Factor - 1 (ex: 0.00310356)
  isEstimated: boolean;
  observationsCount: number;
  datesUsed: BusinessDate[]; // rateDates utilizadas
  observations: DiAccrualObservation[];
  pctCdi: number;
}

/**
 * Calcula a acumulação diária realizada do CDI entre duas datas de negócio [openDate, valuationDate)
 * Metodologia Oficial B3:
 * O intervalo de taxas DI aplicáveis é [openDate, accrualValuationDate) - Data inicial inclusive, data final exclusive.
 * A taxa de openDate (D_0) remunera a primeira sessão decorrida (D_1 = openDate + 1 DU).
 * Se valuationDate cair em fim de semana ou feriado, normaliza para o dia útil de pregão B3 mais recente.
 */
export function calculateRealizedDiFactor(
  openDateStr: BusinessDate,
  valuationDateStr: BusinessDate,
  fallbackAnnualRate: AnnualRateDecimal = 0.14,
  customSeries?: Map<BusinessDate, { annualRateDecimal: AnnualRateDecimal; source: string }>,
  pctCdi: number = 100
): RealizedDiResult {
  const openDate = parseBusinessDate(openDateStr);
  const valDate = parseBusinessDate(valuationDateStr);
  const safeFallback = toAnnualRateDecimal(fallbackAnnualRate);
  const series = customSeries ?? CANONICAL_DI_RATES;

  // Normalização de valuationDate para o pregão B3 mais recente (evita inflar DU em fins de semana e feriados)
  const accrualValuationDate = getPreviousOrSameB3TradingDay(valDate);

  if (openDate >= accrualValuationDate || pctCdi <= 0) {
    return {
      accumulatedFactor: 1.0,
      periodYieldDecimal: 0.0,
      isEstimated: false,
      observationsCount: 0,
      datesUsed: [],
      observations: [],
      pctCdi,
    };
  }

  // Rate observation dates: [openDate, accrualValuationDate)
  const rateDates = getDiObservationDates(openDate, accrualValuationDate);
  // Accrual dates: (openDate, accrualValuationDate]
  const accrualDates = getB3TradingDays(openDate, accrualValuationDate, 'EXCLUDE_START_INCLUDE_END');

  if (rateDates.length !== accrualDates.length) {
    throw new Error(
      `[CDI Engine Invariant Violation] Inconsistência de datas B3: rateDates (${rateDates.length}) != accrualDates (${accrualDates.length}) entre ${openDate} e ${accrualValuationDate}`
    );
  }

  if (rateDates.length === 0) {
    return {
      accumulatedFactor: 1.0,
      periodYieldDecimal: 0.0,
      isEstimated: false,
      observationsCount: 0,
      datesUsed: [],
      observations: [],
      pctCdi,
    };
  }

  let isEstimated = false;
  const dailyFactors: number[] = [];
  const observations: DiAccrualObservation[] = [];

  for (let i = 0; i < rateDates.length; i++) {
    const rateDate = rateDates[i];
    const accrualDate = accrualDates[i];
    const obs = series.get(rateDate);

    if (obs) {
      const dailyFactor = calculateIndexedDailyFactor(obs.annualRateDecimal, pctCdi);
      dailyFactors.push(dailyFactor);
      observations.push({
        accrualDate,
        rateDate,
        annualRateDecimal: obs.annualRateDecimal,
        dailyFactor,
        source: obs.source,
      });
    } else {
      const syntheticDailyFactor = calculateIndexedDailyFactor(safeFallback, pctCdi);
      dailyFactors.push(syntheticDailyFactor);
      isEstimated = true;
      observations.push({
        accrualDate,
        rateDate,
        annualRateDecimal: safeFallback,
        dailyFactor: syntheticDailyFactor,
        source: 'ESTIMATED_FALLBACK',
      });
    }
  }

  const accumulatedFactor = calculateB3AccumulatedFactor(dailyFactors);

  return {
    accumulatedFactor,
    periodYieldDecimal: accumulatedFactor - 1.0,
    isEstimated,
    observationsCount: dailyFactors.length,
    datesUsed: rateDates,
    observations,
    pctCdi,
  };
}

/**
 * Atalho conveniente para calcular acumulação indexada a percentual de CDI (ex: 110% CDI, 90% CDI)
 */
export function calculateIndexedDiFactor(
  openDateStr: BusinessDate,
  valuationDateStr: BusinessDate,
  pctCdi: number = 100,
  fallbackAnnualRate: AnnualRateDecimal = 0.14,
  customSeries?: Map<BusinessDate, { annualRateDecimal: AnnualRateDecimal; source: string }>
): RealizedDiResult {
  return calculateRealizedDiFactor(openDateStr, valuationDateStr, fallbackAnnualRate, customSeries, pctCdi);
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
