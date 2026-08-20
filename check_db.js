const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 노이즈 필터 및 정규화 로직
const PKG_MAP = [
  { key: 'HDPE', label: 'HDPE(고밀도폴리에틸렌)' },
  { key: 'LDPE', label: 'LDPE(저밀도폴리에틸렌)' },
  { key: 'PE', label: 'PE(폴리에틸렌)' },
  { key: 'PP', label: 'PP(폴리프로필렌)' },
  { key: 'PET', label: 'PET(폴리에틸렌테레프탈레이트)' },
  { key: 'PVC', label: 'PVC(폴리염화비닐)' },
  { key: 'PS', label: 'PS(폴리스티렌)' },
  { key: '알루미늄', label: 'AL(알루미늄)' },
  { key: 'AL', label: 'AL(알루미늄)' },
  { key: '유리', label: '유리(Glass)' },
  { key: '종이', label: '종이(Paper)' },
  { key: 'PTP', label: 'PTP/블리스터' },
  { key: '블리스터', label: 'PTP/블리스터' }
];

const DISPLAY_REPLACEMENTS = {
  "비타민A": "비타민 A",
  "비타민B1": "비타민 B1",
  "비타민B2": "비타민 B2",
  "비타민B6": "비타민 B6",
  "비타민B12": "비타민 B12",
  "비타민C": "비타민 C",
  "비타민D": "비타민 D",
  "비타민E": "비타민 E",
  "비타민K": "비타민 K",
  "뮤코다당.단백": "뮤코다당·단백",
};

function cleanBasicText(text) {
  if (!text) return "";
  let t = String(text).trim();
  t = t.replace(/\s+/g, " ");
  t = t.replace(/,\s*$/, "");
  return t;
}

function applyDisplayReplacements(text) {
  let t = text;
  for (const [old, newVal] of Object.entries(DISPLAY_REPLACEMENTS)) {
    t = t.split(old).join(newVal);
  }
  t = t.replace(/\s*,\s*/g, ", ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function splitOutsideParentheses(text, delimiter = ",") {
  const parts = [];
  let current = [];
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") {
      depth++;
      current.push(ch);
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
      current.push(ch);
    } else if (ch === delimiter && depth === 0) {
      const part = current.join("").trim();
      if (part) parts.push(part);
      current = [];
    } else {
      current.push(ch);
    }
  }
  const last = current.join("").trim();
  if (last) parts.push(last);
  return parts;
}

