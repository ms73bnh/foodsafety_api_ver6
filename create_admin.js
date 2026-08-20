const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  const username = 'admin';
  const passwordText = 'admin123';
  const hashedPassword = hashPassword(passwordText);

  // 기존 admin 계정이 있으면 삭제 후 재성성 또는 업데이트
  const existing = await prisma.user.findUnique({
    where: { username }
  });

  if (existing) {
    await prisma.user.update({
      where: { username },
      data: {
        password: hashedPassword,
        isApproved: true,
        role: 'ADMIN'
      }
    });
    console.log(`기존 admin 계정의 비밀번호를 '${passwordText}'로 업데이트하고 승인 완료했습니다.`);
  } else {
    await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        name: '관리자',
        companyNm: '식약처',
        deptNm: '데이터분석과',
        positionNm: '팀장',
        titleNm: '관리자',
        role: 'ADMIN',
        isApproved: true
      }
    });
    console.log(`새로운 admin 계정을 생성했습니다. (PW: ${passwordText})`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
