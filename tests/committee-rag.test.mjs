import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { splitWithOffsets, pageChunks, tableMarkdown, exportMarkdown, classifyContent } from '../lib/committeeRag/format.mjs';
import { parseDetail, parseListing, assertSourceUrl, fetchSource } from '../lib/committeeRag/source.mjs';
import { validatePage, openPdf, extractPage } from '../lib/committeeRag/pdf.mjs';
import { claimJob, activateDocument } from '../lib/committeeRag/pipeline.mjs';
import { mergeRankings, searchChunks, evidenceReference } from '../lib/committeeRag/search.mjs';
import { splitIntoSemanticChunks } from '../lib/committeeChunks.js';

const table = { kind: 'table', title: '검토 결과', text: '', headers: ['원료명', '결과', '비고'], rows: [['원료 A', '보완', '안전성 자료 제출'], ['원료 B', '불인정', '기준 미충족']] };
const sourceUrl = 'https://www.mfds.go.kr/brd/m_532/view.do?seq=123';

test('legacy chunker preserves the previously lost final marker', () => {
  const input = 'A'.repeat(600) + '\n\n' + 'B'.repeat(590) + 'TAILMARKER';
  const chunks = splitIntoSemanticChunks(input);
  assert(chunks.some(c => c.includes('TAILMARKER')));
  assert(chunks.every(c => c.length <= 600));
  assert.equal(chunks.join('').match(/A/g).length >= 600, true);
});

test('source ranges cover every character including long Korean tokens and the final paragraph', () => {
  for (const input of ['보완사유'.repeat(1800) + '끝', 'a '.repeat(3000), '', 'X'.repeat(1001)]) {
    const chunks = splitWithOffsets(input);
    let cursor = 0;
    for (const c of chunks) { assert.equal(c.sourceStart, cursor); assert(c.sourceEnd > cursor); assert(c.content.length <= 320); cursor = c.sourceEnd; }
    assert.equal(cursor, input.length);
  }
  assert.throws(() => splitWithOffsets('text', 40, 40));
});

test('table headers, complete rows, multi-label classification, and page provenance survive chunking', () => {
  const page = { pageNumber: 12, blocks: [table] };
  const chunks = pageChunks(page, '제202차');
  assert.equal(chunks.length, 2);
  assert(chunks.every(c => c.categories.includes('table') && c.pageStart === 12));
  assert(chunks[0].content.includes('원료명: 원료 A'));
  assert(chunks[1].content.includes('결과: 불인정'));
  assert(classifyContent('불인정 및 보완 검토 조건', 'table').includes('condition'));
  assert.throws(() => tableMarkdown(['a', 'b'], [['c']]));
  assert(tableMarkdown(['항목'], [['a|b\n다음']]).includes('a&#124;b<br>다음'));
});

test('OCR rejects malformed tables, contradictory blank pages and empty nonblank output', () => {
  assert.throws(() => validatePage({ blank: false, warnings: [], blocks: [{ ...table, rows: [['x']] }] }));
  assert.throws(() => validatePage({ blank: true, warnings: [], blocks: [] }, '1'));
  assert.throws(() => validatePage({ blank: false, warnings: [], blocks: [] }));
  const result = validatePage({ blank: false, warnings: [], blocks: [table] }, '원료 A 보완 안전성 자료 제출 원료 B 불인정 기준 미충족');
  assert.equal(result.status, 'completed');
  assert(result.markdown.includes('| 원료 A | 보완 | 안전성 자료 제출 |'));
});

test('scanned text and omitted critical numbers require explicit review', () => {
  const blocks = [{ kind: 'paragraph', text: '하루 섭취량 기준' }];
  assert.equal(validatePage({ blank: false, warnings: [], blocks }).status, 'review');
  assert.equal(validatePage({ blank: false, warnings: [], blocks }, '하루 500 mg 섭취').status, 'review');
  assert.equal(validatePage({ blank: true, warnings: [], blocks: [] }, '').status, 'completed');
});

