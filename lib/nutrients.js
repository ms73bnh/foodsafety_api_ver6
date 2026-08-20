// lib/nutrients.js

const RAW_NUTRIENT_LIST = [
    // 비타민 류
    "비타민A", "비타민 A", 
    "비타민B1", "비타민 B1", 
    "비타민B2", "비타민 B2", 
    "비타민B6", "비타민 B6", 
    "비타민B12", "비타민 B12", 
    "비타민C", "비타민 C", 
    "비타민D", "비타민 D", 
    "비타민E", "비타민 E", 
    "비타민K", "비타민 K", 
    "비타민K1", "비타민 K1", 
    "비타민K2", "비타민 K2",
    "베타카로틴", "나이아신", "판토텐산", "엽산", "비오틴",
    
    // 미네랄 류
    "칼슘", "마그네슘", "철", "아연", "구리", 
    "셀레늄", "셀렌", "요오드", "망간", "몰리브덴", "칼륨", "크롬",
    
    // 단백질 및 지방산 류
    "단백질", "필수지방산", "리놀레산", "리놀렌산"
];

// 정규화된 형태(공백 제거 및 대소문자 무시)로 저장하여 비교의 정확도를 높입니다.
const NORMALIZED_NUTRIENTS = new Set(
    RAW_NUTRIENT_LIST.map(item => item.replace(/\s+/g, "").toLowerCase())
);

/**
 * 성분명이 단순 영양성분인지 확인합니다.
 * @param {string} name - 확인할 성분명
 * @returns {boolean} - 영양성분일 경우 true
 */
export function isNutrient(name) {
    if (!name) return false;
    // 입력값도 공백을 제거하여 비교
    const cleanName = name.replace(/\s+/g, "").toLowerCase();
    
    // 완전히 일치하는 경우
    if (NORMALIZED_NUTRIENTS.has(cleanName)) return true;
    
    // 이름 안에 "비타민"이나 "단백질" 같이 완전히 명백한 패턴이 전체로 쓰인 경우
    // 예를 들어 "비타민 K(Vit K)" 와 같이 괄호가 포함된 것도 필터링
    const baseName = cleanName.replace(/\(.*\)/g, ""); // 괄호와 그 안 문자 제거
    if (NORMALIZED_NUTRIENTS.has(baseName)) return true;
    
    return false;
}
