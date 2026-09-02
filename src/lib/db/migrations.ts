import type Database from 'better-sqlite3';
import { calculateStrategyCanonicalBenchmarkCapital } from '../../features/options/calculations';

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
    const tableExists = sqliteInstance
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!tableExists) {
      return false;
    }

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
 * Verifica se uma tabela existe no SQLite e a cria via DDL se ausente.
 * Retorna true se a tabela foi criada, false se já existia.
 */
export function ensureTable(
  sqliteInstance: Database.Database,
  table: string,
  createSql: string
): boolean {
  try {
    const tableExists = sqliteInstance
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!tableExists) {
      sqliteInstance.exec(createSql);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[DB Migration] Falha ao verificar ou criar tabela ${table}:`, err);
    throw err;
  }
}

/**
 * Verifica se um índice existe no SQLite e o cria via DDL se ausente.
 * Retorna true se o índice foi criado, false se já existia.
 */
export function ensureIndex(
  sqliteInstance: Database.Database,
  indexName: string,
  createSql: string
): boolean {
  try {
    const indexExists = sqliteInstance
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
      .get(indexName);
    if (!indexExists) {
      sqliteInstance.exec(createSql);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[DB Migration] Falha ao verificar ou criar índice ${indexName}:`, err);
    throw err;
  }
}

/**
 * Backfill seguro e idempotente de posições legadas, pernas de estratégia e timeline inicial.
 * Preserva o baseline de legacy_closed_quantity sem fabricar executions fictícias para dados incompletos.
 */
