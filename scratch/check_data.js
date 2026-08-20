const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.declarations.count();
  const withNorm = await prisma.declarations.count({
    where: { NOT: { normalizedFunctionality: null } }
  });
  const sample = await prisma.declarations.findMany({
    take: 10,
    select: { prdlstNm: true, prmsDt: true, normalizedFunctionality: true, primaryFnclty: true }
  });
  
  const now = new Date();
  const tCurrent = new Date(); tCurrent.setDate(now.getDate() - 90);
  const tPrevious = new Date(); tPrevious.setDate(now.getDate() - 180);
  
  const fmt = (d) => d.toISOString().split('T')[0].replace(/-/g, '');
  const sCurrent = fmt(tCurrent);
  const sPrevious = fmt(tPrevious);

  const countRecent = await prisma.declarations.count({
    where: { prmsDt: { gte: sPrevious } }
  });

  console.log(JSON.stringify({
    total: count,
    withNormalized: withNorm,
    sample,
    sCurrent,
    sPrevious,
    countRecent
  }, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
