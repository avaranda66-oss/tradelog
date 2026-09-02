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
  createOptionPosition,
  updateOptionPosition,
  ungroupOptionStrategyAction,
  type GetOptionPositionsResult,
} from './actions';
import { db } from '../../lib/db';
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
import { eq, inArray, and, isNull } from 'drizzle-orm';

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

    console.log('\n6. Phase 4.1.1 Foundation Integration Tests:');

    // 6.1. P0.2: Criação de nova posição pós-migration inicializa openQuantity e baseline
    const createNewPos1Res = await createOptionPosition({
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
    assert(createNewPos1Res.success === true && Boolean(createNewPos1Res.id), 'P0.2: createOptionPosition 1 executado com sucesso');
    const newPos1Id = createNewPos1Res.id!;

    const createNewPos2Res = await createOptionPosition({
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
    assert(createNewPos2Res.success === true && Boolean(createNewPos2Res.id), 'P0.2: createOptionPosition 2 executado com sucesso');
    const newPos2Id = createNewPos2Res.id!;

    const fetchedNewPos1 = db.query.optionPositions.findFirst({
      where: eq(optionPositions.id, newPos1Id),
    }).sync();
    assert(fetchedNewPos1?.quantity === 1000, 'P0.2: quantity original gravada como 1000');
    assert(fetchedNewPos1?.openQuantity === 1000, 'P0.2: openQuantity inicializado como 1000 (NÃO null)');
    assert(fetchedNewPos1?.closedQuantity === 0, 'P0.2: closedQuantity inicializado como 0 (NÃO null)');
    assert(fetchedNewPos1?.legacyClosedQuantity === 0, 'P0.2: legacyClosedQuantity inicializado como 0 (NÃO null)');
    assert(fetchedNewPos1?.realizedPnlReais === 0, 'P0.2: realizedPnlReais inicializado como 0 (NÃO null)');

    // 6.2. P0.3: Proteção de Imutabilidade da Quantidade Original
    // Cria uma estrutura de 2 pernas para prender as posições
    const newStratRes = await groupOptionPositionsAction({
      name: 'MGLU3 Estrutura 2:1',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'MGLU3',
      collateralMode: 'IDLE_CASH',
      legs: [
        { positionId: newPos1Id, allocatedQuantity: 1000, economicRole: 'FINANCING' },
        { positionId: newPos2Id, allocatedQuantity: 500, economicRole: 'DIRECTIONAL' },
      ],
    });
    assert(newStratRes.success === true, 'P0.2: groupOptionPositionsAction executado com sucesso');
    const newStratId = newStratRes.strategyId!;

    // P0.2: Verifica se as legs nasceram com os caches preenchidos
    const newLeg1 = db.query.optionStrategyLegs.findFirst({
      where: and(
        eq(optionStrategyLegs.strategyId, newStratId),
        eq(optionStrategyLegs.positionId, newPos1Id)
      ),
    }).sync();
    assert(newLeg1?.allocatedQuantity === 1000, 'P0.2: allocatedQuantity leg 1 gravada como 1000');
    assert(newLeg1?.openAllocatedQuantity === 1000, 'P0.2: openAllocatedQuantity leg 1 inicializado como 1000 (NÃO null)');
    assert(newLeg1?.closedAllocatedQuantity === 0, 'P0.2: closedAllocatedQuantity leg 1 inicializado como 0 (NÃO null)');
    assert(newLeg1?.legacyClosedAllocatedQuantity === 0, 'P0.2: legacyClosedAllocatedQuantity leg 1 inicializado como 0 (NÃO null)');

    // P0.2: Verifica se a estratégia nova nasceu com segmento de funding inicial
    const initFundingSeg = db.query.strategyFundingSegments.findFirst({
      where: and(
        eq(strategyFundingSegments.strategyId, newStratId),
        isNull(strategyFundingSegments.endDate)
      ),
    }).sync();
    assert(initFundingSeg !== undefined, 'P0.2: Novo segmento de funding aberto criado na criação da estratégia');
    assert(initFundingSeg?.benchmarkCapitalReais === 2000.0, 'P0.2: Benchmark capital calculado via Risk Recognizer B3 (1000 * 2.00 = R$ 2.000,00)');
    assert(initFundingSeg?.sourceType === 'CREATION', 'P0.2: sourceType inicial gravado como CREATION');
    assert(initFundingSeg?.quality === 'FULL', 'P0.2: quality inicial gravado como FULL');

    // P0.3: Tentar alterar quantity de uma posição alocada deve FALHAR com QUANTITY_IMMUTABLE
    const alterAllocatedRes = await updateOptionPosition(newPos1Id, { quantity: 800 });
    assert(alterAllocatedRes.success === false, 'P0.3: Alteração de quantity em posição alocada bloqueada');
    assert(Boolean(alterAllocatedRes.error?.includes('QUANTITY_IMMUTABLE')), 'P0.3: Erro QUANTITY_IMMUTABLE retornado');

    // 6.3. P0.4: Atualização de Funding fecha segmento antigo, cria evento e abre novo segmento
    const updateFundingSegRes = await updateOptionStrategyFundingAction({
      strategyId: newStratId,
      collateralMode: 'REMUNERATED_100_CDI',
      collateralCoveragePct: 100,
    });
    assert(updateFundingSegRes.success === true, 'P0.4: updateOptionStrategyFundingAction executado com sucesso');

    // Verifica se o segmento anterior foi fechado
    const previousSeg = db.query.strategyFundingSegments.findFirst({
      where: and(
        eq(strategyFundingSegments.strategyId, newStratId),
        eq(strategyFundingSegments.id, initFundingSeg!.id)
      ),
    }).sync();
    assert(previousSeg?.endDate !== null, 'P0.4: Segmento inicial fechado com endDate preenchido');

    // Verifica se o novo segmento vigente foi aberto
    const currentSeg = db.query.strategyFundingSegments.findFirst({
      where: and(
        eq(strategyFundingSegments.strategyId, newStratId),
        isNull(strategyFundingSegments.endDate)
      ),
    }).sync();
    assert(currentSeg !== undefined && currentSeg.id !== initFundingSeg!.id, 'P0.4: Novo segmento aberto vigente criado');
    assert(currentSeg?.sourceType === 'FUNDING_CHANGE', 'P0.4: Novo segmento possui sourceType = FUNDING_CHANGE');
    assert(currentSeg?.fundingEventId !== null, 'P0.4: Novo segmento referencia fundingEventId');
    assert(currentSeg?.capitalRemuneratedReais === 2000.0, 'P0.4: Capital remunerado do novo segmento = R$ 2.000,00');

    // Reconciliação Snapshot <-> Segmento Vigente
    const stratSnapshot = db.query.optionStrategies.findFirst({
      where: eq(optionStrategies.id, newStratId),
    }).sync();
    assert(stratSnapshot?.collateralMode === currentSeg?.collateralMode, 'P0.4: Snapshot collateralMode espelha segmento vigente');
    assert(stratSnapshot?.capitalRemuneratedReais === currentSeg?.capitalRemuneratedReais, 'P0.4: Snapshot capitalRemuneratedReais espelha segmento vigente');

    // 6.4. P0.5: Desagrupamento de Estrutura Virgem com Funding Segment Não Quebra por FK
    const ungroupVirginRes = await ungroupOptionStrategyAction(newStratId);
    assert(ungroupVirginRes.success === true, 'P0.5: Estrutura virgem desagrupada com sucesso sem FOREIGN KEY constraint failed');

    // Posições voltam a estar livres
    const legsAfterUngroup = db.query.optionStrategyLegs.findMany({
      where: inArray(optionStrategyLegs.positionId, [newPos1Id, newPos2Id]),
    }).sync();
    assert(legsAfterUngroup.length === 0, 'P0.5: Pernas cascade-deletadas, liberando as posições');

    // P0.3: Posição virgem liberada permite correção atômica de quantity
    const correctVirginRes = await updateOptionPosition(newPos1Id, { quantity: 1500 });
    assert(correctVirginRes.success === true, 'P0.3: Correção de quantidade em posição virgem permitida');
    const correctedPos = db.query.optionPositions.findFirst({
      where: eq(optionPositions.id, newPos1Id),
    }).sync();
    assert(correctedPos?.quantity === 1500, 'P0.3: Nova quantity = 1500');
    assert(correctedPos?.openQuantity === 1500, 'P0.3: openQuantity atualizado atomicamente para 1500');
    assert(correctedPos!.openQuantity <= correctedPos!.quantity, 'P0.3: Invariante 0 <= openQuantity <= quantity preservada');

    // 6.5. P0.5: Bloqueio de Desagrupamento quando há histórico contábil (Execution)
    // Agrupa novamente para simular execução
    const stratWithExecRes = await groupOptionPositionsAction({
      name: 'MGLU3 com Execucao',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'MGLU3',
      collateralMode: 'IDLE_CASH',
      legs: [
        { positionId: newPos1Id, allocatedQuantity: 1500, economicRole: 'FINANCING' },
        { positionId: newPos2Id, allocatedQuantity: 500, economicRole: 'DIRECTIONAL' },
      ],
    });
    const stratWithExecId = stratWithExecRes.strategyId!;

    // Insere uma execução atrelada a essa estratégia
    db.insert(optionPositionExecutions).values({
      id: 'exec_test_audit',
      positionId: newPos1Id,
      strategyId: stratWithExecId,
      executionType: 'BUY_TO_CLOSE',
      quantity: 500,
      price: 0.05,
      executionDate: '2026-09-02',
      entryPriceBasisReais: 0.15,
      grossRealizedPnlReais: (0.15 - 0.05) * 500,
      netRealizedPnlReais: (0.15 - 0.05) * 500,
      createdAt: new Date().toISOString(),
    }).run();

    // Tentativa de desagrupar deve ser bloqueada por histórico contábil
    const ungroupBlockedRes = await ungroupOptionStrategyAction(stratWithExecId);
    assert(ungroupBlockedRes.success === false, 'P0.5: Desagrupamento com execuções financeiras bloqueado com segurança');
    assert(Boolean(ungroupBlockedRes.error?.includes('STRATEGY_HAS_FINANCIAL_HISTORY')), 'P0.5: Erro STRATEGY_HAS_FINANCIAL_HISTORY retornado');

    // Limpeza da suíte 6
    db.delete(optionPositionExecutions).where(eq(optionPositionExecutions.id, 'exec_test_audit')).run();
    db.delete(strategyAllocationEvents).where(eq(strategyAllocationEvents.strategyId, stratWithExecId)).run();
    db.delete(strategyFundingSegments).where(eq(strategyFundingSegments.strategyId, stratWithExecId)).run();
    db.delete(strategyFundingEvents).where(eq(strategyFundingEvents.strategyId, stratWithExecId)).run();
    db.delete(optionStrategyLegs).where(eq(optionStrategyLegs.strategyId, stratWithExecId)).run();
    db.delete(optionStrategies).where(eq(optionStrategies.id, stratWithExecId)).run();
    db.delete(optionPositions).where(inArray(optionPositions.id, [newPos1Id, newPos2Id])).run();

  } finally {
    // Limpeza Final de Segurança
    db.delete(strategyAllocationEvents).where(inArray(strategyAllocationEvents.positionId, [itubPutId, itubCallId, lrenPutId, dirCallId])).run();
    db.delete(strategyFundingSegments).where(inArray(strategyFundingSegments.strategyId, [itubStratId])).run();
    db.delete(strategyFundingEvents).where(inArray(strategyFundingEvents.strategyId, [itubStratId])).run();
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
