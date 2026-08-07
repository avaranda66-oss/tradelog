import { db } from '../lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    await db.run(sql`ALTER TABLE trading_days ADD COLUMN sleep_time TEXT`);
    console.log('Coluna sleep_time adicionada com sucesso na tabela trading_days');
  } catch (err: any) {
    if (err.message?.includes('duplicate column name')) {
      console.log('Coluna sleep_time já existe — nada a fazer.');
    } else {
      throw err;
    }
  }
}

main().catch(console.error);
