/**
 * SQLite Migration Smoke Test (Fase 4.1.1 — Foundation Integration)
 * Testa a evolução não-destrutiva do schema, idempotência de migrações,
 * reconciliação canônica de baseline de legados (completos vs incompletos),
 * canonical benchmark capital via Risk Recognizer B3 (Golden Case ITUB4 R$ 15.476,00),
 * rebaixamento de funding presumido para PARTIAL,
 * partial unique index, check constraints físicas de sourceType e integridade relacional.
 */

import Database from 'better-sqlite3';
import { ensureColumn, ensureTable, ensureIndex, applyMigrations, upgradeStrategyFundingSegmentsCoherenceCheck } from '../../lib/db/migrations';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[MIGRATION TEST FAILED] ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

export function runMigrationSmokeTest() {
  console.log('\n========================================');
  console.log('🧪 RUNNING SQLITE MIGRATION SMOKE TEST (FASE 4.1.1)');
  console.log('========================================\n');

  // 1. Criar banco em memória com schema LEGADO (sem as novas colunas e tabelas)
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(`
    CREATE TABLE option_positions (
      id TEXT PRIMARY KEY,
      portfolio TEXT DEFAULT 'Principal',
      ticker_underlying TEXT NOT NULL,
      ticker_option TEXT NOT NULL,
      option_type TEXT NOT NULL,
      side TEXT NOT NULL,
      strategy_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      strike REAL NOT NULL,
      entry_price REAL NOT NULL,
      current_price REAL NOT NULL,
      exit_price REAL,
      underlying_entry_spot REAL,
      underlying_current_spot REAL,
      entry_date TEXT NOT NULL,
      expiration_date TEXT NOT NULL,
      exit_date TEXT,
      allocated_capital REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      delta REAL,
      gamma REAL,
      theta REAL,
      vega REAL,
      iv REAL,
      pop REAL,
      break_even REAL,
      cdi_rate_annual REAL DEFAULT 0.14,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE option_strategies (
      id TEXT PRIMARY KEY,
      portfolio TEXT DEFAULT 'Principal',
      name TEXT NOT NULL,
      strategy_type TEXT NOT NULL,
      book TEXT NOT NULL DEFAULT 'HYBRID',
      underlying_ticker TEXT NOT NULL,
      collateral_mode TEXT DEFAULT 'IDLE_CASH',
      collateral_yield_pct_cdi REAL,
      capital_remunerated_reais REAL,
      collateral_coverage_pct REAL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE option_strategy_legs (
      id TEXT PRIMARY KEY,
      strategy_id TEXT NOT NULL REFERENCES option_strategies(id) ON DELETE CASCADE,
      position_id TEXT NOT NULL REFERENCES option_positions(id) ON DELETE RESTRICT,
      allocated_quantity INTEGER NOT NULL,
      economic_role TEXT NOT NULL DEFAULT 'CUSTOM',
      created_at TEXT,
      UNIQUE(strategy_id, position_id)
    );
  `);

  console.log('--- ETAPA 1: Inserindo dados legados reais ---');

  // Posição 1: Golden Case ITUB4 Short Put ITUBU393 (400 unidades @ 1.04, strike 38.69)
  sqlite.prepare(`
    INSERT INTO option_positions (id, ticker_underlying, ticker_option, option_type, side, strategy_type, quantity, strike, entry_price, current_price, entry_date, expiration_date, allocated_capital, status)
    VALUES ('pos_itub_put', 'ITUB4', 'ITUBU393', 'PUT', 'SELL', 'VENDA_PUT', 400, 38.69, 1.04, 0.29, '2026-08-24', '2026-09-18', 15476.0, 'OPEN');
  `).run();

  // Posição 2: Golden Case ITUB4 Long Call ITUBI393 (200 unidades @ 1.18, strike 38.69)
  sqlite.prepare(`
    INSERT INTO option_positions (id, ticker_underlying, ticker_option, option_type, side, strategy_type, quantity, strike, entry_price, current_price, entry_date, expiration_date, allocated_capital, status)
    VALUES ('pos_itub_call', 'ITUB4', 'ITUBI393', 'CALL', 'BUY', 'COMPRA_CALL', 200, 38.69, 1.18, 2.07, '2026-08-24', '2026-09-18', 236.0, 'OPEN');
  `).run();

  // Posição 3: CLOSED completo com exitPrice e exitDate (200 unidades PETR4, saída a 0.20)
  sqlite.prepare(`
    INSERT INTO option_positions (id, ticker_underlying, ticker_option, option_type, side, strategy_type, quantity, strike, entry_price, current_price, exit_price, exit_date, entry_date, expiration_date, allocated_capital, status)
    VALUES ('pos_closed_complete', 'PETR4', 'PETRU300', 'PUT', 'SELL', 'VENDA_PUT', 200, 30.0, 0.80, 0.20, 0.20, '2026-09-02', '2026-08-24', '2026-09-18', 6000.0, 'CLOSED');
  `).run();

  // Posição 4: CLOSED incompleto SEM exitPrice e SEM exitDate (300 unidades LREN3)
  sqlite.prepare(`
    INSERT INTO option_positions (id, ticker_underlying, ticker_option, option_type, side, strategy_type, quantity, strike, entry_price, current_price, exit_price, exit_date, entry_date, expiration_date, allocated_capital, status)
    VALUES ('pos_closed_incomplete', 'LREN3', 'LRENV104', 'PUT', 'SELL', 'VENDA_PUT', 300, 10.42, 0.50, 0.37, NULL, NULL, '2026-08-27', '2026-10-16', 3126.0, 'CLOSED');
  `).run();

  // Posição 5: OPEN com funding presumido sem capital_remunerated_reais (100 unidades VALE3)
  sqlite.prepare(`
    INSERT INTO option_positions (id, ticker_underlying, ticker_option, option_type, side, strategy_type, quantity, strike, entry_price, current_price, entry_date, expiration_date, allocated_capital, status)
    VALUES ('pos_assumed_csp', 'VALE3', 'VALEU600', 'PUT', 'SELL', 'VENDA_PUT', 100, 60.0, 1.50, 1.00, '2026-08-20', '2026-09-18', 6000.0, 'OPEN');
  `).run();

  // Estratégia 1: Golden Case ITUB4 Financiada 2:1 (+200 CALL / -400 PUT)
  sqlite.prepare(`
    INSERT INTO option_strategies (id, name, strategy_type, book, underlying_ticker, collateral_mode, collateral_yield_pct_cdi, capital_remunerated_reais, collateral_coverage_pct, status, opened_at)
    VALUES ('strat_golden_itub', 'ITUB4 — Call Financiada por Put 2:1', 'CUSTOM_MULTI_LEG', 'HYBRID', 'ITUB4', 'REMUNERATED_100_CDI', 100.0, 15476.0, 100.0, 'OPEN', '2026-08-24');
  `).run();
  sqlite.prepare(`
    INSERT INTO option_strategy_legs (id, strategy_id, position_id, allocated_quantity, economic_role)
    VALUES ('leg_itub_put', 'strat_golden_itub', 'pos_itub_put', 400, 'FINANCING');
  `).run();
  sqlite.prepare(`
    INSERT INTO option_strategy_legs (id, strategy_id, position_id, allocated_quantity, economic_role)
    VALUES ('leg_itub_call', 'strat_golden_itub', 'pos_itub_call', 200, 'DIRECTIONAL');
  `).run();

  // Estratégia 2: CLOSED terminal associada à pos_closed_complete (Caso A: 100% inequívoca)
  sqlite.prepare(`
    INSERT INTO option_strategies (id, name, strategy_type, underlying_ticker, collateral_mode, status, opened_at, closed_at)
    VALUES ('strat_closed_A', 'Venda Put PETR4 Encerrada', 'VENDA_PUT', 'PETR4', 'IDLE_CASH', 'CLOSED', '2026-08-24', '2026-09-02');
  `).run();
  sqlite.prepare(`
    INSERT INTO option_strategy_legs (id, strategy_id, position_id, allocated_quantity, economic_role)
    VALUES ('leg_closed_A', 'strat_closed_A', 'pos_closed_complete', 200, 'INCOME');
  `).run();

  // Estratégia 3: CLOSED terminal associada à pos_closed_incomplete (Caso B: dados incompletos)
  sqlite.prepare(`
    INSERT INTO option_strategies (id, name, strategy_type, underlying_ticker, collateral_mode, status, opened_at, closed_at)
    VALUES ('strat_closed_B', 'LREN3 Encerrada Incompleta', 'VENDA_PUT', 'LREN3', 'IDLE_CASH', 'CLOSED', '2026-08-27', '2026-10-16');
  `).run();
  sqlite.prepare(`
    INSERT INTO option_strategy_legs (id, strategy_id, position_id, allocated_quantity, economic_role)
    VALUES ('leg_closed_B', 'strat_closed_B', 'pos_closed_incomplete', 300, 'INCOME');
  `).run();

  // Estratégia 4: OPEN com funding remunerado mas SEM capital_remunerated_reais (Assumed Funding Legacy)
  sqlite.prepare(`
    INSERT INTO option_strategies (id, name, strategy_type, underlying_ticker, collateral_mode, collateral_yield_pct_cdi, capital_remunerated_reais, status, opened_at)
    VALUES ('strat_assumed_funding', 'VALE3 CSP Funding Assumido', 'VENDA_PUT', 'VALE3', 'REMUNERATED_100_CDI', 100.0, NULL, 'OPEN', '2026-08-20');
  `).run();
  sqlite.prepare(`
    INSERT INTO option_strategy_legs (id, strategy_id, position_id, allocated_quantity, economic_role)
    VALUES ('leg_assumed', 'strat_assumed_funding', 'pos_assumed_csp', 100, 'INCOME');
  `).run();

  assert(true, 'Banco legado preparado com posições e estratégias abertas e fechadas');

  console.log('\n--- ETAPA 2: Executando Migração Fase 4.1.1 ---');
  applyMigrations(sqlite);
  assert(true, 'applyMigrations executada com sucesso');

  console.log('\n--- ETAPA 3: Verificando Posições e Reconciliação de Baseline ---');

  // Posição Golden ITUB Put (OPEN): open_quantity = 400, closed_quantity = 0, legacy_closed_quantity = 0
  const posItubPut: any = sqlite.prepare('SELECT * FROM option_positions WHERE id = ?').get('pos_itub_put');
  assert(posItubPut.open_quantity === 400, 'Posição OPEN possui open_quantity = 400');
  assert(posItubPut.closed_quantity === 0, 'Posição OPEN possui closed_quantity = 0');
  assert(posItubPut.legacy_closed_quantity === 0, 'Posição OPEN possui legacy_closed_quantity = 0');
  assert(posItubPut.realized_pnl_reais === 0, 'Posição OPEN possui realized_pnl_reais = 0');

  // Posição 3 (CLOSED Completa): open = 0, closed = 200, legacy_closed = 0, execution gerada
  const posComplete: any = sqlite.prepare('SELECT * FROM option_positions WHERE id = ?').get('pos_closed_complete');
  assert(posComplete.open_quantity === 0, 'Posição CLOSED completa possui open_quantity = 0');
  assert(posComplete.closed_quantity === 200, 'Posição CLOSED completa possui closed_quantity = 200');
  assert(posComplete.legacy_closed_quantity === 0, 'Posição CLOSED completa possui legacy_closed_quantity = 0');
  const expectedPnlComplete = (0.80 - 0.20) * 200; // Venda recompra mais barata: +R$ 120.00
  assert(Math.abs(posComplete.realized_pnl_reais - expectedPnlComplete) < 0.001, `P&L Realizado apurado no servidor com precisão (+R$ ${expectedPnlComplete.toFixed(2)})`);

  const execComplete: any = sqlite.prepare('SELECT * FROM option_position_executions WHERE position_id = ?').get('pos_closed_complete');
  assert(execComplete !== undefined, 'Execution gerada para posição fechada completa');
  assert(execComplete.source === 'LEGACY_MIGRATION', 'Execution marcada como LEGACY_MIGRATION');
  assert(execComplete.quantity === 200, 'Execution quantidade = 200');
  assert(execComplete.price === 0.20, 'Execution preço = 0.20');
  assert(execComplete.execution_date === '2026-09-02', 'Execution data real = 2026-09-02');
  assert(execComplete.strategy_id === 'strat_closed_A', 'Execution atribuída à estratégia pai');
  assert(execComplete.strategy_leg_id === 'leg_closed_A', 'Execution atribuída à strategy leg (Caso A inequívoco)');

  // Reconciliação da Posição Completa: closedQuantity === legacy_closed_quantity + SUM(executions.quantity)
  const sumExecComplete: any = sqlite.prepare('SELECT COALESCE(SUM(quantity), 0) AS total FROM option_position_executions WHERE position_id = ?').get('pos_closed_complete');
  assert(posComplete.closed_quantity === posComplete.legacy_closed_quantity + sumExecComplete.total, 'Reconciliação Canônica Posição Completa: closed_quantity === legacy_closed + sum(executions)');

  // Posição 4 (CLOSED Incompleta): open = 0, closed = 300, legacy_closed = 300, SEM execution gerada
  const posIncomplete: any = sqlite.prepare('SELECT * FROM option_positions WHERE id = ?').get('pos_closed_incomplete');
  assert(posIncomplete.open_quantity === 0, 'Posição CLOSED incompleta possui open_quantity = 0');
  assert(posIncomplete.closed_quantity === 300, 'Posição CLOSED incompleta possui closed_quantity = 300');
  assert(posIncomplete.legacy_closed_quantity === 300, 'Posição CLOSED incompleta possui legacy_closed_quantity = 300 (baseline)');
  assert(posIncomplete.legacy_quality === 'LEGACY_INCOMPLETE', 'Posição marcada com legacy_quality = LEGACY_INCOMPLETE');

  const execIncompleteCount: any = sqlite.prepare('SELECT COUNT(*) AS c FROM option_position_executions WHERE position_id = ?').get('pos_closed_incomplete');
  assert(execIncompleteCount.c === 0, 'NÃO fabricar execution fictícia para posição legacy incompleta sem data/preço');
  assert(posIncomplete.closed_quantity === posIncomplete.legacy_closed_quantity + execIncompleteCount.c, 'Reconciliação Canônica Posição Incompleta: 300 === 300 + 0 (Matematicamente Perfeita)');

  console.log('\n--- ETAPA 4: Verificando Strategy Legs e Anti-Double-Counting ---');

  // Leg A (Terminal, Caso A: execution migrada atribuída)
  const legA: any = sqlite.prepare('SELECT * FROM option_strategy_legs WHERE id = ?').get('leg_closed_A');
  assert(legA.open_allocated_quantity === 0, 'Leg A possui open_allocated_quantity = 0');
  assert(legA.closed_allocated_quantity === 200, 'Leg A possui closed_allocated_quantity = 200');
  assert(legA.legacy_closed_allocated_quantity === 0, 'Leg A possui legacy_closed_allocated_quantity = 0 (fechamento veio da execution)');

  const sumExecLegA: any = sqlite.prepare('SELECT COALESCE(SUM(quantity), 0) AS total FROM option_position_executions WHERE strategy_leg_id = ?').get('leg_closed_A');
  assert(legA.closed_allocated_quantity === legA.legacy_closed_allocated_quantity + sumExecLegA.total, 'Reconciliação Leg A: closed_allocated === legacy_closed + executions (200 === 0 + 200)');
  assert(legA.closed_allocated_quantity <= legA.allocated_quantity, 'Invariante: closed_allocated_quantity <= allocated_quantity');

  // Leg B (Terminal, Caso B: baseline legacy sem execution atribuída)
  const legB: any = sqlite.prepare('SELECT * FROM option_strategy_legs WHERE id = ?').get('leg_closed_B');
  assert(legB.open_allocated_quantity === 0, 'Leg B possui open_allocated_quantity = 0');
  assert(legB.closed_allocated_quantity === 300, 'Leg B possui closed_allocated_quantity = 300');
  assert(legB.legacy_closed_allocated_quantity === 300, 'Leg B possui legacy_closed_allocated_quantity = 300 (baseline)');

  const sumExecLegB: any = sqlite.prepare('SELECT COALESCE(SUM(quantity), 0) AS total FROM option_position_executions WHERE strategy_leg_id = ?').get('leg_closed_B');
  assert(sumExecLegB.total === 0, 'Leg B tem 0 executions associadas');
  assert(legB.closed_allocated_quantity === legB.legacy_closed_allocated_quantity + sumExecLegB.total, 'Reconciliação Leg B: closed_allocated === legacy_closed + executions (300 === 300 + 0)');
  assert(legB.closed_allocated_quantity <= legB.allocated_quantity, 'Invariante: closed_allocated_quantity <= allocated_quantity (Zero Double Counting!)');

  console.log('\n--- ETAPA 5: Verificando Strategy Funding Timeline Bootstrap (Golden Case ITUB & Assumed Funding) ---');

  const segments: any[] = sqlite.prepare('SELECT * FROM strategy_funding_segments ORDER BY strategy_id').all();
  assert(segments.length === 4, 'Todas as 4 estratégias possuem segmento inicial criado');

  // P0.1 & P1.8: Golden Case ITUB4 — Validação Estrita do Benchmark Capital Canônico (R$ 15.476,00)
  const segItub: any = sqlite.prepare('SELECT * FROM strategy_funding_segments WHERE strategy_id = ?').get('strat_golden_itub');
  assert(segItub.source_type === 'CREATION', 'Segmento Golden ITUB possui source_type = CREATION');
  assert(segItub.maneuver_event_id === null, 'Segmento CREATION possui maneuver_event_id = NULL');
  assert(segItub.funding_event_id === null, 'Segmento CREATION possui funding_event_id = NULL');
  assert(segItub.quality === 'FULL', 'Segmento Golden ITUB com capital preenchido possui quality = FULL');
  assert(segItub.end_date === null, 'Segmento Golden ITUB aberto possui end_date = null');
  assert(
    Math.abs(segItub.benchmark_capital_reais - 15476.0) < 0.001,
    `P0.1 Aprovado: Benchmark Capital da ITUB 2:1 calculado rigorosamente em R$ 15.476,00 (obtido R$ ${segItub.benchmark_capital_reais.toFixed(2)}, NÃO 15.712)`
  );
  assert(
    Math.abs(segItub.capital_remunerated_reais - 15476.0) < 0.001,
    `Capital remunerado preservado em R$ 15.476,00 (obtido R$ ${segItub.capital_remunerated_reais.toFixed(2)})`
  );
  assert(segItub.capital_remunerated_reais <= segItub.benchmark_capital_reais, 'Capital remunerado <= benchmark capital');

  // P1.6: Funding Presumido não pode virar FULL (deve ser rebaixado para PARTIAL)
  const segAssumed: any = sqlite.prepare('SELECT * FROM strategy_funding_segments WHERE strategy_id = ?').get('strat_assumed_funding');
  assert(
    Math.abs(segAssumed.benchmark_capital_reais - 6000.0) < 0.001,
    `Benchmark da VALE3 CSP calculado em R$ 6.000,00 (obtido R$ ${segAssumed.benchmark_capital_reais.toFixed(2)})`
  );
  assert(
    Math.abs(segAssumed.capital_remunerated_reais - 6000.0) < 0.001,
    `Capital remunerado presumido em 100% (R$ ${segAssumed.capital_remunerated_reais.toFixed(2)})`
  );
  assert(
    segAssumed.quality === 'PARTIAL',
    'P1.6 Aprovado: Funding legacy presumido sem capital preenchido classificado estritamente como PARTIAL (NÃO promovido para FULL)'
  );

  console.log('\n--- ETAPA 6: Validando Constraints Físicas, Source Coherence e Partial Unique Index ---');

  // 1. Partial Unique Index: Tentar inserir um SEGUNDO segmento aberto para strat_golden_itub deve FALHAR
  let threwPartialUnique = false;
  try {
    sqlite.prepare(`
      INSERT INTO strategy_funding_segments (id, strategy_id, start_date, end_date, benchmark_capital_reais, capital_remunerated_reais, collateral_mode, source_type, created_at)
      VALUES ('seg_duplicate_open', 'strat_golden_itub', '2026-09-02', NULL, 7738.0, 7738.0, 'REMUNERATED_100_CDI', 'CREATION', datetime('now'));
    `).run();
  } catch (err: any) {
    threwPartialUnique = true;
    assert(err.message.includes('UNIQUE constraint failed'), 'Partial Unique Index barrou segundo segmento aberto para a mesma estratégia');
  }
  assert(threwPartialUnique, 'Partial Unique Index one_open_funding_segment_per_strategy validado com sucesso');

  // Inserir segmento FECHADO (end_date preenchido) para a mesma estratégia deve ter SUCESSO
  sqlite.prepare(`
    INSERT INTO strategy_funding_segments (id, strategy_id, start_date, end_date, benchmark_capital_reais, capital_remunerated_reais, collateral_mode, source_type, created_at)
    VALUES ('seg_historical_closed', 'strat_golden_itub', '2026-08-24', '2026-09-02', 15476.0, 15476.0, 'REMUNERATED_100_CDI', 'CREATION', datetime('now'));
  `).run();
  assert(true, 'Inserção de segmento histórico fechado para a mesma estratégia permitida sem violação');

  // 2. P1.7: Physical CHECK Constraint para Coerência de sourceType
  // 2a. source_type = MANEUVER com maneuver_event_id NULL deve FALHAR pelo CHECK
  let threwManeuverCheck = false;
  try {
    sqlite.prepare(`
      INSERT INTO strategy_funding_segments (id, strategy_id, start_date, end_date, benchmark_capital_reais, capital_remunerated_reais, collateral_mode, source_type, maneuver_event_id, created_at)
      VALUES ('seg_incoherent_maneuver', 'strat_closed_A', '2026-08-24', '2026-09-02', 6000.0, 0, 'IDLE_CASH', 'MANEUVER', NULL, datetime('now'));
    `).run();
  } catch (err: any) {
    threwManeuverCheck = true;
    assert(err.message.includes('CHECK constraint failed'), 'P1.7: CHECK físico barrou source_type = MANEUVER com maneuver_event_id NULL');
  }
  assert(threwManeuverCheck, 'Constraint física de coerência de MANEUVER validada');

  // 2b. source_type = FUNDING_CHANGE com funding_event_id NULL deve FALHAR pelo CHECK
  let threwFundingCheck = false;
  try {
    sqlite.prepare(`
      INSERT INTO strategy_funding_segments (id, strategy_id, start_date, end_date, benchmark_capital_reais, capital_remunerated_reais, collateral_mode, source_type, funding_event_id, created_at)
      VALUES ('seg_incoherent_funding', 'strat_closed_A', '2026-08-24', '2026-09-02', 6000.0, 0, 'IDLE_CASH', 'FUNDING_CHANGE', NULL, datetime('now'));
    `).run();
  } catch (err: any) {
    threwFundingCheck = true;
    assert(err.message.includes('CHECK constraint failed'), 'P1.7: CHECK físico barrou source_type = FUNDING_CHANGE com funding_event_id NULL');
  }
  assert(threwFundingCheck, 'Constraint física de coerência de FUNDING_CHANGE validada');

  // 2c. source_type = CREATION com maneuver_event_id preenchido deve FALHAR pelo CHECK
  let threwCreationCheck = false;
  try {
    sqlite.prepare(`
      INSERT INTO strategy_funding_segments (id, strategy_id, start_date, end_date, benchmark_capital_reais, capital_remunerated_reais, collateral_mode, source_type, maneuver_event_id, created_at)
      VALUES ('seg_incoherent_creation', 'strat_closed_A', '2026-08-24', '2026-09-02', 6000.0, 0, 'IDLE_CASH', 'CREATION', 'some_maneuver_id', datetime('now'));
    `).run();
  } catch (err: any) {
    threwCreationCheck = true;
    assert(err.message.includes('CHECK constraint failed'), 'P1.7: CHECK físico barrou source_type = CREATION com maneuver_event_id != NULL');
  }
  assert(threwCreationCheck, 'Constraint física de coerência de CREATION validada');

  // 3. Check Constraint: capital remunerado > benchmark capital deve FALHAR
  let threwExcessRemunerated = false;
  try {
    sqlite.prepare(`
      INSERT INTO strategy_funding_segments (id, strategy_id, start_date, end_date, benchmark_capital_reais, capital_remunerated_reais, collateral_mode, source_type, created_at)
      VALUES ('seg_invalid_cap', 'strat_closed_A', '2026-08-24', '2026-09-02', 1000.0, 2000.0, 'REMUNERATED_100_CDI', 'CREATION', datetime('now'));
    `).run();
  } catch (err: any) {
    threwExcessRemunerated = true;
    assert(err.message.includes('CHECK constraint failed'), 'Check constraint barrou capital_remunerated_reais > benchmark_capital_reais');
  }
  assert(threwExcessRemunerated, 'Check constraint de capital remunerado validada com sucesso');

  // 4. Check Constraint: end_date < start_date deve FALHAR
  let threwInvertedDates = false;
  try {
    sqlite.prepare(`
      INSERT INTO strategy_funding_segments (id, strategy_id, start_date, end_date, benchmark_capital_reais, capital_remunerated_reais, collateral_mode, source_type, created_at)
      VALUES ('seg_invalid_dates', 'strat_closed_A', '2026-09-02', '2026-08-24', 1000.0, 1000.0, 'REMUNERATED_100_CDI', 'CREATION', datetime('now'));
    `).run();
  } catch (err: any) {
    threwInvertedDates = true;
    assert(err.message.includes('CHECK constraint failed'), 'Check constraint barrou end_date < start_date');
  }
  assert(threwInvertedDates, 'Check constraint de datas invertidas validada com sucesso');

  // 5. Check Constraint: execution quantity <= 0 deve FALHAR
  let threwZeroQuantity = false;
  try {
    sqlite.prepare(`
      INSERT INTO option_position_executions (id, position_id, execution_type, quantity, price, execution_date, entry_price_basis_reais, gross_realized_pnl_reais, net_realized_pnl_reais, created_at)
      VALUES ('exec_invalid_qty', 'pos_itub_put', 'BUY_TO_CLOSE', 0, 1.0, '2026-09-02', 1.04, 0, 0, datetime('now'));
    `).run();
  } catch (err: any) {
    threwZeroQuantity = true;
    assert(err.message.includes('CHECK constraint failed'), 'Check constraint barrou execution com quantity <= 0');
  }
  assert(threwZeroQuantity, 'Check constraint de quantidade de execução validada com sucesso');

  console.log('\n--- ETAPA 7: Validando Restrição de Hard-Delete em Registros Auditáveis ---');

  // Tentativa de fazer DELETE em option_strategies quando há execution associada deve FALHAR por ON DELETE RESTRICT
  let threwDeleteStrategy = false;
  try {
    sqlite.prepare('DELETE FROM option_strategies WHERE id = ?').run('strat_closed_A');
  } catch (err: any) {
    threwDeleteStrategy = true;
    assert(err.message.includes('FOREIGN KEY constraint failed'), 'ON DELETE RESTRICT impediu hard-delete de estratégia com histórico financeiro/execuções');
  }
  assert(threwDeleteStrategy, 'Proteção física de hard-delete validada com sucesso');

  // Tentativa de fazer DELETE em option_positions quando há execution associada deve FALHAR
  let threwDeletePosition = false;
  try {
    sqlite.prepare('DELETE FROM option_positions WHERE id = ?').run('pos_closed_complete');
  } catch (err: any) {
    threwDeletePosition = true;
    assert(err.message.includes('FOREIGN KEY constraint failed'), 'ON DELETE RESTRICT impediu hard-delete de posição com execution associada');
  }
  assert(threwDeletePosition, 'Proteção física de posição auditável validada com sucesso');

  console.log('\n--- ETAPA 8: Idempotência de Migração ---');

  // Executar applyMigrations novamente no banco já migrado
  applyMigrations(sqlite);

  // Verificar se contagens e dados permanecem rigorosamente idênticos
  const posCountAfter = sqlite.prepare('SELECT COUNT(*) AS c FROM option_positions').get() as any;
  const execCountAfter = sqlite.prepare('SELECT COUNT(*) AS c FROM option_position_executions').get() as any;
  const segCountAfter = sqlite.prepare('SELECT COUNT(*) AS c FROM strategy_funding_segments').get() as any;

  assert(posCountAfter.c === 5, 'Idempotência: contagem de posições inalterada (5)');
  assert(execCountAfter.c === 1, 'Idempotência: nenhuma execution duplicada gerada na segunda execução');
  assert(segCountAfter.c === 5, 'Idempotência: nenhum segmento duplicado gerado na segunda execução (4 iniciais + 1 histórico fechado)');

  sqlite.close();

  console.log('\n--- ETAPA 9: Two-Hop Migration Test (4.1 -> 4.1.2 Reconstrução Não-Destrutiva) ---');

  const sqliteTwoHop = new Database(':memory:');
  sqliteTwoHop.pragma('foreign_keys = ON');

  // 1. Criar banco exatamente no estado de 037ac1e (schema 4.1 anterior sem o novo CHECK)
  sqliteTwoHop.exec(`
    CREATE TABLE option_positions (
      id TEXT PRIMARY KEY,
      portfolio TEXT DEFAULT 'Principal',
      ticker_underlying TEXT NOT NULL,
      ticker_option TEXT NOT NULL,
      option_type TEXT NOT NULL,
      side TEXT NOT NULL,
      strategy_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      strike REAL NOT NULL,
      entry_price REAL NOT NULL,
      current_price REAL NOT NULL,
      exit_price REAL,
      underlying_entry_spot REAL,
      underlying_current_spot REAL,
      entry_date TEXT NOT NULL,
      expiration_date TEXT NOT NULL,
      exit_date TEXT,
      allocated_capital REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      delta REAL,
      gamma REAL,
      theta REAL,
      vega REAL,
      iv REAL,
      pop REAL,
      break_even REAL,
      cdi_rate_annual REAL DEFAULT 0.14,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT,
      legacy_closed_quantity INTEGER NOT NULL DEFAULT 0,
      legacy_quality TEXT,
      closed_quantity INTEGER NOT NULL DEFAULT 0,
      open_quantity INTEGER,
      realized_pnl_reais REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE option_strategies (
      id TEXT PRIMARY KEY,
      portfolio TEXT DEFAULT 'Principal',
      name TEXT NOT NULL,
      strategy_type TEXT NOT NULL,
      book TEXT NOT NULL DEFAULT 'HYBRID',
      underlying_ticker TEXT NOT NULL,
      collateral_mode TEXT DEFAULT 'IDLE_CASH',
      collateral_yield_pct_cdi REAL,
      capital_remunerated_reais REAL,
      collateral_coverage_pct REAL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE strategy_maneuver_events (
      id TEXT PRIMARY KEY,
      strategy_id TEXT NOT NULL REFERENCES option_strategies(id) ON DELETE RESTRICT,
      maneuver_type TEXT NOT NULL,
      maneuver_date TEXT NOT NULL,
      ratio_preserved INTEGER NOT NULL DEFAULT 1,
      audit_units_before INTEGER,
      audit_units_after INTEGER,
      audit_ratio_before TEXT,
      audit_ratio_after TEXT,
      preserves_original_ratio INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE strategy_funding_events (
      id TEXT PRIMARY KEY,
      strategy_id TEXT NOT NULL REFERENCES option_strategies(id) ON DELETE RESTRICT,
      event_type TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      previous_collateral_mode TEXT NOT NULL,
      new_collateral_mode TEXT NOT NULL,
      previous_coverage_pct REAL,
      new_coverage_pct REAL,
      previous_capital_remunerated REAL,
      new_capital_remunerated REAL,
      previous_pct_cdi REAL,
      new_pct_cdi REAL,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    -- Tabela de 037ac1e: SEM a constraint funding_seg_source_coherence_check
    CREATE TABLE strategy_funding_segments (
      id TEXT PRIMARY KEY,
      strategy_id TEXT NOT NULL REFERENCES option_strategies(id) ON DELETE RESTRICT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      benchmark_capital_reais REAL NOT NULL CHECK(benchmark_capital_reais >= 0),
      capital_remunerated_reais REAL NOT NULL CHECK(capital_remunerated_reais >= 0 AND capital_remunerated_reais <= benchmark_capital_reais),
      collateral_mode TEXT NOT NULL,
      collateral_pct_cdi REAL CHECK(collateral_pct_cdi IS NULL OR collateral_pct_cdi >= 0),
      source_type TEXT NOT NULL,
      maneuver_event_id TEXT REFERENCES strategy_maneuver_events(id) ON DELETE RESTRICT,
      funding_event_id TEXT REFERENCES strategy_funding_events(id) ON DELETE RESTRICT,
      quality TEXT NOT NULL DEFAULT 'FULL',
      created_at TEXT NOT NULL,
      CHECK(end_date IS NULL OR end_date >= start_date)
    );

    CREATE UNIQUE INDEX one_open_funding_segment_per_strategy
    ON strategy_funding_segments(strategy_id)
    WHERE end_date IS NULL;
  `);

  // Inserir strategy e segmento inicial na tabela de 037ac1e
  sqliteTwoHop.prepare(`
    INSERT INTO option_strategies (id, name, strategy_type, book, underlying_ticker, collateral_mode, status, opened_at, created_at)
    VALUES ('strat_twohop', 'Trava TwoHop', 'CUSTOM', 'HYBRID', 'VALE3', 'REMUNERATED_100_CDI', 'OPEN', '2026-08-01', '2026-08-01');
  `).run();

  sqliteTwoHop.prepare(`
    INSERT INTO strategy_funding_segments (id, strategy_id, start_date, end_date, benchmark_capital_reais, capital_remunerated_reais, collateral_mode, source_type, quality, created_at)
    VALUES ('seg_twohop_initial', 'strat_twohop', '2026-08-01', NULL, 5000.0, 5000.0, 'REMUNERATED_100_CDI', 'CREATION', 'FULL', '2026-08-01');
  `).run();

  // Provar que ANTES do upgrade, a constraint de coerência estava ausente
  const preCheckSql = sqliteTwoHop.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'strategy_funding_segments'").get() as { sql: string };
  assert(!preCheckSql.sql.includes('source_type = \'CREATION\' AND maneuver_event_id IS NULL'), 'Pré-migração: banco está no estado de 037ac1e sem o novo CHECK');

  // 3. Executar applyMigrations atual (executa upgradeStrategyFundingSegmentsCoherenceCheck)
  applyMigrations(sqliteTwoHop);

  // 4. Provar que dados permaneceram intactos
  const segAfterUpgrade = sqliteTwoHop.prepare("SELECT * FROM strategy_funding_segments WHERE id = 'seg_twohop_initial'").get() as any;
  assert(Boolean(segAfterUpgrade), 'P0.1: Dados do segmento existente permaneceram intactos após upgrade');
  assert(segAfterUpgrade.benchmark_capital_reais === 5000.0, 'P0.1: benchmark_capital_reais preservado (5000.0)');
  assert(segAfterUpgrade.capital_remunerated_reais === 5000.0, 'P0.1: capital_remunerated_reais preservado (5000.0)');
  assert(segAfterUpgrade.source_type === 'CREATION', 'P0.1: source_type preservado (CREATION)');

  // 5. Consultar sqlite_master e verificar que a constraint nova está fisicamente presente
  const postCheckSql = sqliteTwoHop.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'strategy_funding_segments'").get() as { sql: string };
  assert(postCheckSql.sql.includes('source_type = \'CREATION\' AND maneuver_event_id IS NULL'), 'P0.1: Novo CHECK de coerência fisicamente instalado após rebuild');

  // 6. Tentar inserir MANEUVER sem maneuver_event_id -> deve ser barrado pelo novo CHECK
  let threwCoherenceViolation = false;
  try {
    sqliteTwoHop.prepare(`
      INSERT INTO strategy_funding_segments (id, strategy_id, start_date, end_date, benchmark_capital_reais, capital_remunerated_reais, collateral_mode, source_type, maneuver_event_id, created_at)
      VALUES ('seg_incoherent', 'strat_twohop', '2026-08-15', '2026-08-20', 5000.0, 5000.0, 'REMUNERATED_100_CDI', 'MANEUVER', NULL, datetime('now'));
    `).run();
  } catch (err: any) {
    threwCoherenceViolation = true;
    assert(err.message.includes('CHECK constraint failed'), 'P0.1: Banco reconstruído barrou fisicamente MANEUVER sem maneuver_event_id por CHECK constraint');
  }
  assert(threwCoherenceViolation, 'P0.1: Violação de coerência rejeitada fisicamente no banco atualizado');

  // 7. Testar idempotência executando applyMigrations novamente
  applyMigrations(sqliteTwoHop);
  const segCountTwoHop = sqliteTwoHop.prepare('SELECT COUNT(*) AS c FROM strategy_funding_segments').get() as any;
  assert(segCountTwoHop.c === 1, 'P0.1: Idempotência do upgrade confirmada (1 segmento)');

  sqliteTwoHop.close();

  // 8. Teste de Failure Injection: Prova que falha no meio da reconstrução faz rollback e preserva o banco
  console.log('\n  -> Testando Atomicidade e Failure Injection na Reconstrução...');
  const sqliteFailDb = new Database(':memory:');
  sqliteFailDb.pragma('foreign_keys = ON');

  sqliteFailDb.exec(`
    CREATE TABLE option_strategies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      strategy_type TEXT NOT NULL,
      book TEXT NOT NULL,
      underlying_ticker TEXT NOT NULL,
      collateral_mode TEXT NOT NULL,
      status TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE strategy_funding_segments (
      id TEXT PRIMARY KEY,
      strategy_id TEXT NOT NULL REFERENCES option_strategies(id) ON DELETE RESTRICT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      benchmark_capital_reais REAL NOT NULL CHECK(benchmark_capital_reais >= 0),
      capital_remunerated_reais REAL NOT NULL CHECK(capital_remunerated_reais >= 0 AND capital_remunerated_reais <= benchmark_capital_reais),
      collateral_mode TEXT NOT NULL,
      collateral_pct_cdi REAL CHECK(collateral_pct_cdi IS NULL OR collateral_pct_cdi >= 0),
      source_type TEXT NOT NULL,
      maneuver_event_id TEXT,
      funding_event_id TEXT,
      quality TEXT NOT NULL DEFAULT 'FULL',
      created_at TEXT NOT NULL
    );
  `);

  sqliteFailDb.prepare(`
    INSERT INTO option_strategies (id, name, strategy_type, book, underlying_ticker, collateral_mode, status, opened_at, created_at)
    VALUES ('strat_fail_test', 'Estratégia Failure Injection', 'CUSTOM', 'HYBRID', 'PETR4', 'IDLE_CASH', 'OPEN', '2026-08-01', '2026-08-01');
  `).run();

  sqliteFailDb.prepare(`
    INSERT INTO strategy_funding_segments (id, strategy_id, start_date, end_date, benchmark_capital_reais, capital_remunerated_reais, collateral_mode, source_type, quality, created_at)
    VALUES ('seg_fail_before', 'strat_fail_test', '2026-08-01', NULL, 10000.0, 0, 'IDLE_CASH', 'CREATION', 'FULL', '2026-08-01');
  `).run();

  let failureInjected = false;
  try {
    upgradeStrategyFundingSegmentsCoherenceCheck(sqliteFailDb, () => {
      throw new Error('SIMULATED_FAILURE_MID_REBUILD');
    });
  } catch (err: any) {
    failureInjected = err.message === 'SIMULATED_FAILURE_MID_REBUILD';
  }
  assert(failureInjected, 'Failure Injection: Exceção simulada interceptada durante reconstrução');

  // Verificar que o rollback preservou a tabela original intacta
  const originalSeg = sqliteFailDb.prepare("SELECT * FROM strategy_funding_segments WHERE id = 'seg_fail_before'").get() as any;
  assert(Boolean(originalSeg), 'Failure Injection: Tabela original preservada intacta após rollback');
  assert(originalSeg.benchmark_capital_reais === 10000.0, 'Failure Injection: Dados originais preservados (R$ 10.000,00)');

  // Verificar que a tabela temporária de upgrade foi descartada pelo rollback
  const tempTableExists = sqliteFailDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'strategy_funding_segments_upgrade'").get();
  assert(!tempTableExists, 'Failure Injection: Tabela temporária _upgrade não existe após rollback');

  // Verificar que foreign_keys foi religado pelo bloco finally
  const fkStatus = sqliteFailDb.pragma('foreign_keys', { simple: true });
  assert(fkStatus === 1, 'Failure Injection: foreign_keys religado com sucesso pelo bloco finally (1 = ON)');

  sqliteFailDb.close();

  console.log('\n========================================');
  console.log('✅ ALL SQLITE MIGRATION SMOKE TESTS PASSED SUCCESSFULLY!');
  console.log('========================================\n');
}

if (require.main === module || typeof process !== 'undefined') {
  runMigrationSmokeTest();
}
