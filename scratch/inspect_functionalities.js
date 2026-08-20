const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const functionalitiesRaw = await prisma.declarations.findMany({
    where: { 
      normalizedFunctionality: { not: null, not: '' } 
    },
    select: { normalizedFunctionality: true },
    distinct: ['normalizedFunctionality']
  });

  const functionalities = new Set();
  functionalitiesRaw.forEach(item => {
    item.normalizedFunctionality.split(',').forEach(f => {
      const trimmed = f.trim();
      if (trimmed) functionalities.add(trimmed);
    });
  });

  const list = Array.from(functionalities).sort();
  console.log(`Total unique functionalities: ${list.length}`);
  console.log('First 100 samples:');
  console.log(JSON.stringify(list.slice(0, 100), null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
