const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function main() {
  const jsonPath = path.join(__dirname, "..", "raw_materials_data.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("raw_materials_data.json not found. Run crawler first.");
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log("Total items:", data.length);
  let inserted = 0, skipped = 0, updated = 0;
  for (const item of data) {
    if (!item.ntctxtNo) { skipped++; continue; }
    const existing = await prisma.raw_material_posts.findUnique({ where: { ntctxtNo: item.ntctxtNo } });
    const payload = {
      no: item.no || "", title: item.title || "", regDate: item.regDate || "",
      viewCnt: item.viewCnt || "", content: item.content || "",
      attachmentName: item.attachmentName || "", filePath: item.filePath || "",
      fileName: item.fileName || "", orgFileName: item.orgFileName || "",
      fileTypeCd: item.fileTypeCd || "", ecmFileNo: item.ecmFileNo || "",
      localPdfPath: item.localPdfPath || "",
    };
    if (existing) {
      await prisma.raw_material_posts.update({ where: { ntctxtNo: item.ntctxtNo }, data: payload });
      updated++;
    } else {
      await prisma.raw_material_posts.create({ data: { ntctxtNo: item.ntctxtNo, ...payload } });
      inserted++;
    }
  }
  const total = await prisma.raw_material_posts.count();
  console.log("Done! inserted:", inserted, "updated:", updated, "skipped:", skipped, "total:", total);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
