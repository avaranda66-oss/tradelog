'use server';

import { db } from '@/lib/db';
import { customTags } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import { eq, asc, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

/**
 * Busca todas as tags de uma categoria no SQLite
 */
export async function getTags(category?: string) {
  if (category) {
    return db.query.customTags.findMany({
      where: eq(customTags.category, category),
      orderBy: [asc(customTags.createdAt)],
    });
  }
  return db.query.customTags.findMany({
    orderBy: [asc(customTags.createdAt)],
  });
}

/**
 * Cria uma nova tag na categoria especificada
 */
export async function createTag(category: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Nome da opção não pode ser vazio');

  const existing = await db.query.customTags.findFirst({
    where: and(eq(customTags.category, category), eq(customTags.name, cleanName)),
  });

  if (existing) {
    throw new Error('Esta opção já existe nesta categoria');
  }

  const id = generateId();
  await db.insert(customTags).values({
    id,
    category,
    name: cleanName,
  });

  try {
    revalidatePath('/');
    revalidatePath('/diario');
    revalidatePath('/operacoes');
  } catch {}

  return { id, category, name: cleanName };
}

/**
 * Exclui uma tag do SQLite
 */
export async function deleteTag(id: string) {
  await db.delete(customTags).where(eq(customTags.id, id));
  try {
    revalidatePath('/');
    revalidatePath('/diario');
    revalidatePath('/operacoes');
  } catch {}
  return { success: true };
}

/**
 * Edita o nome de uma tag
 */
export async function updateTagName(id: string, newName: string) {
  const cleanName = newName.trim();
  if (!cleanName) throw new Error('Nome não pode ser vazio');

  await db.update(customTags)
    .set({ name: cleanName })
    .where(eq(customTags.id, id));

  try {
    revalidatePath('/');
    revalidatePath('/diario');
    revalidatePath('/operacoes');
  } catch {}
  return { success: true };
}
