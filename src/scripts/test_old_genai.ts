import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs';
import path from 'node:path';

// Lê exatamente a chave do arquivo .env.local
const envContent = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf-8');
const match = envContent.match(/GEMINI_API_KEY=(.+)/);
const API_KEY = match ? match[1].trim() : '';

console.log('Chave lida do .env.local:', API_KEY);

const genAI = new GoogleGenerativeAI(API_KEY);

async function test() {
  const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro', 'gemini-2.0-flash'];

  for (const m of models) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const result = await model.generateContent('Olá');
      console.log(`✅ SUCESSO com @google/generative-ai (modelo ${m}):`, result.response.text());
      return;
    } catch (err: any) {
      console.log(`❌ Erro no modelo ${m}:`, err.message || err);
    }
  }
}

test().catch(console.error);