test('all attachment links are discovered, URLs normalized and full body retained', async () => {
  const html = `<nav>메뉴</nav><div class="view_cont"><p>${'본문'.repeat(6000)}</p></div>
    <ul><li><div class="bbs_file_cont"><strong>첫 회의록.pdf</strong><a href="./down.do?seq=123&amp;file_seq=1">다운받기</a></div></li>
    <li><div class="bbs_file_cont"><strong>둘째 심의결과.pdf</strong><a href="./down.do?seq=123&amp;file_seq=2">다운받기</a></div></li>
    <li><div class="bbs_file_cont"><strong>첨부.hwpx</strong><a href="./down.do?seq=123&amp;file_seq=3">다운받기</a></div></li></ul>`;
  const detail = parseDetail(html, sourceUrl);
  assert.equal(detail.attachments.length, 3);
  assert.equal(detail.text.length, 12000);
  assert(!detail.text.includes('메뉴'));
  assert(detail.attachments[1].sourceUrl.endsWith('seq=123&file_seq=2'));
  const saved = await readFile(new URL('../scratch_view_chunk.html', import.meta.url), 'utf8');
  assert(parseDetail('<div class="view_cont">회의 본문</div>' + saved, sourceUrl).attachments.some(a => a.fileType === 'hwpx'));
  assert.throws(() => parseDetail('<p>에러 페이지</p>', sourceUrl));
});

test('listing errors cannot be treated as successful end of crawl', () => {
  assert.throws(() => parseListing('<html>Service temporarily unavailable</html>', sourceUrl));
  assert.equal(parseListing('<div>등록된 게시물이 없습니다.</div>', sourceUrl).empty, true);
  const parsed = parseListing('<li><a href="./view.do?seq=123">제202차 심의 결과</a><span>2026-09-10</span></li>', sourceUrl);
  assert.equal(parsed.rows[0].seq, '123');
  assert.equal(parsed.rows[0].postDate, '2026-09-10');
});

test('source fetching blocks off-domain redirects and oversized downloads', async t => {
  for (const url of ['http://www.mfds.go.kr/a', 'https://localhost/a', 'https://www.mfds.go.kr.evil.test/a', 'https://a:b@www.mfds.go.kr/a']) assert.throws(() => assertSourceUrl(url));
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } }));
  await assert.rejects(() => fetchSource(sourceUrl), /HTTPS/);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => new Response('oversized', { headers: { 'content-length': '1000' } }));
  await assert.rejects(() => fetchSource(sourceUrl, { maxBytes: 2 }), /크기/);
});

test('captured MFDS meeting 203 HTML preserves the body and PDF/HWPX attachments', async () => {
  const html = await readFile(new URL('./committee-detail-live.html', import.meta.url), 'utf8');
  const detail = parseDetail(html, 'https://www.mfds.go.kr/brd/m_532/view.do?seq=33426');
  assert(detail.text.includes('제203차'));
  assert.equal(detail.text.length, 821);
  assert.deepEqual(detail.attachments.map(a => a.fileType).sort(), ['hwpx', 'pdf']);
  assert(detail.attachments.find(a => a.fileType === 'pdf').sourceUrl.includes('file_seq=2'));
});

test('markdown export has intact tables, stable anchors, correct classification and original chunk text', () => {
  const page = { pageNumber: 12, blocks: [table], markdown: tableMarkdown(table.headers, table.rows), status: 'completed', extractionMethod: 'gemini-layout-ocr', warnings: [] };
  const chunks = pageChunks(page, '제202차').map((c, i) => ({ ...c, id: i + 1, documentId: 'doc1', orderIndex: i, embeddingStatus: 'completed' }));
  const doc = { id: 'doc1', meetingId: 1, fileName: '심의결과.pdf', sourceUrl, sourceHash: 'abc', pageCount: 12, category: 'results', status: 'completed', pages: [page] };
  const markdown = exportMarkdown([{ id: 1, title: '제202차 회의', meetingNo: '제202차' }], [doc], chunks, { category: 'table', now: new Date('2026-09-11') });
  assert(markdown.includes('#document-doc1'));
  assert(markdown.includes('| 원료 B | 불인정 | 기준 미충족 |'));
  assert(markdown.includes('12쪽'));
  assert(chunks.every(c => markdown.includes(c.content)));
});

test('RRF deduplicates candidates without losing PDF citation metadata', () => {
  const rows = mergeRankings([[{ id: 1, content: 'a' }, { id: 2, content: 'b' }], [{ id: 2, content: 'b' }]]);
  assert.equal(rows[0].id, 2); assert.equal(rows.length, 2);
  const ref = evidenceReference({ id: 12, documentId: 'doc', chunkType: 'pdf', pageStart: 11, documentName: 'file.pdf', meeting: { title: '회의' } });
  assert.equal(ref.evidenceId, 'C12'); assert(ref.pdfFileUrl.endsWith('#page=11'));
});

