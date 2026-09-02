import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'login_farol.ts');
    
    // Spawns detached so it doesn't block the API response
    const child = spawn('npx', ['tsx', scriptPath], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
    child.unref();

    return NextResponse.json({
      success: true,
      message: 'Janela do Google Chrome aberta para login. Após entrar no site, a sessão será salva.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Falha ao abrir janela de login' },
      { status: 500 }
    );
  }
}
