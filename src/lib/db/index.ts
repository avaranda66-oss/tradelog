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

  CREATE TABLE IF NOT EXISTS custom_tags (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT
  );
`);

try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN farol_bias TEXT;'); } catch {}
try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN farol_key_levels TEXT;'); } catch {}
try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN farol_news TEXT;'); } catch {}
try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN farol_insights TEXT;'); } catch {}
try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN sleep_time TEXT;'); } catch {}

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
