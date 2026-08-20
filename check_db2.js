const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const types = ['RECALL', 'INSPECTION', 'ADMIN_ACTION'];
  for (const type of types) {
    const alerts = await prisma.food_alerts.findMany({
      where: { type },
      take: 2,
      orderBy: { regDate: 'desc' }
    });
    console.log(`\n=== ${type} ===`);
    console.log(JSON.stringify(alerts.map(a => ({ id: a.id, prdtNm: a.prdtNm, regDate: a.regDate })), null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
