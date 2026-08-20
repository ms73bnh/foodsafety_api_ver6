import { NextResponse } from 'next/server';
import axios from 'axios';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

const API_KEY = process.env.FOOD_API_KEY || 'd753b2c401d242248da5';

export const dynamic = 'force-dynamic';

// DB 연결 확인 헬퍼 (오류 처리를 위해 호출됨)
const checkDbConnection = async () => {
  try {
    await prisma.$connect();
  } catch (err) {
    console.error('Database connection failed:', err);
    throw new Error('Database connection is not available');
  }
};

// 1. 공용 서비스 정의 (API ID, 내부 명칭, DB 타입)
const services = [
  { id: 'I0490', name: 'recalls', type: 'RECALL' },
  { id: 'I2620', name: 'inspections', type: 'INSPECTION' },
  { id: 'I0470', name: 'admin_actions', type: 'ADMIN_ACTION' },
];

/**
 * GET: DB에 저장된 최신 알림 정보를 타입별로 반환
 */
export async function GET(req) {
  try {
    checkDbConnection();
    
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const limit = type ? 50 : 20;
    const page = parseInt(searchParams.get('page') || '1');
    const sort = searchParams.get('sort') || 'desc'; // 기본값 최신순

    if (type) {
      const dbRows = await prisma.food_alerts.findMany({
        where: { 
          type,
          regDate: { startsWith: '20' }
        },
        orderBy: { regDate: sort },
        skip: (page - 1) * limit,
        take: limit
      });
      const total = await prisma.food_alerts.count({ 
        where: { 
          type,
          regDate: { startsWith: '20' }
        }
      });
      
      return NextResponse.json({
        success: true,
        rows: dbRows.map(row => ({
          ...JSON.parse(row.detailJson || '{}'),
          _dbId: row.id,
          _standard: {
            title: row.prdtNm,
            subTitle: row.bsshNm,
            desc: row.reason,
            result: row.result,
            date: row.regDate,
            img: row.imgUrl,
            type: row.type
          }
        })),
        total,
        page,
        limit
      });
    }

    const responseData = {};
    for (const service of services) {
      const dbRows = await prisma.food_alerts.findMany({
        where: { 
          type: service.type,
          regDate: { startsWith: '20' }
        },
        orderBy: { regDate: 'desc' },
        take: 10 // 사이드바 요약용으로 10개만
      });

      responseData[service.name] = {
        rows: dbRows.map(row => ({
          ...JSON.parse(row.detailJson || '{}'),
          _dbId: row.id,
          _standard: {
            title: row.prdtNm,
            subTitle: row.bsshNm,
            desc: row.reason,
            result: row.result,
            date: row.regDate,
            img: row.imgUrl,
            type: row.type
          }
        })),
        total: dbRows.length
      };
    }

    return NextResponse.json({ 
      success: true, 
      ...responseData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Alerts Get Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST: 외부 API와 실시간 동기화 수행 (증분 동기화)
 */
export async function POST() {
  try {
    checkDbConnection();

    let totalSynced = 0;
    const syncResults = [];

    for (const service of services) {
      let startIdx = 1; // 사용자의 요청에 따라 무조건 처음(1)부터 마지막 끝까지 모든 데이터를 동기화합니다.
      let serviceSynced = 0;
      let hasMoreData = true;

      while (hasMoreData) {
        const endIdx = startIdx + 499; // 타임아웃 방지를 위해 한 번에 500개씩 동기화 (전체 누적 위해 확장)

        const url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/${service.id}/json/${startIdx}/${endIdx}`;
        const response = await axios.get(url);
        const apiData = response.data[service.id];

        if (!apiData || !apiData.row || apiData.row.length === 0) {
          hasMoreData = false;
          if (serviceSynced === 0) {
            syncResults.push({ service: service.id, status: 'NO_DATA', fetched: 0 });
          } else {
            syncResults.push({ service: service.id, status: 'SUCCESS', fetched: serviceSynced });
          }
          break;
        }

        const rows = apiData.row;
        
        for (const item of rows) {
          let uniqueKey = '';
          let mappedData = {};

          if (service.type === 'RECALL') {
            uniqueKey = `RECALL_${item.RTRVLDSUSE_SEQ || item.PRDTNM + item.MNFDT}`;
            mappedData = {
              prdtNm: item.PRDTNM,
              bsshNm: item.BSSHNM,
              reason: item.RTRVLPRVNS,
              result: item.RTRVL_GRDCD_NM,
              regDate: (item.CRET_DTM || '').split(' ')[0],
              imgUrl: item.IMG_FILE_PATH
            };
          } else if (service.type === 'INSPECTION') {
            uniqueKey = `INSP_${item.RTRVLDSUSE_SEQ || item.PRDTNM + item.BSSHNM + item.CRET_DTM}`;
            mappedData = {
              prdtNm: item.PRDTNM,
              bsshNm: item.BSSHNM,
              reason: item.TEST_ITMNM,
              result: item.TESTANALS_RSLT,
              regDate: (item.CRET_DTM || '').split(' ')[0],
              imgUrl: null
            };
          } else if (service.type === 'ADMIN_ACTION') {
            uniqueKey = `ADMIN_${item.DSPSDTLS_SEQ || item.PRCSCITYPOINT_BSSHNM + item.DSPS_DCSNDT}`;
            mappedData = {
              prdtNm: item.PRCSCITYPOINT_BSSHNM, 
              bsshNm: item.DSPS_TYPECD_NM, 
              reason: item.DSPSCN || item.VILTCN, 
              result: item.INDUTY_CD_NM, 
              regDate: (item.DSPS_DCSNDT || item.LAST_UPDT_DTM || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
              imgUrl: null
            };
          }
          
          const hashedKey = crypto.createHash('md5').update(uniqueKey).digest('hex');

          await prisma.food_alerts.upsert({
            where: { uniqueKey: hashedKey },
            update: {
              prdtNm: mappedData.prdtNm,
              imgUrl: mappedData.imgUrl,
              detailJson: JSON.stringify(item)
            },
            create: {
              uniqueKey: hashedKey,
              type: service.type,
              ...mappedData,
              detailJson: JSON.stringify(item)
            }
          });
        }

        await prisma.sync_state.upsert({
          where: { id: service.id },
          update: { lastIndex: startIdx + rows.length - 1 },
          create: { id: service.id, lastIndex: startIdx + rows.length - 1 }
        });

        serviceSynced += rows.length;
        totalSynced += rows.length;

        if (rows.length < 500) {
          hasMoreData = false;
          syncResults.push({ service: service.id, status: 'SUCCESS', fetched: serviceSynced });
          break;
        }

        startIdx += 500;
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `${totalSynced}개의 데이터를 동기화했습니다.`,
      results: syncResults
    });

  } catch (error) {
    console.error('Alerts Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
