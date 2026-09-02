import { chromium, type BrowserContext } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { db } from './db';
import { tradingDays, tradeImages } from './db/schema';
import { generateId, todayISO } from './utils';
import { eq } from 'drizzle-orm';

export interface FarolCaptureResult {
  success: boolean;
  date: string;
  time: string;
  images: {
    briefing?: string;
    gps?: string;
    radar?: string;
  };
  extractedData: {
    bias?: string;
    keyLevels?: string;
    news?: string;
    insights?: string;
    winBias?: string;
    wdoBias?: string;
    scenarioWeight?: string;
    probableRange?: string;
    suggestedStop?: string;
  };
  error?: string;
}

const SIDEBAR_HIDE_CSS = `
  /* Oculta a barra lateral esquerda fixa sem quebrar layout */
  aside,
  [data-sidebar="sidebar"],
  div.border-r.w-64.fixed,
  div[class*="w-64"][class*="fixed"] {
    display: none !important;
    visibility: hidden !important;
    width: 0 !important;
  }

  /* Expande o container principal para 100% da tela */
  main,
  [data-sidebar="inset"],
  .flex-1 {
    margin-left: 0 !important;
    padding-left: 16px !important;
    padding-right: 16px !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  /* Oculta o rodapé */
  footer {
    display: none !important;
  }
`;

/**
 * Executa automação Playwright para capturar as 3 abas oficiais do Farol do Mercado de forma ACUMULATIVA:
 * 1. Briefing de Mercado (https://www.faroldomercado.com/farol)
 * 2. GPS de Mercado (Página Completa / Ultra Full em imagem única com scroll contínuo)
 * 3. Radar & Tickers (https://www.faroldomercado.com/dashboard)
 */
