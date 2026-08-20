const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const dataPath = path.join(__dirname, 'raw_materials_data.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`Importing ${data.length} records into raw_material_posts...`);

  // no 숫자 기준 내림차순 정렬
  data.sort((a, b) => parseInt(b.no || 0, 10) - parseInt(a.no || 0, 10));

  let inserted = 0;
  for (const item of data) {
    if (!item.ntctxtNo || !item.title) continue;
    const noInt = parseInt(item.no, 10) || null;

    await prisma.raw_material_posts.upsert({
      where: { ntctxtNo: item.ntctxtNo },
      update: {
        no: noInt,
        title: item.title,
        companyNm: item.companyNm || null,
        recogNo: item.recogNo || null,
        functionalityText: item.functionalityText || null,
        dailyIntake: item.dailyIntake || null,
        precautions: item.precautions || null,
        regDate: item.regDate || null,
        viewCnt: item.viewCnt || null,
        content: item.content || null,
        attachmentName: item.attachmentName || null,
        filePath: item.filePath || null,
        fileName: item.fileName || null,
        orgFileName: item.orgFileName || null,
        fileTypeCd: item.fileTypeCd || null,
        ecmFileNo: item.ecmFileNo || null,
        localPdfPath: item.localPdfPath || null,
      },
      create: {
        no: noInt,
        ntctxtNo: item.ntctxtNo,
        title: item.title,
        companyNm: item.companyNm || null,
        recogNo: item.recogNo || null,
        functionalityText: item.functionalityText || null,
        dailyIntake: item.dailyIntake || null,
        precautions: item.precautions || null,
        regDate: item.regDate || null,
        viewCnt: item.viewCnt || null,
        content: item.content || null,
        attachmentName: item.attachmentName || null,
        filePath: item.filePath || null,
        fileName: item.fileName || null,
        orgFileName: item.orgFileName || null,
        fileTypeCd: item.fileTypeCd || null,
        ecmFileNo: item.ecmFileNo || null,
        localPdfPath: item.localPdfPath || null,
      }
    });
    inserted++;
  }
  const total = await prisma.raw_material_posts.count();
  console.log(`Done! Total records in raw_material_posts: ${total}`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });