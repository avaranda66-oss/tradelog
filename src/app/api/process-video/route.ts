import { NextResponse } from 'next/server';
import { processOBSVideoFromLocalPath } from '@/features/video/actions';

export const maxDuration = 300; // 5 minutos de timeout no Next.js

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { path: pathInput, date, startTime, extractAudio } = body;

    if (!pathInput) {
      return NextResponse.json({ error: 'Caminho do arquivo não informado' }, { status: 400 });
    }

    const cleanPath = String(pathInput).trim().replace(/^["']|["']$/g, '');

    const result = await processOBSVideoFromLocalPath({
      localFilePath: cleanPath,
      date,
      startTime,
      shouldExtractAudio: extractAudio !== false,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[API /api/process-video] Erro:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao processar vídeo local' },
      { status: 500 }
    );
  }
}
