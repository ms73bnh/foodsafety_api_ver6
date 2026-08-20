const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const alerts = await prisma.food_alerts.findMany({
    where: { 
      type: 'RECALL',
      regDate: { startsWith: '20' }
    },
    orderBy: { regDate: 'desc' },
    take: 5
  });
  console.log("RECALLS:", JSON.stringify(alerts, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
