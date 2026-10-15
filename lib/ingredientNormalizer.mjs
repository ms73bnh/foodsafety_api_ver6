// 기능성 원료 정체성 정규화
//
// 규칙
// 1. 승인번호(제YYYY-N호)가 있으면 개별인정형 원료이며 승인번호 단위로 묶는다.
//    이름 표기(영문명, 분말 여부, 공백)가 달라도 같은 번호면 같은 원료, 다른 번호면 다른 원료.
// 2. 승인번호가 없으면 이름으로 묶는다.
//    - 괄호 안이 영문뿐이면(영문명) 괄호가 없는 이름과 같은 원료로 본다.
//    - "자일로올리고당"과 "자일로올리고당분말"은 서로 다른 원료다.
// 3. "(원료성)" 괄호와 "…제품" 접미사는 같은 원료의 구분 표시이므로 키에서 빼고 markers로 남긴다.
// 4. 별칭 괄호("(또는 셀렌)", "(MSM, Methyl…, 디메틸설폰)", ALIAS_QUALIFIERS)는 키에서 빼고 aliases로 남긴다.
// 5. 그 외 알 수 없는 한글 괄호 내용은 키에 남겨서 잘못 합치지 않고 needsReview로 표시한다.
// 6. 승인번호 없는 개별인정형 원료는 승인번호 있는 원료와 합치지 않고 별도로 둔다.

const APPROVAL_RE = /제?\s*(\d{4})\s*-\s*(\d{1,4})\s*호/g;
// 구형 표기: 괄호 안이 승인번호뿐인 경우 (2006-4), (2007-19, 2008-36)
const BARE_APPROVALS_RE = /^\s*\d{4}\s*-\s*\d{1,4}(\s*,\s*\d{4}\s*-\s*\d{1,4})*\s*$/;
const BARE_APPROVAL_ITEM_RE = /(\d{4})\s*-\s*(\d{1,4})/g;
const DATE_RE =/\d{4}\s*\.\s*\d{1,2}\s*\.\s*\d{1,2}\s*\.?/g;
const LATIN_ONLY_RE = /^[A-Za-z0-9\s.,'’\-+/&]+$/;
const BOILERPLATE_RE = /^(기능성\s*원료\s*인정|개별\s*인정형?|인정|원료)$/;
// 같은 원료의 구분 표시: "(원료성)" 괄호, "…제품" 접미사
const MARKER_RE = /^원료성$/;
const PRODUCT_SUFFIX_RE = /\s*제품$/;
// 별칭으로 확정된 한글 괄호(학명/이명). 새 항목은 검증 후 여기에 추가한다.
const ALIAS_QUALIFIERS = new Set(['카르두스마리아누스', '쥐눈이콩']);
const UNIT_ONLY_RE =/^[\d\s.,x*~%|/()+-]+(mg|g|ml|l|kcal|포|정|캡슐|병|ea|t|box)?$/i;

function isNoise(text) {
  const clean = String(text || '').trim();
  // 한 글자 한글은 실제 원료명이다(철, 동 등). 한 글자 기호·영문·숫자만 노이즈.
  if (clean.length <= 1 && !/[가-힣]/.test(clean)) return true;
  if (/^\d+$/.test(clean)) return true;
  if (UNIT_ONLY_RE.test(clean)) return true;
  return /^[0\s-]+$/.test(clean);
}

// 괄호 밖 구분자 기준 분리
export function splitTopLevel(text, delimiter = ',') {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === delimiter && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// 최상위 괄호 그룹과 괄호 밖 텍스트로 분리
function splitGroups(text) {
  const groups = [];
  let outside = '';
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') {
      if (depth === 0) current = '';
      else current += ch;
      depth++;
    } else if (ch === ')' && depth > 0) {
      depth--;
      if (depth === 0) groups.push(current);
      else current += ch;
    } else if (depth > 0) current += ch;
    else outside += ch;
  }
  if (depth > 0) groups.push(current); // 닫히지 않은 괄호
  return { outside, groups };
}

function takeApprovals(text, approvals) {
  return text.replace(APPROVAL_RE, (_, year, no) => {
    approvals.push(`${year}-${Number(no)}`);
    return ' ';
  });
}

