// 고시형 원료 주기능 딕셔너리
// 출처: 건강기능식품의 기준 및 규격 고시 제2026-32호 (2026.4.13.)
// 복합 기능성 원료는 검증된 전체 기능성을 배열로 포함

export const INGREDIENT_MAP = [
  // ── 인삼류 ─────────────────────────────────────────────────────────────────
  { patterns: ['홍삼'], categories: ['면역', '에너지활력', '혈행개선', '뇌건강', '항산화', '여성건강'] },
  { patterns: ['인삼'], categories: ['면역', '에너지활력', '뼈관절', '간건강'] },

  // ── 항산화 ─────────────────────────────────────────────────────────────────
  { patterns: ['스피루리나'], categories: ['항산화', '피부건강'] },
  { patterns: ['클로렐라'], categories: ['항산화', '피부건강', '면역', '콜레스테롤'] },
  { patterns: ['녹차추출물', '녹차 추출물'], categories: ['항산화', '체지방감소', '콜레스테롤'] },
  { patterns: ['프로폴리스'], categories: ['항산화', '구강케어'] },
  { patterns: ['코엔자임q10', '코엔자임 q10', '코큐텐'], categories: ['항산화', '혈압'] },
  { patterns: ['라이코펜'], categories: ['항산화'] },

  // ── 눈건강 ─────────────────────────────────────────────────────────────────
  { patterns: ['마리골드꽃추출물', '마리골드꽃 추출물', '루테인'], categories: ['눈건강'] },
  { patterns: ['헤마토코쿠스'], categories: ['눈건강'] },
  { patterns: ['빌베리추출물', '빌베리 추출물'], categories: ['눈건강'] },

  // ── 뇌건강·혈행 ────────────────────────────────────────────────────────────
  { patterns: ['은행잎추출물', '은행잎 추출물'], categories: ['뇌건강', '혈행개선'] },
  { patterns: ['포스파티딜세린'], categories: ['뇌건강', '피부건강'] },
  { patterns: ['epa 및 dha', 'epa/dha', 'epa&dha'], categories: ['혈행개선', '콜레스테롤', '뇌건강', '눈건강'] },
  { patterns: ['베타글루칸'], categories: ['혈행개선'] },
  { patterns: ['감마리놀렌산'], categories: ['콜레스테롤', '혈행개선', '여성건강', '피부건강'] },

  // ── 간건강 ─────────────────────────────────────────────────────────────────
  { patterns: ['밀크씨슬'], categories: ['간건강'] },

  // ── 뼈관절 ─────────────────────────────────────────────────────────────────
  { patterns: ['대두이소플라본'], categories: ['뼈관절'] },
  { patterns: ['글루코사민'], categories: ['뼈관절'] },
  { patterns: ['n-아세틸글루코사민', 'nag'], categories: ['뼈관절', '피부건강'] },
  { patterns: ['뮤코다당'], categories: ['뼈관절'] },
  { patterns: ['msm', '메틸설포닐메탄'], categories: ['뼈관절'] },
  { patterns: ['폴리감마글루탐산'], categories: ['뼈관절'] },

  // ── 혈당·콜레스테롤 ────────────────────────────────────────────────────────
  { patterns: ['구아바잎'], categories: ['혈당조절'] },
  { patterns: ['바나바잎'], categories: ['혈당조절'] },
  { patterns: ['구아검'], categories: ['혈당조절', '콜레스테롤', '장건강', '배변활동'] },
  { patterns: ['난소화성말토덱스트린'], categories: ['혈당조절', '콜레스테롤', '배변활동'] },
  { patterns: ['글루코만난', '곤약'], categories: ['콜레스테롤', '배변활동'] },
  { patterns: ['귀리식이섬유'], categories: ['콜레스테롤', '혈당조절'] },
  { patterns: ['대두식이섬유'], categories: ['콜레스테롤', '혈당조절', '배변활동'] },
  { patterns: ['차전자피식이섬유', '차전자피 식이섬유'], categories: ['콜레스테롤', '배변활동'] },
  { patterns: ['식물스테롤'], categories: ['콜레스테롤'] },
  { patterns: ['홍국'], categories: ['콜레스테롤'] },
  { patterns: ['대두단백'], categories: ['콜레스테롤'] },
  { patterns: ['키토산', '키토올리고당'], categories: ['콜레스테롤', '체지방감소'] },
  { patterns: ['마늘'], categories: ['콜레스테롤', '혈압'] },

  // ── 체지방감소 ─────────────────────────────────────────────────────────────
  { patterns: ['공액리놀레산', 'cla'], categories: ['체지방감소'] },
  { patterns: ['가르시니아캄보지아'], categories: ['체지방감소'] },
  { patterns: ['콜레우스포스콜리'], categories: ['체지방감소'] },

  // ── 장건강·배변 ────────────────────────────────────────────────────────────
  { patterns: ['프락토올리고당'], categories: ['장건강', '배변활동'] },
  { patterns: ['프로바이오틱스', '유산균'], categories: ['장건강', '배변활동'] },
  { patterns: ['라피노스'], categories: ['장건강', '배변활동'] },
  { patterns: ['목이버섯식이섬유', '목이버섯 식이섬유'], categories: ['배변활동'] },
  { patterns: ['분말한천'], categories: ['배변활동'] },

  // ── 피부건강 ───────────────────────────────────────────────────────────────
  { patterns: ['알로에'], categories: ['피부건강', '장건강', '면역'] },
  { patterns: ['히알루론산'], categories: ['피부건강'] },
  { patterns: ['글루코실세라미드'], categories: ['피부건강'] },

  // ── 수면·긴장 ──────────────────────────────────────────────────────────────
  { patterns: ['테아닌'], categories: ['수면정신'] },
  { patterns: ['유단백가수분해물'], categories: ['수면정신'] },

  // ── 에너지·활력 ────────────────────────────────────────────────────────────
  { patterns: ['옥타코사놀'], categories: ['에너지활력', '근육/운동'] },
  { patterns: ['매실추출물'], categories: ['에너지활력'] },
  { patterns: ['홍경천'], categories: ['에너지활력'] },

  // ── 근육·운동 ──────────────────────────────────────────────────────────────
  { patterns: ['크레아틴'], categories: ['근육/운동'] },

  // ── 면역 ────────────────────────────────────────────────────────────────────
  { patterns: ['알콕시글리세롤', '상어간유'], categories: ['면역'] },

  // ── 남성·여성건강 ──────────────────────────────────────────────────────────
  { patterns: ['쏘팔메토'], categories: ['남성건강'] },
  { patterns: ['회화나무'], categories: ['여성건강'] },
];

// 원료명으로 카테고리 배열 반환 (매칭 없으면 null)
export function lookupIngredientCategories(rawmtrlNm) {
  if (!rawmtrlNm) return null;
  const lower = rawmtrlNm.toLowerCase().replace(/\s+/g, '');
  const matched = new Set();
  for (const entry of INGREDIENT_MAP) {
    if (entry.patterns.some(p => lower.includes(p.replace(/\s+/g, '')))) {
      entry.categories.forEach(c => matched.add(c));
    }
  }
  return matched.size > 0 ? Array.from(matched) : null;
}