function backfillOptionPositionsAndLegs(sqliteInstance: Database.Database): void {
  const hasPositions = sqliteInstance
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='option_positions'")
    .get();
  if (!hasPositions) return;

  sqliteInstance.transaction(() => {
    // 1. Posições Abertas: open_quantity = quantity, closed_quantity = 0, legacy_closed_quantity = 0
    sqliteInstance.prepare(`
      UPDATE option_positions
      SET open_quantity = quantity,
          closed_quantity = 0,
          legacy_closed_quantity = 0,
          realized_pnl_reais = 0
      WHERE open_quantity IS NULL AND status = 'OPEN';
    `).run();

    // 2. Posições Fechadas / Terminais (status != 'OPEN') com open_quantity ainda nulo
    const closedPositions = sqliteInstance.prepare(`
      SELECT id, side, quantity, entry_price, exit_price, exit_date, status
      FROM option_positions
      WHERE open_quantity IS NULL AND status != 'OPEN';
    `).all() as Array<{
      id: string;
      side: string;
      quantity: number;
      entry_price: number;
      exit_price: number | null;
      exit_date: string | null;
      status: string;
    }>;

    for (const pos of closedPositions) {
      if (pos.exit_price !== null && pos.exit_date !== null) {
        // Legacy Fechado Completo: gera execution migrada com fatos reais
        const isSell = pos.side.toUpperCase() === 'SELL' || pos.side.toUpperCase() === 'SHORT';
        const pnl = isSell
          ? (pos.entry_price - pos.exit_price) * pos.quantity
          : (pos.exit_price - pos.entry_price) * pos.quantity;
        const execId = `exec_mig_${pos.id}`;

        sqliteInstance.prepare(`
          INSERT OR IGNORE INTO option_position_executions (
            id, position_id, execution_type, quantity, price, execution_date,
            entry_price_basis_reais, gross_realized_pnl_reais, fees_reais, net_realized_pnl_reais,
            source, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'LEGACY_MIGRATION', 'Migração de fechamento legacy completo', datetime('now'));
        `).run(
          execId,
          pos.id,
          isSell ? 'BUY_TO_CLOSE' : 'SELL_TO_CLOSE',
          pos.quantity,
          pos.exit_price,
          pos.exit_date,
          pos.entry_price,
          pnl,
          pnl
        );

        sqliteInstance.prepare(`
          UPDATE option_positions
          SET open_quantity = 0,
              closed_quantity = quantity,
              legacy_closed_quantity = 0,
              realized_pnl_reais = ?
          WHERE id = ?;
        `).run(pnl, pos.id);
      } else {
        // Legacy Fechado Incompleto: NÃO fabricar execution, data fictícia ou preço falso!
        // Reconciliação canônica via legacy_closed_quantity = quantity
        sqliteInstance.prepare(`
          UPDATE option_positions
          SET open_quantity = 0,
              closed_quantity = quantity,
              legacy_closed_quantity = quantity,
              legacy_quality = 'LEGACY_INCOMPLETE',
              realized_pnl_reais = 0
          WHERE id = ?;
        `).run(pos.id);
      }
    }

    // 3. Pernas de Estratégia (option_strategy_legs) com open_allocated_quantity nulo
    const hasLegs = sqliteInstance
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='option_strategy_legs'")
      .get();
    if (hasLegs) {
      const legsToBackfill = sqliteInstance.prepare(`
        SELECT 
          l.id AS leg_id,
          l.strategy_id,
          l.position_id,
          l.allocated_quantity,
          s.status AS strategy_status,
          p.quantity AS pos_quantity,
          p.exit_price,
          p.exit_date
        FROM option_strategy_legs l
        JOIN option_strategies s ON s.id = l.strategy_id
        JOIN option_positions p ON p.id = l.position_id
        WHERE l.open_allocated_quantity IS NULL;
      `).all() as Array<{
        leg_id: string;
        strategy_id: string;
        position_id: string;
        allocated_quantity: number;
        strategy_status: string;
        pos_quantity: number;
        exit_price: number | null;
        exit_date: string | null;
      }>;

      for (const leg of legsToBackfill) {
        if (leg.strategy_status === 'OPEN') {
          sqliteInstance.prepare(`
            UPDATE option_strategy_legs
            SET open_allocated_quantity = allocated_quantity,
                closed_allocated_quantity = 0,
                legacy_closed_allocated_quantity = 0
            WHERE id = ?;
          `).run(leg.leg_id);
        } else {
          // Estratégia Terminal ('CLOSED' ou 'ROLLED')
          // Caso A: Posição legada fechada com dados completos E quantidade 100% coincidente (atribuição inequívoca)
          const isComplete = leg.exit_price !== null && leg.exit_date !== null;
          const isExactQuantity = leg.pos_quantity === leg.allocated_quantity;

          if (isComplete && isExactQuantity) {
            // Vincula a execution migrada à leg
            const execId = `exec_mig_${leg.position_id}`;
            sqliteInstance.prepare(`
              UPDATE option_position_executions
              SET strategy_id = ?, strategy_leg_id = ?
              WHERE id = ?;
            `).run(leg.strategy_id, leg.leg_id, execId);

            sqliteInstance.prepare(`
              UPDATE option_strategy_legs
              SET open_allocated_quantity = 0,
                  closed_allocated_quantity = allocated_quantity,
                  legacy_closed_allocated_quantity = 0
              WHERE id = ?;
            `).run(leg.leg_id);
          } else {
            // Caso B: Dados incompletos OU atribuição ambígua -> fecha via baseline legacy sem execution
            sqliteInstance.prepare(`
              UPDATE option_strategy_legs
              SET open_allocated_quantity = 0,
                  closed_allocated_quantity = allocated_quantity,
                  legacy_closed_allocated_quantity = allocated_quantity
              WHERE id = ?;
            `).run(leg.leg_id);
          }
        }
      }
    }

    // 4. Bootstrap da Strategy Funding Timeline para Estratégias Existentes
    const hasStrategies = sqliteInstance
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='option_strategies'")
      .get();
    const hasSegments = sqliteInstance
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_funding_segments'")
      .get();

    if (hasStrategies && hasSegments) {
      const strategiesWithoutSegment = sqliteInstance.prepare(`
        SELECT s.id, s.collateral_mode, s.collateral_yield_pct_cdi, s.capital_remunerated_reais, s.opened_at, s.closed_at, s.created_at
        FROM option_strategies s
        WHERE NOT EXISTS (SELECT 1 FROM strategy_funding_segments seg WHERE seg.strategy_id = s.id);
      `).all() as Array<{
        id: string;
        collateral_mode: string | null;
        collateral_yield_pct_cdi: number | null;
        capital_remunerated_reais: number | null;
        opened_at: string;
        closed_at: string | null;
        created_at: string | null;
      }>;

      for (const strat of strategiesWithoutSegment) {
        // Calcula o capital de benchmark canônico via Risk Recognizer oficial B3
        const legRows = sqliteInstance.prepare(`
          SELECT l.allocated_quantity, l.economic_role, p.strike, p.entry_price, p.underlying_current_spot, p.expiration_date, p.option_type, p.side
          FROM option_strategy_legs l
          JOIN option_positions p ON p.id = l.position_id
          WHERE l.strategy_id = ?;
        `).all(strat.id) as Array<{
          allocated_quantity: number;
          economic_role: string;
          strike: number;
          entry_price: number;
          underlying_current_spot: number | null;
          expiration_date: string;
          option_type: string;
          side: string;
        }>;

        const benchmarkCapital = calculateStrategyCanonicalBenchmarkCapital(
          legRows.map((l) => ({
            allocatedQuantity: l.allocated_quantity,
            economicRole: l.economic_role,
            position: {
              optionType: l.option_type as any,
              side: l.side as any,
              strike: l.strike,
              entryPrice: l.entry_price,
              underlyingCurrentSpot: l.underlying_current_spot,
              expirationDate: l.expiration_date,
            },
          }))
        );

        const mode = strat.collateral_mode || 'IDLE_CASH';
        let capitalRemunerated = 0;
        let quality: 'FULL' | 'PARTIAL' | 'INSUFFICIENT_DATA' = 'FULL';

        if (mode === 'IDLE_CASH') {
          capitalRemunerated = 0;
          quality = 'FULL';
        } else {
          if (strat.capital_remunerated_reais !== null && strat.capital_remunerated_reais !== undefined) {
            capitalRemunerated = Math.min(strat.capital_remunerated_reais, benchmarkCapital);
            quality = 'FULL';
          } else {
            // Funding assumido (hipótese de 100% da garantia remunerada sem dado explícito)
            capitalRemunerated = benchmarkCapital;
            quality = 'PARTIAL'; // P1.6: NÃO promover hipótese antiga para dado observado FULL!
          }
        }

        const segId = `seg_init_${strat.id}`;
        sqliteInstance.prepare(`
          INSERT OR IGNORE INTO strategy_funding_segments (
            id, strategy_id, start_date, end_date, benchmark_capital_reais,
            capital_remunerated_reais, collateral_mode, collateral_pct_cdi,
            source_type, quality, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CREATION', ?, ?);
        `).run(
          segId,
          strat.id,
          strat.opened_at,
          strat.closed_at ?? null,
          benchmarkCapital,
          capitalRemunerated,
          mode,
          strat.collateral_yield_pct_cdi ?? null,
          quality,
          strat.created_at || new Date().toISOString()
        );
      }
    }
  })();
}

