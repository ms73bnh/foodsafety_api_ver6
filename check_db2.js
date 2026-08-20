const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const declCount = await prisma.declarations.count();
  const prodCount = await prisma.production_stats.count();
  const userCount = await prisma.user.count();
  const rawCount = await prisma.individual_raw_materials.count();
  
  console.log('--------------------------------------------');
  console.log('✅ 데이터베이스 적재 현황:');
  console.log(`- 품목신고현황 (declarations): ${declCount.toLocaleString()}건`);
  console.log(`- 생산실적 (production_stats): ${prodCount.toLocaleString()}건`);
  console.log(`- 개별인정형원료 (individual_raw_materials): ${rawCount.toLocaleString()}건`);
  console.log(`- 사용자 계정 (user): ${userCount.toLocaleString()}건`);
  console.log('--------------------------------------------');
}

main().catch(console.error).finally(() => prisma.$disconnect());
