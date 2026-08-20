import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import axios from 'axios';
import { normalizeData } from '@/lib/normalizer';
import { isAdmin } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

const API_KEY = process.env.FOOD_API_KEY || 'd753b2c401d242248da5';
const SERVICE_ID = 'I0030';

export async function POST(req) {
  try {
    // 관리자 권한 검증
    if (!isAdmin(req)) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다. 관리자만 동기화를 수행할 수 있습니다.' },
        { status: 403 }
      );
    }

    const startTime = Date.now();
    const body = await req.json().catch(() => ({}));
    const startIdx = body.startIdx || 1;
    // 사용자의 요청에 따라 1000개 유동적으로 처리 가능하도록 유지하되 기본값 설정
    const limit = body.limit || 1000; 
    const endIdx = startIdx + limit - 1;
    const url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/${SERVICE_ID}/json/${startIdx}/${endIdx}`;

    console.log(`[SYNC START] ${startIdx} ~ ${endIdx} (Limit: ${limit})`);
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let response;
    let retries = 3;
    let lastError = null;

    while (retries > 0) {
      try {
        response = await axios.get(url, { timeout: 60000 });
        if (response.data) break;
      } catch (err) {
        lastError = err;
        retries--;
        console.warn(`[I0030 Sync] StartIdx: ${startIdx}, Retry left: ${retries}, error: ${err.message}`);
        if (retries > 0) await delay(3000);
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

    // [최적화] 모든 보고번호를 추출하여 한 번에 DB 조회
    const reportNos = rows.map(item => item.PRDLST_REPORT_NO).filter(Boolean);
    const existingRecords = await prisma.declarations.findMany({
      where: { prdlstReportNo: { in: reportNos } },
      select: { prdlstReportNo: true, prmsDt: true, primaryFnclty: true, prdlstNm: true, normalizedFunctionality: true }
    });
    const dbFetchTime = Date.now();
    
    // 조회를 위한 Map 생성
    const existingMap = new Map(existingRecords.map(r => [r.prdlstReportNo, r]));

    let addedCount = 0;
    let updatedCount = 0;

    const toCreate = [];       // 신규 레코드
    const toUpdate = [];       // 변경된 레코드
    const newChangeLogs = [];  // 변경 이력

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

    // [벌크 INSERT] 신규 레코드 한 번에 삽입 (skipDuplicates로 충돌 방지)
    if (toCreate.length > 0) {
      await prisma.declarations.createMany({ data: toCreate, skipDuplicates: true });
    }

    // [배치 UPDATE] 변경된 레코드만 처리 (Promise.all로 병렬화)
    if (toUpdate.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = toUpdate.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(({ reportNo, data }) =>
          prisma.declarations.update({ where: { prdlstReportNo: reportNo }, data })
        ));
      }
    }

    // [벌크 INSERT] 변경 이력 한 번에 삽입
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

    // 작업 이력 기록
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
      // 작업 이력 오류 기록
      await writeAuditLog(req, {
        action: 'SYNC_EXECUTE_ERROR',
        page: '/api/sync',
        details: `동기화 실패 (시작 인덱스: ${startIdx}, 범위: ${limit}): ${String(error.message).substring(0, 200)}`
      });
    } catch(e) { /* ignore */ }
    return NextResponse.json({ success: false, error: String(error.message) }, { status: 500 });
  }

}

export async function GET(req) {
  return NextResponse.json({ message: "Use POST to trigger sync" });
}
