const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log('--- USER LIST ---');
  console.log(users.map(u => ({ username: u.username, role: u.role })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
