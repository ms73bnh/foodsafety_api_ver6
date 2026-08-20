const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 기장밀 원료 찾기
  const target = await prisma.individual_raw_materials.findFirst({
    where: {
      name: { contains: '기장밀' }
    }
  });

  if (!target) {
    console.log('기장밀 원료를 찾을 수 없습니다.');
    return;
  }

  console.log(`대상 원료 - ID: ${target.id}, 원료명: ${target.name}, 인정번호: ${target.recognitionNumber}`);

  // 인정번호 핵심 추출 (예: "제2024-16호" -> "2024-16")
  const rawRecNum = target.recognitionNumber || '';
  const recNumberMatch = rawRecNum.match(/\d+-\d+/);
  const recNumberCore = recNumberMatch ? recNumberMatch[0] : '';
  console.log(`추출된 인정번호 코어: "${recNumberCore}"`);

  // DB 검색 조건 재현
  const orConditions = [];
  if (rawRecNum) {
    orConditions.push(
      { rawmtrlNm: { contains: rawRecNum, mode: 'insensitive' } },
      { indvRawmtrlNm: { contains: rawRecNum, mode: 'insensitive' } }
    );
  }
  if (recNumberCore) {
    orConditions.push(
      { rawmtrlNm: { contains: recNumberCore, mode: 'insensitive' } },
      { indvRawmtrlNm: { contains: recNumberCore, mode: 'insensitive' } }
    );
  }

  const matches = await prisma.declarations.findMany({
    where: {
      OR: orConditions
    },
    take: 5,
    select: {
      prdlstReportNo: true,
      prdlstNm: true,
      rawmtrlNm: true,
      indvRawmtrlNm: true
    }
  });

  console.log(`\n인정번호 매핑된 완제품 수: ${matches.length}개 (상위 5개 표시)`);
  matches.forEach((m, idx) => {
    console.log(`${idx+1}. 제품명: ${m.prdlstNm} | 신고번호: ${m.prdlstReportNo}`);
    console.log(`   원재료명(rawmtrlNm): ${m.rawmtrlNm}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
