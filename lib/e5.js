export const EMBEDDING_MODEL = 'Xenova/multilingual-e5-small-int8';
const REMOTE_MODEL_ID = 'Xenova/multilingual-e5-small';
export const EMBEDDING_DIMENSIONS = 384;
export const EMBEDDING_BATCH_SIZE = 16;
const QUERY_CACHE_TTL_MS = 30 * 60 * 1000;
const QUERY_CACHE_MAX_ENTRIES = 200;

const queryCache = globalThis.__committeeE5QueryCache || new Map();
globalThis.__committeeE5QueryCache = queryCache;

function configuration() {
  const url = String(process.env.E5_EMBEDDING_URL || '').replace(/\/$/, '');
  const apiKey = process.env.E5_API_KEY || '';
  if (!url || !apiKey) throw new Error('E5_EMBEDDING_URL 또는 E5_API_KEY가 설정되지 않았습니다.');
  return { url, apiKey };
}

export async function getEmbeddings(texts = [], { inputType = 'document' } = {}) {
  if (!Array.isArray(texts) || texts.length < 1 || texts.length > EMBEDDING_BATCH_SIZE) {
    throw new Error(`임베딩 요청은 1~${EMBEDDING_BATCH_SIZE}개여야 합니다.`);
  }
  const { url, apiKey } = configuration();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ texts, inputType }),
    signal: AbortSignal.timeout(inputType === 'query' ? 90_000 : 240_000),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.detail || result.error || `E5 서버 오류: HTTP ${response.status}`);
  if (result.model !== REMOTE_MODEL_ID || result.dtype !== 'int8' || result.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error('E5 서버의 모델 또는 차원 정보가 일치하지 않습니다.');
  }
  if (!Array.isArray(result.embeddings) || result.embeddings.some(vector => vector.length !== EMBEDDING_DIMENSIONS)) {
    throw new Error('E5 서버가 올바르지 않은 임베딩을 반환했습니다.');
  }
  return result.embeddings;
}

export async function getQueryEmbedding(text = '') {
  const key = String(text).trim().replace(/\s+/g, ' ').toLowerCase();
  if (!key) return [];
  const now = Date.now();
  const cached = queryCache.get(key);
  if (cached && now - cached.createdAt < QUERY_CACHE_TTL_MS) return cached.vector;
  if (cached) queryCache.delete(key);

  const [vector] = await getEmbeddings([key], { inputType: 'query' });
  if (queryCache.size >= QUERY_CACHE_MAX_ENTRIES) queryCache.delete(queryCache.keys().next().value);
  queryCache.set(key, { vector, createdAt: now });
  return vector;
}

export function cosineSimilarity(vecA = [], vecB = []) {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0;
  for (let index = 0; index < vecA.length; index++) dot += vecA[index] * vecB[index];
  return dot;
}
