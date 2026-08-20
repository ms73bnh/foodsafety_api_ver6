const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const search = '모발';
  
  // prisma 쿼리 수행
  const where = {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
      { recognitionNumber: { contains: search, mode: 'insensitive' } },
      { functionalityText: { contains: search, mode: 'insensitive' } },
      { categories: { contains: search, mode: 'insensitive' } },
    ]
  };

  const results = await prisma.individual_raw_materials.findMany({
    where
  });

  console.log(`검색어: "${search}"`);
  console.log(`조회 결과 개수: ${results.length}개`);
  results.forEach((r, idx) => {
    console.log(`${idx+1}. [${r.categories}] ${r.name} / ${r.company} / ${r.functionalityText}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
