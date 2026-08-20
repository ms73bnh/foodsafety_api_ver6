import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import axios from 'axios';
import { normalizeData } from '@/lib/normalizer';
import { isAdmin } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

const API_KEY = process.env.FOOD_API_KEY || 'd753b2c401d242248da5';
const SERVICE_ID = 'I1250';

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

    // 클라이언트가 명시적으로 startIdx를 전달한 경우 사용 (병렬 모드)
    // 아닌 경우 sync_state에서 마지막 index 조회 (순차 모드)
    let startIdx;
    if (body.startIdx != null) {
      startIdx = body.startIdx;
    } else {
      const state = await prisma.sync_state.findUnique({ where: { id: SERVICE_ID } });
      startIdx = state ? state.lastIndex + 1 : 1;
    }
    const limit = body.limit || 1000;
    const endIdx = startIdx + limit - 1;
    const url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/${SERVICE_ID}/json/${startIdx}/${endIdx}`;

    console.log(`[GENERAL SYNC START] ${startIdx} ~ ${endIdx} (Limit: ${limit})`);
    
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
        console.warn(`[I1250 Sync] StartIdx: ${startIdx}, Retry left: ${retries}, error: ${err.message}`);
        if (retries > 0) await delay(3000);
      }
    }

    if (!response || !response.data) {
      throw new Error(`API 호출 실패 (재시도 초과): ${lastError?.message}`);
    }

    const apiFetchTime = Date.now();
    const data = response.data[SERVICE_ID];

    if (!data) {
      const resultCode = response.data.RESULT?.CODE || '';
      const resultMsg = response.data.RESULT?.MSG || 'Unknown';
      // INFO-200: 해당 범위에 데이터 없음 (정상 종료 조건)
      if (resultCode === 'INFO-200') {
        return NextResponse.json({
          success: true,
          addedCount: 0,
          updatedCount: 0,
          total: 0,
          fetchedRows: 0,
          info: '데이터가 없습니다.',
          lastIndex: startIdx - 1
        });
      }
      // ERROR-500 등 서버 오류는 실패로 처리
      return NextResponse.json({
        success: false,
        error: `식품안전나라 API 서버 오류 (${resultCode}): ${resultMsg}`
      }, { status: 502 });
    }

    const rows = data.row;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ 
        success: true, 
        addedCount: 0, 
        updatedCount: 0, 
        total: 0, 
        info: '해당 범위에 데이터가 없습니다.',
        lastIndex: startIdx - 1
      });
    }

    // 모든 보고번호를 추출하여 한 번에 DB 조회
    const reportNos = rows.map(item => item.PRDLST_REPORT_NO).filter(Boolean);
    const existingRecords = await prisma.general_declarations.findMany({
      where: { prdlstReportNo: { in: reportNos } },
      select: { prdlstReportNo: true, lastUpdtDtm: true, prdlstNm: true }
    });
    const dbFetchTime = Date.now();
    
    const existingMap = new Map(existingRecords.map(r => [r.prdlstReportNo, r]));

    let addedCount = 0;
    let updatedCount = 0;

    const toCreate = [];
    const toUpdate = [];

    for (const item of rows) {
      if (!item.PRDLST_REPORT_NO) continue;
      
      const existing = existingMap.get(item.PRDLST_REPORT_NO);
      
      // Packaging Normalization
      const normalized = normalizeData({ FRMLC_MTRQLT: item.FRMLC_MTRQLT });

      const prepareData = {
        prmsDt: item.PRMS_DT || null,
        lastUpdtDtm: item.LAST_UPDT_DTM || null,
        lcnsNo: item.LCNS_NO || null,
        prdlstNm: item.PRDLST_NM || null,
        qltyMntncTmlmtDaycnt: item.QLTY_MNTNC_TMLMT_DAYCNT || null,
        bsshNm: item.BSSH_NM || null,
        prdlstDcnm: item.PRDLST_DCNM || null,
        childCrtfcYn: item.CHILD_CRTFC_YN || null,
        indutyCdNm: item.INDUTY_CD_NM || null,
        dispos: item.DISPOS || null,
        frmlcMtrqlt: item.FRMLC_MTRQLT || null,
        usage: item.USAGE || null,
        etqtyXportPrdlstYn: item.ETQTY_XPORT_PRDLST_YN || null,
        pogDaycnt: item.POG_DAYCNT || null,
        hiengLntrtDvsNm: item.HIENG_LNTRT_DVS_NM || null,
        production: item.PRODUCTION || null,
        prpos: item.PRPOS || null,
        normalizedPackaging: normalized.normalizedPackaging || null
      };

      if (existing) {
        const hasChange = existing.lastUpdtDtm !== prepareData.lastUpdtDtm || 
                          existing.prdlstNm !== prepareData.prdlstNm;
        
        if (hasChange) {
          toUpdate.push({ reportNo: item.PRDLST_REPORT_NO, data: prepareData });
          updatedCount++;
        }
      } else {
        toCreate.push({ prdlstReportNo: item.PRDLST_REPORT_NO, ...prepareData });
        addedCount++;
      }
    }

    // Bulk create new records
    if (toCreate.length > 0) {
      await prisma.general_declarations.createMany({ data: toCreate, skipDuplicates: true });
    }

    // Bulk update modified records
    if (toUpdate.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = toUpdate.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(({ reportNo, data }) =>
          prisma.general_declarations.update({ where: { prdlstReportNo: reportNo }, data })
        ));
      }
    }

    // Update sync state — GREATEST 로 병렬 요청 간 충돌 방지
    const newLastIndex = startIdx + rows.length - 1;
    await prisma.$executeRaw`
      INSERT INTO sync_state (id, "lastIndex", "updatedAt")
      VALUES (${SERVICE_ID}, ${newLastIndex}, NOW())
      ON CONFLICT (id) DO UPDATE
        SET "lastIndex" = GREATEST(sync_state."lastIndex", ${newLastIndex}),
            "updatedAt" = NOW()
    `;

    const processEndTime = Date.now();
    console.log(`[GENERAL SYNC END] 소요시간: API(${apiFetchTime - startTime}ms), DB조회(${dbFetchTime - apiFetchTime}ms), 처리(${processEndTime - dbFetchTime}ms)`);

    await prisma.sync_history.create({
      data: {
        status: 'SUCCESS',
        addedCount,
        updatedCount,
        errorMessage: `General Food I1250 chunk (${startIdx} ~ ${newLastIndex})`
      }
    });

    // 작업 이력 기록
    await writeAuditLog(req, {
      action: 'SYNC_GENERAL_EXECUTE',
      page: '/api/sync-general',
      details: `일반식품 수동 데이터 동기화 완료 (시작 인덱스: ${startIdx}, 범위: ${rows.length}, 신규 추가: ${addedCount}건, 업데이트: ${updatedCount}건)`
    });

    return NextResponse.json({ 
       success: true, 
       addedCount, 
       updatedCount,
       lastIndex: newLastIndex,
       total: parseInt(data.total_count || '0', 10),
       fetchedRows: rows.length
     });

  } catch (error) {
    console.error('General Sync Error:', error);
    try {
      await prisma.sync_history.create({
        data: {
          status: 'ERROR',
          errorMessage: `General Food: ${String(error.message).substring(0, 450)}`
        }
      });
      // 작업 이력 오류 기록
      await writeAuditLog(req, {
        action: 'SYNC_GENERAL_ERROR',
        page: '/api/sync-general',
        details: `일반식품 동기화 실패: ${String(error.message).substring(0, 200)}`
      });
    } catch(e) { /* ignore */ }
    return NextResponse.json({ success: false, error: String(error.message) }, { status: 500 });
  }
}

// 관리자용: lastIndex 수동 설정
export async function PATCH(req) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 });
    }
    const { lastIndex } = await req.json();
    if (typeof lastIndex !== 'number' || lastIndex < 0) {
      return NextResponse.json({ success: false, error: '유효하지 않은 값입니다.' }, { status: 400 });
    }
    await prisma.sync_state.upsert({
      where: { id: SERVICE_ID },
      update: { lastIndex },
      create: { id: SERVICE_ID, lastIndex }
    });
    return NextResponse.json({ success: true, lastIndex });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    let state = await prisma.sync_state.findUnique({
      where: { id: SERVICE_ID }
    });
    return NextResponse.json({
      success: true,
      serviceId: SERVICE_ID,
      lastIndex: state ? state.lastIndex : 0
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
