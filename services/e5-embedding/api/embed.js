import {
  MAX_BATCH_SIZE,
  MODEL_DIMENSIONS,
  MODEL_ID,
  MODEL_REVISION,
  embedTexts,
  getModelStatus,
} from '../lib/model.js';

function isAuthorized(request) {
  const expected = process.env.E5_API_KEY;
  if (!expected) return false;
  return request.headers.authorization === `Bearer ${expected}`;
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    const modelStatus = getModelStatus();
    return response.status(200).json({
      ok: true,
      model: MODEL_ID,
      revision: MODEL_REVISION,
      dtype: 'int8',
      dimensions: MODEL_DIMENSIONS,
      ...modelStatus,
    });
  }
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(request)) return response.status(401).json({ error: 'Unauthorized' });

  const texts = Array.isArray(request.body?.texts) ? request.body.texts : [];
  const inputType = request.body?.inputType === 'query' ? 'query' : 'document';
  if (texts.length < 1 || texts.length > MAX_BATCH_SIZE || texts.some(text => typeof text !== 'string' || !text.trim())) {
    return response.status(400).json({ error: `texts는 1~${MAX_BATCH_SIZE}개의 비어 있지 않은 문자열이어야 합니다.` });
  }

  try {
    const startedAt = Date.now();
    const embeddings = await embedTexts(texts, inputType);
    return response.status(200).json({
      model: MODEL_ID,
      dtype: 'int8',
      dimensions: MODEL_DIMENSIONS,
      count: embeddings.length,
      elapsedMs: Date.now() - startedAt,
      embeddings,
    });
  } catch (error) {
    console.error('E5 embedding failed:', error);
    return response.status(500).json({ error: 'Embedding failed', detail: error.message });
  }
}
