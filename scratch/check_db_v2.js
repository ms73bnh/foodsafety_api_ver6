
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Food Alerts ---');
  const alerts = await prisma.food_alerts.findMany({ take: 5 });
  console.log(JSON.stringify(alerts, null, 2));

  console.log('\n--- Sync History ---');
  const history = await prisma.sync_history.findMany({ 
    orderBy: { executedAt: 'desc' },
    take: 5 
  });
  console.log(JSON.stringify(history, null, 2));

  console.log('\n--- Unique Functionalities ---');
  const functionalities = await prisma.declarations.findMany({
    select: { normalizedFunctionality: true },
    distinct: ['normalizedFunctionality'],
    take: 20
  });
  console.log(functionalities.map(f => f.normalizedFunctionality).filter(Boolean));

  console.log('\n--- Unique Packaging ---');
  const packaging = await prisma.declarations.findMany({
    select: { normalizedPackaging: true },
    distinct: ['normalizedPackaging'],
    take: 20
  });
  console.log(packaging.map(p => p.normalizedPackaging).filter(Boolean));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
