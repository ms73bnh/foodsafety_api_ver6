const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testSearch() {
  const searchTerm = '비타민 C';
  
  console.log(`Searching for "${searchTerm}"...`);
  
  const results = await prisma.declarations.findMany({
    where: {
      OR: [
        { normalizedFunctionality: { contains: searchTerm } },
        { rawmtrlNm: { contains: searchTerm } }
      ]
    },
    take: 5,
    select: {
      prdlstNm: true,
      normalizedFunctionality: true,
      rawmtrlNm: true
    }
  });
  
  console.log('Results:', JSON.stringify(results, null, 2));
  await prisma.$disconnect();
}

testSearch();