function normalizeComponentDisplay(text) {
  let t = cleanBasicText(text);
  t = applyDisplayReplacements(t);
  t = t.replace(/\s+\(/g, "(");
  t = t.replace(/\(제\s*\d{4}\s*-\s*\d+\s*호\)/g, (match) => {
    const inner = match.replace(/\s+/g, "");
    const m = inner.match(/제(\d{4})-(\d+)호/);
    if (m) return `(제${m[1]}-${m[2]}호)`;
    return match;
  });
  return t.trim();
}

function isNoise(text) {
  if (!text) return true;
  const clean = text.trim();
  if (clean.length <= 1) return true;
  if (/^\d+$/.test(clean)) return true;
  const lower = clean.toLowerCase();
  const unitPattern = /^[\d\s.,x*~%|/()+-]+(mg|g|ml|l|kcal|포|정|캡슐|병|ea|t|box)?$/;
  if (unitPattern.test(lower)) return true;
  if (/^[0\s-]+$/.test(clean)) return true;
  return false;
}

function normalizePackaging(rawText) {
  if (!rawText) return "";
  const results = new Set();
  let upperText = rawText.toUpperCase();
  const sortedMap = [...PKG_MAP].sort((a, b) => b.key.length - a.key.length);
  for (const item of sortedMap) {
    const keyUpper = item.key.toUpperCase();
    if (upperText.includes(keyUpper)) {
      results.add(item.label);
      upperText = upperText.split(keyUpper).join(' ');
    }
  }
  return Array.from(results).join(", ") || "";
}

function normalizeData(item) {
  const rawPkg = item['포장재질'] || item.FRMLC_MTRQLT || '';
  const normPkg = normalizePackaging(rawPkg);

  // 이미 정규화기능성 컬럼이 제공된 경우 우선 사용하되 없으면 원재료에서 추출
  let normFunc = item['정규화기능성'] || '';
  if (!normFunc) {
    const rawText = item['품목유형(기능지표성분)'] || item.RAWMTRL_NM || "";
    const cleanText = cleanBasicText(rawText);
    const normalizedDisplay = applyDisplayReplacements(cleanText);
    const splitParts = splitOutsideParentheses(normalizedDisplay, ",");
    const canonicalTerms = splitParts
      .map(p => normalizeComponentDisplay(p))
      .filter(p => !isNoise(p));
    normFunc = canonicalTerms.join(", ");
  }

  const searchFunc = normFunc ? normFunc.replace(/\s+/g, "").toLowerCase() : "";
  let normRaw = item['정규화원재료'] || item['품목유형(기능지표성분)'] || item.RAWMTRL_NM || '';

  return {
    normalizedPackaging: normPkg || null,
    normalizedFunctionality: normFunc || null,
    searchFunctionality: searchFunc || null,
    normalizedRawMaterials: normRaw || null
  };
}

// 1. 품목신고현황 벌크 임포트
async function importDeclarationsFast(filePath) {
  console.log(`\n========================================`);
  console.log(`[품목신고현황] 파일 읽는 중: ${filePath}`);
  const wb = XLSX.readFile(filePath, { raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);
  console.log(`총 행 수: ${rows.length}개`);

  const CHUNK_SIZE = 1000;
  let totalProcessed = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const r of chunk) {
      const reportNo = String(r['품목제조번호'] || r['PRDLST_REPORT_NO'] || '').trim();
      if (!reportNo) continue;

      const norm = normalizeData(r);

      const bsshNm = r['업소명'] ? String(r['업소명']).trim() : null;
      const prdlstNm = r['품목명'] ? String(r['품목명']).trim() : null;
      const prmsDt = r['허가일자'] ? String(r['허가일자']).trim() : null;
      const lcnsNo = r['인허가번호'] ? String(r['인허가번호']).trim() : null;
      const pogDaycnt = r['소비기한일수'] ? String(r['소비기한일수']).trim() : null;
      const dispos = r['제품형태'] ? String(r['제품형태']).trim() : null;
      const ntkMthd = r['섭취방법'] ? String(r['섭취방법']).trim() : null;
      const primaryFnclty = r['주된기능성'] ? String(r['주된기능성']).trim() : null;
      const iftknAtntMatrCn = r['섭취시주의사항'] ? String(r['섭취시주의사항']).trim() : null;
      const cstdyMthd = r['보관방법'] ? String(r['보관방법']).trim() : null;
      const prdlstCdnm = r['유형'] ? String(r['유형']).trim() : null;
      const stdrStnd = r['기준규격'] ? String(r['기준규격']).trim() : null;
      const hiengLntrtDvsNm = r['고열량저영양여부'] ? String(r['고열량저영양여부']).trim() : null;
      const production = r['생산종료여부'] ? String(r['생산종료여부']).trim() : null;
      const childCrtfcYn = r['어린이기호식품인증'] ? String(r['어린이기호식품인증']).trim() : null;
      const prdtShapCdNm = r['제품형태코드명'] ? String(r['제품형태코드명']).trim() : null;
      const frmlcMtrqlt = r['포장재질'] ? String(r['포장재질']).trim() : null;
      const rawmtrlNm = r['품목유형(기능지표성분)'] ? String(r['품목유형(기능지표성분)']).trim() : null;
      const indutyCdNm = r['업종'] ? String(r['업종']).trim() : null;
      const lastUpdtDtm = r['최종수정일자'] ? String(r['최종수정일자']).trim() : null;
      const indvRawmtrlNm = r['기능성원재료'] ? String(r['기능성원재료']).trim() : null;
      const etcRawmtrlNm = r['기타원재료'] ? String(r['기타원재료']).trim() : null;
      const capRawmtrlNm = r['캡슐원재료'] ? String(r['캡슐원재료']).trim() : null;
      const frmlcMthd = r['포장방법'] ? String(r['포장방법']).trim() : null;

      values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::timestamp, $${paramIdx++}::timestamp)`);

      params.push(
        reportNo, bsshNm, prdlstNm, dispos, prmsDt, primaryFnclty, ntkMthd,
        iftknAtntMatrCn, cstdyMthd, rawmtrlNm, lcnsNo, pogDaycnt, prdlstCdnm,
        stdrStnd, hiengLntrtDvsNm, production, childCrtfcYn, prdtShapCdNm,
        frmlcMtrqlt, indutyCdNm, lastUpdtDtm, indvRawmtrlNm, etcRawmtrlNm,
        capRawmtrlNm, frmlcMthd, norm.normalizedPackaging, norm.normalizedFunctionality,
        norm.searchFunctionality, norm.normalizedRawMaterials, now, now
      );
    }

    if (values.length === 0) continue;

    const query = `
      INSERT INTO "declarations" (
        "prdlstReportNo", "bsshNm", "prdlstNm", "dispos", "prmsDt", "primaryFnclty", "ntkMthd",
        "iftknAtntMatrCn", "cstdyMthd", "rawmtrlNm", "lcnsNo", "pogDaycnt", "prdlstCdnm",
        "stdrStnd", "hiengLntrtDvsNm", "production", "childCrtfcYn", "prdtShapCdNm",
        "frmlcMtrqlt", "indutyCdNm", "lastUpdtDtm", "indvRawmtrlNm", "etcRawmtrlNm",
        "capRawmtrlNm", "frmlcMthd", "normalizedPackaging", "normalizedFunctionality",
        "searchFunctionality", "normalizedRawMaterials", "createdAt", "updatedAt"
      ) VALUES ${values.join(', ')}
      ON CONFLICT ("prdlstReportNo") DO UPDATE SET
        "bsshNm" = EXCLUDED."bsshNm",
        "prdlstNm" = EXCLUDED."prdlstNm",
        "dispos" = EXCLUDED."dispos",
        "prmsDt" = EXCLUDED."prmsDt",
        "primaryFnclty" = EXCLUDED."primaryFnclty",
        "ntkMthd" = EXCLUDED."ntkMthd",
        "iftknAtntMatrCn" = EXCLUDED."iftknAtntMatrCn",
        "cstdyMthd" = EXCLUDED."cstdyMthd",
        "rawmtrlNm" = EXCLUDED."rawmtrlNm",
        "lcnsNo" = EXCLUDED."lcnsNo",
        "pogDaycnt" = EXCLUDED."pogDaycnt",
        "prdlstCdnm" = EXCLUDED."prdlstCdnm",
        "stdrStnd" = EXCLUDED."stdrStnd",
        "hiengLntrtDvsNm" = EXCLUDED."hiengLntrtDvsNm",
        "production" = EXCLUDED."production",
        "childCrtfcYn" = EXCLUDED."childCrtfcYn",
        "prdtShapCdNm" = EXCLUDED."prdtShapCdNm",
        "frmlcMtrqlt" = EXCLUDED."frmlcMtrqlt",
        "indutyCdNm" = EXCLUDED."indutyCdNm",
        "lastUpdtDtm" = EXCLUDED."lastUpdtDtm",
        "indvRawmtrlNm" = EXCLUDED."indvRawmtrlNm",
        "etcRawmtrlNm" = EXCLUDED."etcRawmtrlNm",
        "capRawmtrlNm" = EXCLUDED."capRawmtrlNm",
        "frmlcMthd" = EXCLUDED."frmlcMthd",
        "normalizedPackaging" = EXCLUDED."normalizedPackaging",
        "normalizedFunctionality" = EXCLUDED."normalizedFunctionality",
        "searchFunctionality" = EXCLUDED."searchFunctionality",
        "normalizedRawMaterials" = EXCLUDED."normalizedRawMaterials",
        "updatedAt" = EXCLUDED."updatedAt"
    `;

    await prisma.$executeRawUnsafe(query, ...params);
    totalProcessed += chunk.length;
    process.stdout.write(`\r[품목신고] 진행률: ${totalProcessed} / ${rows.length} (${Math.round(totalProcessed / rows.length * 100)}%)`);
  }

  console.log(`\n[품목신고현황] 완료! 총 ${totalProcessed}건 처리.`);
}

// 2. 생산실적 벌크 임포트 (Prisma createMany + Connection recycle)
async function importProductionFast(filePath) {
  console.log(`\n========================================`);
  console.log(`[생산실적] 파일 읽는 중: ${filePath}`);
  const wb = XLSX.readFile(filePath, { raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);
  console.log(`총 행 수: ${rows.length}개`);

  const CHUNK_SIZE = 1000;
  let totalProcessed = 0;
  let client = prisma;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const dataList = [];
    // 중복 방지를 위한 맵
    const keySet = new Set();

    for (const r of chunk) {
      const reportNo = String(r['품목제조번호'] || r['PRDLST_REPORT_NO'] || '').trim();
      const evlYr = String(r['연도'] || r['EVL_YR'] || '').trim();
      if (!reportNo || !evlYr) continue;

      const key = `${reportNo}_${evlYr}`;
      if (keySet.has(key)) continue;
      keySet.add(key);

      const prdlstNm = r['품목명'] ? String(r['품목명']).trim() : null;
      const bsshNm = r['업체명'] || r['업소명'] ? String(r['업체명'] || r['업소명']).trim() : null;
      const lcnsNo = r['인허가번호'] ? String(r['인허가번호']).trim() : null;
      const hItemNm = r['품목유형'] ? String(r['품목유형']).trim() : null;
      const gubun = r['품목구분'] ? String(r['품목구분']).trim() : null;

      const toNum = (v) => {
        if (v === undefined || v === null || v === '') return 0;
        const n = parseFloat(String(v).replace(/,/g, '').trim());
        return isNaN(n) ? 0 : n;
      };

      const prdctnQy = toNum(r['생산량(KG)'] || r['PRDCTN_QY']);
      const fyerPrdctnAbrtQy = toNum(r['연간생산능력(KG)'] || r['FYER_PRDCTN_ABRT_QY']);

      dataList.push({
        prdlstReportNo: reportNo,
        evlYr: evlYr,
        bsshNm: bsshNm,
        prdlstNm: prdlstNm,
        hItemNm: hItemNm,
        lcnsNo: lcnsNo,
        gubun: gubun,
        fyerPrdctnAbrtQy: fyerPrdctnAbrtQy,
        prdctnQy: prdctnQy
      });
    }

    if (dataList.length > 0) {
      let retries = 3;
      while (retries > 0) {
        try {
          await client.production_stats.createMany({
            data: dataList,
            skipDuplicates: true
          });
          break;
        } catch (err) {
          retries--;
          console.warn(`\n[createMany 재시도] index ${i}, 남은 재시도: ${retries}, 에러: ${err.message}`);
          await new Promise(r => setTimeout(r, 2000));
          if (retries === 0) throw err;
        }
      }
    }

    totalProcessed += chunk.length;
    if (i % 5000 === 0 || totalProcessed >= rows.length) {
      process.stdout.write(`\r[생산실적] 진행률: ${totalProcessed} / ${rows.length} (${Math.round(totalProcessed / rows.length * 100)}%)`);
    }

    // 2만 건마다 커넥션 리셋으로 캐시 및 메모리 완전 정리
    if (i > 0 && i % 20000 === 0) {
      await client.$disconnect();
      await new Promise(r => setTimeout(r, 1000));
      client = new PrismaClient();
    }
  }

  console.log(`\n[생산실적] 완료! 총 ${totalProcessed}건 처리 완료.`);
}

async function main() {
  const productionPath = 'I:\\5.다운로드\\production_raw_data_2026-08-20.csv';
  await importProductionFast(productionPath);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });


