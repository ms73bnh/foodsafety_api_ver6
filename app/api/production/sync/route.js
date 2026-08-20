import { NextResponse } from 'next/server';
import axios from 'axios';
import prisma from '@/lib/prisma';

const API_KEY = process.env.FOOD_API_KEY || 'd753b2c401d242248da5';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(req) {
  try {
    const { year, startIdx = 1, limit = 1000 } = await req.json();

    if (!year) {
      return NextResponse.json({ success: false, error: '년도(year)가 필요합니다.' }, { status: 400 });
    }

    const endIdx = startIdx + limit - 1;
    const url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/I0310/json/${startIdx}/${endIdx}/EVL_YR=${year}`;
    
    let response;
    let retries = 3;
    let lastError = null;

    while (retries > 0) {
      try {
        response = await axios.get(url, { timeout: 60000 }); // 60초 타임아웃으로 확장
        if (response.data) break;
      } catch (err) {
        lastError = err;
        retries--;
        console.warn(`[I0310 Sync] Year: ${year}, StartIdx: ${startIdx}, Retry left: ${retries}, error: ${err.message}`);
        if (retries > 0) await delay(3000); // 3초 대기 후 재시도
      }
    }

    if (!response || !response.data) {
      throw new Error(`API 호출 실패 (재시도 초과): ${lastError?.message}`);
    }

    // API 에러 결과 확인 (데이터가 없을 때 등)
    if (response.data.RESULT) {
      const code = response.data.RESULT.CODE;
      const msg = response.data.RESULT.MSG;
      if (code === 'INFO-200') {
        return NextResponse.json({ 
          success: true, 
          message: `${year}년 데이터가 없습니다. (API: ${msg})`,
          fetchedRows: 0, addedCount: 0, updatedCount: 0
        });
      }
      if (code !== 'INFO-000') {
        throw new Error(`API 오류 (${code}): ${msg}`);
      }
    }

    const data = response.data['I0310'];

    if (!data || !data.row || data.row.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: `${year}년 데이터가 더 이상 없습니다.`,
        fetchedRows: 0,
        addedCount: 0,
        updatedCount: 0
      });
    }

    const rows = data.row;
    let addedCount = 0;
    let updatedCount = 0;

    // 배치 처리를 위해 트랜잭션 사용 고려 가능하나 성능상 upsert 반복
    for (const item of rows) {
      try {
        const reportNo = item.PRDLST_REPORT_NO;
        if (!reportNo) continue;

        // 숫자로 변환 가능한 데이터 클렌징
        const convertToFloat = (val) => {
          if (!val) return 0;
          return parseFloat(val.toString().replace(/,/g, '')) || 0;
        };

        await prisma.production_stats.upsert({
          where: {
            prdlstReportNo_evlYr: {
              prdlstReportNo: reportNo,
              evlYr: item.EVL_YR.toString()
            }
          },
          update: {
            bsshNm: item.BSSH_NM,
            prdlstNm: item.PRDLST_NM,
            hItemNm: item.H_ITEM_NM,
            lcnsNo: item.LCNS_NO,
            gubun: item.GUBUN,
            fyerPrdctnAbrtQy: convertToFloat(item.FYER_PRDCTN_ABRT_QY),
            prdctnQy: convertToFloat(item.PRDCTN_QY),
          },
          create: {
            prdlstReportNo: reportNo,
            evlYr: item.EVL_YR.toString(),
            bsshNm: item.BSSH_NM,
            prdlstNm: item.PRDLST_NM,
            hItemNm: item.H_ITEM_NM,
            lcnsNo: item.LCNS_NO,
            gubun: item.GUBUN,
            fyerPrdctnAbrtQy: convertToFloat(item.FYER_PRDCTN_ABRT_QY),
            prdctnQy: convertToFloat(item.PRDCTN_QY),
          }
        });
        addedCount++; // 단순화를 위해 added/updated 구분 생략
      } catch (err) {
        console.error('Row insert error:', err);
      }
    }

    return NextResponse.json({
      success: true,
      fetchedRows: rows.length,
      addedCount,
      updatedCount,
      message: `${year}년 데이터 ${rows.length}개 처리 완료`
    });

  } catch (error) {
    console.error('Production Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