/**
 * P0.1 (Fase 4.1.2): Reconstrução não-destrutiva de strategy_funding_segments para bancos
 * que já executaram a Fase 4.1 (037ac1e) sem o CHECK de coerência de source_type.
 */
function upgradeStrategyFundingSegmentsCoherenceCheck(sqliteInstance: Database.Database): void {
  const tableInfo = sqliteInstance
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'strategy_funding_segments'")
    .get() as { sql: string } | undefined;

  if (!tableInfo) return;

  // Se já possui a constraint física de coerência de source_type, nenhuma ação necessária
  if (tableInfo.sql.includes('source_type = \'CREATION\' AND maneuver_event_id IS NULL')) {
    return;
  }

  // Reconstrução não-destrutiva transacional preservando FKs, IDs e dados
  sqliteInstance.exec(`
    PRAGMA foreign_keys = OFF;

    CREATE TABLE strategy_funding_segments_upgrade (
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
      CHECK(end_date IS NULL OR end_date >= start_date),
      CHECK(
        (source_type = 'CREATION' AND maneuver_event_id IS NULL AND funding_event_id IS NULL) OR
        (source_type = 'MANEUVER' AND maneuver_event_id IS NOT NULL AND funding_event_id IS NULL) OR
        (source_type = 'FUNDING_CHANGE' AND maneuver_event_id IS NULL AND funding_event_id IS NOT NULL)
      )
    );

    INSERT INTO strategy_funding_segments_upgrade (
      id, strategy_id, start_date, end_date, benchmark_capital_reais,
      capital_remunerated_reais, collateral_mode, collateral_pct_cdi,
      source_type, maneuver_event_id, funding_event_id, quality, created_at
    )
    SELECT
      id, strategy_id, start_date, end_date, benchmark_capital_reais,
      capital_remunerated_reais, collateral_mode, collateral_pct_cdi,
      source_type, maneuver_event_id, funding_event_id, quality, created_at
    FROM strategy_funding_segments;

    DROP TABLE strategy_funding_segments;

    ALTER TABLE strategy_funding_segments_upgrade RENAME TO strategy_funding_segments;

    CREATE UNIQUE INDEX IF NOT EXISTS one_open_funding_segment_per_strategy
    ON strategy_funding_segments(strategy_id)
    WHERE end_date IS NULL;

    PRAGMA foreign_keys = ON;
  `);
}

/**
 * Executa todas as migrações incrementais auditáveis no banco de dados SQLite fornecido.
 */
