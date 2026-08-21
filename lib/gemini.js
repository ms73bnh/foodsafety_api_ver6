import { GoogleGenerativeAI } from '@google/generative-ai';

function getGenAI() {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }
  return new GoogleGenerativeAI(key);
}

/**
 * 텍스트를 3072차원 또는 768차원 벡터 임베딩으로 변환 (Google Gemini gemini-embedding-001)
 */
export async function getEmbedding(text = '') {
  const cleanText = String(text || '').trim().replace(/\s+/g, ' ').substring(0, 2048);
  if (!cleanText) return [];

  const genAI = getGenAI();
  try {
    const embedModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const result = await embedModel.embedContent(cleanText);
    return result.embedding.values || [];
  } catch (err) {
    try {
      const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-embedding-2' });
      const result = await fallbackModel.embedContent(cleanText);
      return result.embedding.values || [];
    } catch (e) {
      console.warn('Embedding error (skipping vector scoring):', e.message);
      return [];
    }
  }
}

/**
 * 두 벡터 간 코사인 유사도 계산 (-1.0 ~ 1.0)
 */
export function cosineSimilarity(vecA = [], vecB = []) {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Gemini 생성 모델 인스턴스 반환 (Gemini 3.6 Flash 기본)
 */
export function getGeminiModel(modelName = 'gemini-3.6-flash') {
  const genAI = getGenAI();
  return genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    }
  });
}

