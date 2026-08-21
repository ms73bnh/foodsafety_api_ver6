const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

// .env 파일에서 직접 키 추출
const envContent = fs.readFileSync('.env', 'utf-8');
const match = envContent.match(/GEMINI_API_KEY\s*=\s*(.+)/);
const key = match ? match[1].trim() : '';

console.log('API Key present:', !!key, 'Key prefix:', key ? key.substring(0, 8) + '...' : 'NONE');
console.log('Key length:', key.length);

const genAI = new GoogleGenerativeAI(key);

const models = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.5-flash-preview-05-20',
];

(async () => {
  // List available models
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const body = await resp.json();
    if (body.models) {
      console.log('\n=== Available generateContent models ===');
      body.models.forEach(mo => {
        if (mo.supportedGenerationMethods && mo.supportedGenerationMethods.includes('generateContent')) {
          console.log(' *', mo.name, '->', mo.displayName);
        }
      });
    } else {
      console.log('List models error:', JSON.stringify(body).substring(0, 300));
    }
  } catch (e) {
    console.log('Could not list models:', e.message);
  }

  console.log('\n=== Trying generateContent ===');
  for (const m of models) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const res = await model.generateContent('안녕');
      const t = res.response.text();
      console.log('[OK]', m, '->', t.substring(0, 60));
    } catch (e) {
      console.log('[FAIL]', m, '->', e.message);
    }
  }
  console.log('Done.');
})();
