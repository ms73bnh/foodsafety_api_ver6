const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const alerts = await prisma.food_alerts.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(alerts, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
