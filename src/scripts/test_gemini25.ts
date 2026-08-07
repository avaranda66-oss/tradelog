import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';

const envContent = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf-8');
const match = envContent.match(/GEMINI_API_KEY=(.+)/);
const API_KEY = match ? match[1].trim() : '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

async function test25() {
  console.log('Testing gemini-2.5-flash model with key...');
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Olá! Responda se você está funcionando.',
    });
    console.log('✅ SUCESSO ABSOLUTO com gemini-2.5-flash:');
    console.log(res.text);
  } catch (err: any) {
    console.error('❌ Erro:', err.message || err);
  }
}

test25().catch(console.error);
