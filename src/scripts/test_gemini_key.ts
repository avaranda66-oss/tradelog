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
        console.log(`Checking ${envPath}...`);
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('GOOGLE_API_KEY=') || trimmed.startsWith('GEMINI_API_KEY=')) {
            const parts = trimmed.split('=');
            const keyName = parts[0];
            const val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
            console.log(`  Found ${keyName}: length=${val.length}, prefix=${val.slice(0, 8)}...`);
            if (val && val.length > 10 && !val.includes('sua_chave')) {
              return val;
            }
          }
        }
      }
    } catch (e: any) {
      console.error(`Error reading ${envPath}:`, e.message);
    }
  }
  return '';
}

async function testKey() {
  const key = getApiKey();
  console.log('Final Key selected length:', key.length);
  if (!key) {
    console.error('No key found!');
    return;
  }

  const ai = new GoogleGenAI({ apiKey: key });
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Diga "API OK"',
    });
    console.log('Response:', res.text);
  } catch (err: any) {
    console.error('API Error:', err?.message || err);
  }
}

testKey();
