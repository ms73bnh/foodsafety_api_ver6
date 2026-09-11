import { createHash } from 'node:crypto';

export const PIPELINE_VERSION = 3;
export const CATEGORIES = {
  agenda: '심의 안건', result: '심의 결과', supplementation: '보완 사유',
  condition: '검토 조건·기준', safety: '안전성', functionality: '기능성',
  attendance: '참석·회의 정보', table: '표', other: '기타 내용',
};
export const DOCUMENT_CATEGORIES = { body: '게시물 본문', minutes: '회의록', results: '심의결과', attachment: '기타 첨부' };
export const hash = text => createHash('sha256').update(text).digest('hex');
export function classifyDocument(name = '', sourceType = 'pdf') {
  if (sourceType === 'body') return 'body';
  if (/회의록|회의\s*내용/.test(name)) return 'minutes';
  if (/결과|심의/.test(name)) return 'results';
  return 'attachment';
}
export function classifyContent(text = '', kind = 'paragraph') {
  // Multi-label classification: a results table can retain both dimensions.
  const tags = [];
  if (/보완|추가\s*자료|재제출/.test(text)) tags.push('supplementation');
  if (/불인정|인정|의결|심의\s*결과/.test(text)) tags.push('result');
  if (/조건|기준|규격|섭취량|주의사항/.test(text)) tags.push('condition');
  if (/안전성|독성|이상\s*사례/.test(text)) tags.push('safety');
  if (/기능성|인체\s*적용/.test(text)) tags.push('functionality');
  if (/안건|신청\s*원료/.test(text)) tags.push('agenda');
  if (/참석|위원장|회의\s*일시|장소/.test(text)) tags.push('attendance');
  if (kind === 'table') tags.push('table');
  return tags.length ? tags : ['other'];
}
export const cell = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');
export const heading = value => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/[<>]/g, '').replace(/([\\`*_[\]])/g, '\\$1');
export function safeUrl(value) {
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href.replace(/\(/g, '%28').replace(/\)/g, '%29') : ''; } catch { return ''; }
}
export function tableMarkdown(headers, rows) {
  if (!Array.isArray(headers) || !headers.length || rows.some(row => row.length !== headers.length)) throw new Error('표의 열 개수가 일치하지 않습니다.');
  return [`| ${headers.map(cell).join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.map(cell).join(' | ')} |`)].join('\n');
}
export function blockMarkdown(block) {
  if (block.kind === 'table') return [block.title ? `**${heading(block.title)}**` : '', tableMarkdown(block.headers, block.rows)].filter(Boolean).join('\n\n');
  return block.kind === 'heading' ? `### ${heading(block.text)}` : String(block.text || '');
}

// Source offsets are contiguous, non-overlapping, and cover every character.
// Overlap is context only and is accounted for before constructing each chunk.
export function splitWithOffsets(text, maxSize = 320, overlap = 40) {
  if (maxSize <= overlap || overlap < 0) throw new Error('잘못된 청킹 설정');
  const output = [];
  let cursor = 0;
  while (cursor < text.length) {
    const contextStart = Math.max(0, cursor - overlap);
    let end = Math.min(text.length, contextStart + maxSize);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end - 1), text.lastIndexOf(' ', end - 1));
      if (boundary > cursor + (maxSize - overlap) / 2) end = boundary + 1;
    }
    output.push({ content: text.slice(contextStart, end), sourceStart: cursor, sourceEnd: end });
    cursor = end;
  }
  return output;
}

export function pageChunks(page, label) {
  const output = [];
  page.blocks.forEach((block, blockIndex) => {
    const markdown = blockMarkdown(block);
    const tags = classifyContent(markdown, block.kind);
    // Preserve complete tables in the document/export; embed row groups with repeated column labels.
    const units = block.kind === 'table'
      ? block.rows.map((row, i) => `${block.title || '표'} · 행 ${i + 1}\n${block.headers.map((h, col) => `${h || `열 ${col + 1}`}: ${row[col]}`).join('\n')}`)
      : [markdown];
    let offset = 0;
    for (const unit of units) {
      for (const part of splitWithOffsets(unit)) {
        output.push({ ...part, sourceStart: offset + part.sourceStart, sourceEnd: offset + part.sourceEnd,
          content: `${label}\n[${tags.map(tag => CATEGORIES[tag]).join(' · ')} / ${page.pageNumber}쪽]\n${part.content}`,
          category: tags[0], categories: tags, pageStart: page.pageNumber, pageEnd: page.pageNumber, blockIndex,
        });
      }
      offset += unit.length;
    }
  });
  return output;
}

