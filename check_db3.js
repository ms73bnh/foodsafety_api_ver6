const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const alerts = await prisma.food_alerts.findMany({
    where: { type: 'RECALL' },
    take: 10,
    orderBy: { regDate: 'desc' }
  });
  console.log(alerts);
}

main().catch(console.error).finally(() => prisma.$disconnect());
