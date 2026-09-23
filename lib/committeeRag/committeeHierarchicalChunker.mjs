import { createHash } from 'node:crypto';
import { cleanTextNoise, normalizeTitle, normalizeDates, classifyDocumentType, sanitizeMetadata } from './committeeCleaner.mjs';

export function textHash(text = '') {
  const normalized = String(text || '').replace(/\s+/g, ' ').toLowerCase().trim();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * 게시물 원문 및 안건 목록을 바탕으로 부모-자식 계층형 청크를 생성하고 중복을 탐지합니다.
 */
export function buildHierarchicalChunks(meeting, agendas = [], { pipelineVersion = '3.1.0' } = {}) {
  const rawText = meeting.rawContent || meeting.title || '';
  const cleanedText = cleanTextNoise(rawText);
  const titleInfo = normalizeTitle(meeting.title || '');
  const dateInfo = normalizeDates(cleanedText, meeting.postDate);
  const docType = classifyDocumentType(meeting.title || '', cleanedText);

  // 문서 고유 ID 생성
  const docId = `mfds-committee-${meeting.seq || meeting.id || 'unknown'}`;
  const parentMeetingId = `meeting-${meeting.meetingNo ? meeting.meetingNo.replace(/[^0-9]/g, '') : meeting.id}`;

  const chunks = [];
  const duplicateLog = [];

  // 1. 부모 문서 청크 (Parent Meeting Chunk)
  const parentHeader = [
    `# [${titleInfo.title_normalized}]`,
    '',
    `- 부모 문서 ID: ${docId}`,
    `- 회의 식별자: ${parentMeetingId}`,
    `- 위원회: ${titleInfo.committee_name_normalized || '건강기능식품심의위원회'}`,
    `- 분과: ${titleInfo.subcommittee_name_normalized || '일반분과'}`,
    `- 회의 연도: ${titleInfo.session_year || '미확인'}`,
    `- 회의 차수: ${titleInfo.session_number ? `제${titleInfo.session_number}차` : '미확인'}`,
    `- 문서 유형: ${docType}`,
    `- 담당 부서: ${meeting.department || '영양기능연구과'}`,
    `- 게시일: ${dateInfo.published_date || '미확인'}`,
    `- 심의 기간: ${dateInfo.meeting_date_raw || '미확인'}`,
    `- 원문 URL: ${meeting.sourceUrl || ''}`,
    '',
    '## 문서 본문 개요',
    '',
    cleanedText.slice(0, 800),
  ].join('\n');

  const parentChunkId = `${docId}-parent`;
  const parentHash = textHash(parentHeader);

  chunks.push({
    document_id: docId,
    chunk_id: parentChunkId,
    chunk_index: 0,
    chunk_type: 'parent_meeting',
    document_type: docType,
    parent_meeting_id: parentMeetingId,
    parent_document_id: null,
    agenda_id: null,
    relation_type: 'root',
    
    title_raw: titleInfo.title_raw,
    title_normalized: titleInfo.title_normalized,
    department_raw: meeting.department || null,
    department_normalized: meeting.department ? meeting.department.trim() : null,

    committee_name_raw: titleInfo.committee_name_raw,
    committee_name_normalized: titleInfo.committee_name_normalized,
    subcommittee_name_raw: titleInfo.subcommittee_name_raw,
    subcommittee_name_normalized: titleInfo.subcommittee_name_normalized,

    session_year: titleInfo.session_year,
    session_number: titleInfo.session_number,
    session_label_raw: titleInfo.session_label_raw,

    published_date: dateInfo.published_date,
    meeting_start_date: dateInfo.meeting_start_date,
    meeting_end_date: dateInfo.meeting_end_date,
    meeting_date_raw: dateInfo.meeting_date_raw,

    review_method: null,
    agenda_name: null,
    raw_material_name: null,
    decision: null,
    decision_detail: null,

    source_url: meeting.sourceUrl || null,
    source_page_id: String(meeting.seq || meeting.id || ''),
    attachment_names: meeting.pdfFileName ? [meeting.pdfFileName] : [],

    raw_text: rawText,
    cleaned_text: parentHeader,
    content_hash: parentHash,

    metadata_confidence: { overall: 1.0 },
    processing_version: pipelineVersion,
    processed_at: new Date().toISOString(),
  });

  // 2. 자식 안건 청크 (Child Agenda Chunks)
  let chunkIdx = 1;
  const seenAgendaHashes = new Set();

  agendas.forEach((ag, idx) => {
    const agendaSanitized = sanitizeMetadata(ag.ingredientName, ag.rawName, ag.result, ag.agendaType);
    const agendaId = `${docId}-agenda-${String(idx + 1).padStart(2, '0')}`;
    const agendaChunkId = `${agendaId}-chunk`;

    const agendaContent = [
      `# ${titleInfo.title_normalized}`,
      '',
      `## 안건 ${idx + 1}. ${ag.rawName || agendaSanitized.agenda_name || '심의 안건'}`,
      '',
      `- 부모 문서 ID: ${docId}`,
      `- 안건 ID: ${agendaId}`,
      `- 안건 순번: ${ag.orderIndex || idx + 1}`,
      `- 심의 원료명: ${agendaSanitized.raw_material_name || '원문에 직접 표기 안됨'}`,
      `- 심의 구분: ${agendaSanitized.review_method || '일반심의'}`,
      `- 심의 결과: ${agendaSanitized.decision || '원문 세부내용 참조'}`,
      `- 담당 분과: ${titleInfo.subcommittee_name_normalized || '분과위원회'}`,
      '',
      '## 심의 내용 및 상세',
      '',
      ag.details || ag.rawName || cleanedText,
    ].join('\n');

    const agHash = textHash(agendaContent);

    // 중복 안건 검사
    if (seenAgendaHashes.has(agHash)) {
      duplicateLog.push({
        removed_document_id: agendaChunkId,
        kept_document_id: docId,
        duplicate_type: 'exact',
        similarity: 1.0,
        reason: '동일 게시물 내 중복 안건 청크 제거',
      });
      return;
    }
    seenAgendaHashes.add(agHash);

    chunks.push({
      document_id: docId,
      chunk_id: agendaChunkId,
      chunk_index: chunkIdx++,
      chunk_type: 'child_agenda',
      document_type: 'agenda',
      parent_meeting_id: parentMeetingId,
      parent_document_id: docId,
      agenda_id: agendaId,
      relation_type: 'agenda_of',

      title_raw: titleInfo.title_raw,
      title_normalized: titleInfo.title_normalized,
      department_raw: meeting.department || null,
      department_normalized: meeting.department ? meeting.department.trim() : null,

      committee_name_raw: titleInfo.committee_name_raw,
      committee_name_normalized: titleInfo.committee_name_normalized,
      subcommittee_name_raw: titleInfo.subcommittee_name_raw,
      subcommittee_name_normalized: titleInfo.subcommittee_name_normalized,

      session_year: titleInfo.session_year,
      session_number: titleInfo.session_number,
      session_label_raw: titleInfo.session_label_raw,

      published_date: dateInfo.published_date,
      meeting_start_date: dateInfo.meeting_start_date,
      meeting_end_date: dateInfo.meeting_end_date,
      meeting_date_raw: dateInfo.meeting_date_raw,

      review_method: agendaSanitized.review_method,
      agenda_name: ag.rawName || agendaSanitized.agenda_name,
      raw_material_name: agendaSanitized.raw_material_name,
      decision: agendaSanitized.decision,
      decision_detail: ag.details || null,

      source_url: meeting.sourceUrl || null,
      source_page_id: String(meeting.seq || meeting.id || ''),
      attachment_names: meeting.pdfFileName ? [meeting.pdfFileName] : [],

      raw_text: ag.details || ag.rawName || '',
      cleaned_text: agendaContent,
      content_hash: agHash,

      metadata_confidence: agendaSanitized.metadata_confidence,
      processing_version: pipelineVersion,
      processed_at: new Date().toISOString(),
    });
  });

  return {
    document_id: docId,
    title_raw: titleInfo.title_raw,
    title_normalized: titleInfo.title_normalized,
    doc_type: docType,
    published_date: dateInfo.published_date,
    chunks: chunks,
    duplicate_log: duplicateLog,
  };
}
