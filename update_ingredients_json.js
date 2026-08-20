/**
 * 개별인정형원료 DB 업데이트 스크립트
 * 소스: 개별인정원료.json (크롤링 결과)
 *
 * 실행: node update_ingredients_json.js [JSON 경로]
 * 기본 경로: C:\Study\Monday_Junior\foodsafety_crawler\output\개별인정원료.json
 */

const fs = require('fs');
const path = require('path');

// .env 파일 수동 파싱 → POSTGRES_URL_NON_POOLING(직접 연결, 포트 5432) 사용
// pooler(6543)은 장시간 스크립트에서 timeout 발생
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*([\w]+)\s*=\s*"?([^"#\n]+)"?\s*$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
  // 직접 연결(non-pooling)을 Prisma URL로 강제 사용
  if (process.env.POSTGRES_URL_NON_POOLING) {
    process.env.POSTGRES_PRISMA_URL = process.env.POSTGRES_URL_NON_POOLING;
  }
})();

const { PrismaClient } = require('@prisma/client');

function makePrisma() {
  return new PrismaClient();
}

// ── 카테고리 키워드 ──────────────────────────────────────────────────────────
// v2: 갱년기건강+PMS → 여성건강 / 운동수행능력+근육 → 근육/운동
const CATEGORIES_KEYWORDS = [
  { name: '장건강',    keywords: ['장건강', '장 건강', '유산균 증식', '유익균 증식', '유해균 억제', '유해균억제', '장내 유익균', '장면역', '장 불편감', '프로바이오틱스', '프리바이오틱스', '장내 환경', '정장'] },
  { name: '혈행개선',  keywords: ['혈행', '혈액 흐름', '혈액의 흐름', '혈소판 응집', '혈소판응집', '혈액순환', '혈관이완', '혈관벽', '혈행개선', '혈행 개선'] },
  { name: '눈건강',    keywords: ['눈 건강', '눈건강', '황반색소', '눈의 피로', '건조한 눈', '시각 적응', '시력', '안구'] },
  { name: '뇌건강',    keywords: ['인지기능', '인지능력', '인지력', '기억력', '두뇌', '뇌 건강', '뇌건강', '인지기능 개선', '기억력 개선'] },
  { name: '간건강',    keywords: ['간 건강', '간건강', '간을 보호', '간 보호', '알콜성 손상', '알콜로 인해', '비알콜성 간'] },
  { name: '혈압',      keywords: ['혈압', '혈압조절', '혈압 조절', '높은 혈압'] },
  { name: '체지방감소', keywords: ['체지방 감소', '체지방감소', '체지방 증가가 적', '체지방증가가 적'] },
  { name: '혈당조절',  keywords: ['혈당', '혈당조절', '혈당 조절', '혈당상승 억제', '혈당 상승 억제', '식후혈당', '혈당감소', '당의 흡수'] },
  { name: '뼈관절',    keywords: ['뼈 건강', '뼈건강', '관절', '연골', '골다공증', '뼈의 형성', '뼈 형성', '골 건강', '칼슘 흡수'] },
  { name: '피부건강',  keywords: ['피부 보습', '피부보습', '피부건강', '피부 건강', '피부손상', '피부 손상', '피부홍반', '피부상태', '피부 상태'] },
  { name: '수면정신',  keywords: ['수면', '긴장완화', '긴장 완화', '스트레스', '정신건강', '정신 건강', '불안', '수면의 질', '수면건강', '수면 건강'] },
  { name: '면역',      keywords: ['면역기능', '면역 기능', '면역증진', '면역조절', '면역 조절', '면역과민반응', '면역 과민반응', '면역력'] },
  { name: '남성건강',  keywords: ['전립선', '갱년기 남성', '남성의 갱년기', '남성건강', '남성 건강', '정자운동'] },
  { name: '여성건강',  keywords: ['갱년기 여성', '갱년기여성', '여성건강', '폐경', '월경 전', '월경전', 'PMS', '생리전'] },
  { name: '배변활동',  keywords: ['배변활동', '배변 활동', '변비'] },
  { name: '근육/운동', keywords: ['근력', '근육', '근력개선', '근력 개선', '근력 유지', '신경과 근육', '운동수행', '운동능력', '지구력', '운동 후', '운동 시'] },
  { name: '혈액',      keywords: ['혈액생성', '혈액 생성', '혈액응고', '호모시스테인', '빈혈'] },
  { name: '구강케어',  keywords: ['잇몸', '구강', '치아', '충치'] },
  { name: '전해질균형', keywords: ['전해질', '칼륨', '나트륨'] },
  { name: '항산화',    keywords: ['항산화', '유해산소', '활성산소', '산화스트레스', '산화적 스트레스'] },
  { name: '위건강',    keywords: ['위 건강', '위건강', '위 점막', '위점막', '헬리코박터', '위 불편감', '소화'] },
  { name: '키성장',    keywords: ['키성장', '키 성장', '성장기'] },
  { name: '배뇨기능',  keywords: ['배뇨', '요로', '방광'] },
  { name: '콜레스테롤', keywords: ['콜레스테롤', '중성지방', '중성지질', '지질조절'] },
  { name: '모발',      keywords: ['모발', '탈모'] },
  { name: '에너지활력', keywords: ['에너지 대사', '에너지 생성', '에너지 이용', '피로', '활력'] },
  { name: '호흡기',    keywords: ['기관·기관지', '기관지', '기침', '가래', '코상태', '코 상태', '코막힘', '호흡기'] },
  { name: '멀티비타민', keywords: ['멀티비타민', '복합비타민'] },
];

