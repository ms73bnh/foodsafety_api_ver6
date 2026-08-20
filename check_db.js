const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const alerts = await prisma.food_alerts.findMany({
    take: 5,
    orderBy: { regDate: 'desc' }
  });
  console.log("ALERTS:", JSON.stringify(alerts, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
