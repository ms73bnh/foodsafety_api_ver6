import path from 'node:path';
import process from 'node:process';
import { access } from 'node:fs/promises';
import { env, pipeline } from '@huggingface/transformers';

export const MODEL_ID = 'Xenova/multilingual-e5-small';
export const MODEL_DIMENSIONS = 384;
export const MAX_BATCH_SIZE = 16;
export const MAX_TEXT_LENGTH = 6000;

env.localModelPath = path.join(process.cwd(), 'models');
env.allowRemoteModels = false;
env.useFSCache = false;

const REQUIRED_MODEL_FILES = [
  'config.json',
  'quant_config.json',
  'sentencepiece.bpe.model',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_int8.onnx',
];

export async function getModelFileStatus() {
  const modelRoot = path.join(env.localModelPath, MODEL_ID);
  const missingFiles = [];
  for (const relativePath of REQUIRED_MODEL_FILES) {
    try {
      await access(path.join(modelRoot, ...relativePath.split('/')));
    } catch {
      missingFiles.push(relativePath);
    }
  }
  return { ready: missingFiles.length === 0, missingFiles };
}

function getExtractor() {
  if (!globalThis.__e5PipelinePromise) {
    globalThis.__e5PipelinePromise = pipeline(
      'feature-extraction',
      MODEL_ID,
      { dtype: 'int8', local_files_only: true },
    );
  }
  return globalThis.__e5PipelinePromise;
}

export async function embedTexts(texts, inputType) {
  const fileStatus = await getModelFileStatus();
  if (!fileStatus.ready) {
    throw new Error(`E5 모델 파일 누락: ${fileStatus.missingFiles.join(', ')}`);
  }
  const prefix = inputType === 'query' ? 'query: ' : 'passage: ';
  const prepared = texts.map(text => `${prefix}${String(text).trim().replace(/\s+/g, ' ').slice(0, MAX_TEXT_LENGTH)}`);
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
