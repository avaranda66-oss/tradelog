import { GoogleGenAI } from '@google/genai';

const API_KEY = process.env.GEMINI_API_KEY!;
const ai = new GoogleGenAI({ apiKey: API_KEY });

async function listModels() {
  console.log('Listing available models for the configured GEMINI_API_KEY...');
  try {
    const list = await ai.models.list();
    console.log('Available models:');
    for await (const m of list) {
      console.log(`- ${m.name} (displayName: ${m.displayName})`);
    }
  } catch (err: any) {
    console.error('Error listing models:', err.message || err);
  }
}

listModels().catch(console.error);
