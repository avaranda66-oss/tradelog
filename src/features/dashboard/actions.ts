'use server';

import { db } from '@/lib/db';
import { keyLevels } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import { eq } from 'drizzle-orm';

export async function saveKeyLevels(dayId: string, levels: { name: string; price: number }[]) {
  await db.delete(keyLevels).where(eq(keyLevels.tradingDayId, dayId));

  for (const level of levels) {
    if (level.name && level.price) {
      await db.insert(keyLevels).values({
        id: generateId(),
        tradingDayId: dayId,
        name: level.name,
        price: level.price,
      });
    }
  }
}
