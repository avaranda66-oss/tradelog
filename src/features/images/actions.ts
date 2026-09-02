'use server';

import { db } from '@/lib/db';
import { tradeImages, trades, tradingDays } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import { analyzeTradeScreenshotVision } from '@/lib/vision-analysis';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Salva imagem associada a um trade SEM gastar tokens de IA automaticamente.
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

  const imageId = generateId();
  const defaultCaption = 'Screenshot do trade';

  await db.insert(tradeImages).values({
    id: imageId,
    tradeId,
    filePath: `images/${date}/${fileName}`,
    imageType,
    caption: defaultCaption,
  });

  revalidatePath('/');
  return { id: imageId, filePath: `images/${date}/${fileName}`, caption: defaultCaption };
}

/**
 * Salva imagem da sessão SEM gastar tokens de IA automaticamente.
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

  const imageId = generateId();
  const defaultCaption = 'Gráfico da Sessão';

  await db.insert(tradeImages).values({
    id: imageId,
    tradingDayId,
    filePath: `images/${date}/${fileName}`,
    imageType: 'session',
    caption: defaultCaption,
  });

  revalidatePath('/');
  return { id: imageId, filePath: `images/${date}/${fileName}`, caption: defaultCaption };
}

/**
 * Salva screenshot do Farol do Mercado enviado manualmente pelo usuário
 */
export async function uploadFarolImage(formData: FormData) {
  const file = formData.get('image') as File;
  const date = (formData.get('date') as string) || new Date().toISOString().split('T')[0];

  if (!file) throw new Error('Arquivo de imagem obrigatório');

  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, date),
  });

  if (!day) {
    const newDayId = generateId();
    await db.insert(tradingDays).values({ id: newDayId, date });
    day = await db.query.tradingDays.findFirst({ where: eq(tradingDays.date, date) });
  }

  const farolDir = path.join(process.cwd(), 'data', 'images', date, 'farol');
  if (!fs.existsSync(farolDir)) {
    fs.mkdirSync(farolDir, { recursive: true });
  }

  const ext = path.extname(file.name) || '.png';
  const nameLower = file.name.toLowerCase();
  let imgType = 'farol-radar';
  if (nameLower.includes('gps')) imgType = 'farol-gps';
  else if (nameLower.includes('briefing')) imgType = 'farol-briefing';

  const fileName = `farol_upload_${Date.now()}${ext}`;
  const filePath = path.join(farolDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  const imageId = generateId();
  const caption = `Screenshot Manual Farol (${file.name})`;

  await db.insert(tradeImages).values({
    id: imageId,
    tradingDayId: day?.id,
    filePath: `images/${date}/farol/${fileName}`,
    imageType: imgType,
    caption,
  });

  revalidatePath('/');
  return { id: imageId, filePath: `images/${date}/farol/${fileName}`, caption };
}

/**
 * Atualiza a descrição/legenda manual da imagem no SQLite
 */
export async function updateTradeImageCaption(imageId: string, caption: string) {
  await db.update(tradeImages)
    .set({ caption: caption.trim() })
    .where(eq(tradeImages.id, imageId));

  revalidatePath('/');
  return { success: true, caption: caption.trim() };
}

/**
 * Busca todas as imagens associadas ao pregão do dia (trades, farol e debrief da sessão)
 */
export async function getSessionImages(tradingDayId: string) {
  const day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.id, tradingDayId),
  });
  if (!day) return [];

  const dayTrades = await db.query.trades.findMany({
    where: eq(trades.tradingDayId, tradingDayId),
  });
  const tradeIds = new Set(dayTrades.map((t) => t.id));
  const tradeMap = new Map(dayTrades.map((t) => [t.id, t]));

  const allImages = await db.query.tradeImages.findMany();
  const dayImages = allImages.filter(
    (img) =>
      (img.tradeId && tradeIds.has(img.tradeId)) ||
      img.tradingDayId === tradingDayId ||
      img.filePath.includes(`/${day.date}/`)
  );

  return dayImages.map((img) => {
    const trade = img.tradeId ? tradeMap.get(img.tradeId) : undefined;
    return {
      id: img.id,
      filePath: img.filePath,
      caption: img.caption,
      imageType: img.imageType,
      tradeId: img.tradeId,
      tradeNumber: trade?.tradeNumber,
      tradeSide: trade?.side,
      tradePoints: trade?.points,
      createdAt: img.createdAt,
    };
  });
}

/**
 * Análise opcional manual via Vision AI (Disparada apenas se o usuário clicar no botão de IA)
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
