import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

/**
 * Retorna o caminho executável do FFmpeg
 */
function getFFmpegBinary(): string {
  if (!ffmpegPath) {
    throw new Error('Executável do FFmpeg não encontrado em ffmpeg-static.');
  }
  return ffmpegPath;
}

/**
 * Parseia o nome do arquivo OBS para extrair a data/hora de início da gravação.
 * Formato OBS padrão: "2026-07-03 18-15-57.mp4" ou "2026-07-03_18-15-57.mp4"
 * Retorna: { date: "2026-07-03", startTime: "18:15:57", startDate: Date }
 */
export function parseOBSFilename(filename: string): {
  date: string;
  startTime: string;
  startDate: Date;
} | null {
  const basename = path.basename(filename, path.extname(filename));
  // Tenta formato OBS: "2026-07-03 18-15-57" ou "2026-07-03_18-15-57"
  const match = basename.match(/^(\d{4}-\d{2}-\d{2})[\s_]+(\d{2})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, date, h, m, s] = match;
    return {
      date,
      startTime: `${h}:${m}:${s}`,
      startDate: new Date(`${date}T${h}:${m}:${s}`),
    };
  }
  return null;
}

/**
 * Calcula o offset em segundos dentro do vídeo para um horário de trade.
 * Ex: vídeo começou às 18:15:57, trade abriu às 18:20:00 → offset = 243s
 */
export function calculateVideoOffset(
  recordingStartTime: string, // "18:15:57" ou "08:55:00"
  tradeTime: string // "09:12:30" ou "05/08/2026 09:12:30"
): number {
  const timePart = tradeTime.includes(' ')
    ? tradeTime.split(' ').pop()!
    : tradeTime;

  const [rh, rm, rs] = recordingStartTime.split(':').map(Number);
  const [th, tm, ts] = timePart.split(':').map(Number);

  const recordingSecs = rh * 3600 + rm * 60 + (rs || 0);
  const tradeSecs = th * 3600 + tm * 60 + (ts || 0);

  return tradeSecs - recordingSecs;
}

/**
 * Obtém informações do vídeo (duração em segundos, largura e altura) executando ffmpeg -i
 */
export async function getVideoInfo(videoPath: string): Promise<{
  duration: number;
  width: number;
  height: number;
}> {
  const ffmpeg = getFFmpegBinary();
  let stderr = '';

  try {
    await execFileAsync(ffmpeg, ['-i', videoPath]);
  } catch (err: any) {
    stderr = err.stderr || err.stdout || '';
  }

  // Parseia Duração: 00:15:30.12
  let duration = 0;
  const durationMatch = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d+)/);
  if (durationMatch) {
    const [, h, m, s, ms] = durationMatch;
    duration = parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseFloat(`0.${ms}`);
  }

  // Parseia Resolução: 1920x1080
  let width = 1920;
  let height = 1080;
  const resolutionMatch = stderr.match(/,\s*(\d{3,4})x(\d{3,4})[\s,]/);
  if (resolutionMatch) {
    width = parseInt(resolutionMatch[1], 10);
    height = parseInt(resolutionMatch[2], 10);
  }

  return { duration, width, height };
}

/**
 * Extrai um frame do vídeo em um timestamp específico (em segundos)
 */
export async function extractFrame(
  videoPath: string,
  offsetSeconds: number,
  outputPath: string
): Promise<string> {
  const ffmpeg = getFFmpegBinary();
  const safeOffset = Math.max(0, offsetSeconds);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await execFileAsync(ffmpeg, [
    '-ss', safeOffset.toString(),
    '-i', videoPath,
    '-vframes', '1',
    '-q:v', '2',
    '-y',
    outputPath,
  ]);

  return outputPath;
}

/**
 * Extrai múltiplos frames para cada trade baseado nos horários.
 * Para cada trade, extrai: 30s antes da entrada, no momento da entrada, e na saída.
 */
export async function extractTradeFrames(
  videoPath: string,
  recordingStartTime: string,
  trades: { id: string; openTime: string; closeTime?: string; tradeNumber: number }[],
  outputDir: string
): Promise<{
  tradeId: string;
  tradeNumber: number;
  frames: { type: 'before' | 'entry' | 'exit'; path: string; offsetSecs: number }[];
}[]> {
  const videoInfo = await getVideoInfo(videoPath);
  const results = [];

  for (const trade of trades) {
    const entryOffset = calculateVideoOffset(recordingStartTime, trade.openTime);

    // Se o offset estiver totalmente fora do vídeo, pula ou ajusta
    if (videoInfo.duration > 0 && (entryOffset < -60 || entryOffset > videoInfo.duration + 60)) {
      console.log(`[Video] Trade #${trade.tradeNumber} (${trade.openTime}) fora do tempo do vídeo (offset: ${entryOffset}s, vídeo: ${videoInfo.duration}s)`);
      continue;
    }

    const frames: { type: 'before' | 'entry' | 'exit'; path: string; offsetSecs: number }[] = [];

    // 1) 30s antes da entrada
    const beforeOffset = Math.max(0, entryOffset - 30);
    const beforePath = path.join(outputDir, `trade_${trade.tradeNumber}_before.png`);
    try {
      await extractFrame(videoPath, beforeOffset, beforePath);
      frames.push({ type: 'before', path: beforePath, offsetSecs: beforeOffset });
      console.log(`[Video] Trade #${trade.tradeNumber} - 30s antes (${beforeOffset}s) extraído`);
    } catch (err) {
      console.error(`[Video] Erro frame 30s antes trade #${trade.tradeNumber}:`, err);
    }

    // 2) Momento da entrada
    const entryPath = path.join(outputDir, `trade_${trade.tradeNumber}_entry.png`);
    try {
      await extractFrame(videoPath, Math.max(0, entryOffset), entryPath);
      frames.push({ type: 'entry', path: entryPath, offsetSecs: Math.max(0, entryOffset) });
      console.log(`[Video] Trade #${trade.tradeNumber} - entrada (${entryOffset}s) extraído`);
    } catch (err) {
      console.error(`[Video] Erro frame entrada trade #${trade.tradeNumber}:`, err);
    }

    // 3) Momento da saída (se existir)
    if (trade.closeTime) {
      const exitOffset = calculateVideoOffset(recordingStartTime, trade.closeTime);
      if (exitOffset >= 0 && (videoInfo.duration === 0 || exitOffset <= videoInfo.duration + 10)) {
        const exitPath = path.join(outputDir, `trade_${trade.tradeNumber}_exit.png`);
        try {
          await extractFrame(videoPath, exitOffset, exitPath);
          frames.push({ type: 'exit', path: exitPath, offsetSecs: exitOffset });
          console.log(`[Video] Trade #${trade.tradeNumber} - saída (${exitOffset}s) extraído`);
        } catch (err) {
          console.error(`[Video] Erro frame saída trade #${trade.tradeNumber}:`, err);
        }
      }
    }

    if (frames.length > 0) {
      results.push({ tradeId: trade.id, tradeNumber: trade.tradeNumber, frames });
    }
  }

  return results;
}

/**
 * Extrai a faixa de áudio de um vídeo e salva como MP3
 */
export async function extractAudioFromVideo(
  videoPath: string,
  outputPath: string
): Promise<string> {
  const ffmpeg = getFFmpegBinary();
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await execFileAsync(ffmpeg, [
    '-i', videoPath,
    '-vn',
    '-af', 'loudnorm',
    '-acodec', 'libmp3lame',
    '-q:a', '2',
    '-y',
    outputPath,
  ]);

  return outputPath;
}

