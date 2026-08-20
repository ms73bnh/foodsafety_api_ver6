const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 모의 매핑 함수 (백엔드 API 로직 재현)
function filterMappedProducts(candidates, recNumberCore) {
  return candidates.filter(prod => {
    const text = (prod.rawmtrlNm || '') + ' ' + (prod.indvRawmtrlNm || '');
    const matches = text.match(/제?\s*\d{4}-\d+\s*호?/g) || [];
    
    if (matches.length > 0) {
      const parsedCodes = matches.map(m => {
        const core = m.match(/\d+-\d+/);
        return core ? core[0] : '';
      }).filter(Boolean);

      if (recNumberCore && !parsedCodes.includes(recNumberCore)) {
        return false;
      }
    }
    return true;
  });
}

async function main() {
  // 1. '글리너 다이어트 핏' 완제품 조회
  const targetProduct = await prisma.declarations.findFirst({
    where: { prdlstNm: { contains: '글리너 다이어트 핏' } },
    select: { prdlstNm: true, rawmtrlNm: true, indvRawmtrlNm: true }
  });

  if (!targetProduct) {
    console.log('글리너 다이어트 핏 제품을 DB에서 찾을 수 없습니다.');
    return;
  }
  
  console.log(`\n[대상 완제품]: ${targetProduct.prdlstNm}`);
  console.log(`원재료명 (rawmtrlNm): ${targetProduct.rawmtrlNm}`);

  // 2. 두 가지 원료 케이스 설정
  // 케이스 A: 제2022-13호 (글리너 다이어트 핏의 진짜 원료 인정번호)
  // 케이스 B: 제2021-99호 (임의의 다른 레몬버베나 원료)
  
  // 공통 후보군 시뮬레이션: "레몬버베나"가 포함된 완제품들
  const candidates = await prisma.declarations.findMany({
    where: {
      OR: [
        { rawmtrlNm: { contains: '레몬버베나', mode: 'insensitive' } },
        { indvRawmtrlNm: { contains: '레몬버베나', mode: 'insensitive' } }
      ]
    },
    select: { prdlstNm: true, rawmtrlNm: true, indvRawmtrlNm: true }
  });

  console.log(`\n"레몬버베나" 키워드 매칭 후보 완제품 수: ${candidates.length}개`);

  const caseA = filterMappedProducts(candidates, '2022-13');
  const caseB = filterMappedProducts(candidates, '2021-99');

  console.log('\n--- [케이스 A: 인정번호 2022-13으로 매핑했을 때] ---');
  const matchA = caseA.find(p => p.prdlstNm.includes('글리너 다이어트 핏'));
  console.log(`글리너 다이어트 핏 포함 여부: ${matchA ? '포함됨 (정상)' : '누락됨 (오류)'}`);

  console.log('\n--- [케이스 B: 다른 인정번호 2021-99로 매핑했을 때] ---');
  const matchB = caseB.find(p => p.prdlstNm.includes('글리너 다이어트 핏'));
  console.log(`글리너 다이어트 핏 포함 여부: ${matchB ? '포함됨 (오류)' : '배제됨 (정상 - 수정 성공!)'}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
