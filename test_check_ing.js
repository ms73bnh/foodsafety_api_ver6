const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const materials = await prisma.individual_raw_materials.findMany({
    where: {
      name: { contains: '기장밀' }
    },
    select: {
      id: true,
      name: true,
      recognitionNumber: true,
      company: true
    }
  });

  console.log('--- 기장밀 관련 개별인정형 원료 목록 ---');
  materials.forEach(m => {
    console.log(`ID: ${m.id} | 원료명: "${m.name}" | 인정번호: "${m.recognitionNumber}" | 업체명: "${m.company}"`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
