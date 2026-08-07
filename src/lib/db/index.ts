import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'node:path';
import fs from 'node:fs';

// Garante que a pasta data/ existe
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'tradelog.db');
const sqlite = new Database(dbPath);

// Habilita WAL mode para melhor performance em leituras concorrentes
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Garante criação da tabela video_records e colunas do Farol do Mercado se ainda não existirem
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
`);

try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN farol_bias TEXT;'); } catch {}
try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN farol_key_levels TEXT;'); } catch {}
try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN farol_news TEXT;'); } catch {}
try { sqlite.exec('ALTER TABLE trading_days ADD COLUMN farol_insights TEXT;'); } catch {}

export const db = drizzle(sqlite, { schema });
