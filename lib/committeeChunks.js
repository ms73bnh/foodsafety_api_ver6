import crypto from 'node:crypto';

export const CHUNK_VERSION = 2;
export const CHUNK_TARGET_SIZE = 450;
export const CHUNK_MIN_SIZE = 180;
export const CHUNK_MAX_SIZE = 600;
export const CHUNK_OVERLAP = 75;

export function normalizeChunkText(text = '') {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n[ ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitLongUnit(unit, maxSize) {
  const parts = [];
  let rest = unit.trim();
  while (rest.length > maxSize) {
    let cut = rest.lastIndexOf(' ', maxSize);
    if (cut < Math.floor(maxSize * 0.65)) cut = maxSize;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function semanticUnits(text, maxSize) {
  const paragraphs = normalizeChunkText(text).split(/\n{2,}/).filter(Boolean);
  const units = [];

  for (const paragraph of paragraphs) {
    const lines = paragraph.split(/\n+/).map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
      const sentences = line
        .split(/(?<=[.!?。！？])\s+|(?<=다\.|함\.|음\.)\s*/)
        .map(sentence => sentence.trim())
        .filter(Boolean);
      for (const sentence of sentences.length ? sentences : [line]) {
        units.push(...splitLongUnit(sentence, maxSize));
      }
    }
  }
  return units;
}

function overlapTail(text, overlap) {
  if (!text || overlap <= 0) return '';
  const rawTail = text.slice(-overlap);
  const firstSpace = rawTail.indexOf(' ');
  return (firstSpace >= 0 ? rawTail.slice(firstSpace + 1) : rawTail).trim();
}

export function splitIntoSemanticChunks(text, {
  targetSize = CHUNK_TARGET_SIZE,
  minSize = CHUNK_MIN_SIZE,
  maxSize = CHUNK_MAX_SIZE,
  overlap = CHUNK_OVERLAP,
} = {}) {
  const cleanText = normalizeChunkText(text);
  if (!cleanText) return [];
  if (cleanText.length <= maxSize) return [cleanText];

  const units = semanticUnits(cleanText, maxSize);
  const baseChunks = [];
  let current = '';

  for (const unit of units) {
    const candidate = current ? `${current}\n${unit}` : unit;
    if (current && candidate.length > maxSize && current.length >= minSize) {
      baseChunks.push(current.trim());
      current = unit;
      continue;
    }
    current = candidate;
    if (current.length >= targetSize) {
      baseChunks.push(current.trim());
      current = '';
    }
  }

  if (current) {
    if (baseChunks.length > 0 && current.length < minSize && baseChunks.at(-1).length + current.length + 1 <= maxSize) {
      baseChunks[baseChunks.length - 1] = `${baseChunks.at(-1)}\n${current}`;
    } else {
      baseChunks.push(current.trim());
    }
  }

  return baseChunks.map((chunk, index) => {
    if (index === 0) return chunk;
    const tail = overlapTail(baseChunks[index - 1], overlap);
    return tail ? `${tail}\n${chunk}`.slice(0, maxSize) : chunk;
  });
}

export function chunkContentHash(content = '') {
  const normalized = normalizeChunkText(content).replace(/\s+/g, ' ').toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

