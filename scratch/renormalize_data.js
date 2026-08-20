// scratch/renormalize_data.js
const { PrismaClient } = require('@prisma/client');
const { normalizeData } = require('../lib/normalizer');
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 기존 데이터 재정규화 시작...');
  
  const allData = await prisma.declarations.findMany({
    select: {
      id: true,
      prdlstReportNo: true,
      bsshNm: true,
      prdlstNm: true,
      dispos: true,
      prmsDt: true,
      primaryFnclty: true,
      rawmtrlNm: true,
      frmlcMtrqlt: true,
      prdtShapCdNm: true,
      indvRawmtrlNm: true,
      etcRawmtrlNm: true,
      capRawmtrlNm: true
    }
  });

  console.log(`📊 총 ${allData.length}건의 데이터를 처리합니다.`);

  let count = 0;
  for (const item of allData) {
    const normalized = normalizeData(item);
    
    await prisma.declarations.update({
      where: { id: item.id },
      data: {
        normalizedPackaging: normalized.normalizedPackaging,
        normalizedFunctionality: normalized.normalizedFunctionality,
        searchFunctionality: normalized.searchFunctionality,
        normalizedRawMaterials: normalized.normalizedRawMaterials
      }
    });

    count++;
    if (count % 100 === 0) {
      console.log(`✅ ${count}건 완료...`);
    }
  }

  console.log('🎉 모든 데이터 재정규화 완료!');
}

main()
  .catch(e => {
    console.error('❌ 에러 발생:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
