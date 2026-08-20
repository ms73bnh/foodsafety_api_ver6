const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  const newPasswordHash = hashPassword('admin123');
  
  const updated = await prisma.user.updateMany({
    where: { username: 'admin' },
    data: {
      password: newPasswordHash,
      role: 'ADMIN'
    }
  });
  
  console.log('Updated user password outcome:', updated);
}

main().catch(console.error).finally(() => prisma.$disconnect());
