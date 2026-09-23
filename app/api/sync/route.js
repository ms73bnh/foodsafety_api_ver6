import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import axios from 'axios';
import { normalizeData } from '@/lib/normalizer';
import { isAdmin } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_KEY = process.env.FOOD_API_KEY || 'd753b2c401d242248da5';
const SERVICE_ID = 'I0030';

/**
 * 요청 권한 검증 (관리자 세션, SYNC_SECRET Bearer 토큰, 또는 Vercel Cron 헤더/쿼리)
 */
function checkAuth(req) {
  // 1. 관리자 세션 (쿠키 기반)
  if (isAdmin(req)) return true;

  const authHeader = req.headers.get('authorization');
  const syncSecret = process.env.SYNC_SECRET;

  // 2. Bearer 토큰 검증 (GitHub Actions 등)
  if (syncSecret && authHeader === `Bearer ${syncSecret}`) {
    return true;
  }

  // 3. Vercel Cron 헤더 또는 ?cron=true
  const isVercelCron = Boolean(req.headers.get('x-vercel-cron'));
  const { searchParams } = new URL(req.url);
  const isCronQuery = searchParams.get('cron') === 'true';

  if (isVercelCron) return true;

  if (isCronQuery) {
    if (!syncSecret || authHeader === `Bearer ${syncSecret}`) {
      return true;
    }
  }

  return false;
}

/**
 * 정기 자동 동기화 다중 배치 수행 (Cron/GitHub Actions용)
 */
