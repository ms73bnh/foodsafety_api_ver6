const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // declarations에서 원재료명이 기재된 데이터 중 상위 30개 출력
  const samples = await prisma.declarations.findMany({
    where: {
      OR: [
        { indvRawmtrlNm: { not: null } },
        { rawmtrlNm: { not: null } }
      ]
    },
    take: 30,
    select: {
      prdlstNm: true,
      rawmtrlNm: true,
      indvRawmtrlNm: true
    }
  });

  console.log('--- Declarations Sample Materials ---');
  samples.forEach((s, i) => {
    console.log(`${i+1}. 제품명: ${s.prdlstNm}`);
    console.log(`   rawmtrlNm (기본원재료): ${s.rawmtrlNm}`);
    console.log(`   indvRawmtrlNm (개별인정원재료): ${s.indvRawmtrlNm}`);
    console.log('-----------------------------------');
  });

  // 개별인정형원료 중 몇 개 샘플
  const ingredients = await prisma.individual_raw_materials.findMany({
    take: 10,
    select: {
      id: true,
      name: true
    }
  });
  console.log('\n--- Individual Raw Materials Sample ---');
  ingredients.forEach(i => {
    console.log(`ID: ${i.id}, Name: ${i.name}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
