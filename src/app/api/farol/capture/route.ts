import { NextRequest, NextResponse } from 'next/server';
import { captureFarolMarket } from '@/lib/farol-playwright';
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

    console.log(`[API /api/farol/capture] Iniciando captura Playwright para ${dateStr}...`);
    const result = await captureFarolMarket({ date: dateStr });

    try {
      revalidatePath('/');
      revalidatePath('/diario');
      revalidatePath('/database');
    } catch {}

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API /api/farol/capture] Erro:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Falha ao executar captura do Farol do Mercado' },
      { status: 500 }
    );
  }
}