export function exportMarkdown(meetings, documents, chunks, { category = '', now = new Date(), sectionOnly = false } = {}) {
  const meetingMap = new Map(meetings.map(m => [m.id, m]));
  const lines = sectionOnly ? [] : ['# 건강기능식품심의위원회 · RAG 자료집', '', `생성일: ${now.toISOString().slice(0, 10)}  `,
    `게시물 ${meetings.length}건 · 문서 ${documents.length}건 · 청크 ${chunks.length}개`, '',
    '> 공식 원문에서 추출한 검색 자료입니다. OCR 검토 상태와 원문 출처를 함께 확인하세요. 자동 분류는 법적 판단이나 확정 심의 결과를 의미하지 않습니다.', '', '## 목차', ''];
  if (!sectionOnly) documents.forEach((doc, i) => lines.push(`${i + 1}. [${heading(doc.fileName)}](#document-${doc.id})`));
  for (const doc of documents) {
    const meeting = meetingMap.get(doc.meetingId) || {};
    const selected = chunks.filter(c => c.documentId === doc.id && (!category || c.category === category || c.categories?.includes(category)));
    const link = safeUrl(doc.sourceUrl);
    lines.push('', '---', '', `<a id="document-${doc.id}"></a>`, '', `## ${heading(doc.fileName)}`, '',
      tableMarkdown(['항목', '내용'], [
        ['게시물', meeting.title || ''], ['회차', meeting.meetingNo || '-'], ['등록일', meeting.postDate || '-'],
        ['문서 분류', DOCUMENT_CATEGORIES[doc.category] || doc.category], ['처리 상태', doc.status],
        ['버전', doc.id], ['원본 SHA-256', doc.sourceHash], ['페이지 수', doc.pageCount], ['선택 청크 수', selected.length],
      ]), '', link ? `[원문 다운로드/게시물](${link})` : '원문 링크 없음', '');
    if (doc.error) lines.push(`> 처리 안내: ${heading(doc.error)}`, '');
    lines.push('### 페이지별 원문 · 표', '');
    for (const page of doc.pages || []) {
      if (category && !selected.some(c => c.pageStart === page.pageNumber)) continue;
      lines.push(`#### ${page.pageNumber}쪽 · ${page.extractionMethod} · ${page.status}`, '', page.markdown, '');
      if (page.warnings?.length) lines.push(`> 검토 사항: ${page.warnings.map(heading).join(' / ')}`, '');
    }
    lines.push('### 검색용 청크', '');
    const grouped = new Map();
    for (const chunk of selected) {
      if (!grouped.has(chunk.category)) grouped.set(chunk.category, []);
      grouped.get(chunk.category).push(chunk);
    }
    for (const [key, group] of grouped) {
      lines.push(`#### ${CATEGORIES[key] || key}`, '');
      for (const chunk of group) {
        const fence = '`'.repeat(Math.max(3, ...Array.from(chunk.content.matchAll(/`+/g), m => m[0].length + 1)));
        lines.push(`##### 청크 ${chunk.orderIndex + 1} · ${chunk.pageStart || '-'}쪽`, '',
          `- 청크 ID: ${chunk.id}`, `- 임베딩: ${chunk.embeddingStatus}`, `- 분류: ${CATEGORIES[chunk.category] || chunk.category}`, '',
          fence + 'text', chunk.content, fence, '');
      }
    }
  }
  const legacy = chunks.filter(c => !c.documentId);
  if (legacy.length) {
    lines.push('## 이전 방식으로 생성된 청크', '', '> 페이지 출처가 없는 기존 자료입니다. V3 재수집 후 파일·페이지 분류가 제공됩니다.', '');
    for (const chunk of legacy) lines.push(`### 청크 ${chunk.id} · ${heading(meetingMap.get(chunk.meetingId)?.title || '')}`, '', chunk.content, '');
  }
  return lines.join('\n') + '\n';
}
