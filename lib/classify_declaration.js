import { CATEGORIES_MASTER } from './category_data';
import { lookupIngredientCategories } from './ingredient_category_map';

const VITAMIN_PATTERNS = [
  '비타민 a', '비타민a', '비타민 b1', '비타민b1', '비타민 b2', '비타민b2',
  '비타민 b3', '비타민 b5', '비타민 b6', '비타민b6', '비타민 b7', '비타민 b9',
  '비타민 b12', '비타민b12', '비타민 c', '비타민c', '비타민 d', '비타민d',
  '비타민 e', '비타민e', '비타민 k', '비타민k', '나이아신', '판토텐산',
  '엽산', '비오틴', '베타카로틴',
];

/**
 * 신고 데이터 한 건을 카테고리 배열로 분류한다.
 * 1) 원료명 딕셔너리(공전 기반) 우선 매칭
 * 2) 딕셔너리 미매칭 시 primaryFnclty 키워드 보완
 * 3) 비타민 2종 이상 → 멀티비타민 추가
 */
export function classifyDeclaration(primaryFnclty, normalizedFunctionality, rawmtrlNm) {
  const matched = new Set();

  const dictCats = lookupIngredientCategories(rawmtrlNm);
  if (dictCats) {
    dictCats.forEach(c => matched.add(c));
  }

  if (matched.size === 0) {
    const haystack = (primaryFnclty || '').toLowerCase();
    for (const cat of CATEGORIES_MASTER) {
      for (const kw of cat.keywords) {
        if (haystack.includes(kw.toLowerCase())) {
          matched.add(cat.name);
          break;
        }
      }
    }
  }

  const vitaminText = `${primaryFnclty || ''} ${normalizedFunctionality || ''}`.toLowerCase();
  const vitaminHits = new Set();
  for (const vp of VITAMIN_PATTERNS) {
    if (vitaminText.includes(vp)) vitaminHits.add(vp);
  }
  if (vitaminHits.size >= 2) matched.add('멀티비타민');

  return Array.from(matched);
}
