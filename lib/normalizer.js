// lib/normalizer.js

import { ingredientLabels } from './ingredientNormalizer.mjs';
import canonicalMap from './ingredientCanonicalMap.mjs';

/**
 * 사용자 제공 Python 로직을 Javascript로 이식한 고도화된 정규화 엔진
 */

// 표시용 표준화 사전
const DISPLAY_REPLACEMENTS = {
    "비타민A": "비타민 A",
    "비타민B1": "비타민 B1",
    "비타민B2": "비타민 B2",
    "비타민B6": "비타민 B6",
    "비타민B12": "비타민 B12",
    "비타민C": "비타민 C",
    "비타민D": "비타민 D",
    "비타민E": "비타민 E",
    "비타민K": "비타민 K",
    "뮤코다당.단백": "뮤코다당·단백",
};

function applyDisplayReplacements(text) {
    let t = text;
    for (const [old, newVal] of Object.entries(DISPLAY_REPLACEMENTS)) {
        t = t.split(old).join(newVal);
    }
    // 쉼표 주변 공백 정리
    t = t.replace(/\s*,\s*/g, ", ");
    t = t.replace(/\s+/g, " ").trim();
    return t;
}

/**
 * 포장재 정규화 맵
 */
const PKG_MAP = [
    { key: 'HDPE', label: 'HDPE(고밀도폴리에틸렌)' },
    { key: 'LDPE', label: 'LDPE(저밀도폴리에틸렌)' },
    { key: 'PE', label: 'PE(폴리에틸렌)' },
    { key: 'PP', label: 'PP(폴리프로필렌)' },
    { key: 'PET', label: 'PET(폴리에틸렌테레프탈레이트)' },
    { key: 'PVC', label: 'PVC(폴리염화비닐)' },
    { key: 'PS', label: 'PS(폴리스티렌)' },
    { key: '알루미늄', label: 'AL(알루미늄)' },
    { key: 'AL', label: 'AL(알루미늄)' },
    { key: '유리', label: '유리(Glass)' },
    { key: '종이', label: '종이(Paper)' },
    { key: 'PTP', label: 'PTP/블리스터' },
    { key: '블리스터', label: 'PTP/블리스터' }
];

/**
 * 검색용 텍스트 생성 (공백 제거, 대소문자 통일)
 */
function slugifyForSearch(text) {
    if (!text) return "";
    return String(text).replace(/\s+/g, "").toLowerCase();
}

/**
 * 포장재 정규화 로직
 */
function normalizePackaging(rawText) {
    if (!rawText) return "";
    const results = new Set();
    let upperText = rawText.toUpperCase();

    // 긴 키워드부터 먼저 찾아서 처리 (예: 'PET', 'HDPE' 찾은 후 'PE' 중복 매칭 방지)
    const sortedMap = [...PKG_MAP].sort((a, b) => b.key.length - a.key.length);

    for (const item of sortedMap) {
        const keyUpper = item.key.toUpperCase();
        if (upperText.includes(keyUpper)) {
            results.add(item.label);
            // 매칭된 키워드는 제거하여 하위 문자열 매칭(PE in PET 등) 방지
            upperText = upperText.split(keyUpper).join(' ');
        }
    }

    return Array.from(results).join(", ") || ""; // 매칭되는 게 없으면 빈 값 반환 (노이즈 제거)
}

/**
 * 메인 정규화 엔트리 포인트
 */
export function normalizeData(item) {
    // 1. 포장재질 정규화
    const rawPkg = item.FRMLC_MTRQLT || '';
    const normPkg = normalizePackaging(rawPkg);

    // 2. 기능성(성분) 정규화 — 규칙은 lib/ingredientNormalizer.mjs 참고
    //    승인번호 단위로 개별인정형 원료를 묶고, 대표명은 ingredientCanonicalMap(scripts/build-ingredient-map.mjs로 생성)을 따른다.
    const { labels } = ingredientLabels(item.RAWMTRL_NM || '', canonicalMap);
    const normFunc = labels.map(applyDisplayReplacements).join(', ');

    // 3. 검색용 기능성 텍스트 (공백 제거 버전)
    const searchFunc = slugifyForSearch(normFunc);

    // 4. 원재료 (기존 유지)
    let normRaw = item.RAWMTRL_NM || item.INDIV_RAWMTRL_NM || '';

    return {
        normalizedPackaging: normPkg,
        normalizedFunctionality: normFunc,
        searchFunctionality: searchFunc,
        normalizedRawMaterials: normRaw
    };
}

const SUPERSCRIPT_MAP = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
};

export function toSuperscript(numStr) {
  return String(numStr)
    .split('')
    .map(ch => SUPERSCRIPT_MAP[ch] || ch)
    .join('');
}

/**
 * 섭취량, 기능성, 주의사항 텍스트 내 줄바꿈과 윗첨자 지수 정리
 * 예: "5.0 × 10\n10\nCFU/일" -> "5.0 × 10¹⁰ CFU/일"
 * 예: "10 10 CFU" -> "10¹⁰ CFU"
 * 예: "10^10" -> "10¹⁰"
 */
export function formatFormattedText(text) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

  // 1. 10\n(\d{1,2})\n(CFU|마리|개|/) -> 10¹⁰ $2
  cleaned = cleaned.replace(/10\s*[\r\n]+\s*(\d{1,2})\s*[\r\n]*\s*(CFU|cfu|마리|개|\/)/gi, (match, exp, unit) => {
    return `10${toSuperscript(exp)} ${unit}`;
  });

  // 2. 10\s+(\d{1,2})\s*(CFU|cfu|마리|개|\/)/gi -> 10¹⁰ $2
  cleaned = cleaned.replace(/\b10\s+(\d{1,2})\s*(CFU|cfu|마리|개|\/)/gi, (match, exp, unit) => {
    return `10${toSuperscript(exp)} ${unit}`;
  });

  // 3. 10\^(\d{1,2})/g -> 10¹⁰
  cleaned = cleaned.replace(/\b10\^(\d{1,2})/g, (match, exp) => {
    return `10${toSuperscript(exp)}`;
  });

  // 4. 1010 CFU 또는 1011 CFU 같은 붙어있는 지수 (1000단위가 아닌 경우)
  cleaned = cleaned.replace(/\b10(8|9|10|11|12)\s*(CFU|cfu|마리|개)/gi, (match, exp, unit) => {
    return `10${toSuperscript(exp)} ${unit}`;
  });

  // 5. 연속된 불필요한 줄바꿈 (3개 이상 개행) 축소
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 6. 줄 끝 공백 정리
  cleaned = cleaned
    .split('\n')
    .map(line => line.trim())
    .join('\n');

  return cleaned.trim();
}
