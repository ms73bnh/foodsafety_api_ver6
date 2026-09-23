/**
 * 식약처 심의위원회 데이터 정제, 노이즈 제거, 메타데이터 교정 및 정규화 모듈
 */

// 1. 제거 대상 웹페이지 공통 UI 노이즈 패턴
export const UI_NOISE_PATTERNS = [
  /^(국민소통|여론광장|통합민원신고|지방식약청\s*메뉴|식품[·\s]의약품[·\s]화장품\s*등\s*전체\s*메뉴)$/i,
  /^(검색\s*도움말|검색\s*연산자\s*사용법|본문\s*바로가기|주메뉴\s*바로가기|모바일메뉴)$/i,
  /^(닫기|열기|제안|신고|제품화전략지원단|혁신제품\s*사전상담)$/i,
  /^식품의약품안전처\s*공통\s*푸터/i,
  /^(홈\s*>\s*정보공개\s*>\s*주요위원회|홈\s*>\s*알림\s*>\s*공지사항)/i,
  /^(관련\s*소셜미디어|공통\s*안내\s*문구|저작권\s*보호정책|개인정보처리방침)$/i,
];

// 2. 유효하지 않은 원료명 (이상값) 탐지 목록
export const INVALID_RAW_MATERIAL_NAMES = new Set([
  '심의날짜', '식약처', '시험법 추가 및 개선', '용어정비', '상세 내용', '안건',
  '부서', '식품의약품안전처', '건강기능식품심의위원회', '회의결과', '개최알림',
  '영양기능연구과', '식품기준과', '기능성원료', '심의결과', '기타', '신규인정',
  '내용없음', '첨부파일', '붙임'
]);

/**
 * 웹페이지 공통 노이즈 라인을 정제하고 문단 순서를 보존합니다.
 */
export function cleanTextNoise(rawText = '') {
  if (!rawText) return '';
  const lines = rawText.split('\n');
  const cleanedLines = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      cleanedLines.push('');
      continue;
    }

    // UI 노이즈 패턴 검사
    const isNoise = UI_NOISE_PATTERNS.some(pattern => pattern.test(trimmed));
    if (isNoise) continue;

    // 반복되는 웹 브레드크럼 라인 정제
    if (trimmed.includes('홈 >') && (trimmed.includes('주요위원회') || trimmed.includes('공시'))) {
      continue;
    }

    cleanedLines.push(line);
  }

  // 연속 3줄 이상의 빈 줄을 2줄로 정제
  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 게시물 제목을 파싱하여 정규화 표현 및 연도, 차수, 위원회/분과명을 추출합니다.
 */
