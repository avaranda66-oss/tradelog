import fs from 'node:fs';
import path from 'node:path';

const envContent = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf-8');
const match = envContent.match(/GEMINI_API_KEY=(.+)/);
const API_KEY = match ? match[1].trim() : '';

async function testRaw() {
  console.log('Testing raw REST API with key:', API_KEY);
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log('HTTP Status:', res.status);
  console.log('Response body:', JSON.stringify(data, null, 2));
}

testRaw().catch(console.error);
