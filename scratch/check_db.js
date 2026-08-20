const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Checking declarations table...');
    const declCount = await prisma.declarations.count();
    console.log(`Declarations count: ${declCount}`);

    console.log('Checking food_alerts table...');
    const alertCount = await prisma.food_alerts.count();
    console.log(`Food alerts count: ${alertCount}`);
    
    console.log('Success: All tables exist.');
  } catch (error) {
    console.error('Error checking tables:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