export function applyMigrations(sqliteInstance: Database.Database): void {
  // 1. Migrações Históricas de Colunas
  ensureColumn(sqliteInstance, 'option_strategies', 'capital_remunerated_reais', 'REAL');
  ensureColumn(sqliteInstance, 'option_strategies', 'collateral_coverage_pct', 'REAL');
  ensureColumn(sqliteInstance, 'trading_days', 'farol_bias', 'TEXT');
  ensureColumn(sqliteInstance, 'trading_days', 'farol_key_levels', 'TEXT');
  ensureColumn(sqliteInstance, 'trading_days', 'farol_news', 'TEXT');
  ensureColumn(sqliteInstance, 'trading_days', 'farol_insights', 'TEXT');
  ensureColumn(sqliteInstance, 'trading_days', 'sleep_time', 'TEXT');
  ensureColumn(sqliteInstance, 'trading_days', 'strategy_tags', 'TEXT');
  ensureColumn(sqliteInstance, 'trade_images', 'trading_day_id', 'TEXT');

  // 2. Novas Colunas de Posições (Fase 4.1: Caches e Baseline Legacy)
  ensureColumn(sqliteInstance, 'option_positions', 'legacy_closed_quantity', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(sqliteInstance, 'option_positions', 'legacy_quality', 'TEXT');
  ensureColumn(sqliteInstance, 'option_positions', 'closed_quantity', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(sqliteInstance, 'option_positions', 'open_quantity', 'INTEGER');
  ensureColumn(sqliteInstance, 'option_positions', 'realized_pnl_reais', 'REAL NOT NULL DEFAULT 0');

  // 3. Novas Colunas de Pernas de Estratégia (Fase 4.1)
  ensureColumn(sqliteInstance, 'option_strategy_legs', 'legacy_closed_allocated_quantity', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(sqliteInstance, 'option_strategy_legs', 'closed_allocated_quantity', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(sqliteInstance, 'option_strategy_legs', 'open_allocated_quantity', 'INTEGER');

  // 4. Novas Tabelas de Auditoria, Manejo e Funding (Fase 4.1)
  ensureTable(sqliteInstance, 'strategy_maneuver_events', `
    CREATE TABLE strategy_maneuver_events (
      id TEXT PRIMARY KEY,
      strategy_id TEXT NOT NULL REFERENCES option_strategies(id) ON DELETE RESTRICT,
      maneuver_type TEXT NOT NULL,
      percentage_reduced REAL,
      units_reduced INTEGER,
      execution_date TEXT NOT NULL,
      audit_realized_pnl_reais REAL NOT NULL,
      audit_capital_released_reais REAL,
      audit_ratio_before TEXT,
      audit_ratio_after TEXT,
      preserves_original_ratio INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL
    );
  `);

  ensureTable(sqliteInstance, 'strategy_funding_events', `
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
  `);

  ensureTable(sqliteInstance, 'strategy_funding_segments', `
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
      CHECK(end_date IS NULL OR end_date >= start_date),
      CHECK(
        (source_type = 'CREATION' AND maneuver_event_id IS NULL AND funding_event_id IS NULL) OR
        (source_type = 'MANEUVER' AND maneuver_event_id IS NOT NULL AND funding_event_id IS NULL) OR
        (source_type = 'FUNDING_CHANGE' AND maneuver_event_id IS NULL AND funding_event_id IS NOT NULL)
      )
    );
  `);

  // P0.1 (Fase 4.1.2): Upgrade real para bancos que já criaram strategy_funding_segments na 4.1 sem o novo CHECK
  upgradeStrategyFundingSegmentsCoherenceCheck(sqliteInstance);

  ensureIndex(sqliteInstance, 'one_open_funding_segment_per_strategy', `
    CREATE UNIQUE INDEX IF NOT EXISTS one_open_funding_segment_per_strategy
    ON strategy_funding_segments(strategy_id)
    WHERE end_date IS NULL;
  `);

  ensureTable(sqliteInstance, 'option_position_executions', `
    CREATE TABLE option_position_executions (
      id TEXT PRIMARY KEY,
      position_id TEXT NOT NULL REFERENCES option_positions(id) ON DELETE RESTRICT,
      strategy_id TEXT REFERENCES option_strategies(id) ON DELETE RESTRICT,
      strategy_leg_id TEXT REFERENCES option_strategy_legs(id) ON DELETE RESTRICT,
      maneuver_event_id TEXT REFERENCES strategy_maneuver_events(id) ON DELETE RESTRICT,
      execution_type TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      price REAL NOT NULL CHECK(price >= 0),
      execution_date TEXT NOT NULL,
      entry_price_basis_reais REAL NOT NULL,
      gross_realized_pnl_reais REAL NOT NULL,
      fees_reais REAL NOT NULL DEFAULT 0,
      net_realized_pnl_reais REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'USER_MANUAL',
      notes TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 5. Backfill de reconciliação de legados e integridade canônica
  backfillOptionPositionsAndLegs(sqliteInstance);
}
