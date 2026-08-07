'use server';

import { db } from '@/lib/db';
import { tradeImages } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import { analyzeTradeScreenshotVision } from '@/lib/vision-analysis';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Salva imagem associada a um trade e executa análise multimodal Vision de gráfico
 */
export async function uploadTradeImage(formData: FormData) {
  const file = formData.get('image') as File;
  const tradeId = formData.get('tradeId') as string;
  const imageType = (formData.get('imageType') as string) || 'contexto';
  const date = formData.get('date') as string;

  if (!file || !tradeId) throw new Error('Arquivo e tradeId são obrigatórios');

  const imgDir = path.join(process.cwd(), 'data', 'images', date);
  if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true });
  }

  const ext = path.extname(file.name) || '.png';
  const fileName = `trade_${tradeId.slice(-6)}_${Date.now()}${ext}`;
  const filePath = path.join(imgDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  let visionCaption = '';
  try {
    visionCaption = await analyzeTradeScreenshotVision(filePath);
  } catch (err) {
    console.error('Falha ao analisar imagem via Vision AI:', err);
  }

  const imageId = generateId();
  await db.insert(tradeImages).values({
    id: imageId,
    tradeId,
    filePath: `images/${date}/${fileName}`,
    imageType,
    caption: visionCaption || 'Screenshot do trade',
  });

  revalidatePath('/');
  return { id: imageId, filePath: `images/${date}/${fileName}`, caption: visionCaption };
}

/**
 * Salva imagem associada à sessão do dia (Debrief / Retrospectiva)
 */
export async function uploadSessionImage(formData: FormData) {
  const file = formData.get('image') as File;
  const tradingDayId = formData.get('tradingDayId') as string;
  const date = formData.get('date') as string || new Date().toISOString().split('T')[0];

  if (!file || !tradingDayId) throw new Error('Arquivo e tradingDayId são obrigatórios');

  const imgDir = path.join(process.cwd(), 'data', 'images', date);
  if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true });
  }

  const ext = path.extname(file.name) || '.png';
  const fileName = `session_${tradingDayId.slice(-6)}_${Date.now()}${ext}`;
  const filePath = path.join(imgDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  let visionCaption = '';
  try {
    visionCaption = await analyzeTradeScreenshotVision(filePath);
  } catch (err) {
    console.error('Falha ao analisar imagem via Vision AI:', err);
  }

  const imageId = generateId();
  await db.insert(tradeImages).values({
    id: imageId,
    tradingDayId,
    filePath: `images/${date}/${fileName}`,
    imageType: 'session',
    caption: visionCaption || 'Gráfico/Screenshot da Sessão',
  });

  revalidatePath('/');
  return { id: imageId, filePath: `images/${date}/${fileName}`, caption: visionCaption };
}

/**
 * Busca imagens da sessão do dia
 */
export async function getSessionImages(tradingDayId: string) {
  return db.query.tradeImages.findMany({
    where: eq(tradeImages.tradingDayId, tradingDayId),
  });
}

/**
 * Dispara análise de visão computacional em uma imagem existente
 */
export async function analyzeImageWithVision(imageId: string) {
  const image = await db.query.tradeImages.findFirst({
    where: eq(tradeImages.id, imageId),
  });

  if (!image) throw new Error('Imagem não encontrada');

  const fullPath = path.join(process.cwd(), 'data', image.filePath);
  const visionCaption = await analyzeTradeScreenshotVision(fullPath);

  await db.update(tradeImages)
    .set({ caption: visionCaption })
    .where(eq(tradeImages.id, imageId));

  revalidatePath('/');
  return { caption: visionCaption };
}

/**
 * Remove uma imagem de trade ou sessão do banco de dados e do disco
 */
export async function deleteTradeImage(imageId: string) {
  console.log(`[Image] Solicitando exclusão da imagem ID: ${imageId}`);
  const image = await db.query.tradeImages.findFirst({
    where: eq(tradeImages.id, imageId),
  });

  if (image) {
    const fullPath = path.join(process.cwd(), 'data', image.filePath);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
        console.log(`[Image] Arquivo deletado do disco: ${fullPath}`);
      } catch (err) {
        console.error(`[Image] Erro ao deletar arquivo do disco:`, err);
      }
    }

    await db.delete(tradeImages).where(eq(tradeImages.id, imageId));
    console.log(`[Image] Registro deletado do SQLite para ID: ${imageId}`);
    revalidatePath('/');
    return { success: true };
  }

  return { success: false, error: 'Imagem não encontrada' };
}

/**
 * Busca imagens de um trade
 */
export async function getTradeImages(tradeId: string) {
  return db.query.tradeImages.findMany({
    where: eq(tradeImages.tradeId, tradeId),
  });
}
