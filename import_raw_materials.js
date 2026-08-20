const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const dataPath = path.join(__dirname, 'raw_materials_data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('raw_materials_data.json not found!');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`Importing ${data.length} records...`);

  let inserted = 0, skipped = 0;
  for (const item of data) {
    if (!item.ntctxtNo || !item.title) { skipped++; continue; }
    await prisma.raw_material_posts.upsert({
      where: { ntctxtNo: item.ntctxtNo },
      update: {
        title: item.title,
        companyNm: item.companyNm || null,
        recogNo: item.recogNo || null,
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
        no: item.no || null,
        ntctxtNo: item.ntctxtNo,
        title: item.title,
        companyNm: item.companyNm || null,
        recogNo: item.recogNo || null,
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
    if (inserted % 50 === 0) console.log(`  ${inserted}/${data.length} done...`);
  }
  const total = await prisma.raw_material_posts.count();
  console.log(`Done! DB total: ${total}`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });