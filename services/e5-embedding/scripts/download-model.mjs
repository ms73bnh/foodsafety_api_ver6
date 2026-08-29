import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
const REPOSITORY = 'Xenova/multilingual-e5-small';
const MODEL_ROOT = path.join(process.cwd(), 'models', REPOSITORY);
const files = [
  ['config.json'],
  ['quant_config.json'],
  ['sentencepiece.bpe.model'],
  ['special_tokens_map.json'],
  ['tokenizer.json'],
  ['tokenizer_config.json'],
  ['onnx/model_int8.onnx', '4d24e2bc01a447951524466ef533e52944bf48509e6552810bcee1a2711cb02c'],
];

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function download(relativePath, expectedHash) {
  const destination = path.join(MODEL_ROOT, ...relativePath.split('/'));
  try {
    await access(destination);
    if (!expectedHash || await sha256(destination) === expectedHash) return;
  } catch {}

  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.download`;
  await rm(temporary, { force: true });
  const url = `https://huggingface.co/${REPOSITORY}/resolve/${REVISION}/${relativePath}?download=true`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`${relativePath} 다운로드 실패: HTTP ${response.status}`);
  await writeFile(temporary, response.body);
  if (expectedHash && await sha256(temporary) !== expectedHash) {
    await rm(temporary, { force: true });
    throw new Error(`${relativePath} SHA-256 검증 실패`);
  }
  await rename(temporary, destination);
}

for (const [relativePath, expectedHash] of files) {
  await download(relativePath, expectedHash);
}
console.log(`E5 model ready: ${MODEL_ROOT}`);
