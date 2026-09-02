import { NextRequest, NextResponse } from 'next/server';
import { analyzeFarolScreenshotsVision } from '@/lib/farol-vision';
import { todayISO } from '@/lib/utils';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let dateStr = todayISO();
    try {
      const body = await req.json();
      if (body.date) dateStr = body.date;
    } catch {}

    console.log(`[API /api/farol/analyze] Iniciando análise Gemini Vision para ${dateStr}...`);
    const analysis = await analyzeFarolScreenshotsVision(dateStr);

    try {
      revalidatePath('/');
      revalidatePath('/diario');
      revalidatePath('/database');
    } catch {}

    return NextResponse.json({
      success: true,
      date: dateStr,
      data: analysis,
    });
  } catch (error: any) {
    console.error('[API /api/farol/analyze] Erro:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Falha ao analisar screenshots do Farol do Mercado' },
      { status: 500 }
    );
  }
}
