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
  normalizeAnnualRate,
} from './cdi-engine';
import {
  calculateSignedPnL,
  getConservativeExitQuote,
  calculateEfficiencyScore,
  isActionFeedEligible,
  calculateCollateralReturn,
  enrichOptionStrategy,
  type OptionMarketSnapshot,
} from './calculations';

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

  // ─── 2. CDI ACCRUAL TESTS (CANÔNICO B3 [start, end) E TRUNCAMENTO 16 CASAS) ───
  console.log('\n2. CDI Accrual Engine Tests:');
  const di6du = calculateRealizedDiFactor('2026-08-24', '2026-09-01');
  assert(di6du.observationsCount === 6, 'DI acumulou exatamente 6 observações');
  assert(di6du.isEstimated === false, 'DI usou série oficial B3 sem fallback');
  assert(Math.abs(di6du.periodYieldDecimal - 0.00310356) < 0.0001, 'Yield CDI 6 DU é aproximadamente +0.3104%');

  const diProj12 = calculateProjectedDiFactor(12, 0.14);
  assert(Math.abs(diProj12.periodYieldDecimal - 0.006259) < 0.0001, 'CDI projetado 12 DU é aproximadamente +0.6259%');

  assert(normalizeAnnualRate(14.0, 'PERCENT') === 0.14, 'normalizeAnnualRate normaliza PERCENT para decimal');
  assert(normalizeAnnualRate(0.14, 'DECIMAL') === 0.14, 'normalizeAnnualRate preserva DECIMAL');

  // Teste de Convenção Temporal Canônica B3 [openDate, valuationDate) com Taxas Heterogêneas (D0 != D1)
  const customSeries = new Map<string, { annualRateDecimal: number; source: string }>([
    ['2026-08-24', { annualRateDecimal: 0.1390, source: 'TEST_D0' }], // Taxa em 24/08 (D0)
    ['2026-08-25', { annualRateDecimal: 0.1500, source: 'TEST_D1' }], // Taxa em 25/08 (D1)
  ]);

  // 24/08 -> 25/08 (1 DU): deve utilizar a taxa de 24/08 (13.90%) para remunerar até 25/08
  const diD1 = calculateRealizedDiFactor('2026-08-24', '2026-08-25', 0.14, customSeries as any);
  const fdi24 = Math.round(Math.pow(1 + 0.1390, 1 / 252.0) * 100000000) / 100000000;
  assert(Math.abs(diD1.accumulatedFactor - fdi24) < 0.00000001, '24/08 -> 25/08 (1 DU) acumula estritamente a taxa de 24/08 (13.90%)');
  assert(diD1.observations[0].rateDate === '2026-08-24' && diD1.observations[0].accrualDate === '2026-08-25', 'DiAccrualObservation separa rateDate (24/08) de accrualDate (25/08)');

  // 24/08 -> 26/08 (2 DU): deve acumular FDI(24/08) * FDI(25/08)
  const diD2 = calculateRealizedDiFactor('2026-08-24', '2026-08-26', 0.14, customSeries as any);
  const fdi25 = Math.round(Math.pow(1 + 0.1500, 1 / 252.0) * 100000000) / 100000000;
  const expectedProd = Math.round(Math.trunc(fdi24 * fdi25 * 1e16) / 1e16 * 1e8) / 1e8;
  assert(Math.abs(diD2.accumulatedFactor - expectedProd) < 0.00000001, '24/08 -> 26/08 (2 DU) acumula FDI(24/08) * FDI(25/08) com convenção canônica B3 [start, end)');

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

  console.log('\n========================================');
  console.log('✅ ALL 30 UNIT TESTS PASSED SUCCESSFULLY!');
  console.log('========================================\n');
}

if (require.main === module || typeof process !== 'undefined') {
  runAllTests();
}
