/**
 * SQLite Migration Smoke Test
 * Tests schema evolution, idempotent ALTER TABLE migrations with ensureColumn,
 * and data preservation across legacy and current database schemas.
 */

import Database from 'better-sqlite3';
import { ensureColumn, applyMigrations } from '../../lib/db/migrations';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[MIGRATION TEST FAILED] ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

export function runMigrationSmokeTest() {
  console.log('\n========================================');
  console.log('🧪 RUNNING SQLITE MIGRATION SMOKE TEST');
  console.log('========================================\n');

  // 1. Criar banco em memória com schema LEGADO (sem as novas colunas)
  const sqlite = new Database(':memory:');
  
  sqlite.exec(`
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
  `);

  // 2. Inserir dados legados
  sqlite.prepare(`
    INSERT INTO option_strategies (id, portfolio, name, strategy_type, book, underlying_ticker, collateral_mode, status, opened_at)
    VALUES ('strat_legacy_1', 'Principal', 'ITUB4 2:1 Legado', 'CUSTOM_MULTI_LEG', 'HYBRID', 'ITUB4', 'REMUNERATED_100_CDI', 'OPEN', '2026-08-24')
  `).run();

  const initialRow: any = sqlite.prepare('SELECT * FROM option_strategies WHERE id = ?').get('strat_legacy_1');
  assert(initialRow.name === 'ITUB4 2:1 Legado', 'Linha legada inserida no schema antigo');
  assert(!('capital_remunerated_reais' in initialRow), 'Coluna capital_remunerated_reais inicialmente não existe');
  assert(!('collateral_coverage_pct' in initialRow), 'Coluna collateral_coverage_pct inicialmente não existe');

  // 3. Executar migrações com ensureColumn
  const addedCol1 = ensureColumn(sqlite, 'option_strategies', 'capital_remunerated_reais', 'REAL');
  const addedCol2 = ensureColumn(sqlite, 'option_strategies', 'collateral_coverage_pct', 'REAL');
  assert(addedCol1 === true, 'ensureColumn adiciona capital_remunerated_reais com sucesso');
  assert(addedCol2 === true, 'ensureColumn adiciona collateral_coverage_pct com sucesso');

  // 4. Validar preservação de dados e acesso às novas colunas
  const migratedRow: any = sqlite.prepare('SELECT * FROM option_strategies WHERE id = ?').get('strat_legacy_1');
  assert(migratedRow.name === 'ITUB4 2:1 Legado', 'Dados legados preservados intactos após migração');
  assert('capital_remunerated_reais' in migratedRow && migratedRow.capital_remunerated_reais === null, 'Nova coluna capital_remunerated_reais acessível com valor inicial null');
  assert('collateral_coverage_pct' in migratedRow && migratedRow.collateral_coverage_pct === null, 'Nova coluna collateral_coverage_pct acessível com valor inicial null');

  // 5. Atualizar novos campos na linha legada
  sqlite.prepare('UPDATE option_strategies SET capital_remunerated_reais = ?, collateral_coverage_pct = ? WHERE id = ?')
    .run(15476.0, 100.0, 'strat_legacy_1');
  const updatedRow: any = sqlite.prepare('SELECT * FROM option_strategies WHERE id = ?').get('strat_legacy_1');
  assert(updatedRow.capital_remunerated_reais === 15476.0, 'Atualização de capital_remunerated_reais bem-sucedida');
  assert(updatedRow.collateral_coverage_pct === 100.0, 'Atualização de collateral_coverage_pct bem-sucedida');

  // 6. Idempotência: Executar migração novamente no mesmo banco
  const secondRun1 = ensureColumn(sqlite, 'option_strategies', 'capital_remunerated_reais', 'REAL');
  const secondRun2 = ensureColumn(sqlite, 'option_strategies', 'collateral_coverage_pct', 'REAL');
  assert(secondRun1 === false, 'Idempotência: segunda execução não tenta duplicar capital_remunerated_reais (retorna false)');
  assert(secondRun2 === false, 'Idempotência: segunda execução não tenta duplicar collateral_coverage_pct (retorna false)');

  // 7. Dados continuam intactos após segunda execução
  const finalRow: any = sqlite.prepare('SELECT * FROM option_strategies WHERE id = ?').get('strat_legacy_1');
  assert(finalRow.capital_remunerated_reais === 15476.0, 'Dados permanecem 100% íntegros após migrações idempotentes');

  sqlite.close();

  console.log('\n========================================');
  console.log('✅ ALL SQLITE MIGRATION SMOKE TESTS PASSED SUCCESSFULLY!');
  console.log('========================================\n');
}

if (require.main === module || typeof process !== 'undefined') {
  runMigrationSmokeTest();
}
