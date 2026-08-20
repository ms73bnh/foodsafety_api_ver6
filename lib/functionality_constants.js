/**
 * 기능성 원료 소분류 매핑 및 유틸리티
 */

// 영양성분을 소분류로 나누기 위한 매핑
export const NUTRIENT_SUBGROUPS = {
  VITAMINS: [
    "비타민 A", "비타민 B1", "비타민 B2", "비타민 B6", "비타민 B12", "비타민 C", 
    "비타민 D", "비타민 E", "비타민 K", "베타카로틴", "나이아신", "판토텐산", "엽산", "비오틴"
  ],
  MINERALS: [
    "칼슘", "마그네슘", "철", "아연", "구리", "셀레늄", "요오드", "망간", "몰리브덴", "칼륨", "크롬"
  ],
  OTHERS: [
    "식이섬유", "단백질", "필수지방산"
  ]
};

// 기능성원료를 소분류로 나누기 위한 매핑
export const STANDARDIZED_SUBGROUPS = {
  PLANTS: [
    "인삼", "홍삼", "녹차추출물", "구아바잎 추출물", "바나바잎 추출물", "은행잎 추출물", 
    "밀크씨슬 추출물", "달맞이꽃종자 추출물", "매실추출물", "가르시니아캄보지아 추출물", 
    "마리골드꽃추출물", "헤마토코쿠스 추출물", "쏘팔메토 열매 추출물", "알로에 겔", 
    "영지버섯 자실체 추출물", "마늘", "상황버섯추출물", "토마토추출물", "곤약감자추출물", 
    "회화나무열매추출물", "콜레우스포스콜리 추출물", "홍경천 추출물", "빌베리 추출물"
  ],
  MICROBIAL: [
    "프로바이오틱스", "클로렐라", "스피루리나", "프락토올리고당", "홍국", "라피노스", 
    "폴리감마글루탐산", "NAG", "키토산", "키토올리고당"
  ],
  OILS: [
    "EPA 및 DHA 함유 유지", "감마리놀렌산 함유 유지", "레시틴", "스쿠알렌", 
    "식물스테롤", "식물스테롤에스테르", "옥타코사놀 함유 유지", "공액리놀레산"
  ],
  OTHERS: [
    "코엔자임Q10", "대두이소플라본", "포스파티딜세린", "글루코사민", "히알루론산", 
    "테아닌", "MSM", "크레아틴", "유단백가수분해물", "분말한천", "식이섬유", "난소화성말토덱스트린"
  ]
};

/**
 * 성분명애 따른 소분류를 반환합니다.
 * @param {string} name 
 * @param {string} category 
 * @returns {string} subcategory label
 */
export function getSubcategory(name, category) {
  if (category === '영양성분') {
    if (NUTRIENT_SUBGROUPS.VITAMINS.some(v => name.includes(v))) return '비타민류';
    if (NUTRIENT_SUBGROUPS.MINERALS.some(m => name.includes(m))) return '무기질류';
    return '기타 영양소';
  }
  
  if (category === '기능성원료') {
    if (STANDARDIZED_SUBGROUPS.PLANTS.some(p => name.includes(p))) return '식물추출물';
    if (STANDARDIZED_SUBGROUPS.MICROBIAL.some(m => name.includes(m))) return '발효/균/미생물';
    if (STANDARDIZED_SUBGROUPS.OILS.some(o => name.includes(o))) return '지방산/유지';
    return '기타 기능성';
  }
  
  return '';
}