test('activation never replaces active data when vectors fail validation', async () => {
  let writes = 0;
  const db = { $transaction: fn => fn({ $executeRawUnsafe: async () => {}, $queryRawUnsafe: async () => [{ count: 1 }], committee_chunks: { updateMany: async () => { writes++; } } }) };
  await assert.rejects(() => activateDocument(db, { id: 'doc', meetingId: 1 }), /벡터 검증/);
  assert.equal(writes, 0);
});

test('DRM-protected non-PDF content is rejected rather than silently marked extracted', async () => {
  const directory = new URL('../public/guidelines_pdf/', import.meta.url);
  const file = (await readdir(directory)).find(name => name.endsWith('.pdf'));
  const bytes = await readFile(new URL(file, directory));
  await assert.rejects(() => openPdf(bytes));
});

test('12-page in-memory PDF fixture is processed beyond page 10; OCR provider is deliberately stubbed', async () => {
  const fixture = await PDFDocument.create();
  const font = await fixture.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 12; i++) fixture.addPage().drawText(`Committee page ${i} END_OF_PAGE`, { font, size: 12, x: 40, y: 700 });
  const pdf = await openPdf(await fixture.save());
  assert(pdf.getPageCount() > 10);
  let callCount = 0;
  const result = await extractPage(pdf, 11, { generate: async bytes => { callCount++; assert.equal(bytes.subarray(0, 4).toString(), '%PDF'); return { blank: false, warnings: ['test fixture'], blocks: [table] }; } });
  assert.equal(result.pageNumber, 11); assert.equal(callCount, 1); assert.equal(result.status, 'review');
});

test('additive migration, queue leasing, retry eligibility and active lexical search execute in PostgreSQL', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE committee_meetings (id SERIAL PRIMARY KEY, title TEXT, "meetingNo" TEXT, "meetingDate" TEXT, "postDate" TEXT, "pdfFileName" TEXT, "pdfFileUrl" TEXT, "sourceUrl" TEXT);
      CREATE TABLE committee_chunks (id SERIAL PRIMARY KEY, "meetingId" INTEGER REFERENCES committee_meetings(id), "orderIndex" INTEGER DEFAULT 0, "chunkType" TEXT, content TEXT);
      INSERT INTO committee_meetings(id,title) VALUES (1,'검증 회의');
      INSERT INTO committee_chunks("meetingId","chunkType",content) VALUES (1,'body','과거 검색 자료');`);
    const migration = await readFile(new URL('../prisma/committee_rag_v3.sql', import.meta.url), 'utf8');
    await db.exec(migration); await db.exec(migration);
    assert.equal((await db.query('SELECT active FROM committee_chunks')).rows[0].active, true);
    const id = '10000000-0000-4000-8000-000000000001';
    await db.query('INSERT INTO committee_ingestion_jobs(id,"jobKey","meetingId") VALUES ($1,$2,1)', [id, 'discover:1']);
    const adapter = { $queryRawUnsafe: async (sql, ...args) => (await db.query(sql, args.map(a => a instanceof Date ? a.toISOString() : a))).rows };
    const first = await claimJob(adapter); assert.equal(first.id, id); assert.equal(first.status, 'running');
    assert.equal(await claimJob(adapter), null);
    await db.exec(`UPDATE committee_ingestion_jobs SET "leaseUntil"=NOW()-interval '1 minute'`);
    const reclaimed = await claimJob(adapter); assert.equal(reclaimed.id, id); assert.notEqual(reclaimed.leaseToken, first.leaseToken);
    await db.exec(`UPDATE committee_ingestion_jobs SET status='retry', "nextRetryAt"=NOW()+interval '1 hour'`);
    assert.equal(await claimJob(adapter), null);
    await db.exec(`INSERT INTO committee_chunks("meetingId","chunkType",content,active) VALUES (1,'pdf','과거 검색 자료 비활성',false)`);
    const found = await searchChunks(adapter, '검색', ['검색'], []);
    assert.equal(found.length, 1); assert.equal(found[0].content, '과거 검색 자료');
  } finally { await db.close(); }
});
