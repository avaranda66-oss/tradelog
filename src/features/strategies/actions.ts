'use server';

import { db } from '@/lib/db';
import { customStrategies } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import { eq, asc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

/**
 * Busca todas as estratégias cadastradas no SQLite
 */
export async function getStrategies() {
  return db.query.customStrategies.findMany({
    orderBy: [asc(customStrategies.createdAt)],
  });
}

/**
 * Cadastra uma nova estratégia no SQLite
 */
export async function createStrategy(name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Nome da estratégia não pode ser vazio');

  const existing = await db.query.customStrategies.findFirst({
    where: eq(customStrategies.name, cleanName),
  });

  if (existing) {
    throw new Error('Estratégia com este nome já existe');
  }

  const id = generateId();
  await db.insert(customStrategies).values({
    id,
    name: cleanName,
    category: 'geral',
  });

  revalidatePath('/');
  revalidatePath('/diario');
  revalidatePath('/operacoes');

  return { id, name: cleanName };
}

/**
 * Exclui uma estratégia do SQLite
 */
export async function deleteStrategy(id: string) {
  await db.delete(customStrategies).where(eq(customStrategies.id, id));
  revalidatePath('/');
  revalidatePath('/diario');
  revalidatePath('/operacoes');
  return { success: true };
}

/**
 * Atualiza o nome de uma estratégia no SQLite
 */
export async function updateStrategyName(id: string, newName: string) {
  const cleanName = newName.trim();
  if (!cleanName) throw new Error('Nome da estratégia não pode ser vazio');

  await db.update(customStrategies)
    .set({ name: cleanName })
    .where(eq(customStrategies.id, id));

  revalidatePath('/');
  revalidatePath('/diario');
  revalidatePath('/operacoes');
  return { success: true };
}