export function normalizeTitle(titleRaw = '') {
  const title = String(titleRaw || '').trim();
  if (!title) {
    return {
      title_raw: '',
      title_normalized: '',
      committee_name_raw: null,
      committee_name_normalized: null,
      subcommittee_name_raw: null,
      subcommittee_name_normalized: null,
      session_year: null,
      session_number: null,
      session_label_raw: null,
    };
  }

  // 제목 정규화 (띄어쓰기, 연도 표기 방식 통일)
  let normalized = title
    .replace(/건강기능식품\s*심의위원회/g, '건강기능식품심의위원회')
    .replace(/재평가\s*분과/g, '재평가분과')
    .replace(/기능성\s*원료[·\s]성분\s*인정\s*및\s*기준[·\s]규격\s*분과/g, '기능성원료·성분인정및기준·규격분과')
    .replace(/인체적용시험평가\s*분과/g, '인체적용시험평가분과')
    .replace(/['’](\d{2})년/g, (_, yr) => `${Number(yr) > 50 ? '19' : '20'}${yr}년`);

  // 연도 및 회차 파싱 (예: 2026년 제5차, '21년 제1차, 2021년 제2회)
  const yearMatch = title.match(/(?:20\d{2}|['’]\d{2})년/);
  let sessionYear = null;
  if (yearMatch) {
    const yrStr = yearMatch[0].replace(/['’]/g, '').replace('년', '');
    sessionYear = yrStr.length === 2 ? Number(`20${yrStr}`) : Number(yrStr);
  }

  const numberMatch = title.match(/제?\s*(\d+)\s*[차회]/);
  const sessionNumber = numberMatch ? Number(numberMatch[1]) : null;
  const sessionLabelRaw = numberMatch ? numberMatch[0] : null;

  // 위원회 및 분과 파싱
  const committeeNameRaw = (title.includes('건강기능식품심의위원회') || title.includes('건강기능식품 심의위원회')) ? '건강기능식품심의위원회' : null;
  const committeeNameNormalized = committeeNameRaw;

  let subcommitteeNameRaw = null;
  if (title.includes('재평가')) subcommitteeNameRaw = '재평가분과';
  else if (title.includes('기능성') || title.includes('기준') || title.includes('규격')) subcommitteeNameRaw = '기능성 원료·성분 인정 및 기준·규격분과';
  else if (title.includes('인체적용시험')) subcommitteeNameRaw = '인체적용시험평가분과';

  const subcommitteeNameNormalized = subcommitteeNameRaw ? subcommitteeNameRaw.replace(/\s+/g, '') : null;

  return {
    title_raw: title,
    title_normalized: normalized,
    committee_name_raw: committeeNameRaw,
    committee_name_normalized: committeeNameNormalized,
    subcommittee_name_raw: subcommitteeNameRaw,
    subcommittee_name_normalized: subcommitteeNameNormalized,
    session_year: sessionYear,
    session_number: sessionNumber,
    session_label_raw: sessionLabelRaw,
  };
}

/**
 * 날짜 표현을 정규화하고 게시일, 심의 시작/종료일을 구별합니다.
 */
export function normalizeDates(text = '', postDateRaw = null) {
  let publishedDate = null;
  let meetingStartDate = null;
  let meetingEndDate = null;
  let meetingDateRaw = null;

  if (postDateRaw) {
    const pMatch = String(postDateRaw).match(/20\d{2}[-.]\d{2}[-.]\d{2}/);
    if (pMatch) publishedDate = pMatch[0].replaceAll('.', '-');
  }

  // 본문에서 심의 일시/기간 파싱
  const dateMatch = text.match(/(?:일시|일자|기간|일시 및 장소)\s*[:：]\s*([^\n]+)/);
  if (dateMatch) {
    meetingDateRaw = dateMatch[1].trim();
    // 2026.8.12 또는 2021-02-22 ~ 2021-02-24 형태 파싱
    const dates = meetingDateRaw.match(/20\d{2}[-./]\d{1,2}[-./]\d{1,2}/g);
    if (dates && dates.length >= 1) {
      const formatIso = dStr => {
        const parts = dStr.split(/[-./]/).map(p => p.padStart(2, '0'));
        return `${parts[0]}-${parts[1]}-${parts[2]}`;
      };
      meetingStartDate = formatIso(dates[0]);
      meetingEndDate = dates[1] ? formatIso(dates[1]) : meetingStartDate;
    }
  }

  if (!publishedDate && meetingStartDate) {
    publishedDate = meetingStartDate;
  }

  return {
    published_date: publishedDate,
    meeting_start_date: meetingStartDate,
    meeting_end_date: meetingEndDate,
    meeting_date_raw: meetingDateRaw || (postDateRaw ? String(postDateRaw) : null),
  };
}

/**
 * 게시물 및 문서의 유형을 자동 분류합니다.
 */
export function classifyDocumentType(title = '', content = '') {
  const combined = `${title}\n${content}`;
  
  if (/명단|위원\s*명단|위촉/i.test(title)) return 'member_list';
  if (/개획|개최\s*알림|서면심의\s*개최|개최\s*안내/i.test(title)) return 'announcement';
  if (/결과|회의결과|결과\s*보고|결과\s*알림/i.test(title)) return 'result';
  if (/회의록|회의\s*내용/i.test(title) || /회의록/i.test(content)) return 'meeting_minutes';
  if (/규정|기준|규격|제개정|개정/i.test(title)) return 'regulation';
  if (/안건|심의\s*안건/i.test(title)) return 'agenda';
  if (/첨부|붙임|보도자료/i.test(title)) return 'attachment';

  if (/결과|인정|보완|불인정/.test(content)) return 'result';
  if (title.trim()) return 'general';
  return 'unknown';
}

/**
 * 메타데이터 필드를 정제하고 오염된 원료명, 결과 기본값 오남용을 세척합니다.
 */
export function sanitizeMetadata(rawMaterial = null, agendaName = null, decisionRaw = null, reviewMethodRaw = null) {
  let rawMaterialName = rawMaterial ? String(rawMaterial).trim() : null;
  let agendaNameClean = agendaName ? String(agendaName).trim() : null;
  let decision = null;
  let reviewMethod = null;
  let confidence = 1.0;

  // 원료명 오염 검사
  if (rawMaterialName) {
    const isBogus = INVALID_RAW_MATERIAL_NAMES.has(rawMaterialName) ||
      INVALID_RAW_MATERIAL_NAMES.has(rawMaterialName.replace(/\s+/g, '')) ||
      /심의날짜|식약처|시험법|용어정비|상세\s*내용|안건|부서|게시물/.test(rawMaterialName);
    
    if (isBogus) {
      // 안건명으로 쓸 수 있는지 확인 후 원료명은 null 처리
      if (!agendaNameClean && rawMaterialName.length > 3) {
        agendaNameClean = rawMaterialName;
      }
      rawMaterialName = null;
      confidence *= 0.8;
    }
  }

  // 심의 결과 검사 (원문에 명시된 경우만 인정, 보완, 불인정 적용)
  if (decisionRaw) {
    const dStr = String(decisionRaw);
    if (dStr.includes('불인정') || dStr.includes('미인정')) decision = '불인정';
    else if (dStr.includes('보완')) decision = '보완';
    else if (dStr.includes('인정')) decision = '인정';
    // '기타'를 기본값으로 무조건 넣지 않고 원문에 명확치 않으면 null 처리
  }

  // 심의 구분 검사
  if (reviewMethodRaw) {
    const rStr = String(reviewMethodRaw);
    if (rStr.includes('기능성 추가') || rStr.includes('기능성추가')) reviewMethod = '기능성추가';
    else if (rStr.includes('기준') || rStr.includes('규격')) reviewMethod = '기준규격';
    else if (rStr.includes('재심의') || rStr.includes('재신청')) reviewMethod = '재심의';
    else if (rStr.includes('신규')) reviewMethod = '신규인정';
    // 기본값으로 '신규인정'을 남발하지 않음
  }

  return {
    raw_material_name: rawMaterialName,
    agenda_name: agendaNameClean,
    decision: decision,
    review_method: reviewMethod,
    metadata_confidence: {
      raw_material: rawMaterialName ? 0.95 : 0.5,
      decision: decision ? 0.95 : 0.5,
      overall: confidence,
    }
  };
}
