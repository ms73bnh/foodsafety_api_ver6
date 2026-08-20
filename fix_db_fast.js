const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDb() {
  await prisma.$executeRawUnsafe(`
    UPDATE food_alerts
    SET regDate = substr(json_extract(detailJson, '$.CRET_DTM'), 1, 10)
    WHERE type = 'RECALL' AND json_extract(detailJson, '$.CRET_DTM') IS NOT NULL;
  `);
  
  await prisma.$executeRawUnsafe(`
    UPDATE food_alerts
    SET regDate = substr(json_extract(detailJson, '$.CRET_DTM'), 1, 10)
    WHERE type = 'INSPECTION' AND json_extract(detailJson, '$.CRET_DTM') IS NOT NULL;
  `);

  console.log('Fixed DB via executeRaw');
}

fixDb().catch(console.error).finally(() => prisma.$disconnect());
