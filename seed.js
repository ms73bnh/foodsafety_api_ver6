const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  console.log('Seeding default users...');
  
  // 1. 관리자 계정 생성
  const adminPassword = hashPassword('admin123!');
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: adminPassword,
      name: '최고관리자',
      companyNm: '식품안전인사이트',
      deptNm: '시스템운영팀',
      positionNm: '과장',
      titleNm: '최고관리자',
      role: 'ADMIN',
      isApproved: true
    }
  });
  console.log('Created Admin User:', adminUser.username);

  // 2. 승인된 일반 사용자 계정 생성
  const userPassword = hashPassword('user123!');
  const approvedUser = await prisma.user.upsert({
    where: { username: 'user' },
    update: {},
    create: {
      username: 'user',
      password: userPassword,
      name: '홍길동',
      companyNm: '그린푸드',
      deptNm: '품질관리팀',
      positionNm: '대리',
      titleNm: '담당자',
      role: 'USER',
      isApproved: true
    }
  });
  console.log('Created Approved User:', approvedUser.username);

  // 3. 미승인 일반 사용자 계정 생성
  const pendingUser = await prisma.user.upsert({
    where: { username: 'pending_user' },
    update: {},
    create: {
      username: 'pending_user',
      password: userPassword,
      name: '임꺽정',
      companyNm: '서울식품',
      deptNm: '연구개발부',
      positionNm: '사원',
      titleNm: '연구원',
      role: 'USER',
      isApproved: false
    }
  });
  console.log('Created Pending User:', pendingUser.username);
  
  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
