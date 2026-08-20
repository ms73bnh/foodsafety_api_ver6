import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { isSalesOrAbove } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    if (!isSalesOrAbove(req)) {
      return new Response('권한이 없습니다.', { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'csv';
    
    // Extract query parameters for filtering
    const integrated = (searchParams.get('integrated') || '').trim();
    const prdlstReportNo = (searchParams.get('prdlstReportNo') || '').trim();
    const bsshNm = (searchParams.get('bsshNm') || '').trim();
    const prdlstNm = (searchParams.get('prdlstNm') || '').trim();
    const prdlstDcnm = (searchParams.get('prdlstDcnm') || '').trim();
    const normalizedPackaging = (searchParams.get('normalizedPackaging') || '').trim();
    const dispos = (searchParams.get('dispos') || '').trim();

    const conditions = [];

    if (integrated) {
      const keywords = integrated.split(',').map(kw => kw.trim()).filter(kw => kw !== '');
      keywords.forEach(kw => {
        conditions.push({
          OR: [
            { prdlstReportNo: { contains: kw, mode: 'insensitive' } },
            { bsshNm: { contains: kw, mode: 'insensitive' } },
            { prdlstNm: { contains: kw, mode: 'insensitive' } },
            { prdlstDcnm: { contains: kw, mode: 'insensitive' } },
            { dispos: { contains: kw, mode: 'insensitive' } },
            { normalizedPackaging: { contains: kw, mode: 'insensitive' } },
            { frmlcMtrqlt: { contains: kw, mode: 'insensitive' } }
          ]
        });
      });
    }

    if (prdlstReportNo) conditions.push({ prdlstReportNo: { contains: prdlstReportNo, mode: 'insensitive' } });
    if (bsshNm) conditions.push({ bsshNm: { contains: bsshNm, mode: 'insensitive' } });
    if (prdlstNm) conditions.push({ prdlstNm: { contains: prdlstNm, mode: 'insensitive' } });
    if (prdlstDcnm) conditions.push({ prdlstDcnm: { contains: prdlstDcnm, mode: 'insensitive' } });
    if (dispos) conditions.push({ dispos: { contains: dispos, mode: 'insensitive' } });
    
    if (normalizedPackaging) {
      conditions.push({
        OR: [
          { normalizedPackaging: { contains: normalizedPackaging, mode: 'insensitive' } },
          { frmlcMtrqlt: { contains: normalizedPackaging, mode: 'insensitive' } }
        ]
      });
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    const sortValue = searchParams.get('sort') || 'prmsDt_desc';
    let orderBy = {};
    if (sortValue === 'prmsDt_desc') orderBy = { prmsDt: 'desc' };
    else if (sortValue === 'prmsDt_asc') orderBy = { prmsDt: 'asc' };
    else orderBy = { createdAt: 'desc' };

    // Fetch all records (limit to 50k)
    const data = await prisma.general_declarations.findMany({
      where,
      orderBy: orderBy,
      take: 50000 
    });

    if (data.length === 0) {
        return new Response('데이터가 없습니다.', { status: 404 });
    }

    const headers = [
        '품목제조번호',
        '업소명',
        '품목명',
        '허가일자',
        '품목유형명',
        '제품형태',
        '소비기한',
        '포장재질(정규화)',
        '포장재질(원문)',
        '용법',
        '용도'
    ];

    const rows = data.map(item => [
        item.prdlstReportNo || '',
        item.bsshNm || '',
        item.prdlstNm || '',
        item.prmsDt ? `${item.prmsDt.substring(0,4)}-${item.prmsDt.substring(4,6)}-${item.prmsDt.substring(6,8)}` : '',
        item.prdlstDcnm || '',
        item.dispos || '',
        item.pogDaycnt || '',
        item.normalizedPackaging || '',
        item.frmlcMtrqlt || '',
        item.usage || '',
        item.prpos || ''
    ]);

    if (format === 'xlsx') {
        const XLSX = require('xlsx');
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "GeneralFoodData");
        
        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        return new Response(buf, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="general_food_data_${new Date().toISOString().split('T')[0]}.xlsx"`
            }
        });
    } else {
        // CSV Construction
        const BOM = '\uFEFF';
        const csvContent = [
            headers.join(','), 
            ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        return new Response(BOM + csvContent, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="general_food_data_${new Date().toISOString().split('T')[0]}.csv"`
          }
        });
    }

  } catch (error) {
    console.error('Export General API Error:', error);
    return new Response('서버 오류가 발생했습니다.', { status: 500 });
  }
}
