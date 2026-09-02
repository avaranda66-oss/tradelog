import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = process.env.TRADELOG_DB_PATH || path.join(process.cwd(), 'data', 'tradelog.db');

if (dbPath !== ':memory:') {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const sqlite = new Database(dbPath);

if (dbPath !== ':memory:') {
  sqlite.pragma('journal_mode = WAL');
}
sqlite.pragma('foreign_keys = ON');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS trading_days (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    sleep_time TEXT,
    wake_up_time TEXT,
    sleep_quality INTEGER,
    mental_state TEXT,
    personal_note TEXT,
    macro_calendar TEXT,
    overnight_note TEXT,
    general_bias TEXT,
    total_points REAL,
    total_reais REAL,
    trades_right INTEGER,
    trades_wrong INTEGER,
    avg_conviction REAL,
    avg_execution REAL,
    bias_correct INTEGER,
    pre_market_done INTEGER DEFAULT 0,
    overtrading INTEGER DEFAULT 0,
    honest_phrase TEXT,
    retrospective TEXT,
    emotional_post TEXT,
    farol_bias TEXT,
    farol_key_levels TEXT,
    farol_news TEXT,
    farol_insights TEXT,
    strategy_tags TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    trading_day_id TEXT REFERENCES trading_days(id) ON DELETE CASCADE,
    trade_number INTEGER NOT NULL,
    instrument TEXT NOT NULL,
    open_time TEXT NOT NULL,
    close_time TEXT NOT NULL,
    duration TEXT,
    side TEXT NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL NOT NULL,
    contracts INTEGER NOT NULL,
    points REAL,
    reais REAL,
    is_average INTEGER DEFAULT 0,
    mep REAL,
    men REAL,
    drawdown REAL,
    conviction INTEGER,
    execution INTEGER,
    what_i_saw_now TEXT,
    retrospective TEXT,
    strategy TEXT,
    emotional_pre TEXT,
    entry_type TEXT,
    pre_trade_note TEXT,
    market_regime TEXT,
    day_phase TEXT,
    stop_type TEXT,
    did_partial INTEGER DEFAULT 0,
    moved_stop INTEGER DEFAULT 0,
    reduced_size INTEGER DEFAULT 0,
    exited_early INTEGER DEFAULT 0,
    during_trade_note TEXT,
    emotional_post TEXT,
    trade_quality INTEGER,
    post_trade_note TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS trade_images (
    id TEXT PRIMARY KEY,
    trade_id TEXT REFERENCES trades(id) ON DELETE CASCADE,
    trading_day_id TEXT REFERENCES trading_days(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    caption TEXT,
    image_type TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS video_records (
    id TEXT PRIMARY KEY,
    trading_day_id TEXT REFERENCES trading_days(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    duration_secs INTEGER,
    resolution TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS custom_strategies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'geral',
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS custom_tags (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS trade_annotations (
    id TEXT PRIMARY KEY,
    trade_id TEXT REFERENCES trades(id) ON DELETE CASCADE,
    trading_day_id TEXT REFERENCES trading_days(id) ON DELETE CASCADE,
    timestamp_secs REAL NOT NULL,
    formatted_time TEXT NOT NULL,
    clock_time TEXT,
    text TEXT NOT NULL,
    tag TEXT DEFAULT 'insight',
    drawing_data TEXT,
    author TEXT DEFAULT 'user',
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS gex_runs (
    id TEXT PRIMARY KEY,
    trading_day_id TEXT REFERENCES trading_days(id) ON DELETE SET NULL,
    date TEXT NOT NULL,
    asset TEXT NOT NULL,
    script_version TEXT NOT NULL,
    script_name TEXT NOT NULL,
    script_path TEXT,
    spot_fechamento REAL NOT NULL,
    spot_ajuste REAL NOT NULL,
    range_min REAL,
    range_max REAL,
    oi_mode TEXT DEFAULT 'effective',
    cotahist_file TEXT,
    cotahist_hash TEXT,
    cotahist_date TEXT,
    open_interest_file TEXT,
    open_interest_hash TEXT,
    open_interest_date TEXT,
    iv_coverage REAL,
    call_wall_strike REAL,
    call_wall_fech REAL,
    call_wall_ajus REAL,
    call_wall_gex REAL,
    zero_gamma_strike REAL,
    zero_gamma_fech REAL,
    zero_gamma_ajus REAL,
    put_wall_strike REAL,
    put_wall_fech REAL,
    put_wall_ajus REAL,
    put_wall_gex REAL,
    status TEXT DEFAULT 'completed',
    logs TEXT,
    ntsl_code TEXT,
    ntsl_file_path TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS gex_levels (
    id TEXT PRIMARY KEY,
    gex_run_id TEXT REFERENCES gex_runs(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    asset TEXT NOT NULL,
    level_type TEXT NOT NULL,
    strike REAL NOT NULL,
    winfut_fech REAL,
    winfut_ajus REAL,
    gex_call REAL,
    gex_put REAL,
    gex_net REAL,
    gex_proxy REAL,
    gex_gross REAL,
    open_interest INTEGER,
    negocios INTEGER,
    volume_financeiro REAL,
    real_iv REAL,
    order_index INTEGER DEFAULT 0,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS gex_backtest_results (
    id TEXT PRIMARY KEY,
    gex_run_id TEXT REFERENCES gex_runs(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    asset TEXT NOT NULL,
    script_version TEXT NOT NULL,
    call_wall_tests INTEGER DEFAULT 0,
    call_wall_holding_rate REAL,
    put_wall_tests INTEGER DEFAULT 0,
    put_wall_holding_rate REAL,
    zero_gamma_crossings INTEGER DEFAULT 0,
    zero_gamma_acceleration_ratio REAL,
    trades_tested INTEGER DEFAULT 0,
    trades_win_rate_near_gex REAL,
    avg_deviation_points REAL,
    overall_score REAL,
    notes TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS option_positions (
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

  CREATE TABLE IF NOT EXISTS option_strategies (
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

  CREATE TABLE IF NOT EXISTS option_strategy_legs (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL REFERENCES option_strategies(id) ON DELETE CASCADE,
    position_id TEXT NOT NULL REFERENCES option_positions(id) ON DELETE RESTRICT,
    allocated_quantity INTEGER NOT NULL,
    economic_role TEXT NOT NULL DEFAULT 'CUSTOM',
    created_at TEXT,
    UNIQUE(strategy_id, position_id)
  );

  CREATE TABLE IF NOT EXISTS strategy_allocation_events (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    position_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    allocated_quantity INTEGER NOT NULL,
    notes TEXT,
    timestamp TEXT
  );
`);

export { ensureColumn, applyMigrations } from './migrations';
import { applyMigrations } from './migrations';

// ─── Execução de Migrações Auditáveis de Schema ───
applyMigrations(sqlite);

// Semeia todas as categorias padrão no SQLite se a tabela custom_tags estiver vazia
const tagSeeds: Record<string, string[]> = {
  strategy: [
    'Rompimento', 'Pullback', 'VWAP Revert', 'Fluxo', 'Scalp', 'Momentum',
    'Contra-Tendência', 'Abertura', 'Abertura das Ações', 'Abertura Mercado Americano', 'Região ADR'
  ],
  entry_type: [
    'Breakout', 'Pullback', 'Reversão', 'Scalp', 'Momentum',
    'Contra-Tendência', 'Abertura Ações', 'Abertura Mercado Americano', 'Região ADR'
  ],
  emotion_pre: [
    'Confiante', 'Centrado', 'Neutro', 'Focado', 'Ansioso', 'FOMO', 'Revenge', 'Medo', 'Euforia'
  ],
  market_regime: [
    'Tendência', 'Range', 'Chop', 'Volatilidade', 'Abertura', 'Pós-Payroll', 'Reversão Macro'
  ],
  day_phase: [
    'Pré-Abertura', 'Abertura B3 (10h)', 'Abertura EUA (NYSE)', 'Meio Pregão', 'Fechamento'
  ],
  stop_type: [
    'Técnico', 'Financeiro', 'Temporal', 'Trail', 'Breakeven', 'Nível GEX'
  ],
  emotion_post: [
    'Calmo', 'Satisfeito', 'Centrado', 'Neutro', 'Frustrado', 'Aliviado', 'Arrependido', 'Eufórico'
  ],
};

const insertTagStmt = sqlite.prepare('INSERT OR IGNORE INTO custom_tags (id, category, name, created_at) VALUES (?, ?, ?, ?)');
const countTags = sqlite.prepare('SELECT COUNT(*) as count FROM custom_tags').get() as { count: number };

if (countTags.count === 0) {
  let counter = 1;
  const now = new Date().toISOString();
  for (const [cat, names] of Object.entries(tagSeeds)) {
    for (const name of names) {
      const id = `tag_${cat}_${counter++}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      insertTagStmt.run(id, cat, name, now);
    }
  }
}

export const db = drizzle(sqlite, { schema });
