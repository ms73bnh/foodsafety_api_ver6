import { GoogleGenAI } from '@google/genai';

function getGenAI() {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  return new GoogleGenAI({ apiKey: key });
}

export async function getEmbedding(text = '') {
  const cleanText = String(text || '').trim().replace(/\s+/g, ' ').substring(0, 2048);
  if (!cleanText) return [];
  const ai = getGenAI();
  try {
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: cleanText,
    });
    return result.embeddings?.[0]?.values || [];
  } catch (err) {
    console.warn('Embedding error (skipping vector scoring):', err.message);
    return [];
  }
}

export function cosineSimilarity(vecA = [], vecB = []) {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  const len = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function streamGeminiResponse(prompt) {
  const ai = getGenAI();
  const candidateModels = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.1-flash-lite'];
  let lastErr = null;
  for (const model of candidateModels) {
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: prompt,
        config: { temperature: 0.3, maxOutputTokens: 1024 },
      });
      return stream;
    } catch (err) {
      lastErr = err;
      console.warn(`Model ${model} failed:`, err.message);
    }
  }
  throw new Error(`AI 답변 생성 실패: ${lastErr?.message}`);
}
