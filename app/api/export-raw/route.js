import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'declaration';
    const query = searchParams.get('q') || '';

    const where = {};
    if (query) {
      where.OR = [
        { bsshNm: { contains: query, mode: 'insensitive' } },
        { prdlstNm: { contains: query, mode: 'insensitive' } },
        { prdlstReportNo: { contains: query, mode: 'insensitive' } }
      ];
    }

    if (type === 'production') {
        const data = await prisma.production_stats.findMany({
            where,
            orderBy: [
              { evlYr: 'desc' },
              { createdAt: 'desc' }
            ]
        });

        if (data.length === 0) {
            return new Response('데이터가 없습니다.', { status: 404 });
        }

        const BOM = '\uFEFF';
        const headers = ['연도', '품목제조번호', '품목명', '업체명', '생산량(KG)', '인허가번호', '품목유형', '품목구분', '연간생산능력(KG)'];
        const rows = data.map(item => [
            `"${item.evlYr || ''}"`,
            `"${item.prdlstReportNo || ''}"`,
            `"${(item.prdlstNm || '').replace(/"/g, '""')}"`,
            `"${(item.bsshNm || '').replace(/"/g, '""')}"`,
            item.prdctnQy || 0,
            `"${item.lcnsNo || ''}"`,
            `"${item.hItemNm || ''}"`,
            `"${item.gubun || ''}"`,
            item.fyerPrdctnAbrtQy || 0
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        return new Response(BOM + csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="production_raw_data_${new Date().toISOString().split('T')[0]}.csv"`
            }
        });
    }

    // Default: Declarations
    const data = await prisma.declarations.findMany({
      where,
      orderBy: [
        { prmsDt: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    if (data.length === 0) {
        return new Response('데이터가 없습니다.', { status: 404 });
    }

    const BOM = '\uFEFF';
    const headers = [
        '품목제조번호', '업소명', '품목명', '허가일자', '인허가번호', 
        '소비기한일수', '제품형태', '섭취방법', '주된기능성', '섭취시주의사항', 
        '보관방법', '유형', '기준규격', '고열량저영양여부', '생산종료여부', 
        '어린이기호식품인증', '제품형태코드명', '포장재질', '품목유형(기능지표성분)', 
        '업종', '최종수정일자', '기능성원재료', '기타원재료', '캡슐원재료', 
        '포장방법', '정규화기능성', '정규화원재료'
    ];

    const rows = data.map(item => [
        `"${item.prdlstReportNo || ''}"`,
        `"${(item.bsshNm || '').replace(/"/g, '""')}"`,
        `"${(item.prdlstNm || '').replace(/"/g, '""')}"`,
        item.prmsDt || '',
        `"${item.lcnsNo || ''}"`,
        `"${item.pogDaycnt || ''}"`,
        `"${item.dispos || ''}"`,
        `"${(item.ntkMthd || '').replace(/"/g, '""')}"`,
        `"${(item.primaryFnclty || '').replace(/"/g, '""')}"`,
        `"${(item.iftknAtntMatrCn || '').replace(/"/g, '""')}"`,
        `"${(item.cstdyMthd || '').replace(/"/g, '""')}"`,
        `"${item.prdlstCdnm || ''}"`,
        `"${(item.stdrStnd || '').replace(/"/g, '""')}"`,
        `"${item.hiengLntrtDvsNm || ''}"`,
        `"${item.production || ''}"`,
        `"${item.childCrtfcYn || ''}"`,
        `"${item.prdtShapCdNm || ''}"`,
        `"${item.frmlcMtrqlt || ''}"`,
        `"${(item.rawmtrlNm || '').replace(/"/g, '""')}"`,
        `"${item.indutyCdNm || ''}"`,
        `"${item.lastUpdtDtm || ''}"`,
        `"${(item.indvRawmtrlNm || '').replace(/"/g, '""')}"`,
        `"${(item.etcRawmtrlNm || '').replace(/"/g, '""')}"`,
        `"${(item.capRawmtrlNm || '').replace(/"/g, '""')}"`,
        `"${item.frmlcMthd || ''}"`,
        `"${(item.normalizedFunctionality || '').replace(/"/g, '""')}"`,
        `"${(item.normalizedRawMaterials || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    return new Response(BOM + csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="food_safety_raw_data_${new Date().toISOString().split('T')[0]}.csv"`
      }
    });

  } catch (error) {
    console.error('Raw Export API Error:', error);
    return new Response('서버 오류가 발생했습니다.', { status: 500 });
  }
}
