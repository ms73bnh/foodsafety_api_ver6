// scratch/sample_packaging.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const data = await prisma.declarations.findMany({
    take: 50,
    select: {
      prdlstReportNo: true,
      frmlcMtrqlt: true,
      dispos: true,
      prdtShapCdNm: true
    }
  });
  console.log(JSON.stringify(data, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
