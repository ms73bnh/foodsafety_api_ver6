import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTextNoise, normalizeTitle, normalizeDates, classifyDocumentType, sanitizeMetadata } from '../lib/committeeRag/committeeCleaner.mjs';
import { buildHierarchicalChunks } from '../lib/committeeRag/committeeHierarchicalChunker.mjs';
import { runQualityPipeline } from '../lib/committeeRag/committeeQualityPipeline.mjs';
import fs from 'node:fs';

test('1. 공통 메뉴 및 UI 노이즈 제거 검증', () => {
  const input = `국민소통\n여론광장\n통합민원신고\n제203차 건강기능식품심의위원회 회의 결과\n\n○ 일시 : 2026.8.12\n식품의약품안전처 공통 푸터`;
  const cleaned = cleanTextNoise(input);
  
  assert.ok(!cleaned.includes('국민소통'));
  assert.ok(!cleaned.includes('여론광장'));
  assert.ok(!cleaned.includes('통합민원신고'));
  assert.ok(!cleaned.includes('공통 푸터'));
  assert.ok(cleaned.includes('제203차 건강기능식품심의위원회 회의 결과'));
});

test('2. 제목 및 날짜 정규화 검증', () => {
  const rawTitle = "[영양기능연구과] '26년 제5차 건강기능식품 심의위원회 회의 결과";
  const normTitle = normalizeTitle(rawTitle);
  
  assert.equal(normTitle.session_year, 2026);
  assert.equal(normTitle.session_number, 5);
  assert.equal(normTitle.committee_name_normalized, '건강기능식품심의위원회');

  const dateNorm = normalizeDates('○ 일시 : 2026.8.12.(목) / 충북 오송', '2026-09-09');
  assert.equal(dateNorm.published_date, '2026-09-09');
  assert.equal(dateNorm.meeting_start_date, '2026-08-12');
});

test('3. 문서 유형 분류 검증', () => {
  assert.equal(classifyDocumentType('건강기능식품심의위원회 서면심의 개최 알림'), 'announcement');
  assert.equal(classifyDocumentType('건강기능식품심의위원회 회의 결과 보고'), 'result');
  assert.equal(classifyDocumentType('건강기능식품심의위원회 위원 명단'), 'member_list');
});

test('4. 잘못된 원료명 오염 세척 검증', () => {
  const sanitized1 = sanitizeMetadata('심의날짜', '안건 1호 장미꽃잎추출물', '인정', '신규인정');
  assert.equal(sanitized1.raw_material_name, null); // 심의날짜 오염 세척
  assert.equal(sanitized1.decision, '인정');
  assert.equal(sanitized1.review_method, '신규인정');

  const sanitized2 = sanitizeMetadata('식약처', null, null, null);
  assert.equal(sanitized2.raw_material_name, null);

  const sanitizedValid = sanitizeMetadata('장미꽃잎추출물', '장미꽃잎추출물 기능성 인정', '보완', '기능성 추가');
  assert.equal(sanitizedValid.raw_material_name, '장미꽃잎추출물');
  assert.equal(sanitizedValid.decision, '보완');
  assert.equal(sanitizedValid.review_method, '기능성추가');
});

test('5. 계층형 청킹 및 부모-자식 연결 검증', () => {
  const meeting = {
    id: 100, seq: '9999', meetingNo: '제203차', title: '제203차 건강기능식품심의위원회 회의 결과',
    department: '영양기능연구과', postDate: '2026-08-12', rawContent: '회의 본문 내용입니다.'
  };
  const agendas = [
    { orderIndex: 1, rawName: '고소애가수분해물 : 인정', ingredientName: '고소애가수분해물', result: '인정', agendaType: '신규인정', details: '상세내용' }
  ];

  const result = buildHierarchicalChunks(meeting, agendas);
  assert.equal(result.chunks.length, 2);

  const parentChunk = result.chunks[0];
  const childChunk = result.chunks[1];

  assert.equal(parentChunk.chunk_type, 'parent_meeting');
  assert.equal(childChunk.chunk_type, 'child_agenda');
  assert.equal(childChunk.parent_document_id, parentChunk.document_id);
  assert.equal(childChunk.raw_material_name, '고소애가수분해물');
  assert.equal(childChunk.decision, '인정');
});

test('6. 전체 품질 파이프라인 및 4대 결과물 생성 검증', async () => {
  const mockMeetings = [
    {
      id: 1, seq: '1001', meetingNo: '제1차', title: '2026년 제1차 건강기능식품심의위원회 회의 결과',
      department: '영양기능연구과', postDate: '2026-01-10', rawContent: '국민소통\n제1차 회의 결과 본문',
      agendas: [{ orderIndex: 1, rawName: '비타민D : 인정', ingredientName: '비타민D', result: '인정' }]
    }
  ];

  const result = await runQualityPipeline(mockMeetings, process.cwd());
  
  assert.ok(fs.existsSync(result.rawPath));
  assert.ok(fs.existsSync(result.cleanedPath));
  assert.ok(fs.existsSync(result.jsonlPath));
  assert.ok(fs.existsSync(result.reportPath));

  assert.ok(result.report.summary_metrics.total_chunks > 0);
  assert.equal(result.report.summary_metrics.total_documents, 1);
});
