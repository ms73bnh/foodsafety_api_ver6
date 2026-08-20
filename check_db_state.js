const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  // 1. declarations 전체 수
  const total = await prisma.declarations.count();
  console.log('declarations 총 건수:', total);

  // 2. normalizedFunctionality 보유 건수
  const withFunc = await prisma.declarations.count({
    where: { normalizedFunctionality: { not: null } }
  });
  console.log('normalizedFunctionality 있는 건수:', withFunc);

  // 3. prmsDt 보유 건수
  const withDate = await prisma.declarations.count({
    where: { prmsDt: { not: null, not: '' } }
  });
  console.log('prmsDt 있는 건수:', withDate);

  // 4. 샘플 5건 출력
  const samples = await prisma.declarations.findMany({
    take: 5,
    where: { normalizedFunctionality: { not: null } },
    select: { prmsDt: true, normalizedFunctionality: true, prdlstNm: true }
  });
  console.log('\n샘플 (normalizedFunctionality 있는 5건):');
  samples.forEach((s, i) => {
    console.log(`[${i+1}] prmsDt=${s.prmsDt}`);
    console.log(`     normalizedFunctionality=${s.normalizedFunctionality?.substring(0, 120)}`);
  });

  // 5. 개별인정형원료 카테고리 분포
  const ingMats = await prisma.individual_raw_materials.findMany({
    select: { categories: true }
  });
  const catCount = {};
  ingMats.forEach(r => {
    if (r.categories) {
      r.categories.split(',').map(c => c.trim()).filter(Boolean).forEach(c => {
        catCount[c] = (catCount[c] || 0) + 1;
      });
    }
  });
  const sorted = Object.entries(catCount).sort((a, b) => b[1] - a[1]);
  console.log('\n개별인정형원료 카테고리 분포 (상위 10개):');
  sorted.slice(0, 10).forEach(([k, v]) => console.log(`  ${k}: ${v}건`));
  console.log('카테고리 미매핑 원료 수:', ingMats.filter(r => !r.categories || r.categories.trim() === '').length);
}

run().catch(console.error).finally(() => prisma.$disconnect());
