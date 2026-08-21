import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

/**
 * 텍스트를 768차원 벡터 임베딩으로 변환 (Google Gemini 무료 text-embedding-004)
 */
export async function getEmbedding(text = '') {
  if (!genAI) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  const cleanText = String(text || '').trim().replace(/\s+/g, ' ').substring(0, 2048);
  if (!cleanText) return [];

  const embedModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await embedModel.embedContent(cleanText);
  return result.embedding.values || [];
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
 * Gemini 생성 모델 인스턴스 반환 (Gemini 3.6 Flash)
 */
export function getGeminiModel() {
  if (!genAI) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }
  return genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    }
  });
}
