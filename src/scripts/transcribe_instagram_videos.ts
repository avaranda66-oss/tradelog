import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';

function getApiKey(): string {
  const candidatePaths = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
    'd:\\estudos\\tradelog\\.env.local',
  ];

  for (const envPath of candidatePaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('GEMINI_API_KEY=')) {
            const parts = trimmed.split('=');
            const val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
            if (val && val.length > 20 && !val.includes('sua_chave')) {
              return val;
            }
          }
        }
      }
    } catch {}
  }
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

const API_KEY = getApiKey();
if (!API_KEY) {
  console.error('❌ ERRO: Nenhuma chave GEMINI_API_KEY ou GOOGLE_API_KEY encontrada em .env.local!');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

async function transcribeVideoFile(videoPath: string): Promise<string> {
  const fileBuffer = fs.readFileSync(videoPath);
  const base64Data = fileBuffer.toString('base64');
  const ext = path.extname(videoPath).toLowerCase();
  const mimeType = ext === '.mp4' ? 'video/mp4' : 'video/mp4';

  const prompt = `Você é um transcritor profissional de áudio sobre Mercado Financeiro e Opções da B3.
Sua tarefa é transcrever PALAVRA POR PALAVRA todo o áudio falado neste vídeo em português.
Regras:
1. Seja extremamente fiel à fala do autor. Transcreva frases completas, números, nomes de ativos (ex: PETR4, VALE3, B3), strikes, estratégias (Venda Coberta, Rolagem, Trava de Linha, Pozinho) e termos técnicos.
2. Formate o texto em parágrafos claros e legíveis.
3. Não resuma ou omita frases da fala. Forneça a transcrição na íntegra.`;

  console.log(`  🎙️ Enviando ${path.basename(videoPath)} (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB) para o Gemini AI...`);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt },
        ],
      },
    ],
    config: {
      maxOutputTokens: 16384,
    },
  });

  return response.text || '';
}

async function main() {
  const baseDir = path.join('d:', 'estudos', 'opcoes-knowledge');
  const profiles = ['cleberfflores', 'carvao_options'];

  console.log('==================================================');
  console.log('🎙️ MOTOR DE TRANSCRIÇÃO DE ÁUDIO DE VÍDEOS (GEMINI AI)');
  console.log('==================================================');

  for (const profile of profiles) {
    const profDir = path.join(baseDir, profile);
    if (!fs.existsSync(profDir)) {
      console.warn(`Pasta ${profDir} não encontrada, pulando...`);
      continue;
    }

    const files = fs.readdirSync(profDir).filter(f => f.endsWith('.mp4'));
    console.log(`\n📁 Perfil @${profile}: Encontrados ${files.length} vídeos para transcrição de áudio.\n`);

    const masterDocPath = path.join(profDir, 'ALL_AUDIO_TRANSCRIPTS.md');
    let masterMarkdown = `# TRANSCRIÇÃO DE ÁUDIO INTEGRAL DOS VÍDEOS - @${profile}\n\n`;
    masterMarkdown += `Documentação completa palavra por palavra do áudio falado nos vídeos.\n\n---\n\n`;

    let processedCount = 0;

    for (const file of files) {
      const videoPath = path.join(profDir, file);
      const transcriptPath = path.join(profDir, file.replace('.mp4', '.transcript.txt'));

      console.log(`[${processedCount + 1}/${files.length}] Processando: ${file}...`);

      let transcript = '';

      if (fs.existsSync(transcriptPath) && fs.statSync(transcriptPath).size > 20) {
        console.log(`  ✔ Transcrição prévia encontrada em cache (${transcriptPath})`);
        transcript = fs.readFileSync(transcriptPath, 'utf-8');
      } else {
        try {
          transcript = await transcribeVideoFile(videoPath);
          fs.writeFileSync(transcriptPath, transcript, 'utf-8');
          console.log(`  ✨ Transcrito com sucesso! (${transcript.length} caracteres)`);
        } catch (err: any) {
          console.error(`  ❌ Erro ao transcrever ${file}:`, err?.message || err);
          transcript = `[Erro ao transcrever áudio: ${err?.message || 'Falha na API'}]`;
        }
      }

      masterMarkdown += `### 🎥 Vídeo: \`${file}\`\n`;
      masterMarkdown += `**Arquivo:** [${file}](file:///${videoPath.replace(/\\/g, '/')})\n\n`;
      masterMarkdown += `#### 🗣️ Transcrição do Áudio:\n\n`;
      masterMarkdown += `${transcript.trim()}\n\n`;
      masterMarkdown += `---\n\n`;

      processedCount++;
    }

    fs.writeFileSync(masterDocPath, masterMarkdown, 'utf-8');
    console.log(`\n✨ Concluída transcrição do perfil @${profile}! Relatório salvo em: ${masterDocPath}`);
  }

  console.log('\n==================================================');
  console.log('✅ TODAS AS TRANSCRIÇÕES FORAM CONCLUÍDAS COM SUCESSO!');
  console.log('==================================================');
}

main().catch(console.error);
