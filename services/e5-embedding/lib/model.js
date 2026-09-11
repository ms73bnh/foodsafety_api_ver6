import os from 'node:os';
import path from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

export const MODEL_ID = 'Xenova/multilingual-e5-small';
export const MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
export const MODEL_DIMENSIONS = 384;
export const MAX_BATCH_SIZE = 16;
export const MAX_TEXT_LENGTH = 6000;

const MODEL_CACHE_DIR = path.join(os.tmpdir(), 'e5-transformers-cache');
const pipelineState = globalThis.__e5PipelineState || {
  status: 'idle',
  startedAt: null,
  readyAt: null,
};
globalThis.__e5PipelineState = pipelineState;

// Vercel Function의 번들에 대용량 모델을 포함하지 않고, 첫 추론 시 Hugging Face에서
// 다운로드한 뒤 인스턴스의 쓰기 가능한 /tmp 공간에 캐시합니다.
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useFSCache = true;
env.cacheDir = MODEL_CACHE_DIR;

export function getModelStatus() {
  return {
    mode: 'remote-cache',
    status: pipelineState.status,
    loaded: pipelineState.status === 'ready',
    startedAt: pipelineState.startedAt,
    readyAt: pipelineState.readyAt,
  };
}

function getExtractor() {
  if (!globalThis.__e5PipelinePromise) {
    pipelineState.status = 'loading';
    pipelineState.startedAt = new Date().toISOString();
    pipelineState.readyAt = null;
    const startedAt = Date.now();
    console.log('[e5] pipeline initialization started', {
      model: MODEL_ID,
      revision: MODEL_REVISION,
      cacheMode: 'remote-tmp',
    });
    globalThis.__e5PipelinePromise = pipeline(
      'feature-extraction',
      MODEL_ID,
      { dtype: 'int8', revision: MODEL_REVISION },
    ).then(extractor => {
      pipelineState.status = 'ready';
      pipelineState.readyAt = new Date().toISOString();
      console.log('[e5] pipeline initialization completed', {
        model: MODEL_ID,
        durationMs: Date.now() - startedAt,
      });
      return extractor;
    }).catch(error => {
      pipelineState.status = 'failed';
      pipelineState.readyAt = null;
      globalThis.__e5PipelinePromise = undefined;
      console.error('[e5] pipeline initialization failed', {
        model: MODEL_ID,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });
  }
  return globalThis.__e5PipelinePromise;
}

export async function tokenCounts(texts, inputType) {
  const extractor = await getExtractor();
  const prefix = inputType === 'query' ? 'query: ' : 'passage: ';
  return texts.map(text => extractor.tokenizer.encode(`${prefix}${String(text).trim().replace(/\s+/g, ' ')}`).length);
}

export async function embedTexts(texts, inputType, { strictTokens = false } = {}) {
  const prefix = inputType === 'query' ? 'query: ' : 'passage: ';
  if (strictTokens && (await tokenCounts(texts, inputType)).some(count => count > 512)) {
    throw new Error('E5_TOKEN_LIMIT: 512토큰 초과 입력은 분할 후 재요청해야 합니다.');
  }
  const prepared = texts.map(text => `${prefix}${String(text).trim().replace(/\s+/g, ' ')}`);
  const extractor = await getExtractor();
  const output = await extractor(prepared, { pooling: 'mean', normalize: true });
  const vectors = output.tolist();
  if (!Array.isArray(vectors) || vectors.length !== prepared.length) {
    throw new Error('임베딩 응답 개수가 요청과 일치하지 않습니다.');
  }
  if (vectors.some(vector => !Array.isArray(vector) || vector.length !== MODEL_DIMENSIONS)) {
    throw new Error(`임베딩 차원이 ${MODEL_DIMENSIONS}이 아닙니다.`);
  }
  return vectors;
}
