const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const filePath = path.join(__dirname, '03data.md');
  if (!fs.existsSync(filePath)) {
    console.error('03data.md 파일이 존재하지 않습니다.');
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let currentCategory = null;
  let inTable = false;
  
  const rawMaterialsMap = new Map(); // key: uniqueKey, value: object

  for (let line of lines) {
    line = line.trim();
    
    // 카테고리 헤더 파싱
    // 예: ### 간건강 (25건)
    const categoryMatch = line.match(/^###\s+([^(]+)\s*\(\d+건\)/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim();
      inTable = false;
      continue;
    }

    // "전체 원료 인덱스" 섹션 이후는 무시
    if (line.startsWith('## 전체 원료 인덱스')) {
      break;
    }

    if (line.startsWith('|') && line.includes('---')) {
      inTable = true;
      continue;
    }

    if (inTable && line.startsWith('|')) {
      const parts = line.split('|').map(p => p.trim());
      // 헤더 행 무시
      if (parts[1] === '등록년도' || parts[1] === '등록연도') {
        continue;
      }
      
      if (parts.length >= 6) {
        const registeredYear = parts[1];
        const name = parts[2];
        const company = parts[3];
        const functionalityText = parts[4];
        let recognitionNumber = parts[5];

        if (!name || name === '원료명') continue;

        // 고유 식별자 처리
        let isTempNumber = false;
        if (!recognitionNumber || recognitionNumber === '-' || recognitionNumber === '') {
          // 인정번호가 없는 경우 고유한 임시 번호 생성
          recognitionNumber = `AUTO-${registeredYear}-${name.replace(/\s+/g, '')}-${company.replace(/\s+/g, '')}`;
          isTempNumber = true;
        }

        const key = recognitionNumber;

        if (rawMaterialsMap.has(key)) {
          // 이미 존재하면 카테고리 추가
          const existing = rawMaterialsMap.get(key);
          const cats = existing.categories.split(',').map(c => c.trim());
          if (currentCategory && !cats.includes(currentCategory)) {
            cats.push(currentCategory);
            existing.categories = cats.join(', ');
          }
          // 기능성 내용도 병합 (중복되지 않게)
          if (functionalityText && functionalityText !== '-') {
            if (!existing.functionalityText.includes(functionalityText)) {
              existing.functionalityText = existing.functionalityText 
                ? `${existing.functionalityText} / ${functionalityText}`
                : functionalityText;
            }
          }
        } else {
          // 새로 추가
          rawMaterialsMap.set(key, {
            recognitionNumber,
            name,
            company: (company === '-') ? '' : company,
            functionalityText: (functionalityText === '-') ? '' : functionalityText,
            dailyIntake: '',
            precautions: '',
            registeredDate: registeredYear,
            detailContent: '',
            categories: currentCategory || ''
          });
        }
      }
    }
  }

  console.log(`파싱 완료: 총 ${rawMaterialsMap.size}개의 고유 개별인정형 원료 추출`);

  // DB에 적재
  let count = 0;
  for (const material of rawMaterialsMap.values()) {
    try {
      await prisma.individual_raw_materials.upsert({
        where: { recognitionNumber: material.recognitionNumber },
        update: {
          name: material.name,
          company: material.company,
          functionalityText: material.functionalityText,
          registeredDate: material.registeredDate,
          categories: material.categories,
        },
        create: {
          recognitionNumber: material.recognitionNumber,
          name: material.name,
          company: material.company,
          functionalityText: material.functionalityText,
          registeredDate: material.registeredDate,
          categories: material.categories,
        }
      });
      count++;
    } catch (e) {
      console.error(`에러 발생 (${material.recognitionNumber}):`, e.message);
    }
  }

  console.log(`DB 동기화 완료: ${count}개 원료 적재 완료.`);
}

run()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
