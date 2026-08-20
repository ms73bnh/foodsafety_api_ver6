const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const dbRows = await prisma.food_alerts.findMany({
    where: { 
      type: 'RECALL',
      regDate: { startsWith: '20' }
    },
    orderBy: { regDate: 'desc' },
    take: 1
  });
  
  const mapped = dbRows.map(row => ({
      _standard: {
        title: row.prdtNm,
        subTitle: row.bsshNm,
        desc: row.reason,
        result: row.result,
        date: row.regDate,
        img: row.imgUrl,
        type: row.type
      }
  }));

  console.log("MAPPED:", JSON.stringify(mapped, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
