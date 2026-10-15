// 기능성 필터 조건 생성 (검색 /api/data, 내보내기 /api/export 공용)
//
// searchFunctionality 는 라벨을 공백 제거·소문자로 쉼표로 이어 붙인 값이다. (예: "아연,자일로올리고당분말(제2009-80호)")
//  - 키워드가 실제 라벨과 정확히 같으면(정밀 선택에서 고른 값) 라벨 단위로 일치시킨다.
//    부분 일치로 하면 '자일로올리고당분말'이 '자일로올리고당분말(제2009-80호)'까지 함께 검색된다.
//  - 라벨이 아닌 입력(자유 검색어, 예: '비타민')은 기존처럼 부분 일치로 검색한다.

const TTL_MS = 10 * 60 * 1000;
let cache = { at: 0, keys: null };

const slug = (text) => String(text || '').replace(/\s+/g, '').toLowerCase();

// DB에 존재하는 모든 라벨 키(공백 제거·소문자). 동기화로 새 라벨이 생겨도 TTL 이후 반영된다.
export async function getFunctionalityLabelKeys(prisma) {
  const now = Date.now();
  if (cache.keys && now - cache.at < TTL_MS) return cache.keys;
  const rows = await prisma.declarations.groupBy({
    by: ['searchFunctionality'],
    where: { searchFunctionality: { not: '' } },
  });
  const keys = new Set();
  rows.forEach((row) => row.searchFunctionality.split(',').forEach((key) => key && keys.add(key)));
  cache = { at: now, keys };
  return keys;
}

export function functionalityCondition(keyword, labelKeys) {
  const key = slug(keyword);
  if (labelKeys.has(key)) {
    return {
      OR: [
        { searchFunctionality: key },
        { searchFunctionality: { startsWith: `${key},` } },
        { searchFunctionality: { endsWith: `,${key}` } },
        { searchFunctionality: { contains: `,${key},` } },
      ],
    };
  }
  return {
    OR: [
      { searchFunctionality: { contains: key } },
      { normalizedFunctionality: { contains: keyword, mode: 'insensitive' } },
    ],
  };
}
