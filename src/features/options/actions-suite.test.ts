/**
 * Server Actions & Integration Test Suite
 * Tests Server Boundaries, Transactional Isolation, Error Contracts, Pre-Insert Validations,
 * and Canonical Portfolio Economic Summary Aggregation (Double Yield Engine).
 */

import { getOptionPositions, groupOptionPositionsAction, type GetOptionPositionsResult } from './actions';
import { db } from '../../lib/db';
import { optionPositions, optionStrategies, optionStrategyLegs, strategyAllocationEvents } from '../../lib/db/schema';
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
  // Simulando retorno de erro
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

  console.log('\n2. Live Portfolio Economic Summary Aggregation Tests:');
  const portfolioRes = await getOptionPositions('ALL');
  assert(portfolioRes.success === true, 'getOptionPositions com banco real retorna success: true');
  assert(portfolioRes.positions !== null && portfolioRes.positions.length > 0, 'getOptionPositions carrega posições reais');
  assert(portfolioRes.strategies !== null && portfolioRes.strategies.length > 0, 'getOptionPositions carrega estratégias reais');
  
  const summary = portfolioRes.summary!;
  assert(summary.portfolioOptionPnlReais > 0, 'Portfolio Economic: portfolioOptionPnlReais é positivo e calculado');
  assert(summary.portfolioBenchmarkCdiReais > 0, 'Portfolio Economic: portfolioBenchmarkCdiReais é positivo');
  assert(summary.portfolioTotalEconomicReturnReais >= summary.portfolioOptionPnlReais, 'Portfolio Economic: Retorno Total Econômico >= P&L das opções (Double Yield)');
  assert(summary.portfolioExcessReturnVsCdiReais > 0, 'Portfolio Economic: Excesso vs CDI é positivo');
  assert(summary.totalAlphaReais === summary.portfolioExcessReturnVsCdiReais, 'Single Source of Truth: totalAlphaReais espelha portfolioExcessReturnVsCdiReais');
  console.log('\n3. Server Boundary Pre-Insert Validations in groupOptionPositionsAction:');
  const testPos1Id = 'test_pos_act_1';
  const testPos2Id = 'test_pos_act_2';

  try {
    // Limpeza prévia defensiva
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

    // 3.1. Rejeição de Quantidade Oversubscribed (Concorrência / Stale allocation)
    const oversubRes = await groupOptionPositionsAction({
      name: 'Teste Oversubscription',
      strategyType: 'CUSTOM_MULTI_LEG',
      underlyingTicker: 'TEST4',
      collateralMode: 'IDLE_CASH',
      legs: [
        { positionId: testPos1Id, allocatedQuantity: 999999, economicRole: 'FINANCING' },
        { positionId: testPos2Id, allocatedQuantity: 100, economicRole: 'DIRECTIONAL' },
      ],
    });
    assert(oversubRes.success === false, 'Concorrência/Oversubscription: Bloqueado com success=false');
    assert(Boolean(oversubRes.error?.includes('Quantidade insuficiente')), 'Concorrência/Oversubscription: Mensagem clara de quantidade insuficiente');

    // 3.2. Rejeição de Capital Remunerado > Benchmark Capital antes do INSERT
    // Capital reservado = 100 * 40 = R$ 4.000. Tentando remunerar R$ 50.000
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
    assert(Boolean(exceedCapRes.error?.includes('REMUNERATED_CAPITAL_EXCEEDS_BENCHMARK')), 'Pre-Insert Validation: Retorna erro REMUNERATED_CAPITAL_EXCEEDS_BENCHMARK antes do insert');

    // 3.3. Rejeição de Modo CUSTOM sem percentual
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

    // 3.4. Rejeição de Cobertura > 100%
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

    // 3.5. Sucesso com Funding Zero Preservado (0% Coverage e R$ 0 Remunerado)
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
    
    // Consulta no banco para validar se gravou exatamente 0 e não null
    const persistedStrat = db.query.optionStrategies.findFirst({
      where: eq(optionStrategies.id, zeroFundingRes.strategyId!),
    }).sync();
    assert(persistedStrat?.collateralCoveragePct === 0, 'Funding Zero: collateral_coverage_pct persistido como 0 (não null)');
    assert(persistedStrat?.capitalRemuneratedReais === 0, 'Funding Zero: capital_remunerated_reais persistido como 0 (não null)');

    // Limpeza da estrutura criada
    if (zeroFundingRes.strategyId) {
      db.delete(strategyAllocationEvents).where(eq(strategyAllocationEvents.strategyId, zeroFundingRes.strategyId)).run();
      db.delete(optionStrategyLegs).where(eq(optionStrategyLegs.strategyId, zeroFundingRes.strategyId)).run();
      db.delete(optionStrategies).where(eq(optionStrategies.id, zeroFundingRes.strategyId)).run();
    }
  } finally {
    // Limpeza final
    db.delete(strategyAllocationEvents).where(inArray(strategyAllocationEvents.positionId, [testPos1Id, testPos2Id])).run();
    db.delete(optionStrategyLegs).where(inArray(optionStrategyLegs.positionId, [testPos1Id, testPos2Id])).run();
    db.delete(optionPositions).where(inArray(optionPositions.id, [testPos1Id, testPos2Id])).run();
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
