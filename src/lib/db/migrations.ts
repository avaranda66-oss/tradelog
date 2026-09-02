import type Database from 'better-sqlite3';

/**
 * Verifica se uma coluna existe na tabela SQLite e a adiciona via DDL se ausente.
 * Retorna true se a coluna foi adicionada, false se já existia.
 */
export function ensureColumn(
  sqliteInstance: Database.Database,
  table: string,
  column: string,
  ddl: string
): boolean {
  try {
    const tableInfo = sqliteInstance.pragma(`table_info(${table})`) as Array<{ name: string; type: string }>;
    const exists = tableInfo.some((col) => col.name.toLowerCase() === column.toLowerCase());
    if (!exists) {
      sqliteInstance.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl};`);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[DB Migration] Falha ao verificar ou adicionar coluna ${column} na tabela ${table}:`, err);
    throw err;
  }
}

/**
 * Executa todas as migrações incrementais auditáveis no banco de dados SQLite fornecido.
 */
export function applyMigrations(sqliteInstance: Database.Database): void {
  ensureColumn(sqliteInstance, 'option_strategies', 'capital_remunerated_reais', 'REAL');
  ensureColumn(sqliteInstance, 'option_strategies', 'collateral_coverage_pct', 'REAL');
  ensureColumn(sqliteInstance, 'trading_days', 'farol_bias', 'TEXT');
  ensureColumn(sqliteInstance, 'trading_days', 'farol_key_levels', 'TEXT');
  ensureColumn(sqliteInstance, 'trading_days', 'farol_news', 'TEXT');
  ensureColumn(sqliteInstance, 'trading_days', 'farol_insights', 'TEXT');
  ensureColumn(sqliteInstance, 'trading_days', 'sleep_time', 'TEXT');
  ensureColumn(sqliteInstance, 'trading_days', 'strategy_tags', 'TEXT');
  ensureColumn(sqliteInstance, 'trade_images', 'trading_day_id', 'TEXT');
}