function compact(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// 이름 키 만들기 (별칭 맵 생성 등 외부에서도 같은 규칙을 쓰도록 공개)
export function nameKeyOf(text) {
  return `NM:${nameKey(text)}`;
}

function nameKey(text) {
  return text.replace(/\s+/g, '').toLowerCase();
}

export function parseIngredient(raw) {
  const source = String(raw ?? '').normalize('NFKC').trim();
  if (isNoise(source)) return null;

  const { outside, groups } = splitGroups(source);
  const approvals = [];
  const englishNames = [];
  const aliases = [];
  const qualifierAliases = [];
  const qualifiers = [];
  const markers = [];

  let baseName = compact(takeApprovals(outside, approvals).replace(DATE_RE, ' '));
  // "…제품" 접미사는 같은 원료의 구분 표시
  const productMatch = baseName.match(PRODUCT_SUFFIX_RE);
  if (productMatch && baseName.length > productMatch[0].length) {
    markers.push('제품');
    baseName = baseName.slice(0, -productMatch[0].length).trim();
  }

  for (const group of groups) {
    if (BARE_APPROVALS_RE.test(group)) {
      for (const m of group.matchAll(BARE_APPROVAL_ITEM_RE)) approvals.push(`${m[1]}-${Number(m[2])}`);
      continue;
    }
    const rest = takeApprovals(group, approvals).replace(DATE_RE, ' ');
    const pieces = rest.split(',').map(compact).filter((p) => p && !/^[\s.\-]*$/.test(p));
    // 영문 표기가 섞인 다중 항목 괄호는 별칭 목록(예: MSM, Methyl sulfonylmethane, 디메틸설폰)
    const aliasGroup = pieces.length >= 2 && pieces.some((p) => LATIN_ONLY_RE.test(p));
    for (const piece of pieces) {
      if (BOILERPLATE_RE.test(piece)) continue;
      if (MARKER_RE.test(piece)) { markers.push(piece); continue; }
      if (LATIN_ONLY_RE.test(piece)) englishNames.push(piece);
      else if (aliasGroup || /^또는\s/.test(piece)) aliases.push(piece);
      else if (ALIAS_QUALIFIERS.has(nameKey(piece))) qualifierAliases.push(piece); // 키에서만 빼고 독립 이름으로는 쓰지 않는다
      else qualifiers.push(piece);
    }
  }

  const uniqueApprovals = [...new Set(approvals)];
  const common = { raw: source, baseName, englishNames, aliases, qualifierAliases, qualifiers, markers };
  if (uniqueApprovals.length) {
    return {
      ...common,
      kind: 'individual',
      displayName: baseName,
      approvalNos: uniqueApprovals,
      keys: uniqueApprovals.map((no) => `AP:${no}`),
      needsReview: false,
    };
  }

  if (!baseName || isNoise(baseName)) return null;
  const label = baseName + qualifiers.map((q) => `(${q})`).join('');
  return {
    ...common,
    kind: 'general',
    displayName: label.replace(/비타민\s*([A-Z]\d*)/g, '비타민 $1'),
    approvalNos: [],
    keys: [`NM:${nameKey(label)}`],
    needsReview: qualifiers.length > 0,
  };
}

// 원료 하나의 표시 라벨.
//  - 개별인정형: "대표명(제YYYY-N호)" — 같은 승인번호는 항상 같은 라벨
//  - 그 외: 대표명
// canonical = { approvals: { '2009-80': '대표명' }, names: { 'NM:키': '대표명' }, aliases: { 'NM:별칭키': 'NM:대표키' } } (ingredientCanonicalMap.mjs)
// 맵에 없는 원료는 해당 행의 이름을 그대로 쓴다.
const labelText = (text) => compact(String(text || '').replace(/,/g, ' '));

export function ingredientLabels(rawText, canonical = {}) {
  const items = parseIngredientList(rawText);
  const labels = [];
  for (const item of items) {
    if (item.kind === 'individual') {
      for (const no of item.approvalNos) {
        const name = labelText(canonical.approvals?.[no] || item.baseName) || '개별인정원료';
        labels.push(`${name}(제${no}호)`);
      }
    } else {
      // 별칭으로만 표기된 이름(예: 디메틸설폰)은 대표 원료(엠에스엠)로 합친다
      const key = item.keys[0];
      const target = canonical.aliases?.[key] || key;
      labels.push(labelText(canonical.names?.[target] || item.displayName));
    }
  }
  return { labels: [...new Set(labels)], items };
}

// "a, b(제2009-80호), c" 형태의 문자열 전체를 파싱하고 키 기준으로 중복 제거
export function parseIngredientList(rawText) {
  const text = String(rawText ?? '').normalize('NFKC');
  const seen = new Set();
  const result = [];
  for (const part of splitTopLevel(text)) {
    const parsed = parseIngredient(part);
    if (!parsed) continue;
    const fresh = parsed.keys.filter((k) => !seen.has(k));
    if (!fresh.length) continue;
    fresh.forEach((k) => seen.add(k));
    result.push(parsed);
  }
  return result;
}
