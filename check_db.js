const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

function verifyPassword(password, storedPassword) {
  if (!storedPassword || !storedPassword.includes(':')) return false;
  const [salt, originalHash] = storedPassword.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { username: 'admin' }
  });
  console.log("USER:", user);
  if (user) {
    console.log("비밀번호 'admin123' 검증 결과:", verifyPassword('admin123', user.password));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
