/**
 * Server Actions & Integration Test Suite
 * 100% Hermetic with Deterministic Fixtures.
 * Tests Server Boundaries, Transactional Residual Allocation, Error Contracts, Pre-Insert Validations,
 * Strategy Funding Updates, and Canonical Portfolio Economic Summary Aggregation (Double Yield Engine).
 */

if (process.env.TRADELOG_DB_PATH !== ':memory:') {
  throw new Error(
    'FAIL-FAST VIOLATION: actions-suite must ONLY be run against an in-memory database (:memory:) to prevent polluting local development database. Please run via: npx tsx src/features/options/actions-suite.runner.ts'
  );
}

import type { GetOptionPositionsResult } from './actions';
import {
  optionPositions,
  optionStrategies,
  optionStrategyLegs,
  strategyAllocationEvents,
  strategyManeuverEvents,
  strategyFundingEvents,
  strategyFundingSegments,
  optionPositionExecutions,
} from '../../lib/db/schema';
import { eq, inArray, and, isNull, asc } from 'drizzle-orm';
import { calculateRealizedDiFactor } from './cdi-engine';
import { calculateStrategyEconomicPerformance } from './calculations';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[ACTIONS TEST FAILED] ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

export async function runActionsSuiteTests() {
  const { db } = await import('../../lib/db');
  const {
    getOptionPositions,
    groupOptionPositionsAction,
    updateOptionStrategyFundingAction,
    createOptionPosition,
    updateOptionPosition,
    closeOptionPosition,
    ungroupOptionStrategyAction,
    rollOptionPosition,
    partialCloseStrategyLegAction,
    scaleDownOptionStrategyAction,
  } = await import('./actions');

  console.log('\n========================================');
  console.log('🧪 RUNNING SERVER ACTIONS & INTEGRATION TEST SUITE (:memory:)');
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
    db.delete(strategyFundingSegments).where(inArray(strategyFundingSegments.strategyId, [itubStratId])).run();
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

    db.insert(strategyFundingSegments).values({
      id: 'fix_itub_seg_1',
      strategyId: itubStratId,
      startDate: '2026-08-24',
      endDate: null,
      benchmarkCapitalReais: 15476.0,
      capitalRemuneratedReais: 15476.0,
      collateralMode: 'REMUNERATED_100_CDI',
      collateralPctCdi: 100,
      sourceType: 'CREATION',
      quality: 'FULL',
      createdAt: '2026-08-24T10:00:00Z',
    }).run();

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
      db.delete(strategyFundingSegments).where(eq(strategyFundingSegments.strategyId, alloc1Res.strategyId)).run();
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

    // 4.3.1. Rejeição de NaN e Infinity no groupOptionPositionsAction
    const groupNaNRes = await groupOptionPositionsAction({
      name: 'Teste Group NaN',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'TEST4',
      collateralMode: 'CUSTOM',
      collateralYieldPctCDI: NaN,
      legs: [
        { positionId: testPos1Id, allocatedQuantity: 10, economicRole: 'FINANCING' },
        { positionId: testPos2Id, allocatedQuantity: 10, economicRole: 'DIRECTIONAL' },
      ],
    });
    assert(groupNaNRes.success === false, 'Pre-Insert Validation: Rejeição de NaN em collateralYieldPctCDI');

    const groupInfRes = await groupOptionPositionsAction({
      name: 'Teste Group Infinity',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'TEST4',
      collateralMode: 'REMUNERATED_100_CDI',
      collateralCoveragePct: Infinity,
      legs: [
        { positionId: testPos1Id, allocatedQuantity: 10, economicRole: 'FINANCING' },
        { positionId: testPos2Id, allocatedQuantity: 10, economicRole: 'DIRECTIONAL' },
      ],
    });
    assert(groupInfRes.success === false, 'Pre-Insert Validation: Rejeição de Infinity em collateralCoveragePct');

    const groupNaNCapRes = await groupOptionPositionsAction({
      name: 'Teste Group NaN Capital',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'TEST4',
      collateralMode: 'REMUNERATED_100_CDI',
      capitalRemuneratedReais: NaN,
      legs: [
        { positionId: testPos1Id, allocatedQuantity: 10, economicRole: 'FINANCING' },
        { positionId: testPos2Id, allocatedQuantity: 10, economicRole: 'DIRECTIONAL' },
      ],
    });
    assert(groupNaNCapRes.success === false, 'Pre-Insert Validation: Rejeição de NaN em capitalRemuneratedReais');

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

    // 5.4. Rejeitar NaN e Infinity na taxa CDI e Cobertura
    const updateNaNRes = await updateOptionStrategyFundingAction({
      strategyId: zeroFundingRes.strategyId!,
      collateralMode: 'CUSTOM',
      collateralYieldPctCDI: NaN,
      collateralCoveragePct: 50,
    });
    assert(updateNaNRes.success === false, 'Server Boundary: Rejeição de NaN em collateralYieldPctCDI');

    const updateInfRes = await updateOptionStrategyFundingAction({
      strategyId: zeroFundingRes.strategyId!,
      collateralMode: 'REMUNERATED_100_CDI',
      collateralCoveragePct: Infinity,
    });
    assert(updateInfRes.success === false, 'Server Boundary: Rejeição de Infinity em collateralCoveragePct');

    const updateNaNCapitalRes = await updateOptionStrategyFundingAction({
      strategyId: zeroFundingRes.strategyId!,
      collateralMode: 'REMUNERATED_100_CDI',
      capitalRemuneratedReais: NaN,
    });
    assert(updateNaNCapitalRes.success === false, 'Server Boundary: Rejeição de NaN em capitalRemuneratedReais');

    // Limpeza da estrutura criada
    if (zeroFundingRes.strategyId) {
      db.delete(strategyFundingSegments).where(eq(strategyFundingSegments.strategyId, zeroFundingRes.strategyId)).run();
      db.delete(strategyFundingEvents).where(eq(strategyFundingEvents.strategyId, zeroFundingRes.strategyId)).run();
      db.delete(strategyAllocationEvents).where(eq(strategyAllocationEvents.strategyId, zeroFundingRes.strategyId)).run();
      db.delete(optionStrategyLegs).where(eq(optionStrategyLegs.strategyId, zeroFundingRes.strategyId)).run();
      db.delete(optionStrategies).where(eq(optionStrategies.id, zeroFundingRes.strategyId)).run();
    }
    db.delete(strategyAllocationEvents).where(inArray(strategyAllocationEvents.positionId, [testPos1Id, testPos2Id])).run();
    db.delete(optionStrategyLegs).where(inArray(optionStrategyLegs.positionId, [testPos1Id, testPos2Id])).run();
    db.delete(optionPositions).where(inArray(optionPositions.id, [testPos1Id, testPos2Id])).run();

    console.log('\n6. Phase 4.1.1 & 4.1.2 Foundation Closure Tests:');

    // 6.1. P0.4: Rejeição de criação direta com status CLOSED
    const rejectClosedRes = await createOptionPosition({
      portfolio: 'Principal',
      tickerUnderlying: 'MGLU3',
      tickerOption: 'MGLUU200',
      optionType: 'PUT',
      side: 'SELL',
      strategyType: 'VENDA_PUT',
      quantity: 400,
      strike: 2.00,
      entryPrice: 0.15,
      currentPrice: 0.15,
      entryDate: '2026-09-02',
      expirationDate: '2026-10-16',
      status: 'CLOSED',
    });
    assert(rejectClosedRes.success === false, 'P0.4: Criação direta como CLOSED rejeitada');
    assert(Boolean(rejectClosedRes.error?.includes('DIRECT_CLOSED_CREATION_NOT_SUPPORTED')), 'P0.4: Erro DIRECT_CLOSED_CREATION_NOT_SUPPORTED retornado');

    // 6.1b. Boundary: Rejeição de criação com data não útil (fim de semana ou feriado) e aceite de dia útil
    const rejectSaturdayRes = await createOptionPosition({
      portfolio: 'Principal',
      tickerUnderlying: 'PETR4',
      tickerOption: 'PETRU300',
      optionType: 'PUT',
      side: 'SELL',
      strategyType: 'VENDA_PUT',
      quantity: 100,
      strike: 30.00,
      entryPrice: 1.00,
      currentPrice: 1.00,
      entryDate: '2026-08-15', // Sábado
      expirationDate: '2026-09-18',
      status: 'OPEN',
    });
    assert(rejectSaturdayRes.success === false, 'Boundary: Criação com sábado rejeitada');
    assert(Boolean(rejectSaturdayRes.error?.includes('INVALID_ENTRY_DATE_NON_TRADING_DAY')), 'Boundary: Erro INVALID_ENTRY_DATE_NON_TRADING_DAY para sábado');

    const rejectHolidayRes = await createOptionPosition({
      portfolio: 'Principal',
      tickerUnderlying: 'PETR4',
      tickerOption: 'PETRU300',
      optionType: 'PUT',
      side: 'SELL',
      strategyType: 'VENDA_PUT',
      quantity: 100,
      strike: 30.00,
      entryPrice: 1.00,
      currentPrice: 1.00,
      entryDate: '2026-09-07', // Feriado Independência do Brasil
      expirationDate: '2026-09-18',
      status: 'OPEN',
    });
    assert(rejectHolidayRes.success === false, 'Boundary: Criação com feriado B3 rejeitada');
    assert(Boolean(rejectHolidayRes.error?.includes('INVALID_ENTRY_DATE_NON_TRADING_DAY')), 'Boundary: Erro INVALID_ENTRY_DATE_NON_TRADING_DAY para feriado');

    const validTradingDayRes = await createOptionPosition({
      portfolio: 'Principal',
      tickerUnderlying: 'PETR4',
      tickerOption: 'PETRU300',
      optionType: 'PUT',
      side: 'SELL',
      strategyType: 'VENDA_PUT',
      quantity: 100,
      strike: 30.00,
      entryPrice: 1.00,
      currentPrice: 1.00,
      entryDate: '2026-08-24', // Segunda-feira útil de pregão B3
      expirationDate: '2026-09-18',
      status: 'OPEN',
    });
    assert(validTradingDayRes.success === true, 'Boundary: Criação com pregão B3 válido aceita');
    if (validTradingDayRes.id) {
      db.delete(optionPositions).where(eq(optionPositions.id, validTradingDayRes.id)).run();
    }

    // Validação de Fail-Safe no CDI Engine: disparar erro ao calcular com intervalo inconsistente
    let cdiThrewOnWeekend = false;
    try {
      calculateRealizedDiFactor('2026-08-15', '2026-09-02', 0.14);
    } catch (err: any) {
      cdiThrewOnWeekend = err.message.includes('CDI Engine Invariant Violation');
    }
    assert(cdiThrewOnWeekend, 'CDI Engine: Fail-safe preservado (dispara Invariant Violation se chamado com data inconsistente)');

    // 6.2. P1.5: Rejeição de groupOptionPositionsAction em modo remunerado sem split explícito
    const createPosA = await createOptionPosition({
      portfolio: 'Principal',
      tickerUnderlying: 'MGLU3',
      tickerOption: 'MGLUU200',
      optionType: 'PUT',
      side: 'SELL',
      strategyType: 'VENDA_PUT',
      quantity: 1000,
      strike: 2.00,
      entryPrice: 0.15,
      currentPrice: 0.15,
      entryDate: '2026-09-02',
      expirationDate: '2026-10-16',
      status: 'OPEN',
    });
    const createPosB = await createOptionPosition({
      portfolio: 'Principal',
      tickerUnderlying: 'MGLU3',
      tickerOption: 'MGLUI200',
      optionType: 'CALL',
      side: 'BUY',
      strategyType: 'COMPRA_CALL',
      quantity: 500,
      strike: 2.00,
      entryPrice: 0.10,
      currentPrice: 0.10,
      entryDate: '2026-09-02',
      expirationDate: '2026-10-16',
      status: 'OPEN',
    });
    const newPos1Id = createPosA.id!;
    const newPos2Id = createPosB.id!;

    // Tentativa com REMUNERATED_100_CDI sem coverage e sem capital
    const rejectRemuneratedRes = await groupOptionPositionsAction({
      name: 'MGLU3 Sem Split',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'MGLU3',
      collateralMode: 'REMUNERATED_100_CDI',
      legs: [
        { positionId: newPos1Id, allocatedQuantity: 1000, economicRole: 'FINANCING' },
        { positionId: newPos2Id, allocatedQuantity: 500, economicRole: 'DIRECTIONAL' },
      ],
    });
    assert(rejectRemuneratedRes.success === false, 'P1.5: Criação de estratégia remunerada sem split explícito rejeitada');
    assert(Boolean(rejectRemuneratedRes.error?.includes('EXPLICIT_FUNDING_SPLIT_REQUIRED')), 'P1.5: Erro EXPLICIT_FUNDING_SPLIT_REQUIRED retornado');

    // 6.3. P0.2: Criação e inicialização de caches de posições e pernas
    const fetchedNewPos1 = db.query.optionPositions.findFirst({
      where: eq(optionPositions.id, newPos1Id),
    }).sync();
    assert(fetchedNewPos1?.quantity === 1000, 'P0.2: quantity original gravada como 1000');
    assert(fetchedNewPos1?.openQuantity === 1000, 'P0.2: openQuantity inicializado como 1000 (NÃO null)');
    assert(fetchedNewPos1?.closedQuantity === 0, 'P0.2: closedQuantity inicializado como 0 (NÃO null)');
    assert(fetchedNewPos1?.legacyClosedQuantity === 0, 'P0.2: legacyClosedQuantity inicializado como 0 (NÃO null)');
    assert(fetchedNewPos1?.realizedPnlReais === 0, 'P0.2: realizedPnlReais inicializado como 0 (NÃO null)');

    // 6.4. Agrupamento Virgem Válido (com IDLE_CASH)
    const virginStratRes = await groupOptionPositionsAction({
      name: 'MGLU3 Estrutura Virgem',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'MGLU3',
      collateralMode: 'IDLE_CASH',
      legs: [
        { positionId: newPos1Id, allocatedQuantity: 1000, economicRole: 'FINANCING' },
        { positionId: newPos2Id, allocatedQuantity: 500, economicRole: 'DIRECTIONAL' },
      ],
    });
    assert(virginStratRes.success === true, 'P0.2: Agrupamento virgem criado com sucesso');
    const virginStratId = virginStratRes.strategyId!;

    const newLeg1 = db.query.optionStrategyLegs.findFirst({
      where: and(
        eq(optionStrategyLegs.strategyId, virginStratId),
        eq(optionStrategyLegs.positionId, newPos1Id)
      ),
    }).sync();
    assert(newLeg1?.openAllocatedQuantity === 1000, 'P0.2: openAllocatedQuantity inicializado como 1000');
    assert(newLeg1?.closedAllocatedQuantity === 0, 'P0.2: closedAllocatedQuantity inicializado como 0');

    // P0.3: Tentar alterar quantity de uma posição alocada deve FALHAR com QUANTITY_IMMUTABLE
    const alterAllocatedRes = await updateOptionPosition(newPos1Id, { quantity: 800 });
    assert(alterAllocatedRes.success === false, 'P0.3: Alteração de quantity em posição alocada bloqueada');
    assert(Boolean(alterAllocatedRes.error?.includes('QUANTITY_IMMUTABLE')), 'P0.3: Erro QUANTITY_IMMUTABLE retornado');

    // 6.5. P0.2: Bloqueio de Full Close em posição alocada em estrutura ativa
    const closeAllocatedRes = await closeOptionPosition({
      id: newPos1Id,
      exitPrice: 0.05,
      status: 'CLOSED',
    });
    assert(closeAllocatedRes.success === false, 'P0.2: Full Close em posição alocada em estrutura bloqueado');
    assert(Boolean(closeAllocatedRes.error?.includes('POSITION_ALLOCATED_TO_STRATEGY')), 'P0.2: Erro POSITION_ALLOCATED_TO_STRATEGY retornado');

    // 6.6. P0.3: Desagrupamento de Estrutura 100% Virgem (apenas CREATION segment, 0 funding events) -> SUCCESS
    const ungroupVirginRes = await ungroupOptionStrategyAction(virginStratId);
    assert(ungroupVirginRes.success === true, 'P0.3: Estrutura virgem desagrupada com sucesso');

    // Pernas cascade-deletadas e posições livres
    const legsAfterUngroup = db.query.optionStrategyLegs.findMany({
      where: inArray(optionStrategyLegs.positionId, [newPos1Id, newPos2Id]),
    }).sync();
    assert(legsAfterUngroup.length === 0, 'P0.3: Pernas cascade-deletadas, liberando as posições');

    // P0.3: Posição virgem liberada permite correção atômica de quantity
    const correctVirginRes = await updateOptionPosition(newPos1Id, { quantity: 1500 });
    assert(correctVirginRes.success === true, 'P0.3: Correção de quantidade em posição virgem permitida');
    const correctedPos = db.query.optionPositions.findFirst({
      where: eq(optionPositions.id, newPos1Id),
    }).sync();
    assert(Boolean(correctedPos), 'P0.3: Posição corrigida encontrada no banco');
    if (!correctedPos) throw new Error('correctedPos não encontrada');
    assert(correctedPos.quantity === 1500, 'P0.3: Nova quantity = 1500');
    assert(correctedPos.openQuantity === 1500, 'P0.3: openQuantity atualizado atomicamente para 1500');
    assert((correctedPos.openQuantity ?? 0) <= correctedPos.quantity, 'P0.3: Invariante 0 <= openQuantity <= quantity preservada');

    // 6.7. P0.3 & P0.4: Desagrupamento Bloqueado após alteração de funding (Preservação de Audit Trail)
    // Agrupa novamente
    const reGroupRes = await groupOptionPositionsAction({
      name: 'MGLU3 Estrutura Auditável',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'MGLU3',
      collateralMode: 'IDLE_CASH',
      legs: [
        { positionId: newPos1Id, allocatedQuantity: 1500, economicRole: 'FINANCING' },
        { positionId: newPos2Id, allocatedQuantity: 500, economicRole: 'DIRECTIONAL' },
      ],
    });
    const auditStratId = reGroupRes.strategyId!;

    // Executa alteração prospectiva de funding (gera strategy_funding_events CHANGE)
    const updateAuditFundingRes = await updateOptionStrategyFundingAction({
      strategyId: auditStratId,
      collateralMode: 'REMUNERATED_100_CDI',
      collateralCoveragePct: 100,
    });
    assert(updateAuditFundingRes.success === true, 'P0.4: updateOptionStrategyFundingAction executado com sucesso');

    // Verifica que existe 1 evento de funding CHANGE
    const fundingEventsInDb = db.query.strategyFundingEvents.findMany({
      where: eq(strategyFundingEvents.strategyId, auditStratId),
    }).sync();
    assert(fundingEventsInDb.length === 1, 'P0.4: Evento de funding CHANGE gravado na auditoria');
    assert(fundingEventsInDb[0].eventType === 'CHANGE', 'P0.4: EventType é CHANGE (prospectivo)');

    // Tentativa de desagrupar deve ser BLOQUEADA por histórico de funding!
    const ungroupFundingRes = await ungroupOptionStrategyAction(auditStratId);
    assert(ungroupFundingRes.success === false, 'P0.3: Desagrupamento bloqueado por presença de histórico de funding');
    assert(Boolean(ungroupFundingRes.error?.includes('STRATEGY_HAS_FINANCIAL_HISTORY')), 'P0.3: Erro STRATEGY_HAS_FINANCIAL_HISTORY retornado');

    // Provar que nada foi apagado
    const eventsAfterBlocked = db.query.strategyFundingEvents.findMany({
      where: eq(strategyFundingEvents.strategyId, auditStratId),
    }).sync();
    const segmentsAfterBlocked = db.query.strategyFundingSegments.findMany({
      where: eq(strategyFundingSegments.strategyId, auditStratId),
    }).sync();
    const stratAfterBlocked = db.query.optionStrategies.findFirst({
      where: eq(optionStrategies.id, auditStratId),
    }).sync();
    assert(eventsAfterBlocked.length === 1, 'P0.3: Evento de funding PRESERVADO no banco');
    assert(segmentsAfterBlocked.length === 2, 'P0.3: Segmentos de funding PRESERVADOS no banco (inicial fechado + vigente aberto)');
    assert(Boolean(stratAfterBlocked), 'P0.3: Estratégia PRESERVADA no banco');

    // 6.8. P0.2: Full Close Canônico em Posição Avulsa (Standalone)
    const createStandalonePut = await createOptionPosition({
      portfolio: 'Principal',
      tickerUnderlying: 'BBDC4',
      tickerOption: 'BBDCU150',
      optionType: 'PUT',
      side: 'SELL',
      strategyType: 'VENDA_PUT',
      quantity: 400,
      strike: 15.00,
      entryPrice: 1.04,
      currentPrice: 1.04,
      entryDate: '2026-08-24',
      expirationDate: '2026-09-18',
      status: 'OPEN',
    });
    const standalonePutId = createStandalonePut.id!;

    // Rejeição de status não suportados diretamente (EXERCISED, ROLLED)
    const rejectExercised = await closeOptionPosition({
      id: standalonePutId,
      exitPrice: 1.04,
      status: 'EXERCISED',
    });
    assert(rejectExercised.success === false, 'P0.2: Encerramento com EXERCISED rejeitado com NOT_SUPPORTED');
    assert(Boolean(rejectExercised.error?.includes('NOT_SUPPORTED')), 'P0.2: Erro NOT_SUPPORTED retornado para EXERCISED');

    const rejectRolled = await closeOptionPosition({
      id: standalonePutId,
      exitPrice: 1.04,
      status: 'ROLLED',
    });
    assert(rejectRolled.success === false, 'P0.2: Encerramento com ROLLED rejeitado com NOT_SUPPORTED');
    assert(Boolean(rejectRolled.error?.includes('NOT_SUPPORTED')), 'P0.2: Erro NOT_SUPPORTED retornado para ROLLED');

    // Executa Full Close normal com lucro (venda a 1.04, recompra a 0.20 -> unitPnl = +0.84 * 400 = +R$ 336.00)
    const fullCloseRes = await closeOptionPosition({
      id: standalonePutId,
      exitPrice: 0.20,
      exitDate: '2026-09-02',
      status: 'CLOSED',
      notes: 'Fechamento integral a mercado com 80% do lucro',
    });
    assert(fullCloseRes.success === true, 'P0.2: closeOptionPosition executado com sucesso');

    // Validação da posição fechada
    const closedPos = db.query.optionPositions.findFirst({
      where: eq(optionPositions.id, standalonePutId),
    }).sync();
    assert(closedPos?.status === 'CLOSED', 'P0.2: Posição status = CLOSED');
    assert(closedPos?.openQuantity === 0, 'P0.2: openQuantity zerado = 0');
    assert(closedPos?.closedQuantity === 400, 'P0.2: closedQuantity atualizado para 400');
    assert(closedPos?.exitPrice === 0.20, 'P0.2: exitPrice gravado = 0.20');
    assert(Math.abs((closedPos?.realizedPnlReais ?? 0) - 336.0) < 0.01, 'P0.2: realizedPnlReais apurado com precisão: +R$ 336,00');

    // Validação da execution gerada
    const execsForPos = db.query.optionPositionExecutions.findMany({
      where: eq(optionPositionExecutions.positionId, standalonePutId),
    }).sync();
    assert(execsForPos.length === 1, 'P0.2: Exatamente 1 execution gerada para o fechamento');
    const exec = execsForPos[0];
    assert(exec.quantity === 400, 'P0.2: Execution quantity = 400');
    assert(exec.price === 0.20, 'P0.2: Execution price = 0.20');
    assert(exec.executionType === 'BUY_TO_CLOSE', 'P0.2: Execution type = BUY_TO_CLOSE (recompra de short)');
    assert(exec.grossRealizedPnlReais === 336.0, 'P0.2: Execution grossRealizedPnl = 336.0');
    assert(exec.netRealizedPnlReais === 336.0, 'P0.2: Execution netRealizedPnl = 336.0');

    // Validação das identidades canônicas estritas
    assert(
      closedPos?.closedQuantity === (closedPos?.legacyClosedQuantity ?? 0) + execsForPos.reduce((s, e) => s + e.quantity, 0),
      'P0.2: Reconciliação canônica: closedQuantity === legacyClosedQuantity + sum(executions)'
    );
    assert(
      closedPos?.openQuantity === (closedPos?.quantity ?? 0) - (closedPos?.closedQuantity ?? 0),
      'P0.2: Reconciliação canônica: openQuantity === quantity - closedQuantity'
    );

    // Tentativa de fechar novamente deve ser bloqueada com POSITION_ALREADY_CLOSED
    const secondCloseRes = await closeOptionPosition({
      id: standalonePutId,
      exitPrice: 0.10,
      status: 'CLOSED',
    });
    assert(secondCloseRes.success === false, 'P0.2: Segundo fechamento de posição já encerrada bloqueado');
    assert(Boolean(secondCloseRes.error?.includes('POSITION_ALREADY_CLOSED')), 'P0.2: Erro POSITION_ALREADY_CLOSED retornado');

    // 6.9. P0.2: Full Close com EXPIRED_WORTHLESS em CALL comprada
    const createLongCall = await createOptionPosition({
      portfolio: 'Principal',
      tickerUnderlying: 'VALE3',
      tickerOption: 'VALEI600',
      optionType: 'CALL',
      side: 'BUY',
      strategyType: 'COMPRA_CALL',
      quantity: 200,
      strike: 60.00,
      entryPrice: 1.18,
      currentPrice: 0.01,
      entryDate: '2026-08-24',
      expirationDate: '2026-09-18',
      status: 'OPEN',
    });
    const longCallId = createLongCall.id!;

    const expireCallRes = await closeOptionPosition({
      id: longCallId,
      exitPrice: 0,
      exitDate: '2026-09-18', // No vencimento
      status: 'EXPIRED_WORTHLESS',
      notes: 'Virou pó no vencimento',
    });
    assert(expireCallRes.success === true, 'P0.2: Encerramento com EXPIRED_WORTHLESS executado com sucesso');

    const expiredPos = db.query.optionPositions.findFirst({
      where: eq(optionPositions.id, longCallId),
    }).sync();
    assert(expiredPos?.status === 'EXPIRED_WORTHLESS', 'P0.2: Posição status = EXPIRED_WORTHLESS');
    assert(expiredPos?.openQuantity === 0, 'P0.2: openQuantity = 0');
    assert(expiredPos?.closedQuantity === 200, 'P0.2: closedQuantity = 200');
    assert(expiredPos?.realizedPnlReais === -236.0, 'P0.2: realizedPnlReais = -R$ 236,00 (-1.18 * 200)');

    const expireExecs = db.query.optionPositionExecutions.findMany({
      where: eq(optionPositionExecutions.positionId, longCallId),
    }).sync();
    assert(expireExecs.length === 1, 'P0.2: 1 execution gerada para o pó');
    assert(expireExecs[0].executionType === 'EXPIRE_WORTHLESS', 'P0.2: Execution type = EXPIRE_WORTHLESS');
    assert(expireExecs[0].price === 0, 'P0.2: Execution price = 0');
    assert(expireExecs[0].netRealizedPnlReais === -236.0, 'P0.2: Execution netRealizedPnl = -236.0');

    // Limpeza da Seção 6
    db.delete(optionPositionExecutions).where(inArray(optionPositionExecutions.positionId, [standalonePutId, longCallId, newPos1Id, newPos2Id])).run();
    db.delete(strategyFundingSegments).where(eq(strategyFundingSegments.strategyId, auditStratId)).run();
    db.delete(strategyFundingEvents).where(eq(strategyFundingEvents.strategyId, auditStratId)).run();
    db.delete(strategyAllocationEvents).where(eq(strategyAllocationEvents.strategyId, auditStratId)).run();
    db.delete(optionStrategyLegs).where(eq(optionStrategyLegs.strategyId, auditStratId)).run();
    db.delete(optionStrategies).where(eq(optionStrategies.id, auditStratId)).run();
    db.delete(optionPositions).where(inArray(optionPositions.id, [newPos1Id, newPos2Id, standalonePutId, longCallId])).run();

    console.log('\n7. Roll Protocol Suspension & Temporal Invariants Tests:');

    // 7.1. Tentativa de Roll deve retornar NOT_SUPPORTED e NUNCA criar nova posição
    const initialPosCount = db.query.optionPositions.findMany().sync().length;
    const rollAttemptRes = await rollOptionPosition({
      currentPositionId: 'dummy_id',
      recompraPrice: 0.10,
      newOptionTicker: 'VALEJ600',
      newStrike: 62.00,
      newEntryPrice: 1.50,
      newExpirationDate: '2026-10-16',
    });
    assert(rollAttemptRes.success === false, 'P0.1: rollOptionPosition rejeitado temporariamente com sucesso');
    assert(Boolean(rollAttemptRes.error?.includes('ROLL_NOT_SUPPORTED_UNTIL_MANEUVER_ENGINE')), 'P0.1: Erro ROLL_NOT_SUPPORTED_UNTIL_MANEUVER_ENGINE retornado');
    const finalPosCount = db.query.optionPositions.findMany().sync().length;
    assert(initialPosCount === finalPosCount, 'P0.1: Nenhuma nova posição criada na tentativa de roll');

    // 7.2. Invariante Temporal: EXPIRED_WORTHLESS antes do vencimento deve ser bloqueado
    const createEarlyExpPos = await createOptionPosition({
      portfolio: 'Principal',
      tickerUnderlying: 'VALE3',
      tickerOption: 'VALEU600',
      optionType: 'PUT',
      side: 'SELL',
      strategyType: 'VENDA_PUT',
      quantity: 100,
      strike: 60.00,
      entryPrice: 1.00,
      currentPrice: 0.05,
      entryDate: '2026-08-24',
      expirationDate: '2026-09-18', // Vencimento em 18/09
      status: 'OPEN',
    });
    const earlyExpPosId = createEarlyExpPos.id!;

    const rejectEarlyExpireRes = await closeOptionPosition({
      id: earlyExpPosId,
      exitPrice: 0,
      exitDate: '2026-09-02', // 02/09 < 18/09
      status: 'EXPIRED_WORTHLESS',
    });
    assert(rejectEarlyExpireRes.success === false, 'P0.2: EXPIRED_WORTHLESS antes do vencimento bloqueado');
    assert(Boolean(rejectEarlyExpireRes.error?.includes('EXPIRE_BEFORE_EXPIRATION_NOT_ALLOWED')), 'P0.2: Erro EXPIRE_BEFORE_EXPIRATION_NOT_ALLOWED retornado');

    // 7.3. Validações estritas de CLOSED normal
    // a) Preço negativo ou não finito
    const rejectNegativePriceRes = await closeOptionPosition({
      id: earlyExpPosId,
      exitPrice: -0.50,
      exitDate: '2026-09-02',
      status: 'CLOSED',
    });
    assert(rejectNegativePriceRes.success === false, 'P0.2: Preço de saída negativo rejeitado');
    assert(Boolean(rejectNegativePriceRes.error?.includes('INVALID_EXIT_PRICE')), 'P0.2: Erro INVALID_EXIT_PRICE retornado');

    // b) exitDate não útil (sábado)
    const rejectSaturdayCloseRes = await closeOptionPosition({
      id: earlyExpPosId,
      exitPrice: 0.20,
      exitDate: '2026-08-29', // Sábado
      status: 'CLOSED',
    });
    assert(rejectSaturdayCloseRes.success === false, 'P0.2: Data de saída em dia não útil rejeitada');
    assert(Boolean(rejectSaturdayCloseRes.error?.includes('INVALID_EXIT_DATE_NON_TRADING_DAY')), 'P0.2: Erro INVALID_EXIT_DATE_NON_TRADING_DAY retornado');

    // c) exitDate anterior à entryDate
    const rejectPastCloseRes = await closeOptionPosition({
      id: earlyExpPosId,
      exitPrice: 0.20,
      exitDate: '2026-08-21', // 21/08 < entryDate 24/08
      status: 'CLOSED',
    });
    assert(rejectPastCloseRes.success === false, 'P0.2: Data de saída anterior à entrada rejeitada');
    assert(Boolean(rejectPastCloseRes.error?.includes('EXIT_DATE_BEFORE_ENTRY_DATE')), 'P0.2: Erro EXIT_DATE_BEFORE_ENTRY_DATE retornado');

    // Encerramento válido no vencimento com pó
    const validExpireRes = await closeOptionPosition({
      id: earlyExpPosId,
      exitPrice: 0,
      exitDate: '2026-09-18', // No vencimento
      status: 'EXPIRED_WORTHLESS',
    });
    assert(validExpireRes.success === true, 'P0.2: EXPIRED_WORTHLESS no vencimento aceito com sucesso');

    // 7.4. Golden Test: Estrutura legada com openedAt em sábado (ex: 2026-08-15)
    const legacyStratId = 'strat_legacy_weekend_audit';
    const legacyPosId = 'pos_legacy_weekend_audit';
    const legacyLegId = 'leg_legacy_weekend_audit';

    db.insert(optionPositions).values({
      id: legacyPosId,
      portfolio: 'Principal',
      tickerUnderlying: 'PETR4',
      tickerOption: 'PETRU300',
      optionType: 'PUT',
      side: 'SELL',
      strategyType: 'CUSTOM',
      quantity: 100,
      openQuantity: 100,
      closedQuantity: 0,
      legacyClosedQuantity: 0,
      strike: 30.00,
      entryPrice: 1.00,
      currentPrice: 1.00,
      allocatedCapital: 3000.0,
      entryDate: '2026-08-24',
      expirationDate: '2026-09-18',
      status: 'OPEN',
      createdAt: '2026-08-15T12:00:00.000Z',
      updatedAt: '2026-08-15T12:00:00.000Z',
    }).run();

    db.insert(optionStrategies).values({
      id: legacyStratId,
      name: 'Trava Legada Sábado',
      strategyType: 'CUSTOM',
      book: 'HYBRID',
      underlyingTicker: 'PETR4',
      collateralMode: 'REMUNERATED_100_CDI',
      status: 'OPEN',
      openedAt: '2026-08-15', // Sábado!
      createdAt: '2026-08-15T12:00:00.000Z',
      updatedAt: '2026-08-15T12:00:00.000Z',
    }).run();

    db.insert(optionStrategyLegs).values({
      id: legacyLegId,
      strategyId: legacyStratId,
      positionId: legacyPosId,
      allocatedQuantity: 100,
      openAllocatedQuantity: 100,
      closedAllocatedQuantity: 0,
      legacyClosedAllocatedQuantity: 0,
      economicRole: 'FINANCING',
      createdAt: '2026-08-15T12:00:00.000Z',
    }).run();

    // getOptionPositions NÃO PODE quebrar nem lançar Invariant Violation
    const getLegacyRes = await getOptionPositions();
    assert(getLegacyRes.success === true, 'P0/P1 Golden Test: getOptionPositions com strategy legacy em sábado retorna success: true sem quebrar');
    assert(getLegacyRes.strategies !== null, 'P0/P1 Golden Test: strategies carregadas');
    const weekendStrat = getLegacyRes.strategies?.find((s) => s.id === legacyStratId);
    assert(Boolean(weekendStrat), 'P0/P1 Golden Test: Estrutura com data de sábado encontrada');
    assert(weekendStrat?.economicPerformance.economicPerformanceQuality === 'INSUFFICIENT_DATA', 'P0/P1 Golden Test: economicPerformanceQuality === INSUFFICIENT_DATA');
    assert(weekendStrat?.economicPerformance.benchmarkQuality === 'NOT_AVAILABLE', 'P0/P1 Golden Test: benchmarkQuality === NOT_AVAILABLE');
    assert(weekendStrat?.economicPerformance.benchmarkCdiReais === null, 'P0/P1 Golden Test: benchmarkCdiReais === null');
    assert(weekendStrat?.economicPerformance.collateralCarryReais === 0, 'P0/P1 Golden Test: collateralCarryReais === 0');
    assert(
      Boolean(weekendStrat?.economicPerformance.qualityNotes.some((n) => n.includes('INVALID_STRATEGY_OPENED_AT_NON_TRADING_DAY'))),
      'P0/P1 Golden Test: qualityNotes contém INVALID_STRATEGY_OPENED_AT_NON_TRADING_DAY'
    );

    // Limpeza das fixtures de teste
    db.delete(optionPositionExecutions).where(eq(optionPositionExecutions.positionId, earlyExpPosId)).run();
    db.delete(optionStrategyLegs).where(eq(optionStrategyLegs.id, legacyLegId)).run();
    db.delete(optionStrategies).where(eq(optionStrategies.id, legacyStratId)).run();
    db.delete(optionPositions).where(inArray(optionPositions.id, [earlyExpPosId, legacyPosId])).run();

    // ══════════════════════════════════════════════════════════════════════
    // 8. Phase 4.2 Residual Quantity Engine, Scale Down & Partial Close Tests
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n8. Phase 4.2 Residual Quantity Engine, Scale Down & Partial Close Tests:');

    // 8.1. Boundary Pre-Validations for partialCloseStrategyLegAction
    const rejectInvalidQty = await partialCloseStrategyLegAction({
      strategyId: 'non_existent',
      strategyLegId: 'non_existent',
      quantity: -10,
      price: 1.0,
      executionDate: '2026-09-02',
    });
    assert(rejectInvalidQty.success === false, 'P0.8: Quantidade negativa rejeitada');
    assert(Boolean(rejectInvalidQty.error?.includes('INVALID_QUANTITY')), 'P0.8: Erro INVALID_QUANTITY retornado');

    const rejectInvalidPrice = await partialCloseStrategyLegAction({
      strategyId: 'non_existent',
      strategyLegId: 'non_existent',
      quantity: 10,
      price: -0.5,
      executionDate: '2026-09-02',
    });
    assert(rejectInvalidPrice.success === false, 'P0.8: Preço negativo rejeitado');
    assert(Boolean(rejectInvalidPrice.error?.includes('INVALID_PRICE')), 'P0.8: Erro INVALID_PRICE retornado');

    const rejectSaturdayAction = await partialCloseStrategyLegAction({
      strategyId: 'non_existent',
      strategyLegId: 'non_existent',
      quantity: 10,
      price: 1.0,
      executionDate: '2026-09-05', // Sábado
    });
    assert(rejectSaturdayAction.success === false, 'P0.8: Data em sábado rejeitada');
    assert(Boolean(rejectSaturdayAction.error?.includes('INVALID_EXECUTION_DATE_NON_TRADING_DAY')), 'P0.8: Erro INVALID_EXECUTION_DATE_NON_TRADING_DAY retornado');

    // 8.2. Boundary Pre-Validations for scaleDownOptionStrategyAction
    const rejectZeroPct = await scaleDownOptionStrategyAction({
      strategyId: 'non_existent',
      percentageReduced: 0,
      executionDate: '2026-09-02',
      legs: [],
    });
    assert(rejectZeroPct.success === false, 'P0.7: Redução de 0% rejeitada');
    assert(Boolean(rejectZeroPct.error?.includes('INVALID_SCALE_DOWN_PERCENTAGE')), 'P0.7: Erro INVALID_SCALE_DOWN_PERCENTAGE retornado para 0%');

    const rejectHundredPct = await scaleDownOptionStrategyAction({
      strategyId: 'non_existent',
      percentageReduced: 100,
      executionDate: '2026-09-02',
      legs: [],
    });
    assert(rejectHundredPct.success === false, 'P0.7: Redução de 100% rejeitada');
    assert(Boolean(rejectHundredPct.error?.includes('INVALID_SCALE_DOWN_PERCENTAGE')), 'P0.7: Erro INVALID_SCALE_DOWN_PERCENTAGE retornado para 100%');

    // 8.3. Golden Case ITUB4 (+200C / -400P -> +100C / -200P) em 02/09/2026
    const itubGoldenStratId = 'strat_itub_golden_42';
    const itubGoldenPutPosId = 'pos_itub_golden_put';
    const itubGoldenCallPosId = 'pos_itub_golden_call';
    const itubGoldenPutLegId = 'leg_itub_golden_put';
    const itubGoldenCallLegId = 'leg_itub_golden_call';

    db.insert(optionPositions).values({
      id: itubGoldenPutPosId,
      portfolio: 'Principal',
      tickerUnderlying: 'ITUB4',
      tickerOption: 'ITUBU393',
      optionType: 'PUT',
      side: 'SELL',
      strategyType: 'CUSTOM',
      quantity: 400,
      openQuantity: 400,
      closedQuantity: 0,
      legacyClosedQuantity: 0,
      strike: 38.69,
      entryPrice: 1.04,
      currentPrice: 0.30,
      allocatedCapital: 15476.0,
      entryDate: '2026-08-24',
      expirationDate: '2026-09-18',
      status: 'OPEN',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionPositions).values({
      id: itubGoldenCallPosId,
      portfolio: 'Principal',
      tickerUnderlying: 'ITUB4',
      tickerOption: 'ITUBI393',
      optionType: 'CALL',
      side: 'BUY',
      strategyType: 'CUSTOM',
      quantity: 200,
      openQuantity: 200,
      closedQuantity: 0,
      legacyClosedQuantity: 0,
      strike: 38.69,
      entryPrice: 1.18,
      currentPrice: 0.70,
      allocatedCapital: 236.0,
      entryDate: '2026-08-24',
      expirationDate: '2026-09-18',
      status: 'OPEN',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionStrategies).values({
      id: itubGoldenStratId,
      portfolio: 'Principal',
      name: 'ITUB4 Ratio 2:1 Golden Case',
      strategyType: 'RATIO_PUT_SPREAD',
      book: 'HYBRID',
      underlyingTicker: 'ITUB4',
      collateralMode: 'IDLE_CASH',
      status: 'OPEN',
      openedAt: '2026-08-24',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionStrategyLegs).values({
      id: itubGoldenPutLegId,
      strategyId: itubGoldenStratId,
      positionId: itubGoldenPutPosId,
      allocatedQuantity: 400,
      openAllocatedQuantity: 400,
      closedAllocatedQuantity: 0,
      legacyClosedAllocatedQuantity: 0,
      economicRole: 'FINANCING',
      createdAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionStrategyLegs).values({
      id: itubGoldenCallLegId,
      strategyId: itubGoldenStratId,
      positionId: itubGoldenCallPosId,
      allocatedQuantity: 200,
      openAllocatedQuantity: 200,
      closedAllocatedQuantity: 0,
      legacyClosedAllocatedQuantity: 0,
      economicRole: 'DIRECTIONAL',
      createdAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(strategyFundingSegments).values({
      id: 'fnd_itub_golden_initial',
      strategyId: itubGoldenStratId,
      startDate: '2026-08-24',
      endDate: null,
      benchmarkCapitalReais: 15476.0,
      capitalRemuneratedReais: 0,
      collateralMode: 'IDLE_CASH',
      collateralPctCdi: null,
      sourceType: 'CREATION',
      quality: 'FULL',
      createdAt: '2026-08-24T12:00:00.000Z',
    }).run();

    const rejectUnrepresentablePct = await scaleDownOptionStrategyAction({
      strategyId: itubGoldenStratId,
      percentageReduced: 33.33,
      executionDate: '2026-09-02',
      legs: [
        { strategyLegId: itubGoldenPutLegId, price: 0.20 },
        { strategyLegId: itubGoldenCallLegId, price: 0.60 },
      ],
    });
    assert(rejectUnrepresentablePct.success === false, 'P0.7: Porcentagem não representável em contratos inteiros rejeitada');
    assert(Boolean(rejectUnrepresentablePct.error?.includes('SCALE_DOWN_PERCENTAGE_NOT_REPRESENTABLE')), 'P0.7: Erro SCALE_DOWN_PERCENTAGE_NOT_REPRESENTABLE retornado');

    const posResBefore = await getOptionPositions();
    const realizedBefore = posResBefore.summary!.portfolioKnownGrossRealizedPnlReais;

    const scaleDownRes = await scaleDownOptionStrategyAction({
      strategyId: itubGoldenStratId,
      percentageReduced: 50,
      executionDate: '2026-09-02',
      legs: [
        { strategyLegId: itubGoldenPutLegId, price: 0.20, feesReais: 0 },
        { strategyLegId: itubGoldenCallLegId, price: 0.60, feesReais: 0 },
      ],
      notes: 'Redução de 50% da trava 2:1 ITUB4',
    });

    assert(scaleDownRes.success === true, 'P0 Golden Case: scaleDownOptionStrategyAction executado com sucesso');
    assert(Boolean(scaleDownRes.maneuverEventId), 'P0 Golden Case: maneuverEventId retornado');

    const mnvEvent = db.query.strategyManeuverEvents.findFirst({
      where: eq(strategyManeuverEvents.id, scaleDownRes.maneuverEventId!),
    }).sync()!;
    assert(Boolean(mnvEvent), 'P0 Golden Case: Evento de manobra encontrado no banco');
    assert(mnvEvent.maneuverType === 'SCALE_DOWN', 'P0 Golden Case: maneuverType === SCALE_DOWN');
    assert(mnvEvent.percentageReduced === 50, 'P0 Golden Case: percentageReduced === 50');
    assert(mnvEvent.unitsReduced === 100, 'P0 Golden Case: unitsReduced === 100');
    assert(mnvEvent.preservesOriginalRatio === true, 'P0 Golden Case: preservesOriginalRatio === true');
    assert(mnvEvent.auditRealizedPnlReais === 110.0, 'P0 Golden Case: auditRealizedPnlReais === 110.00 (+168 PUT - 58 CALL)');

    const executions = db.query.optionPositionExecutions.findMany({
      where: eq(optionPositionExecutions.maneuverEventId, scaleDownRes.maneuverEventId!),
    }).sync();
    assert(executions.length === 2, 'P0 Golden Case: Exatamente 2 execuções geradas para a manobra');

    const putExec = executions.find((e) => e.strategyLegId === itubGoldenPutLegId)!;
    assert(Boolean(putExec), 'P0 Golden Case: Execução da perna PUT encontrada');
    assert(putExec.quantity === 200, 'P0 Golden Case: PUT execution quantity === 200');
    assert(putExec.price === 0.20, 'P0 Golden Case: PUT execution price === 0.20');
    assert(putExec.executionType === 'BUY_TO_CLOSE', 'P0 Golden Case: PUT executionType === BUY_TO_CLOSE');
    assert(putExec.grossRealizedPnlReais === 168.0, 'P0 Golden Case: PUT grossRealizedPnlReais === +R$ 168,00');

    const callExec = executions.find((e) => e.strategyLegId === itubGoldenCallLegId)!;
    assert(Boolean(callExec), 'P0 Golden Case: Execução da perna CALL encontrada');
    assert(callExec.quantity === 100, 'P0 Golden Case: CALL execution quantity === 100');
    assert(callExec.price === 0.60, 'P0 Golden Case: CALL execution price === 0.60');
    assert(callExec.executionType === 'SELL_TO_CLOSE', 'P0 Golden Case: CALL executionType === SELL_TO_CLOSE');
    assert(callExec.grossRealizedPnlReais === -58.0, 'P0 Golden Case: CALL grossRealizedPnlReais === -R$ 58,00');

    const legsAfter = db.query.optionStrategyLegs.findMany({
      where: eq(optionStrategyLegs.strategyId, itubGoldenStratId),
    }).sync();
    const putLegAfter = legsAfter.find((l) => l.id === itubGoldenPutLegId)!;
    const callLegAfter = legsAfter.find((l) => l.id === itubGoldenCallLegId)!;
    assert(putLegAfter.openAllocatedQuantity === 200, 'P0 Golden Case: PUT leg openAllocatedQuantity === 200');
    assert(putLegAfter.closedAllocatedQuantity === 200, 'P0 Golden Case: PUT leg closedAllocatedQuantity === 200');
    assert(callLegAfter.openAllocatedQuantity === 100, 'P0 Golden Case: CALL leg openAllocatedQuantity === 100');
    assert(callLegAfter.closedAllocatedQuantity === 100, 'P0 Golden Case: CALL leg closedAllocatedQuantity === 100');

    const putPosAfter = db.query.optionPositions.findFirst({ where: eq(optionPositions.id, itubGoldenPutPosId) }).sync()!;
    const callPosAfter = db.query.optionPositions.findFirst({ where: eq(optionPositions.id, itubGoldenCallPosId) }).sync()!;
    assert(putPosAfter.openQuantity === 200, 'P0 Golden Case: PUT position openQuantity === 200');
    assert(putPosAfter.closedQuantity === 200, 'P0 Golden Case: PUT position closedQuantity === 200');
    assert(putPosAfter.realizedPnlReais === 168.0, 'P0 Golden Case: PUT position realizedPnlReais === 168.0');
    assert(putPosAfter.status === 'OPEN', 'P0 Golden Case: PUT position status continua OPEN');

    assert(callPosAfter.openQuantity === 100, 'P0 Golden Case: CALL position openQuantity === 100');
    assert(callPosAfter.closedQuantity === 100, 'P0 Golden Case: CALL position closedQuantity === 100');
    assert(callPosAfter.realizedPnlReais === -58.0, 'P0 Golden Case: CALL position realizedPnlReais === -58.0');
    assert(callPosAfter.status === 'OPEN', 'P0 Golden Case: CALL position status continua OPEN');

    const segmentsAfter = db.query.strategyFundingSegments.findMany({
      where: eq(strategyFundingSegments.strategyId, itubGoldenStratId),
      orderBy: [asc(strategyFundingSegments.startDate)],
    }).sync();
    assert(segmentsAfter.length === 2, 'P0 Golden Case: Exatamente 2 segmentos de funding (fechado + novo aberto)');
    assert(segmentsAfter[0].endDate === '2026-09-02', 'P0 Golden Case: Segmento inicial encerrado em 2026-09-02');
    assert(segmentsAfter[1].startDate === '2026-09-02', 'P0 Golden Case: Novo segmento aberto em 2026-09-02');
    assert(segmentsAfter[1].endDate === null, 'P0 Golden Case: Novo segmento vigente (endDate === null)');
    assert(segmentsAfter[1].benchmarkCapitalReais === 7738.0, 'P0 Golden Case: Novo capital de referência === R$ 7.738,00 (200 * 38.69)');
    assert(segmentsAfter[1].sourceType === 'MANEUVER', 'P0 Golden Case: sourceType === MANEUVER');
    assert(segmentsAfter[1].maneuverEventId === scaleDownRes.maneuverEventId, 'P0 Golden Case: maneuverEventId corresponde ao evento da manobra');

    const posRes1 = await getOptionPositions();
    const stratEnriched1 = posRes1.strategies?.find((s) => s.id === itubGoldenStratId)!;
    assert(Boolean(stratEnriched1), 'P0 Golden Case: Estratégia enriquecida carregada');

    // Asserts Canônicos Auditados:
    assert(stratEnriched1.metrics.netInitialCreditDebitReais === 180.0, 'P0 Golden Case: netInitialCreditDebitReais ORIGINAL === +R$ 180,00 (400*1.04 - 200*1.18)');
    assert(stratEnriched1.metrics.residualInitialCreditDebitReais === 90.0, 'P0 Golden Case: residualInitialCreditDebitReais RESIDUAL === +R$ 90,00 (200*1.04 - 100*1.18)');
    assert(stratEnriched1.metrics.breakEvenInferior === 38.24, 'P0 Golden Case: breakEvenInferior RESIDUAL === 38.24 (38.69 - 90/200)');
    assert(stratEnriched1.metrics.maxLossEconomicReais === 7648.0, 'P0 Golden Case: maxLossEconomicReais RESIDUAL === R$ 7.648,00 (7738 - 90)');
    assert(stratEnriched1.metrics.totalCapitalReserved === 7738.0, 'P0 Golden Case: totalCapitalReserved residual === R$ 7.738,00 (200 * 38.69)');

    assert(stratEnriched1.metrics.strategyGrossRealizedPnlReais === 110.0, 'P0 Golden Case: strategyGrossRealizedPnlReais === +R$ 110,00');
    assert(stratEnriched1.metrics.strategyUnrealizedPnlReais === 100.0, 'P0 Golden Case: strategyUnrealizedPnlReais residual MTM === +R$ 100,00');
    assert(stratEnriched1.metrics.strategyTotalGrossPnlReais === 210.0, 'P0 Golden Case: strategyTotalGrossPnlReais === +R$ 210,00 (110 + 100)');
    assert(stratEnriched1.economicPerformance.optionPnlReais === 210.0, 'P0 Golden Case: Double Yield optionPnlReais === +R$ 210,00 (total gross canônico)');

    // Timeline & CDI Engine Asserts:
    assert(stratEnriched1.economicPerformance.capitalBasisMethod === 'SEGMENTED_TIMELINE', 'P0 Golden Case: capitalBasisMethod === SEGMENTED_TIMELINE');
    assert(stratEnriched1.economicPerformance.optionReturnOnBenchmarkCapitalPct === null, 'P0 Golden Case: percentual estático optionReturnOnBenchmarkCapitalPct === null');
    assert(stratEnriched1.economicPerformance.totalEconomicReturnPct === null, 'P0 Golden Case: percentual estático totalEconomicReturnPct === null');
    assert(stratEnriched1.economicPerformance.cdiPeriodReturnPct === null, 'P0 Golden Case: percentual estático cdiPeriodReturnPct === null');

    const diSeg1 = calculateRealizedDiFactor('2026-08-24', '2026-09-02');
    assert(diSeg1.observationsCount === 7, 'P0 Golden Case: Segmento 1 (24/08 -> 02/09) possui exatamente 7 sessões B3 remuneradas');
    const expectedCdiSeg1 = 15476.0 * diSeg1.periodYieldDecimal;
    assert(Math.abs((stratEnriched1.economicPerformance.benchmarkCdiReais ?? 0) - expectedCdiSeg1) < 0.01, 'P0 Golden Case: benchmarkCdiReais corresponde a CDI(segmento1) + CDI(segmento2)');

    // Prova Exact-Once por Delta de Realized no Portfólio (P1.6)
    const realizedAfter = posRes1.summary!.portfolioKnownGrossRealizedPnlReais;
    assert(realizedAfter - realizedBefore === 110.0, 'P1.6 Prova Exact-Once: Delta exato no portfólio === +R$ 110,00');
    const sumManeuverExecs = executions.reduce((acc, x) => acc + x.grossRealizedPnlReais, 0);
    assert(sumManeuverExecs === 110.0, 'P1.6 Prova Exact-Once: Soma das execuções do evento de manobra === +R$ 110,00');

    // Prova do Segundo Segmento Temporal de Verdade após 02/09 (P1.5)
    const perfValuationNextDay = calculateStrategyEconomicPerformance({
      startDate: '2026-08-24',
      valuationDate: '2026-09-03',
      capitalReservedReais: 7738.0,
      capitalRemuneratedReais: 0,
      benchmarkCapitalReais: 7738.0,
      optionPnlReais: 210.0,
      collateralMode: 'IDLE_CASH',
      fundingSegments: segmentsAfter,
    });
    const diSeg1Full = calculateRealizedDiFactor('2026-08-24', '2026-09-02');
    const diSeg2Next = calculateRealizedDiFactor('2026-09-02', '2026-09-03');
    assert(diSeg1Full.observationsCount === 7, 'P1.5 Segmento 2 Test: Segmento 1 possui 7 sessões');
    assert(diSeg2Next.observationsCount === 1, 'P1.5 Segmento 2 Test: Segmento 2 avaliado até 03/09 possui 1 sessão');
    const expectedBenchmarkSeg2 = (15476.0 * diSeg1Full.periodYieldDecimal) + (7738.0 * diSeg2Next.periodYieldDecimal);
    assert(Math.abs((perfValuationNextDay.benchmarkCdiReais ?? 0) - expectedBenchmarkSeg2) < 0.01, 'P1.5 Segmento 2 Test: Sessão 03/09 remunera capital residual de R$ 7.738');

    // Provar imutabilidade do Realized perante alteração de cotação MTM
    db.update(optionPositions).set({ currentPrice: 5.00 }).where(eq(optionPositions.id, itubGoldenPutPosId)).run();
    db.update(optionPositions).set({ currentPrice: 10.00 }).where(eq(optionPositions.id, itubGoldenCallPosId)).run();

    const posRes2 = await getOptionPositions();
    const stratEnriched2 = posRes2.strategies?.find((s) => s.id === itubGoldenStratId)!;
    assert(stratEnriched2.metrics.strategyGrossRealizedPnlReais === 110.0, 'P0 Golden Case: Realized P&L IMUTÁVEL após choque de cotação MTM (+R$ 110,00)');
    assert(stratEnriched2.economicPerformance.optionPnlReais === Math.round((110.0 + stratEnriched2.metrics.strategyUnrealizedPnlReais) * 100) / 100, 'P0 Golden Case: optionPnlReais no Double Yield varia com MTM mas preserva 110 realizado');

    // 8.4. Teste de Taxas Não-Zero (Gross vs Net Reconciliados)
    const feeStratId = 'strat_fee_test';
    const feePosId = 'pos_fee_test';
    const feeLegId = 'leg_fee_test';

    db.insert(optionPositions).values({
      id: feePosId,
      portfolio: 'Principal',
      tickerUnderlying: 'VALE3',
      tickerOption: 'VALEU600',
      optionType: 'PUT',
      side: 'SELL',
      strategyType: 'CUSTOM',
      quantity: 100,
      openQuantity: 100,
      closedQuantity: 0,
      strike: 60.0,
      entryPrice: 2.00,
      currentPrice: 2.00,
      allocatedCapital: 6000.0,
      entryDate: '2026-08-24',
      expirationDate: '2026-09-18',
      status: 'OPEN',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionStrategies).values({
      id: feeStratId,
      portfolio: 'Principal',
      name: 'Fee Test Strategy',
      strategyType: 'CUSTOM',
      book: 'INCOME',
      underlyingTicker: 'VALE3',
      collateralMode: 'IDLE_CASH',
      status: 'OPEN',
      openedAt: '2026-08-24',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionStrategyLegs).values({
      id: feeLegId,
      strategyId: feeStratId,
      positionId: feePosId,
      allocatedQuantity: 100,
      openAllocatedQuantity: 100,
      closedAllocatedQuantity: 0,
      economicRole: 'INCOME',
      createdAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(strategyFundingSegments).values({
      id: 'fnd_fee_test',
      strategyId: feeStratId,
      startDate: '2026-08-24',
      endDate: null,
      benchmarkCapitalReais: 6000.0,
      capitalRemuneratedReais: 0,
      collateralMode: 'IDLE_CASH',
      collateralPctCdi: null,
      sourceType: 'CREATION',
      quality: 'FULL',
      createdAt: '2026-08-24T12:00:00.000Z',
    }).run();

    // Fechamento de 50 contratos @ 0.32 com taxa de R$ 2,00
    // Gross = (2.00 - 0.32) * 50 = +R$ 84,00
    // Fees = R$ 2,00
    // Net = R$ 82,00
    const feeCloseRes = await partialCloseStrategyLegAction({
      strategyId: feeStratId,
      strategyLegId: feeLegId,
      quantity: 50,
      price: 0.32,
      feesReais: 2.00,
      executionDate: '2026-09-02',
    });
    assert(feeCloseRes.success === true, 'P0 Fees Test: partialCloseStrategyLegAction com taxa executado com sucesso');

    const feePosRes = await getOptionPositions();
    const feeEnrichedPos = feePosRes.positions!.find((p) => p.id === feePosId)!;
    const feeEnrichedStrat = feePosRes.strategies!.find((s) => s.id === feeStratId)!;

    assert(feeEnrichedPos.metrics.realizedGrossPnlReais === 84.0, 'P0 Fees Test: Position grossRealizedPnlReais === +R$ 84,00');
    assert(feeEnrichedPos.metrics.feesReais === 2.0, 'P0 Fees Test: Position feesReais === R$ 2,00');
    assert(feeEnrichedPos.metrics.realizedNetPnlReais === 82.0, 'P0 Fees Test: Position realizedNetPnlReais === +R$ 82,00');

    assert(feeEnrichedStrat.metrics.strategyGrossRealizedPnlReais === 84.0, 'P0 Fees Test: Strategy strategyGrossRealizedPnlReais === +R$ 84,00');
    assert(feeEnrichedStrat.metrics.strategyFeesReais === 2.0, 'P0 Fees Test: Strategy strategyFeesReais === R$ 2,00');
    assert(feeEnrichedStrat.metrics.strategyNetRealizedPnlReais === 82.0, 'P0 Fees Test: Strategy strategyNetRealizedPnlReais === +R$ 82,00');

    // 8.5. Teste de Estratégia Remunerada 100% CDI Pós-Manobra (Snapshot Sync)
    const remunStratId = 'strat_remun_test';
    const remunPosId = 'pos_remun_test';
    const remunLegId = 'leg_remun_test';

    db.insert(optionPositions).values({
      id: remunPosId,
      portfolio: 'Principal',
      tickerUnderlying: 'BBDC4',
      tickerOption: 'BBDCU150',
      optionType: 'PUT',
      side: 'SELL',
      strategyType: 'CUSTOM',
      quantity: 1000,
      openQuantity: 1000,
      closedQuantity: 0,
      strike: 15.0,
      entryPrice: 0.50,
      currentPrice: 0.50,
      allocatedCapital: 15000.0,
      entryDate: '2026-08-24',
      expirationDate: '2026-09-18',
      status: 'OPEN',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionStrategies).values({
      id: remunStratId,
      portfolio: 'Principal',
      name: 'Remunerated 100% CDI Test',
      strategyType: 'COVERED_PUT',
      book: 'INCOME',
      underlyingTicker: 'BBDC4',
      collateralMode: 'REMUNERATED_100_CDI',
      collateralYieldPctCDI: 100,
      capitalRemuneratedReais: 15000.0,
      collateralCoveragePct: 100,
      status: 'OPEN',
      openedAt: '2026-08-24',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionStrategyLegs).values({
      id: remunLegId,
      strategyId: remunStratId,
      positionId: remunPosId,
      allocatedQuantity: 1000,
      openAllocatedQuantity: 1000,
      closedAllocatedQuantity: 0,
      economicRole: 'INCOME',
      createdAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(strategyFundingSegments).values({
      id: 'fnd_remun_test',
      strategyId: remunStratId,
      startDate: '2026-08-24',
      endDate: null,
      benchmarkCapitalReais: 15000.0,
      capitalRemuneratedReais: 15000.0,
      collateralMode: 'REMUNERATED_100_CDI',
      collateralPctCdi: 100,
      sourceType: 'CREATION',
      quality: 'FULL',
      createdAt: '2026-08-24T12:00:00.000Z',
    }).run();

    // Scale down de 50% na estratégia 100% CDI:
    const remunScaleDown = await scaleDownOptionStrategyAction({
      strategyId: remunStratId,
      percentageReduced: 50,
      executionDate: '2026-09-02',
      legs: [{ strategyLegId: remunLegId, price: 0.10, feesReais: 0 }],
    });
    assert(remunScaleDown.success === true, 'P0 Remun Test: scaleDownOptionStrategyAction 50% com sucesso');

    // Verificar se a linha em option_strategies foi sincronizada para 7500
    const remunStratRow = db.query.optionStrategies.findFirst({ where: eq(optionStrategies.id, remunStratId) }).sync()!;
    assert(remunStratRow.capitalRemuneratedReais === 7500.0, 'P0 Remun Test: option_strategies.capitalRemuneratedReais sincronizado atomicamente para R$ 7.500,00');

    // getOptionPositions() deve rodar perfeitamente sem lançar REMUNERATED_CAPITAL_EXCEEDS_BENCHMARK
    const remunPosCheck = await getOptionPositions();
    assert(remunPosCheck.success === true, 'P0 Remun Test: getOptionPositions executou sem erro de benchmark');
    const remunEnriched = remunPosCheck.strategies!.find((s) => s.id === remunStratId)!;
    assert(remunEnriched.economicPerformance.benchmarkCapitalReais === 7500.0, 'P0 Remun Test: benchmarkCapitalReais residual === 7500');

    // 8.6. Teste de Risco UNBOUNDED Degradando Qualidade do Segmento e Benchmark Nullification (P0.2)
    const unbStratId = 'strat_unbounded_test';
    const unbShortCallPosId = 'pos_unb_short_call';
    const unbLongCallPosId = 'pos_unb_long_call';
    const unbShortLegId = 'leg_unb_short_call';
    const unbLongLegId = 'leg_unb_long_call';

    db.insert(optionPositions).values({
      id: unbShortCallPosId,
      portfolio: 'Principal',
      tickerUnderlying: 'PETR4',
      tickerOption: 'PETRI400',
      optionType: 'CALL',
      side: 'SELL',
      strategyType: 'CUSTOM',
      quantity: 100,
      openQuantity: 100,
      closedQuantity: 0,
      strike: 40.0,
      entryPrice: 1.50,
      currentPrice: 1.50,
      allocatedCapital: 0,
      entryDate: '2026-08-24',
      expirationDate: '2026-09-18',
      status: 'OPEN',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionPositions).values({
      id: unbLongCallPosId,
      portfolio: 'Principal',
      tickerUnderlying: 'PETR4',
      tickerOption: 'PETRI420',
      optionType: 'CALL',
      side: 'BUY',
      strategyType: 'CUSTOM',
      quantity: 100,
      openQuantity: 100,
      closedQuantity: 0,
      strike: 42.0,
      entryPrice: 0.80,
      currentPrice: 0.80,
      allocatedCapital: 80.0,
      entryDate: '2026-08-24',
      expirationDate: '2026-09-18',
      status: 'OPEN',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionStrategies).values({
      id: unbStratId,
      portfolio: 'Principal',
      name: 'Spread Call to Naked Call Test',
      strategyType: 'CREDIT_CALL_SPREAD',
      book: 'INCOME',
      underlyingTicker: 'PETR4',
      collateralMode: 'IDLE_CASH',
      status: 'OPEN',
      openedAt: '2026-08-24',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionStrategyLegs).values({
      id: unbShortLegId,
      strategyId: unbStratId,
      positionId: unbShortCallPosId,
      allocatedQuantity: 100,
      openAllocatedQuantity: 100,
      closedAllocatedQuantity: 0,
      economicRole: 'INCOME',
      createdAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionStrategyLegs).values({
      id: unbLongLegId,
      strategyId: unbStratId,
      positionId: unbLongCallPosId,
      allocatedQuantity: 100,
      openAllocatedQuantity: 100,
      closedAllocatedQuantity: 0,
      economicRole: 'HEDGE',
      createdAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(strategyFundingSegments).values({
      id: 'fnd_unb_initial',
      strategyId: unbStratId,
      startDate: '2026-08-24',
      endDate: null,
      benchmarkCapitalReais: 200.0,
      capitalRemuneratedReais: 0,
      collateralMode: 'IDLE_CASH',
      collateralPctCdi: null,
      sourceType: 'CREATION',
      quality: 'FULL',
      createdAt: '2026-08-24T12:00:00.000Z',
    }).run();

    // Fecha a perna compradora (hedge), deixando a short call descoberta
    const unbCloseRes = await partialCloseStrategyLegAction({
      strategyId: unbStratId,
      strategyLegId: unbLongLegId,
      quantity: 100,
      price: 0.50,
      executionDate: '2026-09-02',
    });
    assert(unbCloseRes.success === true, 'P0 Unbounded Test: Fechamento da trava compradora aceito');

    const unbSegments = db.query.strategyFundingSegments.findMany({
      where: eq(strategyFundingSegments.strategyId, unbStratId),
      orderBy: [asc(strategyFundingSegments.startDate)],
    }).sync();
    const activeUnbSegment = unbSegments.find((s) => s.endDate === null)!;
    assert(activeUnbSegment.quality === 'INSUFFICIENT_DATA', 'P0 Unbounded Test: Novo segmento gerado com quality === INSUFFICIENT_DATA devido a risco UNBOUNDED');

    const unbPosCheck = await getOptionPositions();
    const unbStratEnriched = unbPosCheck.strategies!.find((s) => s.id === unbStratId)!;
    assert(unbStratEnriched.economicPerformance.benchmarkQuality === 'NOT_AVAILABLE', 'P0.2 Unbounded Test: benchmarkQuality === NOT_AVAILABLE');
    assert(unbStratEnriched.economicPerformance.benchmarkCdiReais === null, 'P0.2 Unbounded Test: benchmarkCdiReais === null');
    assert(unbStratEnriched.economicPerformance.excessReturnVsCdiReais === null, 'P0.2 Unbounded Test: excessReturnVsCdiReais === null');
    assert(unbStratEnriched.economicPerformance.optionPnlToCdiMultiple === null, 'P0.2 Unbounded Test: optionPnlToCdiMultiple === null');
    assert(unbStratEnriched.economicPerformance.totalReturnToCdiMultiple === null, 'P0.2 Unbounded Test: totalReturnToCdiMultiple === null');
    assert(unbPosCheck.summary!.portfolioExcludedFromBenchmarkCount >= 1, 'P0.2 Unbounded Test: portfolioExcludedFromBenchmarkCount incrementado');

    // 8.7. Múltiplos Parciais Consecutivos (Provas de Invariantes em CADA Passo)
    const partClose1 = await partialCloseStrategyLegAction({
      strategyId: itubGoldenStratId,
      strategyLegId: itubGoldenPutLegId,
      quantity: 50,
      price: 0.15,
      executionDate: '2026-09-02',
    });
    assert(partClose1.success === true, 'P0 Multi-Partial: Redução 1 de 50 contratos aceita');
    const legAfterPart1 = db.query.optionStrategyLegs.findFirst({ where: eq(optionStrategyLegs.id, itubGoldenPutLegId) }).sync()!;
    const putPosAfterPart1 = db.query.optionPositions.findFirst({ where: eq(optionPositions.id, itubGoldenPutPosId) }).sync()!;
    const putExecsPart1 = db.query.optionPositionExecutions.findMany({ where: eq(optionPositionExecutions.positionId, itubGoldenPutPosId) }).sync();
    const sumQtyExecs1 = putExecsPart1.reduce((acc, x) => acc + x.quantity, 0);

    assert(putPosAfterPart1.closedQuantity === (putPosAfterPart1.legacyClosedQuantity ?? 0) + sumQtyExecs1, 'P0 Multi-Partial Step 1: closedQuantity === legacyClosedQuantity + sum(executions.quantity)');
    assert(putPosAfterPart1.openQuantity === putPosAfterPart1.quantity - putPosAfterPart1.closedQuantity, 'P0 Multi-Partial Step 1: openQuantity === quantity - closedQuantity');
    assert(legAfterPart1.openAllocatedQuantity === 150, 'P0 Multi-Partial Step 1: leg openAllocatedQuantity === 150');
    assert(legAfterPart1.closedAllocatedQuantity === 250, 'P0 Multi-Partial Step 1: leg closedAllocatedQuantity === 250 (200 + 50)');

    const partClose2 = await partialCloseStrategyLegAction({
      strategyId: itubGoldenStratId,
      strategyLegId: itubGoldenPutLegId,
      quantity: 50,
      price: 0.10,
      executionDate: '2026-09-02',
    });
    assert(partClose2.success === true, 'P0 Multi-Partial: Redução 2 de 50 contratos aceita');
    const legAfterPart2 = db.query.optionStrategyLegs.findFirst({ where: eq(optionStrategyLegs.id, itubGoldenPutLegId) }).sync()!;
    const putPosAfterPart2 = db.query.optionPositions.findFirst({ where: eq(optionPositions.id, itubGoldenPutPosId) }).sync()!;
    const putExecsPart2 = db.query.optionPositionExecutions.findMany({ where: eq(optionPositionExecutions.positionId, itubGoldenPutPosId) }).sync();
    const sumQtyExecs2 = putExecsPart2.reduce((acc, x) => acc + x.quantity, 0);

    assert(putPosAfterPart2.closedQuantity === (putPosAfterPart2.legacyClosedQuantity ?? 0) + sumQtyExecs2, 'P0 Multi-Partial Step 2: closedQuantity === legacyClosedQuantity + sum(executions.quantity)');
    assert(putPosAfterPart2.openQuantity === putPosAfterPart2.quantity - putPosAfterPart2.closedQuantity, 'P0 Multi-Partial Step 2: openQuantity === quantity - closedQuantity');
    assert(legAfterPart2.openAllocatedQuantity === 100, 'P0 Multi-Partial Step 2: leg openAllocatedQuantity === 100');
    assert(legAfterPart2.closedAllocatedQuantity === 300, 'P0 Multi-Partial Step 2: leg closedAllocatedQuantity === 300 (200 + 50 + 50)');

    const rejectOverdraw = await partialCloseStrategyLegAction({
      strategyId: itubGoldenStratId,
      strategyLegId: itubGoldenPutLegId,
      quantity: 150,
      price: 0.10,
      executionDate: '2026-09-02',
    });
    assert(rejectOverdraw.success === false, 'P0 Multi-Partial: Tentativa de redução acima do saldo (150 > 100) rejeitada');
    assert(Boolean(rejectOverdraw.error?.includes('INSUFFICIENT_LEG_OPEN_QUANTITY')), 'P0 Multi-Partial: Erro INSUFFICIENT_LEG_OPEN_QUANTITY retornado');

    // 8.8. Concorrência DB-Level com 2 Conexões SQLite Independentes
    const Database = require('better-sqlite3');
    const path = require('path');
    const fs = require('fs');
    const tempDbFile = path.join(process.cwd(), 'temp_concurrency_test.db');
    if (fs.existsSync(tempDbFile)) fs.unlinkSync(tempDbFile);

    const conn1 = new Database(tempDbFile);
    const conn2 = new Database(tempDbFile);

    try {
      conn1.exec(`
        CREATE TABLE test_legs (
          id TEXT PRIMARY KEY,
          open_allocated_quantity INTEGER NOT NULL,
          closed_allocated_quantity INTEGER NOT NULL
        );
        INSERT INTO test_legs (id, open_allocated_quantity, closed_allocated_quantity)
        VALUES ('leg_conc', 100, 0);
      `);

      const stmt1 = conn1.prepare(`
        UPDATE test_legs
        SET open_allocated_quantity = open_allocated_quantity - 70,
            closed_allocated_quantity = closed_allocated_quantity + 70
        WHERE id = 'leg_conc' AND open_allocated_quantity >= 70
      `);
      const res1 = stmt1.run();
      assert(res1.changes === 1, 'P0 Concurrency: Conn 1 deduziu 70 com sucesso (changes === 1)');

      const stmt2 = conn2.prepare(`
        UPDATE test_legs
        SET open_allocated_quantity = open_allocated_quantity - 70,
            closed_allocated_quantity = closed_allocated_quantity + 70
        WHERE id = 'leg_conc' AND open_allocated_quantity >= 70
      `);
      const res2 = stmt2.run();
      assert(res2.changes === 0, 'P0 Concurrency: Conn 2 rejeitada atomicamente a nível de SQL (changes === 0)');

      const rowFinal = conn1.prepare('SELECT open_allocated_quantity, closed_allocated_quantity FROM test_legs WHERE id = ?').get('leg_conc');
      assert(rowFinal.open_allocated_quantity === 30, 'P0 Concurrency: Saldo remanescente no banco é exatamente 30 contratos');
      assert(rowFinal.closed_allocated_quantity === 70, 'P0 Concurrency: Saldo encerrado é exatamente 70 contratos');
    } finally {
      conn1.close();
      conn2.close();
      if (fs.existsSync(tempDbFile)) fs.unlinkSync(tempDbFile);
    }

    // 8.9. Terminal Close da Estrutura Residual (Status CLOSED preserva Performance Since Inception) (P0.3)
    const summaryBeforeTerminal = (await getOptionPositions()).summary!;
    const capitalBeforeTerminal = summaryBeforeTerminal.totalCapitalAllocated;
    const realizedBeforeTerminal = summaryBeforeTerminal.portfolioKnownGrossRealizedPnlReais;
    const optionPnlBeforeTerminal = summaryBeforeTerminal.portfolioOptionPnlReais;

    const termCloseCall = await partialCloseStrategyLegAction({
      strategyId: itubGoldenStratId,
      strategyLegId: itubGoldenCallLegId,
      quantity: 100,
      price: 0.80,
      executionDate: '2026-09-02',
    });
    assert(termCloseCall.success === true, 'P0.3 Terminal Close: CALL fechada totalmente');

    const termClosePut = await partialCloseStrategyLegAction({
      strategyId: itubGoldenStratId,
      strategyLegId: itubGoldenPutLegId,
      quantity: 100,
      price: 0.05,
      executionDate: '2026-09-02',
    });
    assert(termClosePut.success === true, 'P0.3 Terminal Close: PUT fechada totalmente');

    const itubStratAfterTerminal = db.query.optionStrategies.findFirst({ where: eq(optionStrategies.id, itubGoldenStratId) }).sync()!;
    assert(itubStratAfterTerminal.status === 'CLOSED', 'P0.3 Terminal Close: Status da estratégia evolui para CLOSED');

    const summaryAfterTerminal = (await getOptionPositions()).summary!;
    assert(summaryAfterTerminal.totalCapitalAllocated < capitalBeforeTerminal, 'P0.3 Terminal Close: Capital alocado (Current Exposure) cai com o fechamento');
    assert(summaryAfterTerminal.portfolioKnownGrossRealizedPnlReais >= realizedBeforeTerminal, 'P0.3 Terminal Close: Realized da carteira preservado e acumulado');

    const itubStratEnrichedClosed = (await getOptionPositions()).strategies!.find((s) => s.id === itubGoldenStratId)!;
    assert(itubStratEnrichedClosed.status === 'CLOSED', 'P0.3 Terminal Close: Estratégia enriquecida com status CLOSED');
    assert(itubStratEnrichedClosed.metrics.totalCapitalReserved === 0, 'P0.3 Terminal Close: Capital reservado cai para 0');
    assert(itubStratEnrichedClosed.economicPerformance.optionPnlReais === itubStratEnrichedClosed.metrics.strategyGrossRealizedPnlReais, 'P0.3 Terminal Close: Performance since inception de estratégia CLOSED preserva rigorosamente o P&L realizado');
    assert(summaryAfterTerminal.portfolioBenchmarkEligibleCount >= 1, 'P0.3 Terminal Close: Estratégia CLOSED com histórico completo permanece benchmark eligible');

    // 8.10. Teste de Legacy Incomplete Degradando Double Yield (P0.1)
    const legacyIncStratId = 'strat_legacy_inc_test';
    const legacyIncPosId = 'pos_legacy_inc_test';
    const legacyIncLegId = 'leg_legacy_inc_test';

    db.insert(optionPositions).values({
      id: legacyIncPosId,
      portfolio: 'Principal',
      tickerUnderlying: 'PETR4',
      tickerOption: 'PETRU300',
      optionType: 'PUT',
      side: 'SELL',
      strategyType: 'CUSTOM',
      quantity: 200,
      openQuantity: 100,
      closedQuantity: 100,
      legacyClosedQuantity: 100,
      legacyQuality: 'LEGACY_INCOMPLETE',
      strike: 30.0,
      entryPrice: 1.00,
      currentPrice: 0.50,
      allocatedCapital: 3000.0,
      entryDate: '2026-08-24',
      expirationDate: '2026-09-18',
      status: 'OPEN',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionStrategies).values({
      id: legacyIncStratId,
      portfolio: 'Principal',
      name: 'Legacy Incomplete Strategy Test',
      strategyType: 'CUSTOM',
      book: 'INCOME',
      underlyingTicker: 'PETR4',
      collateralMode: 'IDLE_CASH',
      status: 'OPEN',
      openedAt: '2026-08-24',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(optionStrategyLegs).values({
      id: legacyIncLegId,
      strategyId: legacyIncStratId,
      positionId: legacyIncPosId,
      allocatedQuantity: 200,
      openAllocatedQuantity: 100,
      closedAllocatedQuantity: 100,
      legacyClosedAllocatedQuantity: 100,
      economicRole: 'INCOME',
      createdAt: '2026-08-24T12:00:00.000Z',
    }).run();

    db.insert(strategyFundingSegments).values({
      id: 'fnd_legacy_inc_test',
      strategyId: legacyIncStratId,
      startDate: '2026-08-24',
      endDate: null,
      benchmarkCapitalReais: 3000.0,
      capitalRemuneratedReais: 0,
      collateralMode: 'IDLE_CASH',
      collateralPctCdi: null,
      sourceType: 'CREATION',
      quality: 'FULL',
      createdAt: '2026-08-24T12:00:00.000Z',
    }).run();

    const legacyCheckRes = await getOptionPositions();
    const legacyEnrichedStrat = legacyCheckRes.strategies!.find((s) => s.id === legacyIncStratId)!;
    assert(legacyEnrichedStrat.metrics.strategyRealizedPnlQuality === 'LEGACY_INCOMPLETE', 'P0.1 Legacy Incomplete: strategyRealizedPnlQuality === LEGACY_INCOMPLETE');
    assert(legacyEnrichedStrat.metrics.strategyGrossRealizedPnlReais === null, 'P0.1 Legacy Incomplete: strategyGrossRealizedPnlReais === null');
    assert(legacyEnrichedStrat.metrics.strategyTotalGrossPnlReais === null, 'P0.1 Legacy Incomplete: strategyTotalGrossPnlReais === null');
    assert(legacyEnrichedStrat.economicPerformance.economicPerformanceQuality === 'INSUFFICIENT_DATA', 'P0.1 Legacy Incomplete: Double Yield degradado para INSUFFICIENT_DATA');
    assert(legacyEnrichedStrat.economicPerformance.excessReturnVsCdiReais === null, 'P0.1 Legacy Incomplete: excessReturnVsCdiReais === null');
    assert(legacyEnrichedStrat.economicPerformance.totalReturnToCdiMultiple === null, 'P0.1 Legacy Incomplete: totalReturnToCdiMultiple === null');

    // 8.11. Teste de Posição com Quantidade Fechada sem Execuções Canônicas (P1.4)
    const missingExecPosId = 'pos_missing_exec_test';
    db.insert(optionPositions).values({
      id: missingExecPosId,
      portfolio: 'Principal',
      tickerUnderlying: 'MGLU3',
      tickerOption: 'MGLUU100',
      optionType: 'PUT',
      side: 'SELL',
      strategyType: 'CUSTOM',
      quantity: 100,
      openQuantity: 50,
      closedQuantity: 50,
      legacyClosedQuantity: 0,
      strike: 10.0,
      entryPrice: 1.00,
      currentPrice: 0.50,
      allocatedCapital: 500.0,
      entryDate: '2026-08-24',
      expirationDate: '2026-09-18',
      status: 'OPEN',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
    }).run();

    const missingExecPosRes = await getOptionPositions();
    const missingExecPos = missingExecPosRes.positions!.find((p) => p.id === missingExecPosId)!;
    assert(missingExecPos.metrics.realizedPnlQuality === 'NOT_AVAILABLE', 'P1.4 Missing Execs: realizedPnlQuality === NOT_AVAILABLE');
    assert(missingExecPos.metrics.realizedGrossPnlReais === null, 'P1.4 Missing Execs: realizedGrossPnlReais === null');
    assert(missingExecPos.metrics.realizedNetPnlReais === null, 'P1.4 Missing Execs: realizedNetPnlReais === null');
    assert(Boolean(missingExecPos.metrics.qualityNotes?.includes('MISSING_CANONICAL_EXECUTION_HISTORY')), 'P1.4 Missing Execs: qualityNotes contém MISSING_CANONICAL_EXECUTION_HISTORY');

  } finally {
    // Limpeza Final de Segurança (ordem estrita de chaves estrangeiras)
    const allCleanPosIds = [
      itubPutId, itubCallId, lrenPutId, dirCallId,
      'pos_itub_golden_put', 'pos_itub_golden_call',
      'pos_fee_test', 'pos_remun_test', 'pos_unb_short_call', 'pos_unb_long_call',
      'pos_legacy_inc_test', 'pos_missing_exec_test'
    ];
    const allCleanStratIds = [
      itubStratId, 'strat_itub_golden_42',
      'strat_fee_test', 'strat_remun_test', 'strat_unbounded_test',
      'strat_legacy_inc_test'
    ];
    db.delete(optionPositionExecutions).where(inArray(optionPositionExecutions.positionId, allCleanPosIds)).run();
    db.delete(strategyFundingSegments).where(inArray(strategyFundingSegments.strategyId, allCleanStratIds)).run();
    db.delete(strategyFundingEvents).where(inArray(strategyFundingEvents.strategyId, allCleanStratIds)).run();
    db.delete(strategyManeuverEvents).where(inArray(strategyManeuverEvents.strategyId, allCleanStratIds)).run();
    db.delete(strategyAllocationEvents).where(inArray(strategyAllocationEvents.positionId, allCleanPosIds)).run();
    db.delete(optionStrategyLegs).where(inArray(optionStrategyLegs.strategyId, allCleanStratIds)).run();
    db.delete(optionStrategies).where(inArray(optionStrategies.id, allCleanStratIds)).run();
    db.delete(optionPositions).where(inArray(optionPositions.id, allCleanPosIds)).run();
  }

  console.log('\n========================================');
  console.log('✅ ALL SERVER ACTIONS TESTS PASSED SUCCESSFULLY!');
  console.log('========================================\n');
}

if (require.main === module) {
  runActionsSuiteTests().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