// 비타민 패턴 (2종 이상 감지 시 멀티비타민 분류)
const VITAMIN_PATTERNS = [
  '비타민 a', '비타민a', '비타민 b1', '비타민b1', '비타민 b2', '비타민b2',
  '비타민 b3', '비타민 b5', '비타민 b6', '비타민b6', '비타민 b7', '비타민 b9',
  '비타민 b12', '비타민b12', '비타민 c', '비타민c', '비타민 d', '비타민d',
  '비타민 e', '비타민e', '비타민 k', '비타민k', '나이아신', '판토텐산',
  '엽산', '비오틴', '베타카로틴',
];

function autoClassify(functionalityText) {
  if (!functionalityText) return '';
  const text = functionalityText;
  const textLower = text.toLowerCase();
  const matched = new Set();

  // 1. 키워드 기반 분류
  for (const cat of CATEGORIES_KEYWORDS) {
    for (const kw of cat.keywords) {
      if (text.includes(kw)) {
        matched.add(cat.name);
        break;
      }
    }
  }

  // 2. 멀티비타민 감지: 비타민 2종 이상 포함 시
  const vitaminHits = new Set();
  for (const vp of VITAMIN_PATTERNS) {
    if (textLower.includes(vp)) vitaminHits.add(vp);
  }
  if (vitaminHits.size >= 2) matched.add('멀티비타민');

  return Array.from(matched).join(', ');
}

// "제2026-20호(2026.5.15.)" → { recognitionNumber: "제2026-20호", registeredDate: "2026.5.15." }
function parseRecognitionNumber(raw) {
  if (!raw) return { recognitionNumber: '', registeredDate: '' };

  // 날짜 괄호 부분 분리: (2026.5.15.) 또는 (2026.05.15)
  const dateMatch = raw.match(/\((\d{4}\.\d{1,2}\.\d{1,2}\.?)\)/);
  const registeredDate = dateMatch ? dateMatch[1].replace(/\.$/, '') : '';

  // 인정번호 본체만 추출
  const recognitionNumber = raw.replace(/\s*\(.*?\)\s*/g, '').trim();

  return { recognitionNumber, registeredDate };
}

function cleanText(str) {
  if (!str) return '';
  return str.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

async function run() {
  const jsonPath = process.argv[2]
    || 'C:\\Study\\Monday_Junior\\foodsafety_crawler\\output\\개별인정원료.json';

  if (!fs.existsSync(jsonPath)) {
    console.error(`파일을 찾을 수 없습니다: ${jsonPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(raw);
  const items = data.items || [];

  console.log(`JSON 로드 완료: ${items.length}건`);

  const db = makePrisma();

  // ── 1. 기존 전체 삭제 ────────────────────────────────────────────────────
  console.log('기존 DB 전체 삭제 중...');
  const deleted = await db.individual_raw_materials.deleteMany({});
  console.log(`  삭제 완료: ${deleted.count}건`);

  // ── 2. JSON → records 변환 ────────────────────────────────────────────────
  let skipped = 0;
  const records = [];

  for (const item of items) {
    const { recognitionNumber, registeredDate } = parseRecognitionNumber(item['인정번호']);

    if (!recognitionNumber) {
      console.warn(`  [건너뜀] 인정번호 없음: ${item['제목']}`);
      skipped++;
      continue;
    }

    const name              = cleanText(item['원료명']) || cleanText(item['제목']);
    const company           = cleanText(item['업체명']);
    const functionalityText = cleanText(item['기능성내용']);
    const dailyIntake       = cleanText(item['일일섭취량']);
    const precautions       = item['섭취주의사항'] ? item['섭취주의사항'].trim() : '';
    const detailContent     = item['상세내용'] ? item['상세내용'].trim() : '';
    const categories        = autoClassify(functionalityText);

    records.push({
      recognitionNumber,
      name:             name            || '',
      company:          company         || '',
      functionalityText: functionalityText || '',
      dailyIntake:      dailyIntake     || '',
      precautions:      precautions     || '',
      registeredDate:   registeredDate  || '',
      detailContent:    detailContent   || '',
      categories,
    });
  }

  // ── 3. createMany (배치 100건) ──────────────────────────────────────────
  const BATCH = 100;
  let inserted = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    await db.individual_raw_materials.createMany({ data: chunk });
    inserted += chunk.length;
    console.log(`  삽입 중... ${inserted}/${records.length}`);
  }

  await db.$disconnect();

  console.log('\n────────────────────────────');
  console.log(`완료: 신규 삽입 ${inserted}건 | 건너뜀 ${skipped}건`);
}

run()
  .catch(e => { console.error(e); process.exit(1); });