async function runCronSync(req) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '1000', 10), 100), 2000);
  let currentIdx = Math.max(parseInt(searchParams.get('startIdx') || '1', 10), 1);
  let totalAdded = 0;
  let totalUpdated = 0;
  let iterations = 0;
  const maxIterations = 5; // Vercel 서버리스 런타임 타임아웃 방지 (배치당 최대 5,000건)

  while (iterations < maxIterations) {
    iterations++;
    const endIdx = currentIdx + limit - 1;
    const url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/${SERVICE_ID}/json/${currentIdx}/${endIdx}`;

    let response;
    try {
      response = await axios.get(url, { timeout: 45000 });
    } catch (err) {
      console.warn(`[Cron Sync] fetch error at ${currentIdx}:`, err.message);
      break;
    }

    const data = response?.data?.[SERVICE_ID];
    const rows = data?.row;
    if (!rows || rows.length === 0) break;

    const reportNos = rows.map(item => item.PRDLST_REPORT_NO).filter(Boolean);
    const existingRecords = await prisma.declarations.findMany({
      where: { prdlstReportNo: { in: reportNos } },
      select: { prdlstReportNo: true, prmsDt: true, primaryFnclty: true, prdlstNm: true, normalizedFunctionality: true }
    });
    const existingMap = new Map(existingRecords.map(r => [r.prdlstReportNo, r]));

    const toCreate = [];
    const toUpdate = [];
    const newChangeLogs = [];

    for (const item of rows) {
      if (!item.PRDLST_REPORT_NO) continue;
      const existing = existingMap.get(item.PRDLST_REPORT_NO);
      const normalized = normalizeData(item);
      const prepareData = {
        bsshNm: item.BSSH_NM,
        prdlstNm: item.PRDLST_NM,
        dispos: item.DISPOS || item.PRDT_SHAP_CD_NM || null,
        prmsDt: item.PRMS_DT,
        primaryFnclty: item.PRIMARY_FNCLTY,
        ntkMthd: item.NTK_MTHD,
        iftknAtntMatrCn: item.IFTKN_ATNT_MATR_CN,
        cstdyMthd: item.CSTDY_MTHD,
        rawmtrlNm: item.RAWMTRL_NM,
        lcnsNo: item.LCNS_NO || null,
        pogDaycnt: item.POG_DAYCNT || null,
        prdlstReportNo: item.PRDLST_REPORT_NO,
        productionReportStatus: item.PRDCTN_REPORT_STATUS || null,
        normalizedFunctionality: normalized.normalizedFunctionality,
        declarationType: normalized.declarationType,
        customCategories: normalized.customCategories,
      };

      if (!existing) {
        toCreate.push(prepareData);
        totalAdded++;
      } else {
        let hasChange = false;
        const changes = {};
        if (existing.primaryFnclty !== prepareData.primaryFnclty) {
          hasChange = true;
          changes.primaryFnclty = { before: existing.primaryFnclty, after: prepareData.primaryFnclty };
        }
        if (existing.prdlstNm !== prepareData.prdlstNm) {
          hasChange = true;
          changes.prdlstNm = { before: existing.prdlstNm, after: prepareData.prdlstNm };
        }
        if (hasChange) {
          toUpdate.push({ where: { prdlstReportNo: item.PRDLST_REPORT_NO }, data: prepareData });
          newChangeLogs.push({
            prdlstReportNo: item.PRDLST_REPORT_NO,
            prdlstNm: item.PRDLST_NM,
            changeType: 'UPDATE',
            diff: changes,
          });
          totalUpdated++;
        }
      }
    }

    if (toCreate.length > 0) {
      await prisma.declarations.createMany({ data: toCreate, skipDuplicates: true });
    }
    for (const updateItem of toUpdate) {
      await prisma.declarations.update(updateItem);
    }
    if (newChangeLogs.length > 0) {
      await prisma.change_log.createMany({ data: newChangeLogs, skipDuplicates: false });
    }

    if (rows.length < limit) break;
    currentIdx += rows.length;
  }

  await prisma.sync_history.create({
    data: {
      status: 'SUCCESS',
      addedCount: totalAdded,
      updatedCount: totalUpdated,
    }
  });

  return NextResponse.json({
    success: true,
    message: `정기 자동 동기화 완료 (추가: ${totalAdded}건, 갱신: ${totalUpdated}건)`,
    totalAdded,
    totalUpdated,
    processedBatches: iterations,
  });
}

export async function POST(req) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다. 관리자 또는 인증된 크론만 동기화를 수행할 수 있습니다.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const isCron = searchParams.get('cron') === 'true' || Boolean(req.headers.get('x-vercel-cron')) || body.cron === true;

    // GitHub Actions / 크론 요청 등 수동 지정 인덱스가 없는 크론 요청인 경우 다중 배치 자동 동기화 수행
    if (isCron && !body.startIdx) {
      return await runCronSync(req);
    }

    const startTime = Date.now();
    const startIdx = body.startIdx || 1;
    const limit = Math.min(body.limit || 500, 1000); 
    const endIdx = startIdx + limit - 1;
    const url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/${SERVICE_ID}/json/${startIdx}/${endIdx}`;

    console.log(`[SYNC START] ${startIdx} ~ ${endIdx} (Limit: ${limit})`);
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let response;
    let retries = 2;
    let lastError = null;

    while (retries > 0) {
      try {
        response = await axios.get(url, { timeout: 15000 });
        if (response.data) break;
      } catch (err) {
        lastError = err;
        retries--;
        console.warn(`[I0030 Sync] StartIdx: ${startIdx}, Retry left: ${retries}, error: ${err.message}`);
        if (retries > 0) await delay(1500);
      }
    }

    if (!response || !response.data) {
      throw new Error(`API 호출 실패 (재시도 초과): ${lastError?.message}`);
    }

    const apiFetchTime = Date.now();
    const data = response.data[SERVICE_ID];
    
    if (!data) {
      if (response.data.RESULT && response.data.RESULT.CODE === 'INFO-200') {
         return NextResponse.json({ success: true, addedCount: 0, updatedCount: 0, deletedCount: 0, total: 0, info: '데이터가 없습니다.' });
      }
      throw new Error(`API Error: ${response.data.RESULT?.MSG || 'Unknown'}`);
    }

    const rows = data.row;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: true, addedCount: 0, updatedCount: 0, deletedCount: 0, total: 0, info: '해당 범위에 데이터가 없습니다.' });
    }

    const reportNos = rows.map(item => item.PRDLST_REPORT_NO).filter(Boolean);
    const existingRecords = await prisma.declarations.findMany({
      where: { prdlstReportNo: { in: reportNos } },
      select: { prdlstReportNo: true, prmsDt: true, primaryFnclty: true, prdlstNm: true, normalizedFunctionality: true }
    });
    const dbFetchTime = Date.now();
    
    const existingMap = new Map(existingRecords.map(r => [r.prdlstReportNo, r]));

    let addedCount = 0;
    let updatedCount = 0;

    const toCreate = [];
    const toUpdate = [];
    const newChangeLogs = [];

    for (const item of rows) {
      if (!item.PRDLST_REPORT_NO) continue;
      
      const existing = existingMap.get(item.PRDLST_REPORT_NO);
      const normalized = normalizeData(item);

      const prepareData = {
        bsshNm: item.BSSH_NM,
        prdlstNm: item.PRDLST_NM,
        dispos: item.DISPOS || item.PRDT_SHAP_CD_NM || null,
        prmsDt: item.PRMS_DT,
        primaryFnclty: item.PRIMARY_FNCLTY,
        ntkMthd: item.NTK_MTHD,
        iftknAtntMatrCn: item.IFTKN_ATNT_MATR_CN,
        cstdyMthd: item.CSTDY_MTHD,
        rawmtrlNm: item.RAWMTRL_NM,
        lcnsNo: item.LCNS_NO || null,
        pogDaycnt: item.POG_DAYCNT || null,
        prdlstCdnm: item.PRDLST_CDNM || null,
        stdrStnd: item.STDR_STND || null,
        hiengLntrtDvsNm: item.HIENG_LNTRT_DVS_NM || null,
        production: item.PRODUCTION || null,
        childCrtfcYn: item.CHILD_CRTFC_YN || null,
        prdtShapCdNm: item.PRDT_SHAP_CD_NM || null,
        frmlcMtrqlt: item.FRMLC_MTRQLT || null,
        indutyCdNm: item.INDUTY_CD_NM || null, 
        lastUpdtDtm: item.LAST_UPDT_DTM || null,
        indvRawmtrlNm: item.INDV_RAWMTRL_NM || null,
        etcRawmtrlNm: item.ETC_RAWMTRL_NM || null,
        capRawmtrlNm: item.CAP_RAWMTRL_NM || null,
        frmlcMthd: item.FRMLC_MTHD || null,
        ...normalized 
      };

      if (existing) {
        const hasChange = existing.prmsDt !== prepareData.prmsDt || 
                          existing.primaryFnclty !== prepareData.primaryFnclty || 
                          existing.prdlstNm !== prepareData.prdlstNm ||
                          existing.normalizedFunctionality !== normalized.normalizedFunctionality;
        
        if (hasChange) {
          toUpdate.push({ reportNo: item.PRDLST_REPORT_NO, data: prepareData });
          newChangeLogs.push({ prdlstReportNo: item.PRDLST_REPORT_NO, type: 'UPDATED', changes: JSON.stringify({ reason: '주요 필드 혹은 정규화 결과 변동됨' }) });
          updatedCount++;
        }
      } else {
        toCreate.push({ prdlstReportNo: item.PRDLST_REPORT_NO, ...prepareData });
        newChangeLogs.push({ prdlstReportNo: item.PRDLST_REPORT_NO, type: 'NEW', changes: JSON.stringify({ reason: '신규 품목 보고 등록됨' }) });
        addedCount++;
      }
    }

    if (toCreate.length > 0) {
      await prisma.declarations.createMany({ data: toCreate, skipDuplicates: true });
    }

    if (toUpdate.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = toUpdate.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(({ reportNo, data }) =>
          prisma.declarations.update({ where: { prdlstReportNo: reportNo }, data })
        ));
      }
    }

    if (newChangeLogs.length > 0) {
      await prisma.change_log.createMany({ data: newChangeLogs, skipDuplicates: false });
    }

    const processEndTime = Date.now();
    console.log(`[SYNC END] 소요시간: API(${apiFetchTime - startTime}ms), DB조회(${dbFetchTime - apiFetchTime}ms), 처리(${processEndTime - dbFetchTime}ms)`);

    await prisma.sync_history.create({
      data: {
        status: 'SUCCESS',
        addedCount,
        updatedCount
      }
    });

    await writeAuditLog(req, {
      action: 'SYNC_EXECUTE',
      page: '/api/sync',
      details: `수동 데이터 동기화 완료 (시작 인덱스: ${startIdx}, 범위: ${limit}, 신규 추가: ${addedCount}건, 업데이트: ${updatedCount}건)`
    });

    return NextResponse.json({ 
       success: true, 
       addedCount, 
       updatedCount,
       deletedCount: 0,
       total: parseInt(data.total_count || '0', 10),
       fetchedRows: rows.length
     });

  } catch (error) {
    console.error('Sync Error:', error);
    try {
      await prisma.sync_history.create({
        data: {
          status: 'ERROR',
          errorMessage: String(error.message).substring(0, 500)
        }
      });
      await writeAuditLog(req, {
        action: 'SYNC_EXECUTE_ERROR',
        page: '/api/sync',
        details: `동기화 실패: ${String(error.message).substring(0, 200)}`
      });
    } catch(e) { /* ignore */ }
    return NextResponse.json({ success: false, error: String(error.message) }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다. 관리자 또는 인증된 크론만 실행할 수 있습니다.' },
        { status: 403 }
      );
    }

    return await runCronSync(req);
  } catch (error) {
    console.error('Cron Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
