// Migration: Add trade annotation fields (Pré/Durante/Pós)
import Database from 'better-sqlite3';
import path from 'node:path';

const dbPath = path.join(process.cwd(), 'data', 'tradelog.db');
const db = new Database(dbPath);

const columns = [
  // Pré-Trade
  "ALTER TABLE trades ADD COLUMN strategy TEXT",
  "ALTER TABLE trades ADD COLUMN emotional_pre TEXT",
  "ALTER TABLE trades ADD COLUMN entry_type TEXT",
  "ALTER TABLE trades ADD COLUMN pre_trade_note TEXT",
  // Durante
  "ALTER TABLE trades ADD COLUMN market_regime TEXT",
  "ALTER TABLE trades ADD COLUMN day_phase TEXT",
  "ALTER TABLE trades ADD COLUMN stop_type TEXT",
  "ALTER TABLE trades ADD COLUMN did_partial INTEGER DEFAULT 0",
  "ALTER TABLE trades ADD COLUMN moved_stop INTEGER DEFAULT 0",
  "ALTER TABLE trades ADD COLUMN reduced_size INTEGER DEFAULT 0",
  "ALTER TABLE trades ADD COLUMN exited_early INTEGER DEFAULT 0",
  "ALTER TABLE trades ADD COLUMN during_trade_note TEXT",
  // Pós-Trade
  "ALTER TABLE trades ADD COLUMN emotional_post TEXT",
  "ALTER TABLE trades ADD COLUMN trade_quality INTEGER",
  "ALTER TABLE trades ADD COLUMN post_trade_note TEXT",
];

let added = 0;
let skipped = 0;

for (const sql of columns) {
  try {
    db.exec(sql);
    added++;
    console.log(`✅ ${sql.split('ADD COLUMN ')[1]}`);
  } catch (err: any) {
    if (err.message.includes('duplicate column')) {
      skipped++;
      console.log(`⏭️  Já existe: ${sql.split('ADD COLUMN ')[1]}`);
    } else {
      console.error(`❌ Erro: ${err.message}`);
    }
  }
}

console.log(`\n📊 Migração concluída: ${added} adicionadas, ${skipped} já existiam`);
db.close();
