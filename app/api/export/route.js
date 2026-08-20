import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'csv';
    
    // Extract query parameters for filtering
    const integrated = (searchParams.get('integrated') || '').trim();
    const prdlstReportNo = (searchParams.get('prdlstReportNo') || '').trim();
    const bsshNm = (searchParams.get('bsshNm') || '').trim();
    const prdlstNm = (searchParams.get('prdlstNm') || '').trim();
    const dispos = (searchParams.get('dispos') || '').trim();
    const normalizedFunctionality = (searchParams.get('normalizedFunctionality') || searchParams.get('search') || '').trim();
    const normalizedPackaging = (searchParams.get('normalizedPackaging') || '').trim();
    const month = (searchParams.get('month') || '').trim();
    const date = (searchParams.get('date') || '').trim();

    const conditions = [];

    if (integrated) {
      const keywords = integrated.split(',').map(kw => kw.trim()).filter(kw => kw !== '');
      keywords.forEach(kw => {
        const kwProcessed = kw.replace(/\s+/g, "").toLowerCase();
        conditions.push({
          OR: [
            { prdlstReportNo: { contains: kw, mode: 'insensitive' } },
            { bsshNm: { contains: kw, mode: 'insensitive' } },
            { prdlstNm: { contains: kw, mode: 'insensitive' } },
            { dispos: { contains: kw, mode: 'insensitive' } },
            { prdtShapCdNm: { contains: kw, mode: 'insensitive' } },
            { searchFunctionality: { contains: kwProcessed } },
            { normalizedPackaging: { contains: kw, mode: 'insensitive' } },
            { frmlcMtrqlt: { contains: kw, mode: 'insensitive' } }
          ]
        });
      });
    }

    if (prdlstReportNo) conditions.push({ prdlstReportNo: { contains: prdlstReportNo, mode: 'insensitive' } });
    if (bsshNm) conditions.push({ bsshNm: { contains: bsshNm, mode: 'insensitive' } });
    if (prdlstNm) conditions.push({ prdlstNm: { contains: prdlstNm, mode: 'insensitive' } });
    if (dispos) {
      conditions.push({
        OR: [
          { dispos: { equals: dispos } },
          { prdtShapCdNm: { equals: dispos } }
        ]
      });
    }
    if (normalizedFunctionality) {
      const keywords = normalizedFunctionality.split(',').map(kw => kw.trim()).filter(kw => kw !== '');
      keywords.forEach(kw => {
        const kwProcessed = kw.replace(/\s+/g, "").toLowerCase();
        conditions.push({ 
          OR: [
            { searchFunctionality: { contains: kwProcessed } },
            { normalizedFunctionality: { contains: kw, mode: 'insensitive' } }
          ]
        });
      });
    }
    if (normalizedPackaging) {
      conditions.push({
        OR: [
          { normalizedPackaging: { contains: normalizedPackaging, mode: 'insensitive' } },
          { frmlcMtrqlt: { contains: normalizedPackaging, mode: 'insensitive' } }
        ]
      });
    }

    if (month) {
       const cleanMonth = month.replace(/-/g, ''); 
       conditions.push({ prmsDt: { startsWith: cleanMonth } });
    }
    if (date) {
       const cleanDate = date.replace(/-/g, ''); 
       conditions.push({ prmsDt: { equals: cleanDate } });
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    const sortValue = searchParams.get('sort') || 'prmsDt_desc';
    let orderBy = {};
    if (sortValue === 'prmsDt_desc') orderBy = { prmsDt: 'desc' };
    else if (sortValue === 'prmsDt_asc') orderBy = { prmsDt: 'asc' };
    else orderBy = { createdAt: 'desc' };

    // Fetch all records (limit to 50k)
    const data = await prisma.declarations.findMany({
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
        '진행상태',
        '제품의형태',
        '포장재질(정규화)',
        '기능성(정규화)',
        '대표기능성'
    ];

    const rows = data.map(item => [
        item.prdlstReportNo || '',
        item.bsshNm || '',
        item.prdlstNm || '',
        item.prmsDt ? `${item.prmsDt.substring(0,4)}-${item.prmsDt.substring(4,6)}-${item.prmsDt.substring(6,8)}` : '',
        item.dispos || '',
        item.prdlstKindNm || '',
        item.normalizedPackaging || '',
        item.normalizedFunctionality || '',
        item.primaryFnclty || ''
    ]);

    if (format === 'xlsx') {
        const XLSX = require('xlsx');
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "FoodSafetyData");
        
        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        return new Response(buf, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="food_safety_data_${new Date().toISOString().split('T')[0]}.xlsx"`
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
            'Content-Disposition': `attachment; filename="food_safety_data_${new Date().toISOString().split('T')[0]}.csv"`
          }
        });
    }

  } catch (error) {
    console.error('Export API Error:', error);
    return new Response('서버 오류가 발생했습니다.', { status: 500 });
  }
}
