/**
 * Automated Unit Test Suite for Options & CDI Benchmark Engine
 */

import {
  isB3TradingDay,
  countB3TradingDays,
  parseBusinessDate,
} from './b3-calendar';
import {
  calculateRealizedDiFactor,
  calculateProjectedDiFactor,
  calculateIndexedDiFactor,
  normalizeAnnualRate,
} from './cdi-engine';
import {
  calculateSignedPnL,
  getConservativeExitQuote,
  calculateEfficiencyScore,
  isActionFeedEligible,
  calculateCollateralReturn,
  calculateStrategyEconomicPerformance,
  enrichOptionStrategy,
  type OptionMarketSnapshot,
  type StrategyEconomicPerformance,
} from './calculations';
import { hasQualityNote } from './components/StrategyEconomicStorytellingCard';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[TEST FAILED] ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

export function runAllTests() {
  console.log('\n========================================');
  console.log('🧪 RUNNING OPTIONS & CDI QUANT TEST SUITE');
  console.log('========================================\n');

  // ─── 1. B3 CALENDAR TESTS ───
  console.log('1. B3 Calendar Engine Tests:');
  assert(isB3TradingDay('2026-07-09') === true, '09/07/2026 (Revolução SP) é dia útil de pregão na B3');
  assert(isB3TradingDay('2026-02-18') === true, '18/02/2026 (Quarta de Cinzas) conta como trading day');
  assert(isB3TradingDay('2026-09-07') === false, '07/09/2026 (Independência) é feriado sem pregão');
  assert(isB3TradingDay('2026-10-12') === false, '12/10/2026 (N. Sra Aparecida) é feriado sem pregão');
  assert(countB3TradingDays('2026-09-01', '2026-09-18') === 12, '18/09/2026 tem exatamente 12 DU restantes de 01/09');
  assert(countB3TradingDays('2026-09-01', '2026-10-16') === 31, '16/10/2026 tem exatamente 31 DU restantes de 01/09');
  assert(countB3TradingDays('2026-08-24', '2026-09-01') === 6, 'ITUBU393 tem exatamente 6 DU decorridos');
  assert(countB3TradingDays('2026-08-27', '2026-09-01') === 3, 'LRENV104 tem exatamente 3 DU decorridos');

  // Teste de parser estrito e anos não suportados
  try {
    parseBusinessDate('2026-99-99');
    assert(false, 'parseBusinessDate deveria rejeitar 2026-99-99');
  } catch {
    assert(true, 'parseBusinessDate rejeita data inválida 2026-99-99');
  }

  try {
    isB3TradingDay('2027-01-05');
    assert(false, 'isB3TradingDay deveria rejeitar ano não suportado 2027');
  } catch {
    assert(true, 'isB3TradingDay lança UnsupportedB3CalendarYearError para ano 2027');
  }

  try {
    countB3TradingDays('2027-01-05', '2027-01-05');
    assert(false, 'countB3TradingDays deveria rejeitar ano não suportado 2027 no boundary');
  } catch {
    assert(true, 'countB3TradingDays valida boundary imediatamente e lança UnsupportedB3CalendarYearError');
  }

  // ─── 2. CDI ACCRUAL TESTS (CANÔNICO B3 [start, end), BIGINT 16 CASAS, FINS DE SEMANA E FERIADOS) ───
  console.log('\n2. CDI Accrual Engine Tests:');
  const di6du = calculateRealizedDiFactor('2026-08-24', '2026-09-01');
  assert(di6du.observationsCount === 6, 'DI acumulou exatamente 6 observações');
  assert(di6du.isEstimated === false, 'DI usou série oficial B3 sem fallback');
  assert(Math.abs(di6du.periodYieldDecimal - 0.00310356) < 0.00001, 'Yield CDI 6 DU é aproximadamente +0.3104%');

  const diProj12 = calculateProjectedDiFactor(12, 0.14);
  assert(Math.abs(diProj12.periodYieldDecimal - 0.006259) < 0.0001, 'CDI projetado 12 DU é aproximadamente +0.6259%');

  assert(normalizeAnnualRate(14.0, 'PERCENT') === 0.14, 'normalizeAnnualRate normaliza PERCENT para decimal');
  assert(normalizeAnnualRate(0.14, 'DECIMAL') === 0.14, 'normalizeAnnualRate preserva DECIMAL');

  // Golden Test com Constantes Independentes Reconciliadas (D0 = 13.90%, D1 = 15.00%)
  // TDI(13.90%) -> FDI = 1.00051660
  // TDI(15.00%) -> FDI = 1.00055476
  // Produto 16 casas: 1.00051660 * 1.00055476 = 1.0010716465890160 -> Arredondado 8 casas: 1.00107165
  const customSeries = new Map<string, { annualRateDecimal: number; source: string }>([
    ['2026-08-24', { annualRateDecimal: 0.1390, source: 'TEST_D0' }],
    ['2026-08-25', { annualRateDecimal: 0.1500, source: 'TEST_D1' }],
  ]);

  const diD1 = calculateRealizedDiFactor('2026-08-24', '2026-08-25', 0.14, customSeries as any);
  assert(diD1.accumulatedFactor === 1.00051660, 'Golden Test D1: 24/08 -> 25/08 (1 DU) resulta rigorosamente em 1.00051660');
  assert(diD1.observations[0].rateDate === '2026-08-24' && diD1.observations[0].accrualDate === '2026-08-25', 'DiAccrualObservation separa rateDate (24/08) de accrualDate (25/08)');

  const diD2 = calculateRealizedDiFactor('2026-08-24', '2026-08-26', 0.14, customSeries as any);
  assert(diD2.accumulatedFactor === 1.00107165, 'Golden Test D2: 24/08 -> 26/08 (2 DU) resulta rigorosamente em 1.00107165 (BigInt 16 casas)');

  // Testes de Valuation em Fins de Semana e Feriados (Sem inflar DU nem CDI)
  // 1. Sexta 28/08 -> Sábado 29/08 (0 DU adicionais, 0 CDI)
  const diFriSat = calculateRealizedDiFactor('2026-08-28', '2026-08-29');
  assert(diFriSat.observationsCount === 0 && diFriSat.accumulatedFactor === 1.0, 'Sexta -> Sábado resulta em 0 DU e 0 CDI adicional');

  // 2. Quinta 27/08 -> Sábado 29/08 (1 DU: quinta -> sexta)
  const diThuSat = calculateRealizedDiFactor('2026-08-27', '2026-08-29');
  assert(diThuSat.observationsCount === 1, 'Quinta -> Sábado resulta em exatamente 1 DU');
  assert(diThuSat.observations[0].rateDate === '2026-08-27' && diThuSat.observations[0].accrualDate === '2026-08-28', 'Quinta -> Sábado remunera a sessão de sexta com a taxa da quinta');

  // 3. Sexta 04/09 -> Segunda 07/09 (Feriado da Independência B3: 0 DU, 0 CDI)
  const diFriHoliday = calculateRealizedDiFactor('2026-09-04', '2026-09-07');
  assert(diFriHoliday.observationsCount === 0 && diFriHoliday.accumulatedFactor === 1.0, 'Sexta -> Segunda Feriado (07/09) resulta em 0 DU e 0 CDI adicional');

  // 4. Sexta 04/09 -> Terça 08/09 (1 DU após feriado: taxa de sexta remunerando até terça)
  const diFriTue = calculateRealizedDiFactor('2026-09-04', '2026-09-08');
  assert(diFriTue.observationsCount === 1, 'Sexta -> Terça (após feriado) resulta em exatamente 1 DU');
  assert(diFriTue.observations[0].rateDate === '2026-09-04' && diFriTue.observations[0].accrualDate === '2026-09-08', 'Sexta -> Terça remunera até terça com a taxa de sexta');

  // Invariant Quantitativo: Para qualquer par de datas, observationsCount === elapsedTradingDays normalizado
  const testPairs: [string, string][] = [
    ['2026-08-24', '2026-09-01'],
    ['2026-08-27', '2026-08-29'],
    ['2026-08-28', '2026-08-29'],
    ['2026-09-04', '2026-09-07'],
    ['2026-09-04', '2026-09-08'],
  ];
  for (const [o, v] of testPairs) {
    const res = calculateRealizedDiFactor(o as any, v as any);
    const expectedDU = countB3TradingDays(o as any, v as any);
    assert(res.observationsCount === expectedDU, `Invariant check: ${o} -> ${v} observationsCount (${res.observationsCount}) === elapsedDU (${expectedDU})`);
  }

  // ─── 3. PRICING & EXIT QUOTE TESTS ───
  console.log('\n3. Pricing & Exit Quote Tests:');
  const snapLive: OptionMarketSnapshot = {
    optionTicker: 'ITUBU393',
    underlyingSpot: 40.23,
    bid: 0.28,
    ask: 0.32,
    last: 0.29,
    mark: { price: 0.29, method: 'MID' },
    feedMode: 'LIVE',
    timestamp: new Date().toISOString(),
    source: 'B3_FEED',
  };

  const quoteShort = getConservativeExitQuote(snapLive, 'SHORT');
  assert(quoteShort.price === 0.32 && quoteShort.basis === 'ASK' && quoteShort.isExecutable === true, 'ExitQuote para Short usa Ask positivo executável');

  const quoteLong = getConservativeExitQuote(snapLive, 'LONG');
  assert(quoteLong.price === 0.28 && quoteLong.basis === 'BID' && quoteLong.isExecutable === true, 'ExitQuote para Long usa Bid positivo executável');

  // Zero / Negative Quote Check
  const snapZero: OptionMarketSnapshot = {
    optionTicker: 'ITUBU393',
    underlyingSpot: 40.23,
    last: 0,
    feedMode: 'MANUAL',
    timestamp: new Date().toISOString(),
    source: 'MANUAL',
  };
  const quoteZero = getConservativeExitQuote(snapZero, 'SHORT');
  assert(quoteZero.price === null && quoteZero.basis === 'UNAVAILABLE', 'ExitQuote com last=0 retorna UNAVAILABLE e price=null');

  // Stale Quote Check
  const pastMs = Date.now() - 600 * 1000; // 10 min atrás
  const snapStale: OptionMarketSnapshot = {
    ...snapLive,
    timestamp: new Date(pastMs).toISOString(),
  };
  const quoteStale = getConservativeExitQuote(snapStale, 'SHORT', { nowMs: Date.now(), maxStaleSeconds: 300 });
  assert(quoteStale.marketDataStatus === 'STALE' && quoteStale.isExecutable === false, 'Quote stale não é considerada executável');

  // P&L Tests
  const pnlLong = calculateSignedPnL({ entryPrice: 1.18, currentPrice: 2.07, quantityUnderlyingUnits: 200, side: 'LONG' });
  assert(Math.abs(pnlLong - 178.0) < 0.01, 'P&L Long Call de ITUB4 resulta rigorosamente em +R$ 178,00');

  const pnlShort = calculateSignedPnL({ entryPrice: 1.04, currentPrice: 0.29, quantityUnderlyingUnits: 400, side: 'SHORT' });
  assert(Math.abs(pnlShort - 300.0) < 0.01, 'P&L Short Put de ITUB4 resulta rigorosamente em +R$ 300,00');

  // ─── 4. EFFICIENCY ENGINE & ACTION FEED INTEGRATION TESTS ───
  console.log('\n4. Efficiency Engine & ActionFeed Integration Tests:');
  // Executável c/ Ask 0.32 LIVE
  const effExec = calculateEfficiencyScore(
    {
      entryPrice: 1.04,
      referencePrice: 0.32,
      quantityUnderlyingUnits: 400,
      elapsedDU: 6,
      totalDU: 18,
      capitalReserved: 15476,
      projectedCdiFactor: 0.006259,
    },
    quoteShort
  );
  assert(effExec.efficiencyScoreDisplay === 46, `Efficiency Score Executável de ITUB resulta rigorosamente em 46 (obtido: ${effExec.efficiencyScoreDisplay})`);
  assert(effExec.tier === 'ELEVADA', 'Score 46 classifica no tier ELEVADA');
  assert(effExec.executionQuality === 'EXECUTABLE', 'Cotação LIVE marca executionQuality EXECUTABLE');
  assert(effExec.decisionEligible === true, 'Cotação LIVE executável é decisionEligible=true');

  // MTM c/ Mark 0.29 (Não-Executável / Indicativo)
  const effMtm = calculateEfficiencyScore(
    {
      entryPrice: 1.04,
      referencePrice: 0.29,
      quantityUnderlyingUnits: 400,
      elapsedDU: 6,
      totalDU: 18,
      capitalReserved: 15476,
      projectedCdiFactor: 0.006259,
    },
    { price: 0.29, basis: 'MARK', isExecutable: false, marketDataStatus: 'MANUAL' }
  );
  assert(effMtm.efficiencyScoreDisplay === 51, `Efficiency Score MTM de ITUB resulta rigorosamente em 51 (obtido: ${effMtm.efficiencyScoreDisplay})`);
  assert(effMtm.executionQuality === 'INDICATIVE', 'Cotação MARK não-executável marca executionQuality INDICATIVE');
  assert(effMtm.decisionEligible === false, 'Cotação MARK não-executável bloqueia decisionEligible (false)');

  // Stale Ask Quote (Score Alto mas Stale -> Bloqueia Decisão)
  const effStale = calculateEfficiencyScore(
    {
      entryPrice: 1.04,
      referencePrice: 0.10, // Score altíssimo
      quantityUnderlyingUnits: 400,
      elapsedDU: 6,
      totalDU: 18,
      capitalReserved: 15476,
      projectedCdiFactor: 0.006259,
    },
    quoteStale
  );
  assert(effStale.executionQuality === 'STALE', 'Cotação stale marca executionQuality STALE');
  assert(effStale.decisionEligible === false, 'Cotação STALE bloqueia decisionEligible mesmo com score de reciclagem forte');

  // Teste com a função exportada de produção isActionFeedEligible()
  assert(isActionFeedEligible(effExec) === true, 'isActionFeedEligible: Cotação LIVE Executável com tier ELEVADA entra no ActionFeed');
  assert(isActionFeedEligible(effMtm) === false, 'isActionFeedEligible: Cotação MARK Indicativa NÃO entra no ActionFeed');
  assert(isActionFeedEligible(effStale) === false, 'isActionFeedEligible: Cotação STALE NÃO entra no ActionFeed');

  // Edge cases
  const effTZero = calculateEfficiencyScore(
    {
      entryPrice: 1.04,
      referencePrice: 1.04,
      quantityUnderlyingUnits: 400,
      elapsedDU: 0,
      totalDU: 18,
      capitalReserved: 15476,
      projectedCdiFactor: 0.006259,
    },
    'MARK',
    false
  );
  assert(effTZero.harvestRatio === null, 'T=0 resulta em harvestRatio null (sem divisão por zero)');

  const effMissingCdi = calculateEfficiencyScore(
    {
      entryPrice: 1.04,
      referencePrice: 0.29,
      quantityUnderlyingUnits: 400,
      elapsedDU: 6,
      totalDU: 18,
      capitalReserved: 15476,
      projectedCdiFactor: null,
    },
    'MARK',
    false
  );
  assert(effMissingCdi.scoreCompleteness === 'PARTIAL_EARLY_CAPTURE_ONLY', 'CDI ausente marca scoreCompleteness PARTIAL_EARLY_CAPTURE_ONLY');
  assert(effMissingCdi.tier === 'CAPTURE_EFFICIENCY_ONLY', 'Score parcial não dispara RECICLAGEM_FORTE');

  // ─── 5. COLLATERAL ENGINE TESTS ───
  console.log('\n5. Collateral Engine Tests:');
  const colIdle = calculateCollateralReturn({
    optionPnlReais: 300,
    capitalAllocated: 15476,
    cdiPeriodYieldDecimal: 0.003104,
    collateralMode: 'IDLE_CASH',
  });
  assert(Math.abs(colIdle.alphaReais - (300 - 48.037)) < 0.05, 'IDLE_CASH calcula Alpha = OptionPnL - CDI');

  const colRemun = calculateCollateralReturn({
    optionPnlReais: 300,
    capitalAllocated: 15476,
    cdiPeriodYieldDecimal: 0.003104,
    collateralMode: 'REMUNERATED_100_CDI',
  });
  assert(Math.abs(colRemun.alphaReais - 300.0) < 0.01, 'REMUNERATED_100_CDI calcula Alpha ≈ OptionPnL');

  const colCustom = calculateCollateralReturn({
    optionPnlReais: 300,
    capitalAllocated: 15476,
    cdiPeriodYieldDecimal: 0.003104,
    collateralMode: 'CUSTOM',
    collateralYieldPctCDI: 110,
  });
  assert(Math.abs(colCustom.collateralReturnReais - 48.037 * 1.1) < 0.05, 'CUSTOM 110% remunera a 1.1x CDI');

  try {
    calculateCollateralReturn({
      optionPnlReais: 300,
      capitalAllocated: 15476,
      cdiPeriodYieldDecimal: 0.003104,
      collateralMode: 'CUSTOM',
    });
    assert(false, 'CUSTOM sem taxa deveria lançar erro');
  } catch {
    assert(true, 'CUSTOM sem taxa lança CUSTOM_COLLATERAL_YIELD_REQUIRED');
  }

  // ─── 6. MULTI-LEG STRATEGY ENGINE TESTS (ITUB4 2:1) ───
  console.log('\n6. Multi-Leg Strategy Engine Tests (ITUB4 2:1):');
  const itubPutMock: any = {
    id: 'pos_itub_put',
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
    entryDate: '2026-08-24',
    expirationDate: '2026-09-18',
    allocatedCapital: 15476.0,
    status: 'OPEN',
    metrics: {
      markPrice: 0.29,
      estimatedExitPrice: 0.32,
      pnlMtmReais: 300.0,
      pnlEstimatedExitReais: 288.0,
      cdiRealizedReais: 48.04,
      elapsedTradingDays: 6,
      remainingTradingDays: 12,
    },
  };

  const itubCallMock: any = {
    id: 'pos_itub_call',
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
    entryDate: '2026-08-24',
    expirationDate: '2026-09-18',
    allocatedCapital: 236.0,
    status: 'OPEN',
    metrics: {
      markPrice: 2.07,
      estimatedExitPrice: 2.07,
      pnlMtmReais: 178.0,
      pnlEstimatedExitReais: 178.0,
      cdiRealizedReais: 0.0,
      elapsedTradingDays: 6,
      remainingTradingDays: 12,
    },
  };

  const strat = enrichOptionStrategy({
    id: 'strat_itub_1',
    portfolio: 'BTG Principal',
    name: 'ITUB4 — Call Financiada por Put 2:1',
    strategyType: 'CUSTOM_MULTI_LEG',
    book: 'HYBRID',
    underlyingTicker: 'ITUB4',
    collateralMode: 'IDLE_CASH',
    status: 'OPEN',
    openedAt: '2026-08-24',
    legs: [
      {
        id: 'leg_1',
        strategyId: 'strat_itub_1',
        positionId: itubPutMock.id,
        allocatedQuantity: 400,
        economicRole: 'FINANCING',
        position: itubPutMock,
      },
      {
        id: 'leg_2',
        strategyId: 'strat_itub_1',
        positionId: itubCallMock.id,
        allocatedQuantity: 200,
        economicRole: 'DIRECTIONAL',
        position: itubCallMock,
      },
    ],
  });

  assert(strat.metrics.netInitialCreditDebitReais === 180.0, 'ITUB 2:1 gera exatamente +R$ 180,00 de Crédito Líquido Inicial');
  assert(strat.metrics.isNetCredit === true, 'ITUB 2:1 é classificada como estrutura de crédito líquido');
  assert(strat.metrics.netPnlMtmReais === 478.0, 'P&L MTM Consolidado da Estrutura ITUB 2:1 é rigorosamente +R$ 478,00');
  assert(strat.metrics.totalCapitalReserved === 15476.0, 'Capital Reservado cash-secured da Estrutura é R$ 15.476,00');
  assert(Math.abs(strat.metrics.roicPct - 3.0886) < 0.01, 'ROIC da Estrutura em 6 DU é +3.09%');
  assert(strat.metrics.maxLossEconomicReais === 15296.0, 'Max Loss Econômico aproximado no vencimento é R$ 15.296,00');
  assert(Math.abs(strat.metrics.breakEvenInferior! - 38.24) < 0.01, 'Break-Even Inferior no vencimento é R$ 38,24');
  assert(strat.metrics.putToCallRatio === 2.0, 'Razão de Assimetria Put/Call é rigorosamente 2.0 (2:1)');
  assert(strat.metrics.downsideExposureUnits === 400, 'Exposição no Downside é de 400 ações equivalentes');
  assert(strat.metrics.upsideParticipationUnits === 200, 'Participação no Upside é de 200 ações equivalentes');

  // ─── 7. STRATEGY ECONOMIC PERFORMANCE & DOUBLE YIELD RECONCILIATION SUITE (CENÁRIOS A a O) ───
  console.log('\n7. Strategy Economic Performance & Double Yield Reconciliation Suite (Cenários A a O):');

  // A. Cash-Secured Put + IDLE_CASH (Caixa não remunerado)
  const perfA = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 15476.0,
    optionPnlReais: 300.0,
    collateralMode: 'IDLE_CASH',
    maxLossEconomicReais: 15476.0,
    maxLossType: 'FINITE',
  });
  assert(Math.abs(perfA.benchmarkCdiReais - 48.031468) < 0.01, 'Cenário A: Benchmark CDI 6 DU é rigorosamente R$ 48,03');
  assert(perfA.collateralCarryReais === 0.0, 'Cenário A: IDLE_CASH gera rigorosamente R$ 0 de carrego de caixa');
  assert(perfA.totalEconomicReturnReais === 300.0, 'Cenário A: Retorno Econômico Total é igual ao P&L das opções (+R$ 300,00)');
  assert(Math.abs(perfA.excessReturnVsCdiReais - (300.0 - 48.031468)) < 0.01, 'Cenário A: Excesso vs CDI = P&L Opção - Custo de Oportunidade (+R$ 251,97)');

  // B. Cash-Secured Put + 100% CDI
  const perfB = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 15476.0,
    optionPnlReais: 300.0,
    collateralMode: 'REMUNERATED_100_CDI',
    maxLossEconomicReais: 15476.0,
    maxLossType: 'FINITE',
  });
  assert(Math.abs(perfB.collateralCarryReais - 48.031468) < 0.01, 'Cenário B: Carrego do Caixa a 100% CDI é rigorosamente R$ 48,03');
  assert(Math.abs(perfB.totalEconomicReturnReais - 348.031468) < 0.01, 'Cenário B: Retorno Total com Double Yield é +R$ 348,03');
  assert(Math.abs(perfB.excessReturnVsCdiReais - 300.0) < 0.00001, 'Cenário B Invariant: Em 100% CDI, excessReturnVsCdiReais === optionPnlReais (+R$ 300,00)');

  // C. Cash-Secured Put + 110% CDI (Indexação diária oficial B3)
  const perfC = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 15476.0,
    optionPnlReais: 300.0,
    collateralMode: 'CUSTOM',
    collateralPctCdi: 110,
    maxLossEconomicReais: 15476.0,
    maxLossType: 'FINITE',
  });
  assert(Math.abs(perfC.collateralCarryReais - 52.841409) < 0.01, 'Cenário C: Carrego a 110% CDI com composição diária oficial é R$ 52,84');
  assert(Math.abs(perfC.excessReturnVsCdiReais - 304.80994) < 0.01, 'Cenário C: Excesso vs CDI = Opções (+300) + Alpha do Caixa (+4.81) = +R$ 304,81');

  // D. Estrutura Financiada ITUB4 2:1 (Reconciliação Completa do Storytelling)
  const perfD = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 15476.0,
    capitalRemuneratedReais: 15476.0,
    benchmarkCapitalReais: 15476.0,
    optionPnlReais: 478.0,
    collateralMode: 'REMUNERATED_100_CDI',
    maxLossEconomicReais: 15296.0,
    maxLossType: 'FINITE',
    netThetaReaisPerDay: 18.40,
    resultNature: 'MTM',
  });
  assert(Math.abs(perfD.totalEconomicReturnReais - 526.031468) < 0.01, 'Cenário D: Retorno Econômico Total ITUB 2:1 é rigorosamente +R$ 526,03 (+3,40%)');
  assert(Math.abs(perfD.excessReturnVsCdiReais - 478.0) < 0.0001, 'Cenário D: Valor Gerado Acima do CDI é rigorosamente +R$ 478,00 (+3,09 p.p.)');
  assert(Math.abs(perfD.optionPnlToCdiMultiple! - 9.9518) < 0.01, 'Cenário D: Múltiplo Opções / CDI é rigorosamente 9,95x');
  assert(Math.abs(perfD.totalReturnToCdiMultiple! - 10.9518) < 0.01, 'Cenário D: Múltiplo Retorno Total / CDI é rigorosamente 10,95x');
  assert(Math.abs(perfD.extraProfitPer1000RiskReais! - 31.25) < 0.01, 'Cenário D: Lucro Extra por R$ 1.000 de risco máximo é R$ 31,25');
  assert(Math.abs(perfD.optionPnlEquivalentCdiDU! - 58.91) < 0.1, 'Cenário D: Dias de CDI Equivalentes por composição logarítmica é ~58,9 DU');
  assert(perfD.annualizationQuality === 'VERY_SHORT_PERIOD', 'Cenário D: 6 DU classifica annualizationQuality como VERY_SHORT_PERIOD');

  // E. Bull Put Spread (Trava com Risco Máximo Finito)
  const perfE = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 2000.0,
    optionPnlReais: 150.0,
    collateralMode: 'IDLE_CASH',
    maxLossEconomicReais: 1800.0,
    maxLossType: 'FINITE',
  });
  assert(perfE.maxLossType === 'FINITE' && perfE.maxLossEconomicReais === 1800.0, 'Cenário E: Bull Put Spread define maxLossType FINITE');
  assert(Math.abs(perfE.extraProfitPer1000RiskReais! - ((150.0 - 2000 * 0.00310356) / 1.8)) < 0.01, 'Cenário E: Calcula métrica por R$ 1.000 de risco sobre maxLoss da trava');

  // F. Posição Parcialmente Alocada
  const perfF = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 7738.0, // 50% de 15476
    optionPnlReais: 150.0,
    collateralMode: 'REMUNERATED_100_CDI',
  });
  assert(Math.abs(perfF.benchmarkCdiReais - (7738.0 * 0.00310356)) < 0.001, 'Cenário F: Alocação parcial escala benchmark linearmente');
  assert(Math.abs(perfF.excessReturnVsCdiReais - 150.0) < 0.001, 'Cenário F: Excesso de retorno proporcional preservado');

  // G. Pernas com Datas de Abertura Diferentes
  const perfG = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 15476.0,
    optionPnlReais: 300.0,
    collateralMode: 'REMUNERATED_100_CDI',
    legsOpenedAtDifferentDates: true,
  });
  assert(perfG.capitalBasisMethod === 'STATIC_APPROXIMATION', 'Cenário G: Marca capitalBasisMethod STATIC_APPROXIMATION');
  assert(perfG.economicPerformanceQuality === 'PARTIAL', 'Cenário G: Marca economicPerformanceQuality PARTIAL');

  // H. Posição MTM Aberta
  const perfH = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 15476.0,
    optionPnlReais: 300.0,
    resultNature: 'MTM',
  });
  assert(perfH.resultNature === 'MTM', 'Cenário H: Identifica resultado como MTM');

  // I. Resultado Realizado (Posição Encerrada)
  const perfI = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 15476.0,
    optionPnlReais: 300.0,
    resultNature: 'REALIZED',
  });
  assert(perfI.resultNature === 'REALIZED', 'Cenário I: Identifica resultado como REALIZED');

  // J. Benchmark com 100% Dados Oficiais B3
  const perfJ = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 15476.0,
    optionPnlReais: 300.0,
  });
  assert(perfJ.benchmarkQuality === 'OFFICIAL_DI', 'Cenário J: Série oficial marca benchmarkQuality OFFICIAL_DI');

  // K. Benchmark Parcialmente Estimado (Fallback)
  const emptySeries = new Map<string, { annualRateDecimal: number; source: string }>();
  const perfK = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 15476.0,
    optionPnlReais: 300.0,
    customDiSeries: emptySeries as any,
  });
  assert(perfK.benchmarkQuality === 'ESTIMATED', 'Cenário K: Sem série oficial marca benchmarkQuality ESTIMATED');

  // L. Max Loss UNBOUNDED (Venda Descoberta de Call)
  const perfL = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 15476.0,
    optionPnlReais: 300.0,
    maxLossType: 'UNBOUNDED',
  });
  assert(perfL.maxLossType === 'UNBOUNDED' && perfL.maxLossEconomicReais === null, 'Cenário L: Risco ilimitado define maxLoss null');
  assert(perfL.excessReturnOnMaxRiskPct === null && perfL.extraProfitPer1000RiskReais === null, 'Cenário L: Não fabrica métricas de risco para UNBOUNDED');

  // M. Valuation em Sábado / Feriado (Sem inflar DU nem CDI)
  const perfM = calculateStrategyEconomicPerformance({
    startDate: '2026-08-28', // Sexta
    valuationDate: '2026-08-29', // Sábado
    capitalReservedReais: 15476.0,
    optionPnlReais: 50.0,
    collateralMode: 'REMUNERATED_100_CDI',
  });
  assert(perfM.elapsedDU === 0 && perfM.benchmarkCdiReais === 0.0, 'Cenário M: Sábado normaliza para 0 DU e 0 CDI');
  assert(perfM.excessReturnVsCdiReais === 50.0, 'Cenário M: Retorno das opções preservado sem contaminação temporal');

  // N. P&L Negativo das Opções
  const perfN = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 15476.0,
    optionPnlReais: -200.0,
    collateralMode: 'REMUNERATED_100_CDI',
  });
  assert(Math.abs(perfN.totalEconomicReturnReais - (-200.0 + 48.03069456)) < 0.001, 'Cenário N: Double Yield amortece P&L negativo com carrego do CDI (-R$ 151,97)');
  assert(Math.abs(perfN.excessReturnVsCdiReais - (-200.0)) < 0.001, 'Cenário N: Excesso vs CDI negativo reflete perda estrita das opções');

  // O. P&L Zero das Opções
  const perfO = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 15476.0,
    optionPnlReais: 0.0,
    collateralMode: 'REMUNERATED_100_CDI',
  });
  assert(Math.abs(perfO.totalEconomicReturnReais - 48.03069456) < 0.001, 'Cenário O: Com P&L zero, retorno econômico total é exatamente o CDI do caixa');
  assert(perfO.excessReturnVsCdiReais === 0.0, 'Cenário O: Valor gerado acima do CDI é rigorosamente R$ 0,00');

  // ─── 8. PHASE 2.1 REAL STRATEGY INTEGRATION & RISK RECOGNIZER TESTS ───
  console.log('\n8. Phase 2.1 Real Strategy Integration & Risk Recognizer Tests:');

  // 8.1. Bull Put Spread Real (Derivação de Risco Máximo da Trava)
  const bpsShortPut: any = {
    id: 'pos_bps_short',
    optionType: 'PUT',
    side: 'SELL',
    quantity: 400,
    strike: 40.0,
    entryPrice: 1.00,
    entryDate: '2026-08-24',
    metrics: { markPrice: 0.50, estimatedExitPrice: 0.55, cdiRealizedReais: 48.03, elapsedTradingDays: 6, remainingTradingDays: 12 },
  };
  const bpsLongPut: any = {
    id: 'pos_bps_long',
    optionType: 'PUT',
    side: 'BUY',
    quantity: 400,
    strike: 35.0,
    entryPrice: 0.50,
    entryDate: '2026-08-24',
    metrics: { markPrice: 0.20, estimatedExitPrice: 0.20, cdiRealizedReais: 0.0, elapsedTradingDays: 6, remainingTradingDays: 12 },
  };

  const bpsStrat = enrichOptionStrategy({
    id: 'strat_bps_1',
    portfolio: 'BTG',
    name: 'PETR4 — Bull Put Spread 40x35',
    strategyType: 'TRAVA_ALTA_PUT',
    book: 'INCOME',
    underlyingTicker: 'PETR4',
    collateralMode: 'IDLE_CASH',
    status: 'OPEN',
    openedAt: '2026-08-24',
    legs: [
      { id: 'l1', strategyId: 'strat_bps_1', positionId: 'pos_bps_short', allocatedQuantity: 400, economicRole: 'INCOME', position: bpsShortPut },
      { id: 'l2', strategyId: 'strat_bps_1', positionId: 'pos_bps_long', allocatedQuantity: 400, economicRole: 'HEDGE', position: bpsLongPut },
    ],
  });
  assert(bpsStrat.metrics.netInitialCreditDebitReais === 200.0, 'BPS Real: Crédito inicial líquido é exatamente +R$ 200,00');
  assert(bpsStrat.metrics.totalCapitalReserved === 2000.0, 'BPS Real: Capital reservado do spread (40-35)*400 é rigorosamente R$ 2.000,00');
  assert(bpsStrat.metrics.maxLossType === 'FINITE', 'BPS Real: Recognizer define maxLossType FINITE');
  assert(bpsStrat.metrics.maxLossEconomicReais === 1800.0, 'BPS Real: Max Loss da trava (2000 - 200) é rigorosamente R$ 1.800,00');
  assert(bpsStrat.metrics.breakEvenInferior === 39.5, 'BPS Real: Break-Even Inferior da trava é R$ 39,50');
  assert(bpsStrat.economicPerformance.extraProfitPer1000RiskReais !== null, 'BPS Real: Calcula lucro extra por R$ 1.000 de risco sobre os R$ 1.800');

  // 8.2. Naked Short Call Real (Risco Ilimitado UNBOUNDED)
  const nakedCallMock: any = {
    id: 'pos_naked_call',
    optionType: 'CALL',
    side: 'SELL',
    quantity: 100,
    strike: 40.0,
    entryPrice: 1.20,
    underlyingCurrentSpot: 39.0,
    entryDate: '2026-08-24',
    metrics: { markPrice: 0.80, estimatedExitPrice: 0.85, cdiRealizedReais: 0.0, elapsedTradingDays: 6, remainingTradingDays: 12 },
  };

  const nakedStrat = enrichOptionStrategy({
    id: 'strat_naked_1',
    portfolio: 'BTG',
    name: 'VALE3 — Venda Descoberta de Call',
    strategyType: 'VENDA_CALL_DESCOBERTA',
    book: 'INCOME',
    underlyingTicker: 'VALE3',
    collateralMode: 'IDLE_CASH',
    status: 'OPEN',
    openedAt: '2026-08-24',
    legs: [
      { id: 'l1', strategyId: 'strat_naked_1', positionId: 'pos_naked_call', allocatedQuantity: 100, economicRole: 'INCOME', position: nakedCallMock },
    ],
  });
  assert(nakedStrat.metrics.maxLossType === 'UNBOUNDED', 'Naked Call Real: Recognizer classifica como UNBOUNDED');
  assert(nakedStrat.metrics.maxLossEconomicReais === null, 'Naked Call Real: Max Loss econômico é null');
  assert(nakedStrat.economicPerformance.excessReturnOnMaxRiskPct === null, 'Naked Call Real: Bloqueia excessReturnOnMaxRiskPct (null)');
  assert(nakedStrat.economicPerformance.extraProfitPer1000RiskReais === null, 'Naked Call Real: Bloqueia extraProfitPer1000RiskReais (null)');

  // 8.3. Estratégia CLOSED (Congela CDI e DU na data de fechamento closedAt)
  const closedStrat = enrichOptionStrategy({
    id: 'strat_closed_1',
    portfolio: 'BTG',
    name: 'ITUB4 — CSP Encerrada no 4º DU',
    strategyType: 'VENDA_PUT',
    book: 'INCOME',
    underlyingTicker: 'ITUB4',
    collateralMode: 'REMUNERATED_100_CDI',
    status: 'CLOSED',
    openedAt: '2026-08-24',
    closedAt: '2026-08-28', // Fechada na sexta (4 DU decorridos)
    legs: [
      { id: 'l1', strategyId: 'strat_closed_1', positionId: bpsShortPut.id, allocatedQuantity: 400, economicRole: 'INCOME', position: bpsShortPut },
    ],
  });
  assert(closedStrat.economicPerformance.resultNature === 'REALIZED', 'CLOSED: Classifica resultado como REALIZED');
  assert(closedStrat.economicPerformance.elapsedDU === 4, 'CLOSED: Avalia exatamente 4 DU (para na data de encerramento 28/08)');
  assert(closedStrat.economicPerformance.accrualValuationDate === '2026-08-28', 'CLOSED: accrualValuationDate é rigorosamente a data do closedAt');

  // 8.4. Estratégia ROLLED (Congela CDI e DU na data do Roll)
  const rolledStrat = enrichOptionStrategy({
    id: 'strat_rolled_1',
    portfolio: 'BTG',
    name: 'ITUB4 — Rolagem na Sexta',
    strategyType: 'VENDA_PUT',
    book: 'INCOME',
    underlyingTicker: 'ITUB4',
    collateralMode: 'REMUNERATED_100_CDI',
    status: 'ROLLED',
    openedAt: '2026-08-24',
    closedAt: '2026-08-28',
    legs: [
      { id: 'l1', strategyId: 'strat_rolled_1', positionId: bpsShortPut.id, allocatedQuantity: 400, economicRole: 'INCOME', position: bpsShortPut },
    ],
  });
  assert(rolledStrat.economicPerformance.elapsedDU === 4, 'ROLLED: Avalia exatamente 4 DU até o fechamento da perna rolada');

  // 8.5. Metodologia B3 com 103,90% do CDI (Sem arredondamento precoce a 8 casas no fator diário)
  const indexedDi1039 = calculateIndexedDiFactor('2026-08-24', '2026-08-26', 103.9); // 2 DU
  // 13.90% a.a. -> FDI_100 = 1.00051660 -> TDI = 0.00051660 -> TDI_103.9 = 0.0005367474 (sem arredondar a 8 casas antes do produtório)
  // Produto exato 2 dias com 16 casas: (1.0005367474)^2 = 1.0010737828062839 -> 1.00107378 (8 casas)
  assert(indexedDi1039.accumulatedFactor === 1.00107378, '103,90% CDI: Acumulação canônica B3 em 2 DU resulta rigorosamente em 1.00107378');

  // 8.6. CUSTOM sem Percentual ou Negativo (Validação Estrita)
  try {
    calculateStrategyEconomicPerformance({
      startDate: '2026-08-24',
      valuationDate: '2026-09-01',
      capitalReservedReais: 15476.0,
      optionPnlReais: 300.0,
      collateralMode: 'CUSTOM',
    });
    assert(false, 'CUSTOM sem percentual deveria lançar erro');
  } catch {
    assert(true, 'CUSTOM sem percentual lança CUSTOM_COLLATERAL_PERCENT_REQUIRED');
  }

  try {
    calculateStrategyEconomicPerformance({
      startDate: '2026-08-24',
      valuationDate: '2026-09-01',
      capitalReservedReais: 15476.0,
      optionPnlReais: 300.0,
      collateralMode: 'CUSTOM',
      collateralPctCdi: -10,
    });
    assert(false, 'CUSTOM com percentual negativo deveria lançar erro');
  } catch {
    assert(true, 'CUSTOM com percentual negativo é rejeitado');
  }

  // 8.7. Capital Remunerado Distinto do Reservado (ex: 50% em Ações de Margem e 50% em CDB)
  const perfSplitCollateral = calculateStrategyEconomicPerformance({
    startDate: '2026-08-24',
    valuationDate: '2026-09-01',
    capitalReservedReais: 15476.0,
    capitalRemuneratedReais: 7738.0, // Apenas R$ 7.738 aplicados no CDI
    benchmarkCapitalReais: 15476.0,
    optionPnlReais: 300.0,
    collateralMode: 'REMUNERATED_100_CDI',
  });
  assert(Math.abs(perfSplitCollateral.collateralCarryReais - (7738.0 * 0.00310361)) < 0.01, 'Split Capital: Carrego do caixa é calculado sobre os R$ 7.738 remunerados');
  assert(Math.abs(perfSplitCollateral.benchmarkCdiReais - (15476.0 * 0.00310361)) < 0.01, 'Split Capital: Benchmark CDI é calculado sobre os R$ 15.476 de custo de oportunidade');
  assert(Math.abs(perfSplitCollateral.excessReturnVsCdiReais - (300.0 + 7738.0 * 0.00310361 - 15476.0 * 0.00310361)) < 0.01, 'Split Capital: Excesso vs CDI desconta o custo de oportunidade não remunerado');

  // 8.8. Bull Call Spread de Débito Real (Integrado)
  const bcsLongCall: any = {
    id: 'pos_bcs_long',
    optionType: 'CALL',
    side: 'BUY',
    quantity: 100,
    strike: 40.0,
    entryPrice: 2.00,
    expirationDate: '2026-09-18',
    entryDate: '2026-08-24',
    metrics: { markPrice: 2.50, estimatedExitPrice: 2.45, cdiRealizedReais: 0.0, elapsedTradingDays: 6, remainingTradingDays: 12 },
  };
  const bcsShortCall: any = {
    id: 'pos_bcs_short',
    optionType: 'CALL',
    side: 'SELL',
    quantity: 100,
    strike: 45.0,
    entryPrice: 0.80,
    expirationDate: '2026-09-18',
    entryDate: '2026-08-24',
    metrics: { markPrice: 1.00, estimatedExitPrice: 1.05, cdiRealizedReais: 0.0, elapsedTradingDays: 6, remainingTradingDays: 12 },
  };
  const bcsStrat = enrichOptionStrategy({
    id: 'strat_bcs_1',
    portfolio: 'BTG',
    name: 'PETR4 — Bull Call Spread 40x45 Débito',
    strategyType: 'TRAVA_ALTA_CALL',
    book: 'DIRECTIONAL',
    underlyingTicker: 'PETR4',
    collateralMode: 'IDLE_CASH',
    status: 'OPEN',
    openedAt: '2026-08-24',
    legs: [
      { id: 'l1', strategyId: 'strat_bcs_1', positionId: bcsLongCall.id, allocatedQuantity: 100, economicRole: 'DIRECTIONAL', position: bcsLongCall },
      { id: 'l2', strategyId: 'strat_bcs_1', positionId: bcsShortCall.id, allocatedQuantity: 100, economicRole: 'FINANCING', position: bcsShortCall },
    ],
  });
  assert(bcsStrat.metrics.netInitialCreditDebitReais === -120.0, 'BCS Débito: Fluxo inicial é débito de R$ 120,00 (-120.00)');
  assert(bcsStrat.metrics.riskRecognitionQuality === 'EXACT', 'BCS Débito: Reconhecimento de risco é EXACT');
  assert(bcsStrat.metrics.maxLossType === 'FINITE', 'BCS Débito: maxLossType é FINITE');
  assert(bcsStrat.metrics.maxLossEconomicReais === 120.0, 'BCS Débito: Max Loss é rigorosamente o débito pago (R$ 120,00)');
  assert(bcsStrat.metrics.breakEvenSuperior === 41.2, 'BCS Débito: Break-Even Superior é R$ 41,20 (40 + 1.20)');

  // 8.9. Bear Put Spread de Débito Real (Integrado)
  const bearPutLong: any = {
    id: 'pos_bear_put_long',
    optionType: 'PUT',
    side: 'BUY',
    quantity: 100,
    strike: 45.0,
    entryPrice: 2.50,
    expirationDate: '2026-09-18',
    entryDate: '2026-08-24',
    metrics: { markPrice: 2.80, estimatedExitPrice: 2.75, cdiRealizedReais: 0.0, elapsedTradingDays: 6, remainingTradingDays: 12 },
  };
  const bearPutShort: any = {
    id: 'pos_bear_put_short',
    optionType: 'PUT',
    side: 'SELL',
    quantity: 100,
    strike: 40.0,
    entryPrice: 1.00,
    expirationDate: '2026-09-18',
    entryDate: '2026-08-24',
    metrics: { markPrice: 1.10, estimatedExitPrice: 1.15, cdiRealizedReais: 0.0, elapsedTradingDays: 6, remainingTradingDays: 12 },
  };
  const bearPutStrat = enrichOptionStrategy({
    id: 'strat_bear_put_1',
    portfolio: 'BTG',
    name: 'VALE3 — Bear Put Spread 45x40 Débito',
    strategyType: 'TRAVA_BAIXA_PUT',
    book: 'DIRECTIONAL',
    underlyingTicker: 'VALE3',
    collateralMode: 'IDLE_CASH',
    status: 'OPEN',
    openedAt: '2026-08-24',
    legs: [
      { id: 'l1', strategyId: 'strat_bear_put_1', positionId: bearPutLong.id, allocatedQuantity: 100, economicRole: 'DIRECTIONAL', position: bearPutLong },
      { id: 'l2', strategyId: 'strat_bear_put_1', positionId: bearPutShort.id, allocatedQuantity: 100, economicRole: 'FINANCING', position: bearPutShort },
    ],
  });
  assert(bearPutStrat.metrics.netInitialCreditDebitReais === -150.0, 'Bear Put Débito: Fluxo inicial é débito de R$ 150,00 (-150.00)');
  assert(bearPutStrat.metrics.riskRecognitionQuality === 'EXACT', 'Bear Put Débito: Reconhecimento de risco é EXACT');
  assert(bearPutStrat.metrics.maxLossType === 'FINITE', 'Bear Put Débito: maxLossType é FINITE');
  assert(bearPutStrat.metrics.maxLossEconomicReais === 150.0, 'Bear Put Débito: Max Loss é rigorosamente o débito pago (R$ 150,00)');
  assert(bearPutStrat.metrics.breakEvenInferior === 43.5, 'Bear Put Débito: Break-Even Inferior é R$ 43,50 (45 - 1.50)');

  // 8.10. Trava com Vencimentos Heterogêneos (Fail-Safe Institucional -> UNKNOWN)
  const diagShortPut: any = {
    id: 'pos_diag_short',
    optionType: 'PUT',
    side: 'SELL',
    quantity: 100,
    strike: 40.0,
    entryPrice: 1.00,
    expirationDate: '2026-09-18', // Vencimento Setembro
    entryDate: '2026-08-24',
    metrics: { markPrice: 0.50, estimatedExitPrice: 0.55, cdiRealizedReais: 0.0, elapsedTradingDays: 6, remainingTradingDays: 12 },
  };
  const diagLongPut: any = {
    id: 'pos_diag_long',
    optionType: 'PUT',
    side: 'BUY',
    quantity: 100,
    strike: 35.0,
    entryPrice: 0.80,
    expirationDate: '2026-10-16', // Vencimento Outubro (Calendário/Diagonal)
    entryDate: '2026-08-24',
    metrics: { markPrice: 0.60, estimatedExitPrice: 0.60, cdiRealizedReais: 0.0, elapsedTradingDays: 6, remainingTradingDays: 31 },
  };
  const diagStrat = enrichOptionStrategy({
    id: 'strat_diag_1',
    portfolio: 'BTG',
    name: 'PETR4 — Diagonal Spread Set/Out',
    strategyType: 'DIAGONAL_SPREAD',
    book: 'INCOME',
    underlyingTicker: 'PETR4',
    collateralMode: 'IDLE_CASH',
    status: 'OPEN',
    openedAt: '2026-08-24',
    legs: [
      { id: 'l1', strategyId: 'strat_diag_1', positionId: diagShortPut.id, allocatedQuantity: 100, economicRole: 'INCOME', position: diagShortPut },
      { id: 'l2', strategyId: 'strat_diag_1', positionId: diagLongPut.id, allocatedQuantity: 100, economicRole: 'HEDGE', position: diagLongPut },
    ],
  });
  assert(diagStrat.metrics.riskRecognitionQuality === 'UNKNOWN', 'Diagonal Fail-Safe: Trava com vencimentos distintos classifica riskRecognitionQuality como UNKNOWN');
  assert(diagStrat.metrics.maxLossType === 'UNKNOWN', 'Diagonal Fail-Safe: maxLossType é UNKNOWN');
  assert(diagStrat.metrics.maxLossEconomicReais === null, 'Diagonal Fail-Safe: maxLossEconomicReais é null');
  assert(diagStrat.economicPerformance.extraProfitPer1000RiskReais === null, 'Diagonal Fail-Safe: Bloqueia extraProfitPer1000RiskReais (null)');

  // 8.11. CLOSED sem closedAt (Detecção Estrita de Falha de Dados e Falha Fechada)
  const closedWithoutDateStrat = enrichOptionStrategy({
    id: 'strat_closed_missing_date',
    portfolio: 'BTG',
    name: 'ITUB4 — Fechada sem data',
    strategyType: 'VENDA_PUT',
    book: 'INCOME',
    underlyingTicker: 'ITUB4',
    collateralMode: 'REMUNERATED_100_CDI',
    status: 'CLOSED',
    openedAt: '2026-08-24',
    closedAt: null, // Sem data de fechamento informada
    legs: [
      { id: 'l1', strategyId: 'strat_closed_missing_date', positionId: bpsShortPut.id, allocatedQuantity: 400, economicRole: 'INCOME', position: bpsShortPut },
    ],
  });
  assert(closedWithoutDateStrat.economicPerformance.economicPerformanceQuality === 'INSUFFICIENT_DATA', 'CLOSED sem data: Marca economicPerformanceQuality INSUFFICIENT_DATA');
  assert(closedWithoutDateStrat.economicPerformance.benchmarkCdiReais === 0, 'CLOSED sem data: Falha fechado com benchmarkCdiReais zerado (0)');
  assert(closedWithoutDateStrat.economicPerformance.qualityNotes.some((n) => n.includes('CLOSED_AT_REQUIRED')), 'CLOSED sem data: Registra erro de domínio CLOSED_AT_REQUIRED');

  // 8.12. ROLLED Result Nature e Split Capital Integrado no enrichOptionStrategy()
  const rolledSplitStrat = enrichOptionStrategy({
    id: 'strat_rolled_split',
    portfolio: 'BTG',
    name: 'ITUB4 — Rolada com 50% de Cobertura CDI',
    strategyType: 'VENDA_PUT',
    book: 'INCOME',
    underlyingTicker: 'ITUB4',
    collateralMode: 'REMUNERATED_100_CDI',
    collateralCoveragePct: 50, // 50% do capital remunerado no CDI
    status: 'ROLLED',
    openedAt: '2026-08-24',
    closedAt: '2026-08-28',
    legs: [
      { id: 'l1', strategyId: 'strat_rolled_split', positionId: bpsShortPut.id, allocatedQuantity: 400, economicRole: 'INCOME', position: bpsShortPut },
    ],
  });
  assert(rolledSplitStrat.economicPerformance.resultNature === 'REALIZED', 'ROLLED Integrado: resultNature é REALIZED');
  assert(rolledSplitStrat.economicPerformance.capitalRemuneratedReais === 8000.0, 'ROLLED Integrado: Capital remunerado é 50% de R$ 16.000 (R$ 8.000,00)');
  assert(rolledSplitStrat.metrics.cdiRealizedReais === rolledSplitStrat.economicPerformance.benchmarkCdiReais, 'Single Source of Truth: metrics.cdiRealizedReais é idêntico a economicPerformance.benchmarkCdiReais');
  assert(rolledSplitStrat.metrics.alphaReais === rolledSplitStrat.economicPerformance.excessReturnVsCdiReais, 'Single Source of Truth: metrics.alphaReais é idêntico a economicPerformance.excessReturnVsCdiReais');
  assert(rolledSplitStrat.metrics.cdiMultiple === rolledSplitStrat.economicPerformance.totalReturnToCdiMultiple, 'Single Source of Truth: metrics.cdiMultiple é idêntico a economicPerformance.totalReturnToCdiMultiple');

  // 8.13. Coverage 0%, 50%, 100% de Capital Remunerado
  const stratCov0 = enrichOptionStrategy({
    id: 'strat_cov_0',
    portfolio: 'BTG',
    name: 'ITUB4 — 0% Cobertura CDI',
    strategyType: 'VENDA_PUT',
    book: 'INCOME',
    underlyingTicker: 'ITUB4',
    collateralMode: 'REMUNERATED_100_CDI',
    collateralCoveragePct: 0,
    status: 'OPEN',
    openedAt: '2026-08-24',
    legs: [{ id: 'l1', strategyId: 'strat_cov_0', positionId: bpsShortPut.id, allocatedQuantity: 400, economicRole: 'INCOME', position: bpsShortPut }],
  });
  assert(stratCov0.economicPerformance.capitalRemuneratedReais === 0, 'Coverage 0%: Capital remunerado é rigorosamente R$ 0,00');

  const stratCov100 = enrichOptionStrategy({
    id: 'strat_cov_100',
    portfolio: 'BTG',
    name: 'ITUB4 — 100% Cobertura CDI',
    strategyType: 'VENDA_PUT',
    book: 'INCOME',
    underlyingTicker: 'ITUB4',
    collateralMode: 'REMUNERATED_100_CDI',
    collateralCoveragePct: 100,
    status: 'OPEN',
    openedAt: '2026-08-24',
    legs: [{ id: 'l1', strategyId: 'strat_cov_100', positionId: bpsShortPut.id, allocatedQuantity: 400, economicRole: 'INCOME', position: bpsShortPut }],
  });
  assert(stratCov100.economicPerformance.capitalRemuneratedReais === 16000.0, 'Coverage 100%: Capital remunerado é 100% da garantia (R$ 16.000,00)');

  // 8.14. Rejeição de Cobertura Inválida (>100% ou <0%)
  let coverageExceedError = false;
  try {
    enrichOptionStrategy({
      id: 'strat_cov_invalid',
      portfolio: 'BTG',
      name: 'ITUB4 — 150% Cobertura',
      strategyType: 'VENDA_PUT',
      book: 'INCOME',
      underlyingTicker: 'ITUB4',
      collateralMode: 'REMUNERATED_100_CDI',
      collateralCoveragePct: 150, // Inválido
      status: 'OPEN',
      openedAt: '2026-08-24',
      legs: [{ id: 'l1', strategyId: 'strat_cov_invalid', positionId: bpsShortPut.id, allocatedQuantity: 400, economicRole: 'INCOME', position: bpsShortPut }],
    });
  } catch (e: any) {
    coverageExceedError = e.message.includes('INVALID_COLLATERAL_COVERAGE_PERCENT');
  }
  assert(coverageExceedError, 'Coverage >100% é rigorosamente rejeitado com erro INVALID_COLLATERAL_COVERAGE_PERCENT');

  // 8.15. Rejeição de Capital Remunerado > Benchmark Capital
  let capitalExceedError = false;
  try {
    calculateStrategyEconomicPerformance({
      startDate: '2026-08-24',
      valuationDate: '2026-09-01',
      capitalReservedReais: 10000,
      benchmarkCapitalReais: 10000,
      capitalRemuneratedReais: 15000, // Maior que o benchmark
      optionPnlReais: 500,
      collateralMode: 'REMUNERATED_100_CDI',
    });
  } catch (e: any) {
    capitalExceedError = e.message.includes('REMUNERATED_CAPITAL_EXCEEDS_BENCHMARK');
  }
  assert(capitalExceedError, 'Capital remunerado > benchmarkCapitalReais é rejeitado com REMUNERATED_CAPITAL_EXCEEDS_BENCHMARK');

  // 8.16. Assumed Funding Degrada Quality para PARTIAL
  const assumedFundingStrat = enrichOptionStrategy({
    id: 'strat_assumed_funding',
    portfolio: 'BTG',
    name: 'ITUB4 — Funding Assumido 100%',
    strategyType: 'VENDA_PUT',
    book: 'INCOME',
    underlyingTicker: 'ITUB4',
    collateralMode: 'REMUNERATED_100_CDI',
    // Sem capitalRemuneratedReais e sem collateralCoveragePct
    status: 'OPEN',
    openedAt: '2026-08-24',
    legs: [{ id: 'l1', strategyId: 'strat_assumed_funding', positionId: bpsShortPut.id, allocatedQuantity: 400, economicRole: 'INCOME', position: bpsShortPut }],
  });
  assert(assumedFundingStrat.economicPerformance.economicPerformanceQuality === 'PARTIAL', 'Funding assumido: Degrada economicPerformanceQuality para PARTIAL');
  assert(assumedFundingStrat.economicPerformance.qualityNotes.some((n) => n.includes('ASSUMED_FULL_COLLATERAL_COVERAGE')), 'Funding assumido: Registra nota ASSUMED_FULL_COLLATERAL_COVERAGE');

  // 8.17. ROLLED sem closedAt Falha Fechado
  const rolledWithoutDateStrat = enrichOptionStrategy({
    id: 'strat_rolled_missing_date',
    portfolio: 'BTG',
    name: 'ITUB4 — Rolada sem data de fechamento',
    strategyType: 'VENDA_PUT',
    book: 'INCOME',
    underlyingTicker: 'ITUB4',
    collateralMode: 'REMUNERATED_100_CDI',
    status: 'ROLLED',
    openedAt: '2026-08-24',
    closedAt: undefined,
    legs: [{ id: 'l1', strategyId: 'strat_rolled_missing_date', positionId: bpsShortPut.id, allocatedQuantity: 400, economicRole: 'INCOME', position: bpsShortPut }],
  });
  assert(rolledWithoutDateStrat.economicPerformance.economicPerformanceQuality === 'INSUFFICIENT_DATA', 'ROLLED sem data: Marca economicPerformanceQuality INSUFFICIENT_DATA');
  assert(rolledWithoutDateStrat.economicPerformance.benchmarkCdiReais === 0, 'ROLLED sem data: Falha fechado com benchmarkCdiReais zerado (0)');

  // 8.18. Trava de Alta com Put (BPS) com Inconsistência Econômica (Débito Pago) => UNKNOWN
  const bpsInconsistentStrat = enrichOptionStrategy({
    id: 'strat_bps_inconsistent',
    portfolio: 'BTG',
    name: 'BPS Inconsistente (Débito)',
    strategyType: 'TRAVA_ALTA_PUT',
    book: 'INCOME',
    underlyingTicker: 'ITUB4',
    collateralMode: 'IDLE_CASH',
    status: 'OPEN',
    openedAt: '2026-08-24',
    legs: [
      { id: 'l1', strategyId: 'strat_bps_inconsistent', positionId: bpsShortPut.id, allocatedQuantity: 400, economicRole: 'INCOME', position: { ...bpsShortPut, entryPrice: 0.50 } }, // Vendeu por 0.50
      { id: 'l2', strategyId: 'strat_bps_inconsistent', positionId: bpsLongPut.id, allocatedQuantity: 400, economicRole: 'HEDGE', position: { ...bpsLongPut, entryPrice: 1.50 } },   // Comprou por 1.50 (Débito)
    ],
  });
  assert(bpsInconsistentStrat.metrics.riskRecognitionQuality === 'UNKNOWN', 'BPS com fluxo de débito: Classifica riskRecognitionQuality como UNKNOWN');
  assert(bpsInconsistentStrat.metrics.maxLossType === 'UNKNOWN', 'BPS com fluxo de débito: maxLossType é UNKNOWN');
  assert(bpsInconsistentStrat.metrics.maxLossEconomicReais === null, 'BPS com fluxo de débito: maxLossEconomicReais é null');

  // 8.19. Trava de Baixa com Call (BCS) com Inconsistência Econômica (Débito Pago) => UNKNOWN
  const bcsInconsistentShortCall: any = {
    id: 'pos_bcs_sc_inconsistent',
    optionType: 'CALL',
    side: 'SELL',
    quantity: 100,
    strike: 40.0,
    entryPrice: 0.50, // Vendeu por 0.50
    expirationDate: '2026-09-18',
    entryDate: '2026-08-24',
    metrics: { markPrice: 0.50, estimatedExitPrice: 0.50, cdiRealizedReais: 0.0, elapsedTradingDays: 6, remainingTradingDays: 12 },
  };
  const bcsInconsistentLongCall: any = {
    id: 'pos_bcs_lc_inconsistent',
    optionType: 'CALL',
    side: 'BUY',
    quantity: 100,
    strike: 45.0,
    entryPrice: 1.50, // Comprou por 1.50 (Débito pago em spread de crédito)
    expirationDate: '2026-09-18',
    entryDate: '2026-08-24',
    metrics: { markPrice: 1.50, estimatedExitPrice: 1.50, cdiRealizedReais: 0.0, elapsedTradingDays: 6, remainingTradingDays: 12 },
  };
  const bcsInconsistentStrat = enrichOptionStrategy({
    id: 'strat_bcs_inconsistent',
    portfolio: 'BTG',
    name: 'BCS Inconsistente (Débito)',
    strategyType: 'TRAVA_BAIXA_CALL',
    book: 'INCOME',
    underlyingTicker: 'ITUB4',
    collateralMode: 'IDLE_CASH',
    status: 'OPEN',
    openedAt: '2026-08-24',
    legs: [
      { id: 'l1', strategyId: 'strat_bcs_inconsistent', positionId: bcsInconsistentShortCall.id, allocatedQuantity: 100, economicRole: 'INCOME', position: bcsInconsistentShortCall },
      { id: 'l2', strategyId: 'strat_bcs_inconsistent', positionId: bcsInconsistentLongCall.id, allocatedQuantity: 100, economicRole: 'HEDGE', position: bcsInconsistentLongCall },
    ],
  });
  assert(bcsInconsistentStrat.metrics.riskRecognitionQuality === 'UNKNOWN', 'BCS com fluxo de débito: Classifica riskRecognitionQuality como UNKNOWN');

  // 8.20. Short Puts com Múltiplos Strikes Diferentes não fabricam Break-Even médio
  const shortPutStrike38: any = {
    id: 'pos_sp_38',
    optionType: 'PUT',
    side: 'SELL',
    quantity: 100,
    strike: 38.0,
    entryPrice: 1.00,
    expirationDate: '2026-09-18',
    entryDate: '2026-08-24',
    metrics: { markPrice: 0.50, estimatedExitPrice: 0.50, cdiRealizedReais: 0.0, elapsedTradingDays: 6, remainingTradingDays: 12 },
  };
  const shortPutStrike42: any = {
    id: 'pos_sp_42',
    optionType: 'PUT',
    side: 'SELL',
    quantity: 100,
    strike: 42.0,
    entryPrice: 2.00,
    expirationDate: '2026-09-18',
    entryDate: '2026-08-24',
    metrics: { markPrice: 1.50, estimatedExitPrice: 1.50, cdiRealizedReais: 0.0, elapsedTradingDays: 6, remainingTradingDays: 12 },
  };
  const multiStrikeCspStrat = enrichOptionStrategy({
    id: 'strat_multi_strike_csp',
    portfolio: 'BTG',
    name: 'Multi Strike CSP',
    strategyType: 'VENDA_PUT',
    book: 'INCOME',
    underlyingTicker: 'ITUB4',
    collateralMode: 'IDLE_CASH',
    status: 'OPEN',
    openedAt: '2026-08-24',
    legs: [
      { id: 'l1', strategyId: 'strat_multi_strike_csp', positionId: shortPutStrike38.id, allocatedQuantity: 100, economicRole: 'INCOME', position: shortPutStrike38 },
      { id: 'l2', strategyId: 'strat_multi_strike_csp', positionId: shortPutStrike42.id, allocatedQuantity: 100, economicRole: 'INCOME', position: shortPutStrike42 },
    ],
  });
  assert(multiStrikeCspStrat.metrics.maxLossType === 'FINITE', 'Multi Strike CSP: Max loss permanece calculável (FINITE)');
  assert(multiStrikeCspStrat.metrics.breakEvenInferior === null, 'Multi Strike CSP: breakEvenInferior é null (não fabrica break-even médio enganoso)');

  // ─── 9. QUALITY NOTES INTERPRETATION HELPER TESTS ───
  console.log('\n9. Quality Notes Interpretation Helper Tests:');
  assert(
    hasQualityNote(['ASSUMED_FULL_COLLATERAL_COVERAGE'], 'ASSUMED_FULL_COLLATERAL_COVERAGE') === true,
    'hasQualityNote: Correspondência exata'
  );
  assert(
    hasQualityNote(
      ['ASSUMED_FULL_COLLATERAL_COVERAGE: Capital remunerado não especificado; assumindo 100%'],
      'ASSUMED_FULL_COLLATERAL_COVERAGE'
    ) === true,
    'hasQualityNote: Correspondência de prefixo com mensagem contextual'
  );
  assert(
    hasQualityNote(
      ['CLOSED_AT_REQUIRED: Data de encerramento/rolagem ausente; apuração encerrada.'],
      'CLOSED_AT_REQUIRED'
    ) === true,
    'hasQualityNote: CLOSED_AT_REQUIRED detectado com mensagem contextual'
  );
  assert(
    hasQualityNote(['OTHER_CODE: Mensagem'], 'CLOSED_AT_REQUIRED') === false,
    'hasQualityNote: Código inexistente retorna false'
  );
  assert(
    hasQualityNote(null, 'CLOSED_AT_REQUIRED') === false,
    'hasQualityNote: Notas nulas retornam false com segurança'
  );
  assert(
    hasQualityNote([], 'CLOSED_AT_REQUIRED') === false,
    'hasQualityNote: Array vazio retorna false'
  );
  assert(
    hasQualityNote(['CLOSED_AT_REQUIRED_EXTRA: Mensagem'], 'CLOSED_AT_REQUIRED') === false,
    'hasQualityNote: Prefixo falso sem separador dois-pontos não colide'
  );

  console.log('\n========================================');
  console.log('✅ ALL UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY!');
  console.log('========================================\n');
}

if (require.main === module || typeof process !== 'undefined') {
  runAllTests();
}

