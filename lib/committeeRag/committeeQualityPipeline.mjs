import fs from 'node:fs';
import path from 'node:path';
import { INVALID_RAW_MATERIAL_NAMES } from './committeeCleaner.mjs';
import { buildHierarchicalChunks } from './committeeHierarchicalChunker.mjs';

/**
 * 심의위원회 데이터 정제, 계층형 청킹, 4대 결과물 파일 생성 및 15대 품질 검증 리포트를 실행합니다.
 */
export async function runQualityPipeline(meetings = [], outputDir = process.cwd()) {
  const version = '3.1.0';
  const now = new Date().toISOString();

  let totalChunks = 0;
  let totalDocuments = meetings.length;
  
  const docTypesCount = {};
  const departmentsCount = {};
  const committeesCount = {};
  const yearsCount = {};

  let emptyBodyCount = 0;
  let uiNoiseCount = 0;
  let duplicateDocCount = 0;
  let orphanChildChunksCount = 0;
  let invalidRawMaterialCount = 0;
  let defaultFallbackCount = 0;
  let dateParseFailureCount = 0;

  const rawMdLines = ['# 심의위원회 전체 청킹자료 (RAW 원본)', '', `생성 시각: ${now}`, ''];
  const cleanedMdLines = ['# 심의위원회 전체 청킹자료 (CLEANED 정제·구조화본)', '', `생성 시각: ${now}`, `파이프라인 버전: ${version}`, ''];
  const jsonlLines = [];
  const allDuplicateLogs = [];
  const processedChunks = [];
  const documentSummaries = [];

  for (const meeting of meetings) {
    // 1. RAW 마크다운 누적
    rawMdLines.push(`## [RAW] ${meeting.title || '제목 없음'}`, '');
    rawMdLines.push(`- 게시일: ${meeting.postDate || '미상'}`, `- 부서: ${meeting.department || '미상'}`, '');
    rawMdLines.push(meeting.rawContent || '(본문 없음)', '', '---', '');

    // 2. 계층형 청킹 및 정제 실행
    const result = buildHierarchicalChunks(meeting, meeting.agendas || [], { pipelineVersion: version });
    allDuplicateLogs.push(...result.duplicate_log);
    duplicateDocCount += result.duplicate_log.length;

    // 지표 집계
    const docType = result.doc_type || 'unknown';
    docTypesCount[docType] = (docTypesCount[docType] || 0) + 1;

    const dept = meeting.department ? meeting.department.trim() : '미확인부서';
    departmentsCount[dept] = (departmentsCount[dept] || 0) + 1;

    const yr = result.chunks[0]?.session_year ? String(result.chunks[0].session_year) : '미확인연도';
    yearsCount[yr] = (yearsCount[yr] || 0) + 1;

    const comm = result.chunks[0]?.subcommittee_name_normalized || '일반분과';
    committeesCount[comm] = (committeesCount[comm] || 0) + 1;

    if (!meeting.rawContent || meeting.rawContent.trim().length === 0) {
      emptyBodyCount++;
    }

    if (/(국민소통|여론광장|통합민원신고|검색\s*도움말|본문\s*바로가기)/.test(meeting.rawContent || '')) {
      uiNoiseCount++;
    }

    if (!result.published_date) {
      dateParseFailureCount++;
    }

    // 청크 단위 처리
    for (const chunk of result.chunks) {
      totalChunks++;
      processedChunks.push(chunk);

      // JSONL 라인 추가
      jsonlLines.push(JSON.stringify(chunk));

      // CLEANED 마크다운 누적
      cleanedMdLines.push(chunk.cleaned_text, '', '---', '');

      // 이상값 및 검증 항목 측정
      if (chunk.chunk_type === 'child_agenda') {
        if (!chunk.parent_document_id) orphanChildChunksCount++;
        
        if (chunk.raw_material_name && INVALID_RAW_MATERIAL_NAMES.has(chunk.raw_material_name)) {
          invalidRawMaterialCount++;
        }

        if (chunk.review_method === '신규인정' && chunk.decision === '기타') {
          defaultFallbackCount++;
        }
      }
    }

    documentSummaries.push(result);
  }

  // 3. 샘플 비교 5종 추출 (announcement, result, agenda, member_list, legacy_2009_2010, post_2020)
  const sampleCategories = ['announcement', 'result', 'member_list', 'agenda', 'general'];
  const samples = [];

  for (const cat of sampleCategories) {
    const matched = documentSummaries.find(d => d.doc_type === cat || (cat === 'agenda' && d.chunks.some(c => c.chunk_type === 'child_agenda')));
    if (matched) {
      const targetChunk = matched.chunks.find(c => c.chunk_type === 'child_agenda') || matched.chunks[0];
      samples.push({
        category: cat,
        document_id: matched.document_id,
        title_raw: matched.title_raw,
        before_raw_chunk: (matched.chunks[0]?.raw_text || '').slice(0, 300),
        after_cleaned_metadata: {
          document_id: targetChunk.document_id,
          chunk_id: targetChunk.chunk_id,
          document_type: targetChunk.document_type,
          title_normalized: targetChunk.title_normalized,
          parent_meeting_id: targetChunk.parent_meeting_id,
          agenda_id: targetChunk.agenda_id,
          raw_material_name: targetChunk.raw_material_name,
          decision: targetChunk.decision,
        },
        after_cleaned_text: targetChunk.cleaned_text.slice(0, 400),
      });
    }
  }

  // 4. 품질 리포트 JSON 생성
  const qualityReport = {
    generated_at: now,
    pipeline_version: version,
    summary_metrics: {
      total_chunks: totalChunks,
      total_documents: totalDocuments,
      doc_types_count: docTypesCount,
      departments_count: departmentsCount,
      committees_count: committeesCount,
      years_count: yearsCount,
      empty_body_count: emptyBodyCount,
      ui_noise_remaining_count: uiNoiseCount,
      ui_noise_remaining_ratio: totalDocuments > 0 ? (uiNoiseCount / totalDocuments) : 0,
      duplicate_doc_count: duplicateDocCount,
      metadata_missing_rate: totalChunks > 0 ? (dateParseFailureCount / totalChunks) : 0,
      metadata_outliers_count: invalidRawMaterialCount,
      orphan_child_chunks_count: orphanChildChunksCount,
      invalid_raw_material_names_count: invalidRawMaterialCount,
      default_fallback_ratio: totalChunks > 0 ? (defaultFallbackCount / totalChunks) : 0,
      date_parse_failure_count: dateParseFailureCount,
    },
    duplicate_log: allDuplicateLogs,
    samples: samples,
  };

  // 5. 파일 쓰기
  const rawPath = path.join(outputDir, '심의위원회_전체_청킹자료.raw.md');
  const cleanedPath = path.join(outputDir, '심의위원회_전체_청킹자료.cleaned.md');
  const jsonlPath = path.join(outputDir, '심의위원회_전체_청킹자료.jsonl');
  const reportPath = path.join(outputDir, '심의위원회_전체_청킹자료.quality_report.json');

  fs.writeFileSync(rawPath, rawMdLines.join('\n'), 'utf8');
  fs.writeFileSync(cleanedPath, cleanedMdLines.join('\n'), 'utf8');
  fs.writeFileSync(jsonlPath, jsonlLines.join('\n'), 'utf8');
  fs.writeFileSync(reportPath, JSON.stringify(qualityReport, null, 2), 'utf8');

  return {
    rawPath,
    cleanedPath,
    jsonlPath,
    reportPath,
    report: qualityReport,
  };
}
