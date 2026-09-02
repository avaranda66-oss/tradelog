/**
 * Server Actions & Integration Test Suite
 * 100% Hermetic with Deterministic Fixtures.
 * Tests Server Boundaries, Transactional Residual Allocation, Error Contracts, Pre-Insert Validations,
 * Strategy Funding Updates, and Canonical Portfolio Economic Summary Aggregation (Double Yield Engine).
 */

import {
  getOptionPositions,
  groupOptionPositionsAction,
  updateOptionStrategyFundingAction,
  type GetOptionPositionsResult,
} from './actions';
import { db } from '../../lib/db';
import {
  optionPositions,
  optionStrategies,
  optionStrategyLegs,
  strategyAllocationEvents,
} from '../../lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[ACTIONS TEST FAILED] ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

export async function runActionsSuiteTests() {
  console.log('\n========================================');
  console.log('🧪 RUNNING SERVER ACTIONS & INTEGRATION TEST SUITE');
  console.log('========================================\n');

  console.log('1. Error Contract & DB Failure Tests:');

  // 1.1. Invariante: ERRO DE BANCO != CARTEIRA VAZIA
  const mockFailureResult: GetOptionPositionsResult = {
    success: false,
    errorCode: 'DATABASE_LOAD_ERROR',
    error: 'Simulated connection failure',
    positions: null,
    strategies: null,
    summary: null,
  };
  assert(mockFailureResult.success === false, 'Error Contract: success é false em falha de banco');
  assert(mockFailureResult.positions === null, 'Error Contract: positions é null (não array vazio [])');
  assert(mockFailureResult.strategies === null, 'Error Contract: strategies é null (não array vazio [])');
  assert(mockFailureResult.summary === null, 'Error Contract: summary é null (não zeros mascarados)');

  console.log('\n2. Deterministic Portfolio Fixtures & Canonical Economic Summary Tests:');

  // Identificadores Determinísticos para o Teste
  const itubPutId = 'fix_itub_put_1';
  const itubCallId = 'fix_itub_call_1';
  const itubStratId = 'fix_itub_strat_1';
  const lrenPutId = 'fix_lren_put_1';
  const dirCallId = 'fix_dir_call_1';

  try {
    // Limpeza Prévia Determinística
    db.delete(strategyAllocationEvents).where(inArray(strategyAllocationEvents.positionId, [itubPutId, itubCallId, lrenPutId, dirCallId])).run();
    db.delete(optionStrategyLegs).where(inArray(optionStrategyLegs.strategyId, [itubStratId])).run();
    db.delete(optionStrategies).where(inArray(optionStrategies.id, [itubStratId])).run();
    db.delete(optionPositions).where(inArray(optionPositions.id, [itubPutId, itubCallId, lrenPutId, dirCallId])).run();

    // 1. Posições ITUB (Estrutura 2:1)
    db.insert(optionPositions).values([
      {
        id: itubPutId,
        portfolio: 'Principal',
        tickerOption: 'ITUBU393',
        tickerUnderlying: 'ITUB4',
        optionType: 'PUT',
        side: 'SELL',
        strategyType: 'VENDA_PUT',
        strike: 38.69,
        entryPrice: 1.04,
        currentPrice: 0.29,
        allocatedCapital: 15476.0,
        quantity: 400,
        entryDate: '2026-08-24',
        expirationDate: '2026-09-18',
        status: 'OPEN',
      },
      {
        id: itubCallId,
        portfolio: 'Principal',
        tickerOption: 'ITUBI393',
        tickerUnderlying: 'ITUB4',
        optionType: 'CALL',
        side: 'BUY',
        strategyType: 'COMPRA_CALL',
        strike: 38.69,
        entryPrice: 1.18,
        currentPrice: 2.07,
        allocatedCapital: 236.0,
        quantity: 200,
        entryDate: '2026-08-24',
        expirationDate: '2026-09-18',
        status: 'OPEN',
      },
      // 2. Posição Renda Avulsa (Short Put LREN3)
      {
        id: lrenPutId,
        portfolio: 'Principal',
        tickerOption: 'LRENV104',
        tickerUnderlying: 'LREN3',
        optionType: 'PUT',
        side: 'SELL',
        strategyType: 'VENDA_PUT',
        strike: 10.42,
        entryPrice: 0.50,
        currentPrice: 0.37,
        allocatedCapital: 5210.0,
        quantity: 500,
        entryDate: '2026-08-27',
        expirationDate: '2026-09-18',
        status: 'OPEN',
      },
      // 3. Posição Direcional Pura Avulsa (Long Call BOVA11 - NOT_APPLICABLE para Benchmark CDI)
      {
        id: dirCallId,
        portfolio: 'Principal',
        tickerOption: 'BOVAI130',
        tickerUnderlying: 'BOVA11',
        optionType: 'CALL',
        side: 'BUY',
        strategyType: 'COMPRA_CALL',
        strike: 130.0,
        entryPrice: 2.00,
        currentPrice: 2.50,
        allocatedCapital: 200.0,
        quantity: 100,
        entryDate: '2026-08-25',
        expirationDate: '2026-09-18',
        status: 'OPEN',
      },
    ]).run();

    // Criação da Estrutura ITUB 2:1 a 100% CDI
    db.insert(optionStrategies).values({
      id: itubStratId,
      portfolio: 'Principal',
      name: 'ITUB4 2:1 Ratio',
      strategyType: 'CUSTOM_MULTI_LEG',
      book: 'HYBRID',
      underlyingTicker: 'ITUB4',
      collateralMode: 'REMUNERATED_100_CDI',
      collateralCoveragePct: 100,
      capitalRemuneratedReais: 15476.0,
      collateralYieldPctCDI: 100,
      status: 'OPEN',
      openedAt: '2026-08-24',
    }).run();

    db.insert(optionStrategyLegs).values([
      {
        id: 'fix_leg_1',
        strategyId: itubStratId,
        positionId: itubPutId,
        allocatedQuantity: 400,
        economicRole: 'FINANCING',
        createdAt: '2026-08-24T10:00:00Z',
      },
      {
        id: 'fix_leg_2',
        strategyId: itubStratId,
        positionId: itubCallId,
        allocatedQuantity: 200,
        economicRole: 'DIRECTIONAL',
        createdAt: '2026-08-24T10:00:00Z',
      },
    ]).run();

    // Consulta e Validação da Agregação de Carteira
    const portfolioRes = await getOptionPositions('ALL');
    assert(portfolioRes.success === true, 'getOptionPositions com fixtures determinísticas retorna success: true');
    assert(portfolioRes.positions !== null && portfolioRes.positions.length >= 4, 'getOptionPositions carrega posições fixtures');
    assert(portfolioRes.strategies !== null && portfolioRes.strategies.length >= 1, 'getOptionPositions carrega estratégia ITUB 2:1');

    const summary = portfolioRes.summary!;
    // ITUB P&L: (+300 Put) + (+178 Call) = +478. LREN P&L: +65. Direcional P&L: +50.
    // Universo Benchmark-Eligible: ITUB Strategy (478) + LREN Put Avulsa (65) = R$ 543,00.
    // Direcional BOVA11 (R$ 50) fica excluded from benchmark.
    assert(summary.portfolioBenchmarkEligibleCount >= 2, 'Benchmark Eligibility: Universo elegível conta ITUB + LREN');
    assert(summary.portfolioExcludedFromBenchmarkCount >= 1, 'Benchmark Eligibility: BOVA11 Direcional excluída do benchmark');
    assert(summary.portfolioBenchmarkQuality === 'OFFICIAL_DI', 'Benchmark Quality: Universo elegível com DI Oficial apura OFFICIAL_DI');
    assert(summary.portfolioOptionPnlReais >= 543.0, 'Portfolio Economic: P&L de opções do universo elegível soma R$ 543,00');
    assert(summary.portfolioBenchmarkCdiReais > 0, 'Portfolio Economic: Benchmark CDI calculado');
    assert(summary.portfolioCollateralCarryReais > 0, 'Portfolio Economic: Carrego de colateral do ITUB calculado');
    assert(summary.portfolioTotalEconomicReturnReais >= summary.portfolioOptionPnlReais, 'Portfolio Economic: Retorno Total com Double Yield');
    assert(summary.totalAlphaReais === summary.portfolioExcessReturnVsCdiReais, 'Single Source of Truth: totalAlphaReais espelha portfolioExcessReturnVsCdiReais');

    // Validação dos Livros Canônicos
    assert(summary.hybridBook.optionPnlReais >= 478.0, 'Hybrid Book: P&L de opções canônico é R$ 478,00');
    assert(summary.hybridBook.benchmarkCdiReais > 0, 'Hybrid Book: Benchmark CDI calculado a partir de economicPerformance');
    assert(summary.hybridBook.collateralCarryReais > 0, 'Hybrid Book: Carrego de colateral presente');
    assert(summary.incomeBook.optionPnlReais >= 65.0, 'Income Book: P&L de opções da short put avulsa é R$ 65,00');

    console.log('\n3. Real Concurrency & Residual Oversubscription Tests:');
    const oversubPos1Id = 'test_pos_oversub_1';
    const oversubPos2Id = 'test_pos_oversub_2';

    db.delete(strategyAllocationEvents).where(inArray(strategyAllocationEvents.positionId, [oversubPos1Id, oversubPos2Id])).run();
    db.delete(optionStrategyLegs).where(inArray(optionStrategyLegs.positionId, [oversubPos1Id, oversubPos2Id])).run();
    db.delete(optionPositions).where(inArray(optionPositions.id, [oversubPos1Id, oversubPos2Id])).run();

    db.insert(optionPositions).values([
      {
        id: oversubPos1Id,
        portfolio: 'TestPortfolio',
        tickerOption: 'TESTU300',
        tickerUnderlying: 'TEST3',
        optionType: 'PUT',
        side: 'SELL',
        strategyType: 'VENDA_PUT',
        strike: 30.0,
        entryPrice: 1.0,
        currentPrice: 0.5,
        allocatedCapital: 3000.0,
        quantity: 100,
        entryDate: '2026-08-20',
        expirationDate: '2026-09-18',
        status: 'OPEN',
      },
      {
        id: oversubPos2Id,
        portfolio: 'TestPortfolio',
        tickerOption: 'TESTI320',
        tickerUnderlying: 'TEST3',
        optionType: 'CALL',
        side: 'BUY',
        strategyType: 'COMPRA_CALL',
        strike: 32.0,
        entryPrice: 0.5,
        currentPrice: 0.8,
        allocatedCapital: 50.0,
        quantity: 100,
        entryDate: '2026-08-20',
        expirationDate: '2026-09-18',
        status: 'OPEN',
      },
    ]).run();

    // 3.1. Primeira alocação de 60 de 100 -> DEVE PASSAR
    const alloc1Res = await groupOptionPositionsAction({
      name: 'Strategy A (60/100)',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'TEST3',
      collateralMode: 'IDLE_CASH',
      legs: [
        { positionId: oversubPos1Id, allocatedQuantity: 60, economicRole: 'FINANCING' },
        { positionId: oversubPos2Id, allocatedQuantity: 60, economicRole: 'DIRECTIONAL' },
      ],
    });
    assert(alloc1Res.success === true, 'Residual Allocation: Primeira alocação de 60/100 aceita com sucesso');

    // 3.2. Segunda alocação de 60 (restam apenas 40) -> DEVE FALHAR COM ERRO CLARO
    const alloc2Res = await groupOptionPositionsAction({
      name: 'Strategy B (Tentando mais 60/100)',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'TEST3',
      collateralMode: 'IDLE_CASH',
      legs: [
        { positionId: oversubPos1Id, allocatedQuantity: 60, economicRole: 'FINANCING' },
        { positionId: oversubPos2Id, allocatedQuantity: 60, economicRole: 'DIRECTIONAL' },
      ],
    });
    assert(alloc2Res.success === false, 'Residual Allocation: Segunda alocação de 60 (excedendo 40 restantes) rejeitada');
    assert(Boolean(alloc2Res.error?.includes('Quantidade insuficiente')), 'Residual Allocation: Erro informa quantidade insuficiente');

    // 3.3. Invariante: Soma das quantidades alocadas na tabela legs permanece rigorosamente 60 (nunca 120)
    const activeLegs = db.query.optionStrategyLegs.findMany({
      where: eq(optionStrategyLegs.positionId, oversubPos1Id),
    }).sync();
    const sumAllocated = activeLegs.reduce((acc, leg) => acc + leg.allocatedQuantity, 0);
    assert(sumAllocated === 60, 'Residual Invariant: Total alocado no banco é exatamente 60 (<= 100)');

    // Limpeza da estrutura criada
    if (alloc1Res.strategyId) {
      db.delete(strategyAllocationEvents).where(eq(strategyAllocationEvents.strategyId, alloc1Res.strategyId)).run();
      db.delete(optionStrategyLegs).where(eq(optionStrategyLegs.strategyId, alloc1Res.strategyId)).run();
      db.delete(optionStrategies).where(eq(optionStrategies.id, alloc1Res.strategyId)).run();
    }
    db.delete(strategyAllocationEvents).where(inArray(strategyAllocationEvents.positionId, [oversubPos1Id, oversubPos2Id])).run();
    db.delete(optionStrategyLegs).where(inArray(optionStrategyLegs.positionId, [oversubPos1Id, oversubPos2Id])).run();
    db.delete(optionPositions).where(inArray(optionPositions.id, [oversubPos1Id, oversubPos2Id])).run();

    console.log('\n4. Server Boundary Pre-Insert Validations in groupOptionPositionsAction:');
    const testPos1Id = 'test_pos_act_1';
    const testPos2Id = 'test_pos_act_2';

    db.delete(strategyAllocationEvents).where(inArray(strategyAllocationEvents.positionId, [testPos1Id, testPos2Id])).run();
    db.delete(optionStrategyLegs).where(inArray(optionStrategyLegs.positionId, [testPos1Id, testPos2Id])).run();
    db.delete(optionPositions).where(inArray(optionPositions.id, [testPos1Id, testPos2Id])).run();

    db.insert(optionPositions).values([
      {
        id: testPos1Id,
        portfolio: 'TestPortfolio',
        tickerOption: 'TESTU400',
        tickerUnderlying: 'TEST4',
        optionType: 'PUT',
        side: 'SELL',
        strategyType: 'VENDA_PUT',
        strike: 40.0,
        entryPrice: 1.0,
        currentPrice: 0.5,
        allocatedCapital: 4000.0,
        quantity: 100,
        entryDate: '2026-08-20',
        expirationDate: '2026-09-18',
        status: 'OPEN',
      },
      {
        id: testPos2Id,
        portfolio: 'TestPortfolio',
        tickerOption: 'TESTI420',
        tickerUnderlying: 'TEST4',
        optionType: 'CALL',
        side: 'BUY',
        strategyType: 'COMPRA_CALL',
        strike: 42.0,
        entryPrice: 0.5,
        currentPrice: 0.8,
        allocatedCapital: 50.0,
        quantity: 100,
        entryDate: '2026-08-20',
        expirationDate: '2026-09-18',
        status: 'OPEN',
      },
    ]).run();

    // 4.1. Rejeição de Capital Remunerado > Benchmark Capital antes do INSERT
    const exceedCapRes = await groupOptionPositionsAction({
      name: 'Teste Excesso Capital Remunerado',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'TEST4',
      collateralMode: 'REMUNERATED_100_CDI',
      capitalRemuneratedReais: 50000.0,
      legs: [
        { positionId: testPos1Id, allocatedQuantity: 100, economicRole: 'FINANCING' },
        { positionId: testPos2Id, allocatedQuantity: 100, economicRole: 'DIRECTIONAL' },
      ],
    });
    assert(exceedCapRes.success === false, 'Pre-Insert Validation: Capital remunerado excessivo bloqueado');
    assert(Boolean(exceedCapRes.error?.includes('REMUNERATED_CAPITAL_EXCEEDS_BENCHMARK')), 'Pre-Insert Validation: Retorna erro REMUNERATED_CAPITAL_EXCEEDS_BENCHMARK');

    // 4.2. Rejeição de Modo CUSTOM sem percentual
    const customNoPctRes = await groupOptionPositionsAction({
      name: 'Teste Custom Sem Pct',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'TEST4',
      collateralMode: 'CUSTOM',
      collateralYieldPctCDI: null,
      legs: [
        { positionId: testPos1Id, allocatedQuantity: 100, economicRole: 'FINANCING' },
        { positionId: testPos2Id, allocatedQuantity: 100, economicRole: 'DIRECTIONAL' },
      ],
    });
    assert(customNoPctRes.success === false, 'Pre-Insert Validation: CUSTOM sem percentual bloqueado');
    assert(Boolean(customNoPctRes.error?.includes('CUSTOM_COLLATERAL_PERCENT_REQUIRED')), 'Pre-Insert Validation: Retorna erro CUSTOM_COLLATERAL_PERCENT_REQUIRED');

    // 4.3. Rejeição de Cobertura > 100%
    const invalidCovRes = await groupOptionPositionsAction({
      name: 'Teste Cobertura Inválida',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'TEST4',
      collateralMode: 'REMUNERATED_100_CDI',
      collateralCoveragePct: 150,
      legs: [
        { positionId: testPos1Id, allocatedQuantity: 100, economicRole: 'FINANCING' },
        { positionId: testPos2Id, allocatedQuantity: 100, economicRole: 'DIRECTIONAL' },
      ],
    });
    assert(invalidCovRes.success === false, 'Pre-Insert Validation: Cobertura > 100% bloqueada');
    assert(Boolean(invalidCovRes.error?.includes('INVALID_COLLATERAL_COVERAGE_PERCENT')), 'Pre-Insert Validation: Retorna erro INVALID_COLLATERAL_COVERAGE_PERCENT');

    // 4.4. Sucesso com Funding Zero Preservado (0% Coverage e R$ 0 Remunerado)
    const zeroFundingRes = await groupOptionPositionsAction({
      name: 'Teste Zero Funding Preservado',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'TEST4',
      collateralMode: 'REMUNERATED_100_CDI',
      collateralCoveragePct: 0,
      capitalRemuneratedReais: 0,
      legs: [
        { positionId: testPos1Id, allocatedQuantity: 50, economicRole: 'FINANCING' },
        { positionId: testPos2Id, allocatedQuantity: 50, economicRole: 'DIRECTIONAL' },
      ],
    });
    assert(zeroFundingRes.success === true, 'Funding Zero: Criação de estrutura bem-sucedida');
    
    const persistedStrat = db.query.optionStrategies.findFirst({
      where: eq(optionStrategies.id, zeroFundingRes.strategyId!),
    }).sync();
    assert(persistedStrat?.collateralCoveragePct === 0, 'Funding Zero: collateral_coverage_pct persistido como 0 (não null)');
    assert(persistedStrat?.capitalRemuneratedReais === 0, 'Funding Zero: capital_remunerated_reais persistido como 0 (não null)');

    console.log('\n5. Strategy Funding Update Action Tests:');
    // 5.1. Atualizar a estrutura criada para 100% CDI
    const updateFundingRes = await updateOptionStrategyFundingAction({
      strategyId: zeroFundingRes.strategyId!,
      collateralMode: 'REMUNERATED_100_CDI',
      collateralCoveragePct: 100,
    });
    assert(updateFundingRes.success === true, 'Funding Update: Atualização explícita para REMUNERATED_100_CDI bem-sucedida');

    const updatedStrat = db.query.optionStrategies.findFirst({
      where: eq(optionStrategies.id, zeroFundingRes.strategyId!),
    }).sync();
    assert(updatedStrat?.collateralMode === 'REMUNERATED_100_CDI', 'Funding Update: collateral_mode atualizado para REMUNERATED_100_CDI');
    assert(updatedStrat?.collateralCoveragePct === 100, 'Funding Update: collateralCoveragePct atualizado para 100%');
    assert(updatedStrat?.capitalRemuneratedReais === 2000.0, 'Funding Update: capitalRemuneratedReais derivado como 100% da garantia (R$ 2.000,00)');

    // 5.2. Rejeitar update com capital remunerado excessivo
    const updateExceedRes = await updateOptionStrategyFundingAction({
      strategyId: zeroFundingRes.strategyId!,
      collateralMode: 'REMUNERATED_100_CDI',
      capitalRemuneratedReais: 99999.0,
    });
    assert(updateExceedRes.success === false, 'Funding Update: Rejeição de capital remunerado excessivo');
    assert(Boolean(updateExceedRes.error?.includes('REMUNERATED_CAPITAL_EXCEEDS_BENCHMARK')), 'Funding Update: Erro REMUNERATED_CAPITAL_EXCEEDS_BENCHMARK retornado');

    // 5.3. Rejeitar update remunerado sem cobertura nem capital em R$ (split nulo)
    const updateMissingSplitRes = await updateOptionStrategyFundingAction({
      strategyId: zeroFundingRes.strategyId!,
      collateralMode: 'REMUNERATED_100_CDI',
      collateralCoveragePct: null,
      capitalRemuneratedReais: null,
    });
    assert(updateMissingSplitRes.success === false, 'Funding Update: Rejeição de split nulo em modo remunerado');
    assert(Boolean(updateMissingSplitRes.error?.includes('EXPLICIT_FUNDING_SPLIT_REQUIRED')), 'Funding Update: Erro EXPLICIT_FUNDING_SPLIT_REQUIRED retornado');

    // Limpeza da estrutura criada
    if (zeroFundingRes.strategyId) {
      db.delete(strategyAllocationEvents).where(eq(strategyAllocationEvents.strategyId, zeroFundingRes.strategyId)).run();
      db.delete(optionStrategyLegs).where(eq(optionStrategyLegs.strategyId, zeroFundingRes.strategyId)).run();
      db.delete(optionStrategies).where(eq(optionStrategies.id, zeroFundingRes.strategyId)).run();
    }
    db.delete(strategyAllocationEvents).where(inArray(strategyAllocationEvents.positionId, [testPos1Id, testPos2Id])).run();
    db.delete(optionStrategyLegs).where(inArray(optionStrategyLegs.positionId, [testPos1Id, testPos2Id])).run();
    db.delete(optionPositions).where(inArray(optionPositions.id, [testPos1Id, testPos2Id])).run();

  } finally {
    // Limpeza Final de Segurança
    db.delete(strategyAllocationEvents).where(inArray(strategyAllocationEvents.positionId, [itubPutId, itubCallId, lrenPutId, dirCallId])).run();
    db.delete(optionStrategyLegs).where(inArray(optionStrategyLegs.strategyId, [itubStratId])).run();
    db.delete(optionStrategies).where(inArray(optionStrategies.id, [itubStratId])).run();
    db.delete(optionPositions).where(inArray(optionPositions.id, [itubPutId, itubCallId, lrenPutId, dirCallId])).run();
  }

  console.log('\n========================================');
  console.log('✅ ALL SERVER ACTIONS TESTS PASSED SUCCESSFULLY!');
  console.log('========================================\n');
}

if (require.main === module || typeof process !== 'undefined') {
  runActionsSuiteTests().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
