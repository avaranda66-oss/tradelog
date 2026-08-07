import { GoogleGenAI } from '@google/genai';

const API_KEY = process.env.GEMINI_API_KEY!;
const ai = new GoogleGenAI({ apiKey: API_KEY });

async function test() {
  console.log('Testing Gemini API key and model names...');
  const testModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-2.0-flash-exp'];

  for (const m of testModels) {
    try {
      const res = await ai.models.generateContent({
        model: m,
        contents: 'Olá',
      });
      console.log(`✅ SUCESSO com modelo ${m}:`, res.text?.slice(0, 30));
      return m;
    } catch (err: any) {
      console.log(`❌ Erro no modelo ${m}:`, err.message || err);
    }
  }
}

test().catch(console.error);