export async function captureFarolMarket({
  date = todayISO(),
  headless = true,
}: {
  date?: string;
  headless?: boolean;
} = {}): Promise<FarolCaptureResult> {
  const imagesDir = path.join(process.cwd(), 'data', 'images', date, 'farol');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const profileDir = path.join(process.cwd(), 'data', 'playwright_profile');
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  let day = await db.query.tradingDays.findFirst({
    where: eq(tradingDays.date, date),
  });

  if (!day) {
    const newDayId = generateId();
    await db.insert(tradingDays).values({
      id: newDayId,
      date,
    });
    day = await db.query.tradingDays.findFirst({
      where: eq(tradingDays.date, date),
    });
  }

  const now = new Date();
  const timeHHMMSS = now.toTimeString().split(' ')[0].replace(/:/g, '');
  const timeFormatted = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const fileTimeSuffix = `${date}_${timeHHMMSS}`;

  const result: FarolCaptureResult = {
    success: false,
    date,
    time: timeFormatted,
    images: {},
    extractedData: {},
  };

  let context: BrowserContext | null = null;
  try {
    console.log(`[Farol Playwright] Iniciando captura limpa às ${timeFormatted} para ${date}...`);

    try {
      context = await chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        headless,
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });
    } catch {
      context = await chromium.launchPersistentContext(profileDir, {
        headless,
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });
    }

    // ─────────────────────────────────────────────────────────
    // 1. ABA BRIEFING DE MERCADO
    // ─────────────────────────────────────────────────────────
    console.log('[Farol Playwright] 1/3 Capturando Briefing...');
    try {
      const page1 = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
      await page1.goto('https://www.faroldomercado.com/farol', {
        waitUntil: 'networkidle',
        timeout: 35000,
      });
      await page1.waitForTimeout(3000);

      try {
        const cookieBtn = page1.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
        if (await cookieBtn.isVisible({ timeout: 1500 })) await cookieBtn.click();
      } catch {}

      await page1.addStyleTag({ content: SIDEBAR_HIDE_CSS });
      await page1.waitForTimeout(500);

      const briefingFileName = `farol_briefing_${fileTimeSuffix}.png`;
      const briefingPath = path.join(imagesDir, briefingFileName);
      await page1.screenshot({ path: briefingPath, fullPage: true });
      result.images.briefing = `images/${date}/farol/${briefingFileName}`;
      console.log(`[Farol Playwright] ✓ Briefing salvo (${fs.statSync(briefingPath).size} bytes)`);
      await page1.close();
    } catch (err: any) {
      console.error('[Farol Playwright] Erro no Briefing:', err.message);
    }

    // ─────────────────────────────────────────────────────────
    // 2. ABA GPS DE MERCADO (Página Limpa Dedicada)
    // ─────────────────────────────────────────────────────────
    console.log('[Farol Playwright] 2/3 Capturando GPS de Mercado em página limpa...');
    try {
      const page2 = await context.newPage();
      await page2.goto('https://www.faroldomercado.com/farol', {
        waitUntil: 'networkidle',
        timeout: 35000,
      });
      await page2.waitForTimeout(3000);

      try {
        const cookieBtn = page2.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
        if (await cookieBtn.isVisible({ timeout: 1500 })) await cookieBtn.click();
      } catch {}

      // Clica no botão GPS de Mercado
      const gpsBtn = page2.locator('button:has-text("GPS de Mercado"), [role="tab"]:has-text("GPS")').first();
      await gpsBtn.click();
      await page2.waitForTimeout(4000); // Aguarda renderizar todas as tabelas do GPS

      await page2.addStyleTag({ content: SIDEBAR_HIDE_CSS });
      await page2.waitForTimeout(500);

      const gpsFileName = `farol_gps_${fileTimeSuffix}.png`;
      const gpsPath = path.join(imagesDir, gpsFileName);
      await page2.screenshot({ path: gpsPath, fullPage: true });
      result.images.gps = `images/${date}/farol/${gpsFileName}`;
      console.log(`[Farol Playwright] ✓ GPS Completo salvo (${fs.statSync(gpsPath).size} bytes)`);

      // Extração de dados textuais do GPS
      try {
        const pageText = await page2.evaluate(() => document.body.innerText || '');
        if (pageText) {
          const winMatch = pageText.match(/Viés WIN[^\n]*\n*([^\n]+)/i) || pageText.match(/WIN[^\n]*\n*([^\n]+)/i);
          const rangeMatch = pageText.match(/Range[^\n]*\n*([0-9.,\s-]+pts?)/i) || pageText.match(/([0-9]{3}\.[0-9]{3}\s*(?:a|à|-)\s*[0-9]{3}\.[0-9]{3})/);
          const stopMatch = pageText.match(/Stop[^\n]*\n*([0-9.,\s-]+pts?)/i);

          if (winMatch) result.extractedData.winBias = winMatch[1]?.trim();
          if (rangeMatch) result.extractedData.probableRange = rangeMatch[1]?.trim();
          if (stopMatch) result.extractedData.suggestedStop = stopMatch[1]?.trim();
        }
      } catch (err) {
        console.warn('[Farol Playwright] Aviso na extração de texto do GPS:', err);
      }
      await page2.close();
    } catch (err: any) {
      console.error('[Farol Playwright] Erro no GPS:', err.message);
    }

    // ─────────────────────────────────────────────────────────
    // 3. RADAR & TICKERS (https://www.faroldomercado.com/dashboard)
    // ─────────────────────────────────────────────────────────
    console.log('[Farol Playwright] 3/3 Capturando Radar em página limpa...');
    try {
      const page3 = await context.newPage();
      await page3.goto('https://www.faroldomercado.com/dashboard', {
        waitUntil: 'networkidle',
        timeout: 35000,
      });
      await page3.waitForTimeout(4000);

      try {
        const cookieBtn = page3.locator('button:has-text("OK, entendi"), button:has-text("Aceitar")').first();
        if (await cookieBtn.isVisible({ timeout: 1500 })) await cookieBtn.click();
      } catch {}

      await page3.addStyleTag({ content: SIDEBAR_HIDE_CSS });
      await page3.waitForTimeout(500);

      const radarFileName = `farol_radar_${fileTimeSuffix}.png`;
      const radarPath = path.join(imagesDir, radarFileName);
      await page3.screenshot({ path: radarPath, fullPage: true });
      result.images.radar = `images/${date}/farol/${radarFileName}`;
      console.log(`[Farol Playwright] ✓ Radar salvo (${fs.statSync(radarPath).size} bytes)`);

      try {
        const dashText = await page3.evaluate(() => document.body.innerText || '');
        if (dashText) {
          result.extractedData.news = dashText.slice(0, 1000);
        }
      } catch {}
      await page3.close();
    } catch (err: any) {
      console.error('[Farol Playwright] Erro no Radar:', err.message);
    }

    await context.close();
    context = null;

    // ─────────────────────────────────────────────────────────
    // 4. ATUALIZAÇÃO NO BANCO SQLITE (Acumulativa por Horário)
    // ─────────────────────────────────────────────────────────
    if (day) {
      const imageEntries = [
        { key: 'briefing', type: 'farol-briefing', caption: `Briefing de Mercado (${timeFormatted})`, file: result.images.briefing },
        { key: 'gps', type: 'farol-gps', caption: `GPS de Mercado (${timeFormatted})`, file: result.images.gps },
        { key: 'radar', type: 'farol-radar', caption: `Radar & Tickers (${timeFormatted})`, file: result.images.radar },
      ];

      const batchCreatedAt = new Date().toISOString();
      for (const item of imageEntries) {
        if (item.file) {
          await db.insert(tradeImages).values({
            id: generateId(),
            tradingDayId: day.id,
            filePath: item.file,
            imageType: item.type,
            caption: item.caption,
            createdAt: batchCreatedAt,
          });
        }
      }

      if (result.extractedData.probableRange || result.extractedData.winBias) {
        const farolBiasStr = result.extractedData.winBias
          ? `Farol: ${result.extractedData.winBias}`
          : day.farolBias;

        const farolLevelsStr = result.extractedData.probableRange
          ? `Range: ${result.extractedData.probableRange}${result.extractedData.suggestedStop ? ` | Stop: ${result.extractedData.suggestedStop}` : ''}`
          : day.farolKeyLevels;

        await db.update(tradingDays).set({
          farolBias: farolBiasStr || day.farolBias,
          farolKeyLevels: farolLevelsStr || day.farolKeyLevels,
          preMarketDone: true,
          updatedAt: new Date().toISOString(),
        }).where(eq(tradingDays.id, day.id));
      }
    }

    result.success = Boolean(result.images.briefing || result.images.gps || result.images.radar);
    return result;
  } catch (error: any) {
    console.error('[Farol Playwright] Erro fatal:', error);
    try {
      if (context) await (context as any).close();
    } catch {}
    result.error = error?.message || String(error);
    return result;
  }
}
