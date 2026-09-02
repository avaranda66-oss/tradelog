/**
 * SQLite Migration Smoke Test (Fase 4.1)
 * Testa a evolução não-destrutiva do schema, idempotência de migrações,
 * reconciliação canônica de baseline de legados (completos vs incompletos),
 * partial unique indexes, check constraints físicas e integridade relacional.
 */

import Database from 'better-sqlite3';
import { ensureColumn, ensureTable, ensureIndex, applyMigrations } from '../../lib/db/migrations';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[MIGRATION TEST FAILED] ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

export function runMigrationSmokeTest() {
  console.log('\n========================================');
  console.log('🧪 RUNNING SQLITE MIGRATION SMOKE TEST (FASE 4.1)');
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

  // Posição 1: OPEN normal (400 unidades)
  sqlite.prepare(`
    INSERT INTO option_positions (id, ticker_underlying, ticker_option, option_type, side, strategy_type, quantity, strike, entry_price, current_price, entry_date, expiration_date, allocated_capital, status)
    VALUES ('pos_open_1', 'ITUB4', 'ITUBU393', 'PUT', 'SELL', 'VENDA_PUT', 400, 38.69, 1.04, 0.29, '2026-08-24', '2026-09-18', 15476.0, 'OPEN');
  `).run();

  // Posição 2: CLOSED completo com exitPrice e exitDate (200 unidades, compra de Call a 1.18 saída a 2.07)
  sqlite.prepare(`
    INSERT INTO option_positions (id, ticker_underlying, ticker_option, option_type, side, strategy_type, quantity, strike, entry_price, current_price, exit_price, exit_date, entry_date, expiration_date, allocated_capital, status)
    VALUES ('pos_closed_complete', 'ITUB4', 'ITUBI393', 'CALL', 'BUY', 'COMPRA_CALL', 200, 38.69, 1.18, 2.07, 2.07, '2026-09-02', '2026-08-24', '2026-09-18', 236.0, 'CLOSED');
  `).run();

  // Posição 3: CLOSED incompleto SEM exitPrice e SEM exitDate (300 unidades)
  sqlite.prepare(`
    INSERT INTO option_positions (id, ticker_underlying, ticker_option, option_type, side, strategy_type, quantity, strike, entry_price, current_price, exit_price, exit_date, entry_date, expiration_date, allocated_capital, status)
    VALUES ('pos_closed_incomplete', 'LREN3', 'LRENV104', 'PUT', 'SELL', 'VENDA_PUT', 300, 10.42, 0.50, 0.37, NULL, NULL, '2026-08-27', '2026-10-16', 3126.0, 'CLOSED');
  `).run();

  // Posição 4: OPEN com alocação parcial (400 unidades no total, 100 alocadas em strategy e 300 livres)
  sqlite.prepare(`
    INSERT INTO option_positions (id, ticker_underlying, ticker_option, option_type, side, strategy_type, quantity, strike, entry_price, current_price, entry_date, expiration_date, allocated_capital, status)
    VALUES ('pos_partial_alloc', 'PETR4', 'PETRU300', 'PUT', 'SELL', 'VENDA_PUT', 400, 30.0, 0.80, 0.40, '2026-08-20', '2026-09-18', 12000.0, 'OPEN');
  `).run();

  // Estratégia 1: CLOSED terminal associada à pos_closed_complete (Caso A: 100% inequívoca)
  sqlite.prepare(`
    INSERT INTO option_strategies (id, name, strategy_type, underlying_ticker, collateral_mode, status, opened_at, closed_at)
    VALUES ('strat_closed_A', 'Trava Call ITUB Encerrada', 'BULL_CALL_SPREAD', 'ITUB4', 'IDLE_CASH', 'CLOSED', '2026-08-24', '2026-09-02');
  `).run();
  sqlite.prepare(`
    INSERT INTO option_strategy_legs (id, strategy_id, position_id, allocated_quantity)
    VALUES ('leg_closed_A', 'strat_closed_A', 'pos_closed_complete', 200);
  `).run();

  // Estratégia 2: CLOSED terminal associada à pos_closed_incomplete (Caso B: dados incompletos)
  sqlite.prepare(`
    INSERT INTO option_strategies (id, name, strategy_type, underlying_ticker, collateral_mode, status, opened_at, closed_at)
    VALUES ('strat_closed_B', 'LREN3 Encerrada Incompleta', 'CUSTOM_MULTI_LEG', 'LREN3', 'IDLE_CASH', 'CLOSED', '2026-08-27', '2026-10-16');
  `).run();
  sqlite.prepare(`
    INSERT INTO option_strategy_legs (id, strategy_id, position_id, allocated_quantity)
    VALUES ('leg_closed_B', 'strat_closed_B', 'pos_closed_incomplete', 300);
  `).run();

  // Estratégia 3: OPEN ativa associada à pos_open_1 (400 unidades) e pos_partial_alloc (100 unidades)
  sqlite.prepare(`
    INSERT INTO option_strategies (id, name, strategy_type, underlying_ticker, collateral_mode, collateral_yield_pct_cdi, status, opened_at)
    VALUES ('strat_active_open', 'Estrutura Ativa Aberta', 'CUSTOM_MULTI_LEG', 'ITUB4', 'REMUNERATED_100_CDI', 100.0, 'OPEN', '2026-08-24');
  `).run();
  sqlite.prepare(`
    INSERT INTO option_strategy_legs (id, strategy_id, position_id, allocated_quantity)
    VALUES ('leg_active_1', 'strat_active_open', 'pos_open_1', 400);
  `).run();
  sqlite.prepare(`
    INSERT INTO option_strategy_legs (id, strategy_id, position_id, allocated_quantity)
    VALUES ('leg_active_2', 'strat_active_open', 'pos_partial_alloc', 100);
  `).run();

  assert(true, 'Banco legado preparado com posições e estratégias abertas e fechadas');

  console.log('\n--- ETAPA 2: Executando Migração Fase 4.1 ---');
  applyMigrations(sqlite);
  assert(true, 'applyMigrations executada com sucesso');

  console.log('\n--- ETAPA 3: Verificando Posições e Reconciliação de Baseline ---');

  // Posição 1 (OPEN): open_quantity = 400, closed_quantity = 0, legacy_closed_quantity = 0
  const pos1: any = sqlite.prepare('SELECT * FROM option_positions WHERE id = ?').get('pos_open_1');
  assert(pos1.open_quantity === 400, 'Posição OPEN possui open_quantity = 400');
  assert(pos1.closed_quantity === 0, 'Posição OPEN possui closed_quantity = 0');
  assert(pos1.legacy_closed_quantity === 0, 'Posição OPEN possui legacy_closed_quantity = 0');
  assert(pos1.realized_pnl_reais === 0, 'Posição OPEN possui realized_pnl_reais = 0');

  // Posição 2 (CLOSED Completa): open = 0, closed = 200, legacy_closed = 0, execution gerada
  const pos2: any = sqlite.prepare('SELECT * FROM option_positions WHERE id = ?').get('pos_closed_complete');
  assert(pos2.open_quantity === 0, 'Posição CLOSED completa possui open_quantity = 0');
  assert(pos2.closed_quantity === 200, 'Posição CLOSED completa possui closed_quantity = 200');
  assert(pos2.legacy_closed_quantity === 0, 'Posição CLOSED completa possui legacy_closed_quantity = 0');
  const expectedPnl2 = (2.07 - 1.18) * 200; // +178.00
  assert(Math.abs(pos2.realized_pnl_reais - expectedPnl2) < 0.001, `P&L Realizado apurado no servidor com precisão (+R$ ${expectedPnl2.toFixed(2)})`);

  const exec2: any = sqlite.prepare('SELECT * FROM option_position_executions WHERE position_id = ?').get('pos_closed_complete');
  assert(exec2 !== undefined, 'Execution gerada para posição fechada completa');
  assert(exec2.source === 'LEGACY_MIGRATION', 'Execution marcada como LEGACY_MIGRATION');
  assert(exec2.quantity === 200, 'Execution quantidade = 200');
  assert(exec2.price === 2.07, 'Execution preço = 2.07');
  assert(exec2.execution_date === '2026-09-02', 'Execution data real = 2026-09-02');
  assert(exec2.strategy_id === 'strat_closed_A', 'Execution atribuída à estratégia pai');
  assert(exec2.strategy_leg_id === 'leg_closed_A', 'Execution atribuída à strategy leg (Caso A inequívoco)');

  // Reconciliação da Posição 2: closedQuantity === legacy_closed_quantity + SUM(executions.quantity)
  const sumExec2: any = sqlite.prepare('SELECT COALESCE(SUM(quantity), 0) AS total FROM option_position_executions WHERE position_id = ?').get('pos_closed_complete');
  assert(pos2.closed_quantity === pos2.legacy_closed_quantity + sumExec2.total, 'Reconciliação Canônica Posição 2: closed_quantity === legacy_closed + sum(executions)');

  // Posição 3 (CLOSED Incompleta): open = 0, closed = 300, legacy_closed = 300, SEM execution gerada
  const pos3: any = sqlite.prepare('SELECT * FROM option_positions WHERE id = ?').get('pos_closed_incomplete');
  assert(pos3.open_quantity === 0, 'Posição CLOSED incompleta possui open_quantity = 0');
  assert(pos3.closed_quantity === 300, 'Posição CLOSED incompleta possui closed_quantity = 300');
  assert(pos3.legacy_closed_quantity === 300, 'Posição CLOSED incompleta possui legacy_closed_quantity = 300 (baseline)');
  assert(pos3.legacy_quality === 'LEGACY_INCOMPLETE', 'Posição marcada com legacy_quality = LEGACY_INCOMPLETE');

  const exec3Count: any = sqlite.prepare('SELECT COUNT(*) AS c FROM option_position_executions WHERE position_id = ?').get('pos_closed_incomplete');
  assert(exec3Count.c === 0, 'NÃO fabricar execution fictícia para posição legacy incompleta sem data/preço');

  // Reconciliação da Posição 3: closedQuantity (300) === legacy_closed_quantity (300) + SUM(executions) (0)
  assert(pos3.closed_quantity === pos3.legacy_closed_quantity + exec3Count.c, 'Reconciliação Canônica Posição 3: 300 === 300 + 0 (Matematicamente Perfeita)');

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

  // Leg Active 1 & 2 (OPEN)
  const legAct1: any = sqlite.prepare('SELECT * FROM option_strategy_legs WHERE id = ?').get('leg_active_1');
  assert(legAct1.open_allocated_quantity === 400, 'Leg Ativa 1: open_allocated = 400');
  assert(legAct1.closed_allocated_quantity === 0, 'Leg Ativa 1: closed_allocated = 0');

  const legAct2: any = sqlite.prepare('SELECT * FROM option_strategy_legs WHERE id = ?').get('leg_active_2');
  assert(legAct2.open_allocated_quantity === 100, 'Leg Ativa 2 (Parcial): open_allocated = 100');
  assert(legAct2.closed_allocated_quantity === 0, 'Leg Ativa 2: closed_allocated = 0');

  // Posição 4 (Parcial): 400 total - 100 alocadas = 300 livres
  const pos4: any = sqlite.prepare('SELECT * FROM option_positions WHERE id = ?').get('pos_partial_alloc');
  const freeQuantityPos4 = pos4.open_quantity - legAct2.open_allocated_quantity;
  assert(freeQuantityPos4 === 300, 'Quantidade livre disponível da posição 4 calculada exatamente: 400 - 100 = 300');

  console.log('\n--- ETAPA 5: Verificando Strategy Funding Timeline Bootstrap ---');

  const segments: any[] = sqlite.prepare('SELECT * FROM strategy_funding_segments ORDER BY strategy_id').all();
  assert(segments.length === 3, 'Todas as 3 estratégias possuem segmento inicial criado');

  const segActive: any = sqlite.prepare('SELECT * FROM strategy_funding_segments WHERE strategy_id = ?').get('strat_active_open');
  assert(segActive.source_type === 'CREATION', 'Segmento ativo criado com source_type = CREATION');
  assert(segActive.quality === 'FULL', 'Segmento ativo possui quality = FULL');
  assert(segActive.end_date === null, 'Segmento de estratégia aberta possui end_date = null (vigente)');
  assert(segActive.benchmark_capital_reais > 0, `Benchmark capital calculado da estrutura ativa: R$ ${segActive.benchmark_capital_reais.toFixed(2)}`);
  assert(segActive.capital_remunerated_reais <= segActive.benchmark_capital_reais, 'Capital remunerado <= benchmark capital');

  console.log('\n--- ETAPA 6: Validando Constraints Físicas e Partial Unique Index ---');

  // 1. Partial Unique Index: Tentar inserir um SEGUNDO segmento aberto para strat_active_open deve FALHAR
  let threwPartialUnique = false;
  try {
    sqlite.prepare(`
      INSERT INTO strategy_funding_segments (id, strategy_id, start_date, end_date, benchmark_capital_reais, capital_remunerated_reais, collateral_mode, source_type, created_at)
      VALUES ('seg_duplicate_open', 'strat_active_open', '2026-09-02', NULL, 7738.0, 7738.0, 'REMUNERATED_100_CDI', 'MANEUVER', datetime('now'));
    `).run();
  } catch (err: any) {
    threwPartialUnique = true;
    assert(err.message.includes('UNIQUE constraint failed'), 'Partial Unique Index barrou segundo segmento aberto para a mesma estratégia');
  }
  assert(threwPartialUnique, 'Partial Unique Index one_open_funding_segment_per_strategy validado com sucesso');

  // Inserir segmento FECHADO (end_date preenchido) para a mesma estratégia deve ter SUCESSO
  sqlite.prepare(`
    INSERT INTO strategy_funding_segments (id, strategy_id, start_date, end_date, benchmark_capital_reais, capital_remunerated_reais, collateral_mode, source_type, created_at)
    VALUES ('seg_historical_closed', 'strat_active_open', '2026-08-24', '2026-09-02', 15476.0, 15476.0, 'REMUNERATED_100_CDI', 'CREATION', datetime('now'));
  `).run();
  assert(true, 'Inserção de segmento histórico fechado para a mesma estratégia permitida sem violação');

  // 2. Check Constraint: capital remunerado > benchmark capital deve FALHAR
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

  // 3. Check Constraint: end_date < start_date deve FALHAR
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

  // 4. Check Constraint: execution quantity <= 0 deve FALHAR
  let threwZeroQuantity = false;
  try {
    sqlite.prepare(`
      INSERT INTO option_position_executions (id, position_id, execution_type, quantity, price, execution_date, entry_price_basis_reais, gross_realized_pnl_reais, net_realized_pnl_reais, created_at)
      VALUES ('exec_invalid_qty', 'pos_open_1', 'BUY_TO_CLOSE', 0, 1.0, '2026-09-02', 1.04, 0, 0, datetime('now'));
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

  assert(posCountAfter.c === 4, 'Idempotência: contagem de posições inalterada');
  assert(execCountAfter.c === 1, 'Idempotência: nenhuma execution duplicada gerada na segunda execução');
  assert(segCountAfter.c === 4, 'Idempotência: nenhum segmento duplicado gerado na segunda execução');

  sqlite.close();

  console.log('\n========================================');
  console.log('✅ ALL SQLITE MIGRATION SMOKE TESTS PASSED SUCCESSFULLY!');
  console.log('========================================\n');
}

if (require.main === module || typeof process !== 'undefined') {
  runMigrationSmokeTest();
}
