import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'node:path';
import fs from 'node:fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'tradelog.db');
const sqlite = new Database(dbPath);

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

sqlite.exec(`
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
`);

try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN farol_bias TEXT;'); } catch {}
try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN farol_key_levels TEXT;'); } catch {}
try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN farol_news TEXT;'); } catch {}
try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN farol_insights TEXT;'); } catch {}
try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN sleep_time TEXT;'); } catch {}

// Semeia estratégias padrão (incluindo Abertura das Ações, Abertura Mercado Americano e Região ADR)
const defaultStrategies = [
  'Rompimento',
  'Pullback',
  'VWAP Revert',
  'Fluxo',
  'Scalp',
  'Momentum',
  'Contra-Tendência',
  'Abertura',
  'Abertura das Ações',
  'Abertura Mercado Americano',
  'Região ADR',
];

const insertStmt = sqlite.prepare('INSERT OR IGNORE INTO custom_strategies (id, name, category, created_at) VALUES (?, ?, ?, ?)');
for (let i = 0; i < defaultStrategies.length; i++) {
  const sName = defaultStrategies[i];
  const id = `strat_${i + 1}_${sName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  insertStmt.run(id, sName, 'geral', new Date().toISOString());
}

export const db = drizzle(sqlite, { schema });
